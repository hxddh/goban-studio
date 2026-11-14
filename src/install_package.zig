//! Update install: the package. Its layout, the executable's CPU, the
//! zip's entry names and extraction, and the checks an unpacked package
//! must pass before it may replace this app. install.zig describes the
//! whole flow.
const std = @import("std");
const builtin = @import("builtin");
const paths = @import("paths.zig");
const install_mod = @import("install.zig");
const install_verify = @import("install_verify.zig");

const Sha256 = std.crypto.hash.sha2.Sha256;

const testing = std.testing;

pub const bundle_id = paths.bundle_id;
const max_zip_entries = 50_000;
const max_unpacked_bytes: u64 = 3 * 1024 * 1024 * 1024;
// ------------------------------------------------------------ packages

/// The staged package's top-level item inside `unpacked/`: the name the
/// release's .zip holds today.
pub fn stagedRootName(p: install_mod.Platform) []const u8 {
    return stagedRootNames(p)[0];
}

/// Every top-level name a package for `p` may carry. The macOS .zip holds
/// `GobanStudio.app` (what every released app expects); `Goban Studio.app`
/// (the name in the .dmg) is accepted too, so a later release can give
/// both downloads the same name without stranding this version.
pub fn stagedRootNames(p: install_mod.Platform) []const []const u8 {
    return switch (p) {
        .macos_arm64, .macos_x64 => &.{ "GobanStudio.app", "Goban Studio.app" },
        else => &.{"GobanStudio"},
    };
}

/// Executable path inside the staged package, relative to its root.
fn stagedExeRel(p: install_mod.Platform) []const u8 {
    return switch (p) {
        .macos_arm64, .macos_x64 => "Contents/MacOS/goban-studio",
        else => "bin" ++ std.fs.path.sep_str ++ "goban-studio.exe",
    };
}

/// Does this executable header belong to `arch` (Mach-O 64 thin or fat,
/// or PE32+)? Only the first 4 KiB are needed.
pub fn executableMatches(header: []const u8, arch: std.Target.Cpu.Arch) bool {
    if (header.len < 64) return false;
    // Mach-O 64, little endian
    if (std.mem.readInt(u32, header[0..4], .little) == 0xfeedfacf) {
        return cpuTypeMatches(std.mem.readInt(u32, header[4..8], .little), arch);
    }
    // Fat (universal) Mach-O, big endian header
    const fat_magic = std.mem.readInt(u32, header[0..4], .big);
    if (fat_magic == 0xcafebabe or fat_magic == 0xcafebabf) {
        const count = std.mem.readInt(u32, header[4..8], .big);
        const stride: usize = if (fat_magic == 0xcafebabe) 20 else 32;
        var i: usize = 0;
        while (i < count and i < 8) : (i += 1) {
            const at = 8 + i * stride;
            if (at + 4 > header.len) return false;
            if (cpuTypeMatches(std.mem.readInt(u32, header[at..][0..4], .big), arch)) return true;
        }
        return false;
    }
    // PE: "MZ", e_lfanew at 0x3c, "PE\0\0", machine
    if (header[0] == 'M' and header[1] == 'Z') {
        const pe = std.mem.readInt(u32, header[0x3c..0x40], .little);
        if (pe + 6 > header.len) return false;
        if (!std.mem.eql(u8, header[pe..][0..4], "PE\x00\x00")) return false;
        const machine = std.mem.readInt(u16, header[pe + 4 ..][0..2], .little);
        return switch (arch) {
            .x86_64 => machine == 0x8664,
            .aarch64 => machine == 0xaa64,
            else => false,
        };
    }
    return false;
}

fn cpuTypeMatches(cpu_type: u32, arch: std.Target.Cpu.Arch) bool {
    return switch (arch) {
        .aarch64 => cpu_type == 0x0100000c,
        .x86_64 => cpu_type == 0x01000007,
        else => false,
    };
}

/// Zip entry names we are willing to write: relative, forward slashes,
/// under `root/`, no `..`, no drive letters or alternate streams, no
/// control characters.
pub fn safeEntryName(name: []const u8, root: []const u8) bool {
    if (name.len == 0 or name.len > 1024) return false;
    if (name[0] == '/' or std.mem.indexOfScalar(u8, name, '\\') != null) return false;
    if (std.mem.indexOfScalar(u8, name, ':') != null) return false;
    for (name) |c| {
        if (c < 0x20 or c == 0x7f) return false;
    }
    if (!(std.mem.startsWith(u8, name, root) and name.len > root.len and name[root.len] == '/')) return false;
    var parts = std.mem.splitScalar(u8, name, '/');
    while (parts.next()) |part| {
        if (std.mem.eql(u8, part, "..") or std.mem.eql(u8, part, ".")) return false;
    }
    return true;
}

/// Check every entry, then extract with std.zip (Windows packages).
pub fn extractZip(io: std.Io, zip_path: []const u8, dest_path: []const u8, root: []const u8) !void {
    var file = std.Io.Dir.openFileAbsolute(io, zip_path, .{}) catch return error.Unpack;
    defer file.close(io);
    var read_buf: [16 * 1024]u8 = undefined;
    var reader = file.reader(io, &read_buf);
    {
        var iter = std.zip.Iterator.init(&reader) catch return error.Unpack;
        var name_buf: [1024]u8 = undefined;
        var count: usize = 0;
        var total: u64 = 0;
        while (iter.next() catch return error.Unpack) |entry| {
            count += 1;
            total += entry.uncompressed_size;
            if (count > max_zip_entries or total > max_unpacked_bytes) return error.Unpack;
            if (entry.filename_len > name_buf.len) return error.Unpack;
            const name = name_buf[0..entry.filename_len];
            reader.seekTo(entry.header_zip_offset + @sizeOf(std.zip.CentralDirectoryFileHeader)) catch return error.Unpack;
            reader.interface.readSliceAll(name) catch return error.Unpack;
            if (!safeEntryName(name, root)) return error.Unpack;
        }
    }
    std.Io.Dir.cwd().createDirPath(io, dest_path) catch return error.Disk;
    var dest = std.Io.Dir.cwd().openDir(io, dest_path, .{}) catch return error.Disk;
    defer dest.close(io);
    std.zip.extract(dest, &reader, .{}) catch return error.Unpack;
}

pub fn runTool(io: std.Io, argv: []const []const u8) bool {
    var child = std.process.spawn(io, .{
        .argv = argv,
        .stdin = .ignore,
        .stdout = .ignore,
        .stderr = .ignore,
        .create_no_window = true,
    }) catch return false;
    const term = child.wait(io) catch return false;
    return switch (term) {
        .exited => |code| code == 0,
        else => false,
    };
}

pub fn fileExists(io: std.Io, path: []const u8) bool {
    std.Io.Dir.accessAbsolute(io, path, .{}) catch return false;
    return true;
}

pub fn readHead(io: std.Io, path: []const u8, buf: []u8) ?[]const u8 {
    var file = std.Io.Dir.openFileAbsolute(io, path, .{}) catch return null;
    defer file.close(io);
    const n = file.readPositionalAll(io, buf, 0) catch return null;
    return buf[0..n];
}

/// Where the package states its own version, relative to its root.
fn buildInfoRel(p: install_mod.Platform) []const u8 {
    const s = std.fs.path.sep_str;
    return switch (p) {
        .macos_arm64, .macos_x64 => "Contents" ++ s ++ "Resources" ++ s ++ "frontend" ++ s ++ "dist" ++ s ++ "build-info.json",
        else => "resources" ++ s ++ "frontend" ++ s ++ "dist" ++ s ++ "build-info.json",
    };
}

/// Does the unpacked package say it is version `tag`? Its
/// `build-info.json` must (both platforms), and on macOS its Info.plist
/// too. A package that is really an older build under a new tag fails
/// here even when its checksum is the published one.
pub fn stagedVersionMatches(io: std.Io, platform: install_mod.Platform, root_path: []const u8, tag: []const u8) bool {
    var path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const info_path = std.fmt.bufPrint(&path_buf, "{s}{c}{s}", .{ root_path, std.fs.path.sep, buildInfoRel(platform) }) catch return false;
    var info_buf: [2048]u8 = undefined;
    const info = readHead(io, info_path, &info_buf) orelse return false;
    var version_buf: [64]u8 = undefined;
    const version = install_verify.buildInfoVersion(info, &version_buf) orelse return false;
    if (!install_verify.versionIsTag(version, tag)) return false;
    switch (platform) {
        .macos_arm64, .macos_x64 => {
            const plist = std.fmt.bufPrint(&path_buf, "{s}/Contents/Info.plist", .{root_path}) catch return false;
            var plist_buf: [16 * 1024]u8 = undefined;
            const text = readHead(io, plist, &plist_buf) orelse return false;
            return install_verify.versionIsTag(install_verify.plistVersion(text) orelse return false, tag);
        },
        else => return true,
    }
}

/// Is the unpacked package what this app expects: the right layout, the
/// right bundle id (macOS) and an executable for `platform`'s CPU?
pub fn checkStaged(io: std.Io, platform: install_mod.Platform, root_path: []const u8) bool {
    var path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const exe = std.fmt.bufPrint(&path_buf, "{s}{c}{s}", .{ root_path, std.fs.path.sep, stagedExeRel(platform) }) catch return false;
    var head_buf: [4096]u8 = undefined;
    const head = readHead(io, exe, &head_buf) orelse return false;
    if (!executableMatches(head, platform.arch() orelse return false)) return false;
    switch (platform) {
        .macos_arm64, .macos_x64 => {
            const plist = std.fmt.bufPrint(&path_buf, "{s}/Contents/Info.plist", .{root_path}) catch return false;
            var plist_buf: [16 * 1024]u8 = undefined;
            const text = readHead(io, plist, &plist_buf) orelse return false;
            if (std.mem.indexOf(u8, text, "<string>" ++ bundle_id ++ "</string>") == null) return false;
        },
        .windows_x64 => {
            const sep = std.fs.path.sep;
            const index = std.fmt.bufPrint(&path_buf, "{s}{c}resources{c}frontend{c}dist{c}index.html", .{ root_path, sep, sep, sep, sep }) catch return false;
            if (!fileExists(io, index)) return false;
        },
        .unsupported => return false,
    }
    return true;
}

pub fn unpack(io: std.Io, platform: install_mod.Platform, zip_path: []const u8, dest: []const u8) !void {
    switch (platform) {
        // ditto keeps permissions, symlinks and the code signature's
        // resources exactly; it adds no quarantine flag to what it writes.
        .macos_arm64, .macos_x64 => {
            if (builtin.os.tag != .macos) return error.Unsupported;
            std.Io.Dir.cwd().createDirPath(io, dest) catch return error.Disk;
            if (!runTool(io, &.{ "/usr/bin/ditto", "-x", "-k", zip_path, dest })) return error.Unpack;
        },
        .windows_x64 => try extractZip(io, zip_path, dest, stagedRootName(platform)),
        .unsupported => return error.Unsupported,
    }
}

test "zip entry names must stay inside the package root" {
    try testing.expect(safeEntryName("GobanStudio/bin/goban-studio.exe", "GobanStudio"));
    // Directory entries are fine.
    try testing.expect(safeEntryName("GobanStudio/", "GobanStudio"));
    try testing.expect(safeEntryName("GobanStudio/resources/", "GobanStudio"));
    try testing.expect(!safeEntryName("GobanStudio/../evil.exe", "GobanStudio"));
    try testing.expect(!safeEntryName("../GobanStudio/x", "GobanStudio"));
    try testing.expect(!safeEntryName("/GobanStudio/x", "GobanStudio"));
    try testing.expect(!safeEntryName("GobanStudio\\bin\\x", "GobanStudio"));
    try testing.expect(!safeEntryName("GobanStudio/C:x", "GobanStudio"));
    try testing.expect(!safeEntryName("GobanStudio/x:stream", "GobanStudio"));
    try testing.expect(!safeEntryName("GobanStudioEvil/x", "GobanStudio"));
    try testing.expect(!safeEntryName("Other/x", "GobanStudio"));
    try testing.expect(!safeEntryName("GobanStudio/./x", "GobanStudio"));
}

test "executable headers are matched to the CPU" {
    var macho: [64]u8 = @splat(0);
    std.mem.writeInt(u32, macho[0..4], 0xfeedfacf, .little);
    std.mem.writeInt(u32, macho[4..8], 0x0100000c, .little);
    try testing.expect(executableMatches(&macho, .aarch64));
    try testing.expect(!executableMatches(&macho, .x86_64));
    std.mem.writeInt(u32, macho[4..8], 0x01000007, .little);
    try testing.expect(executableMatches(&macho, .x86_64));

    var fat: [64]u8 = @splat(0);
    std.mem.writeInt(u32, fat[0..4], 0xcafebabe, .big);
    std.mem.writeInt(u32, fat[4..8], 2, .big);
    std.mem.writeInt(u32, fat[8..12], 0x01000007, .big);
    std.mem.writeInt(u32, fat[28..32], 0x0100000c, .big);
    try testing.expect(executableMatches(&fat, .x86_64));
    try testing.expect(executableMatches(&fat, .aarch64));

    var pe: [256]u8 = @splat(0);
    pe[0] = 'M';
    pe[1] = 'Z';
    std.mem.writeInt(u32, pe[0x3c..0x40], 0x80, .little);
    @memcpy(pe[0x80..0x84], "PE\x00\x00");
    std.mem.writeInt(u16, pe[0x84..0x86], 0x8664, .little);
    try testing.expect(executableMatches(&pe, .x86_64));
    try testing.expect(!executableMatches(&pe, .aarch64));
    try testing.expect(!executableMatches("#!/bin/sh\necho not an app\n" ++ ("x" ** 64), .x86_64));
}

test "a package states its own version, and it must be the tag's" {
    var out: [64]u8 = undefined;
    try testing.expectEqualStrings("14.0.0", install_verify.buildInfoVersion("{\n  \"app\": \"14.0.0\",\n  \"builtAt\": \"2026-11-11T00:00:00.000Z\"\n}\n", &out).?);
    try testing.expect(install_verify.buildInfoVersion("{\"builtAt\":\"x\"}", &out) == null);
    try testing.expect(install_verify.buildInfoVersion("not json", &out) == null);
    try testing.expect(install_verify.buildInfoVersion("{\"app\":14}", &out) == null);
    const plist =
        \\<plist version="1.0"><dict>
        \\  <key>CFBundleIdentifier</key>
        \\  <string>dev.hxddh.gobanstudio</string>
        \\  <key>CFBundleShortVersionString</key>
        \\  <string>14.0.0</string>
        \\  <key>CFBundleVersion</key>
        \\  <string>14.0.0</string>
        \\</dict></plist>
    ;
    try testing.expectEqualStrings("14.0.0", install_verify.plistVersion(plist).?);
    try testing.expect(install_verify.plistVersion("<key>CFBundleVersion</key><string>1</string>") == null);
    try testing.expect(install_verify.plistVersion("<key>CFBundleShortVersionString</key><integer>1</integer><string>2</string>") == null);
    try testing.expect(install_verify.versionIsTag("14.0.0", "v14.0.0"));
    try testing.expect(install_verify.versionIsTag("14.0", "v14.0.0"));
    try testing.expect(install_verify.versionIsTag("14.1.0-beta.1", "v14.1.0-beta.1"));
    try testing.expect(!install_verify.versionIsTag("13.0.0", "v14.0.0"));
    try testing.expect(!install_verify.versionIsTag("14.0.0", "v14.0.1"));
    try testing.expect(!install_verify.versionIsTag("14.0.0-rc.1", "v14.0.0"));
    try testing.expect(!install_verify.versionIsTag("", "v14.0.0"));
    try testing.expect(!install_verify.versionIsTag("0.0.0", "latest"));

    // On disk, in the layout of the package (Windows layout here; the
    // macOS one adds the Info.plist check).
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [install_mod.path_cap]u8 = undefined;
    const dir = try testTempDir(io, &tmp, &dir_buf);
    var p: [install_mod.path_cap]u8 = undefined;
    const s = std.fs.path.sep;
    const dist = try std.fmt.bufPrint(&p, "{s}{c}resources{c}frontend{c}dist", .{ dir, s, s, s });
    try std.Io.Dir.cwd().createDirPath(io, dist);
    var f: [install_mod.path_cap]u8 = undefined;
    const info = try std.fmt.bufPrint(&f, "{s}{c}build-info.json", .{ dist, s });
    try testing.expect(!stagedVersionMatches(io, .windows_x64, dir, "v14.0.0"));
    try writeTestFile(io, info, "{\"app\":\"14.0.0\",\"builtAt\":\"2026-11-11T00:00:00.000Z\"}\n");
    try testing.expect(stagedVersionMatches(io, .windows_x64, dir, "v14.0.0"));
    // An older build offered under a newer tag.
    try testing.expect(!stagedVersionMatches(io, .windows_x64, dir, "v99.0.0"));

    try testing.expectEqualStrings("GobanStudio.app", stagedRootName(.macos_arm64));
    try testing.expectEqual(@as(usize, 2), stagedRootNames(.macos_x64).len);
    try testing.expectEqualStrings("Goban Studio.app", stagedRootNames(.macos_x64)[1]);
    try testing.expectEqualStrings("GobanStudio", stagedRootName(.windows_x64));
}

/// A stored (uncompressed) zip, for the extraction tests.
fn testZip(allocator: std.mem.Allocator, entries: []const [2][]const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    var central: std.ArrayList(u8) = .empty;
    defer central.deinit(allocator);
    for (entries) |entry| {
        const name = entry[0];
        const data = entry[1];
        const crc = std.hash.Crc32.hash(data);
        const offset: u32 = @intCast(out.items.len);
        var local: [30]u8 = @splat(0);
        @memcpy(local[0..4], "PK\x03\x04");
        std.mem.writeInt(u16, local[4..6], 20, .little);
        std.mem.writeInt(u32, local[14..18], crc, .little);
        std.mem.writeInt(u32, local[18..22], @intCast(data.len), .little);
        std.mem.writeInt(u32, local[22..26], @intCast(data.len), .little);
        std.mem.writeInt(u16, local[26..28], @intCast(name.len), .little);
        try out.appendSlice(allocator, &local);
        try out.appendSlice(allocator, name);
        try out.appendSlice(allocator, data);
        var cd: [46]u8 = @splat(0);
        @memcpy(cd[0..4], "PK\x01\x02");
        std.mem.writeInt(u16, cd[4..6], 20, .little);
        std.mem.writeInt(u16, cd[6..8], 20, .little);
        std.mem.writeInt(u32, cd[16..20], crc, .little);
        std.mem.writeInt(u32, cd[20..24], @intCast(data.len), .little);
        std.mem.writeInt(u32, cd[24..28], @intCast(data.len), .little);
        std.mem.writeInt(u16, cd[28..30], @intCast(name.len), .little);
        std.mem.writeInt(u32, cd[42..46], offset, .little);
        try central.appendSlice(allocator, &cd);
        try central.appendSlice(allocator, name);
    }
    const cd_offset: u32 = @intCast(out.items.len);
    try out.appendSlice(allocator, central.items);
    var end: [22]u8 = @splat(0);
    @memcpy(end[0..4], "PK\x05\x06");
    std.mem.writeInt(u16, end[8..10], @intCast(entries.len), .little);
    std.mem.writeInt(u16, end[10..12], @intCast(entries.len), .little);
    std.mem.writeInt(u32, end[12..16], @intCast(central.items.len), .little);
    std.mem.writeInt(u32, end[16..20], cd_offset, .little);
    try out.appendSlice(allocator, &end);
    return out.toOwnedSlice(allocator);
}

pub fn testTempDir(io: std.Io, tmp: *testing.TmpDir, buf: []u8) ![]const u8 {
    const n = try tmp.dir.realPath(io, buf);
    return buf[0..n];
}

pub fn writeTestFile(io: std.Io, path: []const u8, data: []const u8) !void {
    var file = try std.Io.Dir.createFileAbsolute(io, path, .{});
    defer file.close(io);
    try file.writeStreamingAll(io, data);
}

test "a verified Windows package is extracted; a hostile one is refused" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir = try testTempDir(io, &tmp, &dir_buf);

    var pe: [256]u8 = @splat(0);
    pe[0] = 'M';
    pe[1] = 'Z';
    std.mem.writeInt(u32, pe[0x3c..0x40], 0x80, .little);
    @memcpy(pe[0x80..0x84], "PE\x00\x00");
    std.mem.writeInt(u16, pe[0x84..0x86], 0x8664, .little);

    const good = try testZip(testing.allocator, &.{
        .{ "GobanStudio/bin/goban-studio.exe", &pe },
        .{ "GobanStudio/resources/frontend/dist/index.html", "<!doctype html>" },
        .{ "GobanStudio/README-Windows.txt", "hello" },
    });
    defer testing.allocator.free(good);
    var path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const zip_path = try std.fmt.bufPrint(&path_buf, "{s}{c}good.zip", .{ dir, std.fs.path.sep });
    try writeTestFile(io, zip_path, good);

    // SHA256SUMS → verify → extract → layout check, as the thread does.
    var digest: [32]u8 = undefined;
    Sha256.hash(good, &digest, .{});
    const hex = install_verify.hexDigest(digest);
    const sums = try std.fmt.allocPrint(testing.allocator, "{s}  GobanStudio-Windows-x64.zip\n", .{&hex});
    defer testing.allocator.free(sums);
    const expected = install_verify.findSum(sums, "GobanStudio-Windows-x64.zip").?;
    try testing.expect(install_verify.sumsMatch(expected, try install_verify.hashFile(io, zip_path)));

    var out_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const out = try std.fmt.bufPrint(&out_buf, "{s}{c}unpacked", .{ dir, std.fs.path.sep });
    try extractZip(io, zip_path, out, "GobanStudio");
    var root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const root = try std.fmt.bufPrint(&root_buf, "{s}{c}GobanStudio", .{ out, std.fs.path.sep });
    try testing.expect(checkStaged(io, .windows_x64, root));
    try testing.expect(!checkStaged(io, .macos_arm64, root));
    var exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const exe = try std.fmt.bufPrint(&exe_buf, "{s}{c}bin{c}goban-studio.exe", .{ root, std.fs.path.sep, std.fs.path.sep });
    var head: [4096]u8 = undefined;
    try testing.expect(executableMatches(readHead(io, exe, &head).?, .x86_64));

    // A changed byte no longer matches the published sum.
    var tampered = try testing.allocator.dupe(u8, good);
    defer testing.allocator.free(tampered);
    tampered[40] ^= 1;
    try writeTestFile(io, zip_path, tampered);
    try testing.expect(!install_verify.sumsMatch(expected, try install_verify.hashFile(io, zip_path)));

    const hostile = [_][]const u8{ "GobanStudio/../escaped.txt", "Elsewhere/x.txt", "GobanStudio/x:y" };
    for (hostile) |name| {
        const bad = try testZip(testing.allocator, &.{ .{ "GobanStudio/ok.txt", "ok" }, .{ name, "evil" } });
        defer testing.allocator.free(bad);
        try writeTestFile(io, zip_path, bad);
        var bad_out_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const bad_out = try std.fmt.bufPrint(&bad_out_buf, "{s}{c}bad", .{ dir, std.fs.path.sep });
        try testing.expectError(error.Unpack, extractZip(io, zip_path, bad_out, "GobanStudio"));
        // Refused before anything was written.
        try testing.expect(!fileExists(io, bad_out));
    }
}

test "macOS: ditto unpacks a signed bundle that codesign and the checks accept" {
    if (builtin.os.tag != .macos) return error.SkipZigTest;
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const dir = try testTempDir(io, &tmp, &dir_buf);
    var p: [std.Io.Dir.max_path_bytes]u8 = undefined;

    // A minimal bundle whose executable is this test binary (a real
    // Mach-O for the host CPU), ad-hoc signed like the release.
    const app = try std.fmt.bufPrint(&p, "{s}/src/GobanStudio.app", .{dir});
    var app_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    @memcpy(app_buf[0..app.len], app);
    const app_path = app_buf[0..app.len];
    var q: [std.Io.Dir.max_path_bytes]u8 = undefined;
    try std.Io.Dir.cwd().createDirPath(io, try std.fmt.bufPrint(&q, "{s}/Contents/MacOS", .{app_path}));
    try writeTestFile(io, try std.fmt.bufPrint(&q, "{s}/Contents/Info.plist", .{app_path}),
        \\<?xml version="1.0" encoding="UTF-8"?>
        \\<plist version="1.0"><dict>
        \\<key>CFBundleIdentifier</key><string>dev.hxddh.gobanstudio</string>
        \\<key>CFBundleExecutable</key><string>goban-studio</string>
        \\<key>CFBundlePackageType</key><string>APPL</string>
        \\</dict></plist>
        \\
    );
    var self_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const self_len = try std.process.executablePath(io, &self_buf);
    var exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const exe = try std.fmt.bufPrint(&exe_buf, "{s}/Contents/MacOS/goban-studio", .{app_path});
    try testing.expect(runTool(io, &.{ "/bin/cp", self_buf[0..self_len], exe }));
    try testing.expect(runTool(io, &.{ "/usr/bin/codesign", "--force", "--deep", "--sign", "-", app_path }));
    var zip_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const zip_path = try std.fmt.bufPrint(&zip_buf, "{s}/pkg.zip", .{dir});
    try testing.expect(runTool(io, &.{ "/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app_path, zip_path }));

    var out_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const out = try std.fmt.bufPrint(&out_buf, "{s}/unpacked", .{dir});
    const platform = install_mod.currentPlatform();
    // Under Rosetta the host binary is x86_64 but the wanted package is arm64.
    if (install_mod.runningUnderRosetta()) return error.SkipZigTest;
    try unpack(io, platform, zip_path, out);
    var staged_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const staged = try std.fmt.bufPrint(&staged_buf, "{s}/GobanStudio.app", .{out});
    try testing.expect(checkStaged(io, platform, staged));
    try testing.expect(runTool(io, &.{ "/usr/bin/codesign", "--verify", "--deep", "--strict", staged }));
    // Files we unpack ourselves carry no quarantine flag, so Gatekeeper
    // does not assess the new app when the helper opens it.
    try testing.expect(!runTool(io, &.{ "/usr/bin/xattr", "-p", "com.apple.quarantine", staged }));
    // An app for the other CPU is refused.
    const other: install_mod.Platform = if (platform == .macos_arm64) .macos_x64 else .macos_arm64;
    try testing.expect(!checkStaged(io, other, staged));
}

