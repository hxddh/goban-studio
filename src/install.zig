//! In-app update install (v5).
//!
//! After an update check found a newer release, the player may choose
//! "Download and install". Everything here happens only on that request:
//!
//!   1. Download — one asset for this platform and architecture, plus the
//!      release's SHA256SUMS, both from
//!      `https://github.com/hxddh/goban-studio/releases/download/<tag>/<name>`.
//!      The address is built here from a validated tag and a fixed asset
//!      name; the page never supplies a URL. Redirects are followed by hand
//!      and only to GitHub's own download hosts, always over HTTPS.
//!   2. Verify — the asset's SHA-256 must equal its line in SHA256SUMS.
//!      On its own that catches corruption, truncation and a wrong file,
//!      but it is not a signature: SHA256SUMS comes from the same release
//!      over the same TLS connection to GitHub, so whoever can publish a
//!      release can publish matching sums. v13: a build made with
//!      `-Dupdate-pubkey=<base64 Ed25519 public key>` (docs/signing.md)
//!      also downloads `SHA256SUMS.sig` — the base64 of a 64-byte Ed25519
//!      signature over the exact bytes of SHA256SUMS — and refuses the
//!      update without a valid one (`NoSignature`, `BadSignature`). The
//!      private key never touches GitHub's release storage; it lives in the
//!      release job's secrets. A build without the option behaves as
//!      before (checksums only), and says so nowhere it could mislead.
//!   3. Unpack into a per-user staging directory under the temp dir
//!      (macOS: `ditto -x -k`, then `codesign --verify --deep --strict`;
//!      Windows: std.zip with every entry name checked first), and check
//!      the layout, the bundle id and the executable's CPU architecture.
//!   4. Apply — on "Restart to update" the app writes its *embedded* helper
//!      script (src/updater/) next to the staging directory and starts it
//!      detached. v13: the helper takes an exclusive lock for the
//!      installation (`.<name>.goban-lock` beside it: a second helper for
//!      the same app refuses) and then creates a "started" marker in the
//!      staging directory. The app quits only once that marker exists; if
//!      it does not appear within `helper_start_timeout_ms` the app claims
//!      the marker itself (so a late helper gives up), stays open and
//!      reports `HelperNotStarted`. The helper waits for this process to exit,
//!      swaps the installation (keeping a backup), launches the new app
//!      with `--goban-update-ack=<file>` and waits for the new app to write
//!      that file; without it, it rolls back and relaunches the old app with
//!      `--goban-update-failed`.
//!
//! Nothing downloaded is ever executed except the verified new app, and
//! only by the helper after the swap. If the installation cannot be
//! replaced (read-only location, App Translocation, a development build),
//! the status says so and the page offers "Open download page" instead.
//!
//! Threading follows update.zig: a download runs on its own thread and
//! publishes progress in a locked slot; the UI thread reads snapshots and
//! answers the waiting `studio.updateDownload` call when the thread is done.
const std = @import("std");
const builtin = @import("builtin");
const update = @import("update.zig");
const json = @import("json.zig");
const net = @import("net.zig");
const paths = @import("paths.zig");

const Sha256 = std.crypto.hash.sha2.Sha256;

/// Every download starts with exactly this prefix, then `<tag>/<name>`.
pub const download_prefix = "https://github.com/hxddh/goban-studio/releases/download/";
pub const sums_name = "SHA256SUMS";
/// The detached Ed25519 signature of SHA256SUMS (base64, one line).
pub const sig_name = "SHA256SUMS.sig";
const max_sig_bytes: u64 = 1024;
pub const Ed25519 = std.crypto.sign.Ed25519;
/// A small text file holding the release's tag and a newline. SHA256SUMS
/// lists its hash, so the signed bytes name the version they are for.
pub const version_name = "VERSION";
/// How long the app waits for the helper's "started" marker. A cold
/// Windows PowerShell under an antivirus scan can take well over ten
/// seconds to run its first line; the page shows "installing" meanwhile
/// (`studio.updateStatus`), and the app stays usable if the time runs out.
pub const helper_start_timeout_ms: i64 = 25_000;
pub const started_prefix = "goban-update-started-";
const user_agent = "GobanStudio-updater";
pub const bundle_id = paths.bundle_id;

/// Hard limits: the packages are ~100 MB; SHA256SUMS is a few lines.
pub const max_asset_bytes: u64 = 1024 * 1024 * 1024;
const max_sums_bytes: u64 = 64 * 1024;
const max_zip_entries = 50_000;
const max_unpacked_bytes: u64 = 3 * 1024 * 1024 * 1024;
/// No byte for this long while downloading: the connection is abandoned
/// (std.http has no socket timeout; the UI thread enforces it) and the
/// download continues on a new one from the bytes already on disk, up to
/// `max_stall_retries` times; then it fails with `Stalled`.
pub const stall_timeout_ms: i64 = 60_000;
pub const max_stall_retries: u32 = 3;
/// A connection that breaks off is retried this many times, each
/// continuing the file where it stopped.
pub const max_network_retries: u32 = 4;
/// Download threads that may exist at once: the live one and the
/// abandoned ones still stuck in a read.
const max_running: u32 = max_stall_retries + 3;
/// How long the helper waits for the new app to acknowledge its launch.
pub const ack_timeout_s: u32 = 90;

pub const staging_dir_name = "GobanStudio-update";
pub const log_name = "GobanStudio-update.log";
pub const ack_prefix = "goban-update-ack-";
pub const ack_arg = "--goban-update-ack=";
pub const failed_arg = "--goban-update-failed";

pub const helper_macos = @embedFile("updater/apply-macos.sh");
pub const helper_windows = @embedFile("updater/apply-windows.ps1");

// ------------------------------------------------------------ platform

pub const Platform = enum {
    macos_arm64,
    macos_x64,
    windows_x64,
    unsupported,

    pub fn assetName(p: Platform) ?[]const u8 {
        return switch (p) {
            .macos_arm64 => "GobanStudio-macOS-arm64.zip",
            .macos_x64 => "GobanStudio-macOS-x64.zip",
            .windows_x64 => "GobanStudio-Windows-x64.zip",
            .unsupported => null,
        };
    }

    pub fn label(p: Platform) []const u8 {
        return switch (p) {
            .macos_arm64 => "macos-arm64",
            .macos_x64 => "macos-x64",
            .windows_x64 => "windows-x64",
            .unsupported => "unsupported",
        };
    }

    /// The executable inside the staged package must be built for this.
    pub fn arch(p: Platform) ?std.Target.Cpu.Arch {
        return switch (p) {
            .macos_arm64 => .aarch64,
            .macos_x64, .windows_x64 => .x86_64,
            .unsupported => null,
        };
    }
};

/// Which package replaces this one. An Intel build running under Rosetta
/// on Apple Silicon is moved to the native arm64 package. Windows on ARM
/// runs the x64 build under emulation (there is no ARM64 KataGo for
/// Windows), so it stays on x64.
pub fn currentPlatform() Platform {
    return switch (builtin.os.tag) {
        .macos => switch (builtin.cpu.arch) {
            .aarch64 => .macos_arm64,
            .x86_64 => if (runningUnderRosetta()) .macos_arm64 else .macos_x64,
            else => .unsupported,
        },
        .windows => switch (builtin.cpu.arch) {
            .x86_64, .aarch64 => .windows_x64,
            else => .unsupported,
        },
        else => .unsupported,
    };
}

fn runningUnderRosetta() bool {
    if (comptime builtin.os.tag != .macos) return false;
    var value: c_int = 0;
    var len: usize = @sizeOf(c_int);
    if (std.c.sysctlbyname("sysctl.proc_translated", &value, &len, null, 0) != 0) return false;
    return value == 1;
}

// ------------------------------------------------------------ addresses

/// A release tag usable as one path segment: update.zig's character set,
/// starting with `v` or a digit, never `..`.
pub fn validTag(tag: []const u8) bool {
    if (!update.validTag(tag)) return false;
    if (!(tag[0] == 'v' or std.ascii.isDigit(tag[0]))) return false;
    return std.mem.indexOf(u8, tag, "..") == null;
}

fn isAllowedAssetName(name: []const u8) bool {
    if (std.mem.eql(u8, name, sums_name) or std.mem.eql(u8, name, sig_name)) return true;
    inline for (.{ Platform.macos_arm64, Platform.macos_x64, Platform.windows_x64 }) |p| {
        if (std.mem.eql(u8, name, p.assetName().?)) return true;
    }
    return false;
}

/// `https://github.com/hxddh/goban-studio/releases/download/<tag>/<name>`.
pub fn downloadUrl(buf: []u8, tag: []const u8, name: []const u8) ![]const u8 {
    if (!validTag(tag) or !isAllowedAssetName(name)) return error.BadTag;
    return std.fmt.bufPrint(buf, "{s}{s}/{s}", .{ download_prefix, tag, name }) catch error.BadTag;
}

/// True only for this repository's release-download addresses of a known
/// asset: the prefix, one valid tag, one allowed name, nothing else.
pub fn validDownloadUrl(url: []const u8) bool {
    if (!std.mem.startsWith(u8, url, download_prefix)) return false;
    const rest = url[download_prefix.len..];
    const slash = std.mem.indexOfScalar(u8, rest, '/') orelse return false;
    return validTag(rest[0..slash]) and isAllowedAssetName(rest[slash + 1 ..]);
}

/// A redirect target must be one of GitHub's download hosts (net.zig).
pub const allowedRedirect = net.allowedRedirect;

// ------------------------------------------------------------ signature

/// The build's update key (`-Dupdate-pubkey`, base64 of 32 bytes), decoded;
/// null when the option is empty. Evaluated at compile time in main.zig,
/// so a malformed key fails the build instead of disabling the check.
pub fn parsePublicKey(b64: []const u8) error{BadKey}!?[Ed25519.PublicKey.encoded_length]u8 {
    const text = std.mem.trim(u8, b64, " \t\r\n");
    if (text.len == 0) return null;
    var out: [Ed25519.PublicKey.encoded_length]u8 = undefined;
    const dec = std.base64.standard.Decoder;
    const n = dec.calcSizeForSlice(text) catch return error.BadKey;
    if (n != out.len) return error.BadKey;
    dec.decode(&out, text) catch return error.BadKey;
    return out;
}

/// Check `sig_text` (base64 of a 64-byte Ed25519 signature, surrounding
/// whitespace allowed) against the exact bytes of SHA256SUMS.
pub fn verifySums(sums: []const u8, sig_text: []const u8, public_key: [Ed25519.PublicKey.encoded_length]u8) error{BadSignature}!void {
    const text = std.mem.trim(u8, sig_text, " \t\r\n");
    var sig_bytes: [Ed25519.Signature.encoded_length]u8 = undefined;
    const dec = std.base64.standard.Decoder;
    const n = dec.calcSizeForSlice(text) catch return error.BadSignature;
    if (n != sig_bytes.len) return error.BadSignature;
    dec.decode(&sig_bytes, text) catch return error.BadSignature;
    const pk = Ed25519.PublicKey.fromBytes(public_key) catch return error.BadSignature;
    const sig = Ed25519.Signature.fromBytes(sig_bytes);
    sig.verify(sums, pk) catch return error.BadSignature;
}

// ------------------------------------------------------------ version
//
// A signature over SHA256SUMS alone says "these packages are ours", not
// "these packages are version X": whoever controls a release could attach
// an older release's packages, sums and signature to a new tag, and every
// app would take the old (perhaps vulnerable) version as an update, or
// never see a newer one. So the release job adds one more line to
// SHA256SUMS before signing it: the SHA-256 of a file `VERSION` that holds
// the tag and a newline. `sha256sum -c` still reads the file; apps that do
// not know the line skip it, as they skip the .dmg lines.

pub const Binding = enum {
    /// SHA256SUMS names exactly this tag.
    bound,
    /// SHA256SUMS has no VERSION line (a release older than the binding).
    absent,
    /// SHA256SUMS names another version.
    mismatch,
};

/// Do these sums belong to release `tag`?
pub fn sumsBinding(sums: []const u8, tag: []const u8) Binding {
    if (!hasSumLine(sums, version_name)) return .absent;
    const listed = findSum(sums, version_name) orelse return .mismatch;
    var sha = Sha256.init(.{});
    sha.update(tag);
    sha.update("\n");
    var digest: [Sha256.digest_length]u8 = undefined;
    sha.final(&digest);
    return if (sumsMatch(listed, digest)) .bound else .mismatch;
}

/// Refuse sums that are not for `tag`. A build that checks signatures
/// requires the binding (`NoVersion` without it); a build without a key
/// trusts the release anyway and only refuses a line that names another
/// version.
pub fn checkBinding(sums: []const u8, tag: []const u8, signed: bool) error{ NoVersion, VersionMismatch }!void {
    switch (sumsBinding(sums, tag)) {
        .bound => {},
        .absent => if (signed) return error.NoVersion,
        .mismatch => return error.VersionMismatch,
    }
}

/// Is there any line for `name` (well formed or not)?
fn hasSumLine(sums: []const u8, name: []const u8) bool {
    var lines = std.mem.splitScalar(u8, sums, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trimEnd(u8, raw, "\r \t");
        if (line.len <= name.len) continue;
        if (!std.mem.endsWith(u8, line, name)) continue;
        const before = line[line.len - name.len - 1];
        if (before == ' ' or before == '\t' or before == '*') return true;
    }
    return false;
}

/// The version in the package's `build-info.json`
/// (`{"app": "14.0.0", …}`, written by scripts/sync-dist.mjs).
pub fn buildInfoVersion(text: []const u8, out: []u8) ?[]const u8 {
    const Info = struct { app: []const u8 = "" };
    var scratch: [4096]u8 = undefined;
    var fba = std.heap.FixedBufferAllocator.init(&scratch);
    const parsed = std.json.parseFromSliceLeaky(Info, fba.allocator(), text, .{ .ignore_unknown_fields = true }) catch return null;
    if (parsed.app.len == 0 or parsed.app.len > out.len) return null;
    @memcpy(out[0..parsed.app.len], parsed.app);
    return out[0..parsed.app.len];
}

/// The value of `CFBundleShortVersionString` in an Info.plist (XML).
pub fn plistVersion(text: []const u8) ?[]const u8 {
    const key = "<key>CFBundleShortVersionString</key>";
    const at = std.mem.indexOf(u8, text, key) orelse return null;
    const rest = text[at + key.len ..];
    const open = std.mem.indexOf(u8, rest, "<string>") orelse return null;
    // The value belongs to this key only when nothing but white space
    // separates them.
    if (std.mem.trim(u8, rest[0..open], " \t\r\n").len != 0) return null;
    const value = rest[open + "<string>".len ..];
    const close = std.mem.indexOf(u8, value, "</string>") orelse return null;
    return std.mem.trim(u8, value[0..close], " \t\r\n");
}

/// Is `version` (as a package states it: "14.0.0") the version of `tag`
/// ("v14.0.0")? Compared as versions, so "14.0" equals "v14.0.0".
pub fn versionIsTag(version: []const u8, tag: []const u8) bool {
    const a = update.Version.parse(version) orelse return false;
    const b = update.Version.parse(tag) orelse return false;
    return a.order(b) == .eq;
}

// ------------------------------------------------------------ checksums

/// The lowercase hex SHA-256 listed for `name` in a `sha256sum` file
/// (`<hex>  <name>` or `<hex> *<name>`). Null when missing, malformed, or
/// listed twice with different sums.
pub fn findSum(sums: []const u8, name: []const u8) ?[64]u8 {
    var found: ?[64]u8 = null;
    var lines = std.mem.splitScalar(u8, sums, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trimEnd(u8, raw, "\r \t");
        if (line.len < 66) continue;
        const hex = line[0..64];
        var rest = line[64..];
        if (rest[0] != ' ' and rest[0] != '\t') continue;
        rest = std.mem.trimStart(u8, rest, " \t");
        if (rest.len > 0 and rest[0] == '*') rest = rest[1..];
        if (!std.mem.eql(u8, rest, name)) continue;
        var lower: [64]u8 = undefined;
        for (hex, 0..) |c, i| {
            if (!std.ascii.isHex(c)) return null;
            lower[i] = std.ascii.toLower(c);
        }
        if (found) |prev| {
            if (!std.mem.eql(u8, &prev, &lower)) return null;
        }
        found = lower;
    }
    return found;
}

pub fn hexDigest(digest: [Sha256.digest_length]u8) [64]u8 {
    return std.fmt.bytesToHex(digest, .lower);
}

pub fn sumsMatch(expected: [64]u8, digest: [Sha256.digest_length]u8) bool {
    const actual = hexDigest(digest);
    return std.crypto.timing_safe.eql([64]u8, actual, expected);
}

/// SHA-256 of a file on disk.
pub fn hashFile(io: std.Io, path: []const u8) ![Sha256.digest_length]u8 {
    var file = try std.Io.Dir.openFileAbsolute(io, path, .{});
    defer file.close(io);
    var sha = Sha256.init(.{});
    var buf: [64 * 1024]u8 = undefined;
    var offset: u64 = 0;
    while (true) {
        const n = try file.readPositionalAll(io, &buf, offset);
        if (n == 0) break;
        sha.update(buf[0..n]);
        offset += n;
        if (n < buf.len) break;
    }
    var digest: [Sha256.digest_length]u8 = undefined;
    sha.final(&digest);
    return digest;
}

// ------------------------------------------------------------ packages

/// The staged package's top-level item inside `unpacked/`: the name the
/// release's .zip holds today.
pub fn stagedRootName(p: Platform) []const u8 {
    return stagedRootNames(p)[0];
}

/// Every top-level name a package for `p` may carry. The macOS .zip holds
/// `GobanStudio.app` (what every released app expects); `Goban Studio.app`
/// (the name in the .dmg) is accepted too, so a later release can give
/// both downloads the same name without stranding this version.
pub fn stagedRootNames(p: Platform) []const []const u8 {
    return switch (p) {
        .macos_arm64, .macos_x64 => &.{ "GobanStudio.app", "Goban Studio.app" },
        else => &.{"GobanStudio"},
    };
}

/// Executable path inside the staged package, relative to its root.
fn stagedExeRel(p: Platform) []const u8 {
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

fn runTool(io: std.Io, argv: []const []const u8) bool {
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

fn fileExists(io: std.Io, path: []const u8) bool {
    std.Io.Dir.accessAbsolute(io, path, .{}) catch return false;
    return true;
}

fn readHead(io: std.Io, path: []const u8, buf: []u8) ?[]const u8 {
    var file = std.Io.Dir.openFileAbsolute(io, path, .{}) catch return null;
    defer file.close(io);
    const n = file.readPositionalAll(io, buf, 0) catch return null;
    return buf[0..n];
}

/// Where the package states its own version, relative to its root.
fn buildInfoRel(p: Platform) []const u8 {
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
pub fn stagedVersionMatches(io: std.Io, platform: Platform, root_path: []const u8, tag: []const u8) bool {
    var path_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const info_path = std.fmt.bufPrint(&path_buf, "{s}{c}{s}", .{ root_path, std.fs.path.sep, buildInfoRel(platform) }) catch return false;
    var info_buf: [2048]u8 = undefined;
    const info = readHead(io, info_path, &info_buf) orelse return false;
    var version_buf: [64]u8 = undefined;
    const version = buildInfoVersion(info, &version_buf) orelse return false;
    if (!versionIsTag(version, tag)) return false;
    switch (platform) {
        .macos_arm64, .macos_x64 => {
            const plist = std.fmt.bufPrint(&path_buf, "{s}/Contents/Info.plist", .{root_path}) catch return false;
            var plist_buf: [16 * 1024]u8 = undefined;
            const text = readHead(io, plist, &plist_buf) orelse return false;
            return versionIsTag(plistVersion(text) orelse return false, tag);
        },
        else => return true,
    }
}

/// Is the unpacked package what this app expects: the right layout, the
/// right bundle id (macOS) and an executable for `platform`'s CPU?
pub fn checkStaged(io: std.Io, platform: Platform, root_path: []const u8) bool {
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

// ------------------------------------------------------------ install target

pub const Blocked = enum {
    none,
    /// Not macOS or Windows.
    Unsupported,
    /// A development build (no .app bundle / no bin\ + resources\ layout).
    NotPackaged,
    /// macOS App Translocation: the app runs from a randomized read-only
    /// copy (it was opened from Downloads with the quarantine flag).
    Translocated,
    /// The app, or the folder it is in, cannot be written by this user.
    ReadOnlyLocation,
    /// No per-user temp directory to stage in.
    NoTempDir,
    /// Not probed yet this session (`studio.updateStatus` without `probe`).
    NotChecked,
};

/// The installed package to replace, derived from the executable path:
///   macOS:   <dir>/<Name>.app/Contents/MacOS/<exe>   → <dir>/<Name>.app
///   Windows: <root>\bin\goban-studio.exe             → <root>
pub fn installRootFromExe(exe: []const u8, os: std.Target.Os.Tag) ?[]const u8 {
    switch (os) {
        .macos => {
            const macos_dir = dirname(exe, '/') orelse return null;
            if (!std.mem.eql(u8, basename(macos_dir, '/'), "MacOS")) return null;
            const contents = dirname(macos_dir, '/') orelse return null;
            if (!std.mem.eql(u8, basename(contents, '/'), "Contents")) return null;
            const bundle = dirname(contents, '/') orelse return null;
            if (!std.mem.endsWith(u8, bundle, ".app") or bundle.len <= 5) return null;
            if (dirname(bundle, '/') == null) return null;
            return bundle;
        },
        .windows => {
            const bin = dirname(exe, '\\') orelse return null;
            if (!std.ascii.eqlIgnoreCase(basename(bin, '\\'), "bin")) return null;
            const root = dirname(bin, '\\') orelse return null;
            // A drive root ("C:") cannot be renamed.
            if (root.len <= 3 or dirname(root, '\\') == null) return null;
            return root;
        },
        else => return null,
    }
}

fn dirname(path: []const u8, sep: u8) ?[]const u8 {
    var end = path.len;
    while (end > 1 and (path[end - 1] == sep or (sep == '\\' and path[end - 1] == '/'))) end -= 1;
    const i = std.mem.lastIndexOfAny(u8, path[0..end], if (sep == '\\') "\\/" else "/") orelse return null;
    if (i == 0) return path[0..1];
    return path[0..i];
}

fn basename(path: []const u8, sep: u8) []const u8 {
    const i = std.mem.lastIndexOfAny(u8, path, if (sep == '\\') "\\/" else "/") orelse return path;
    return path[i + 1 ..];
}

/// Can this user create and remove a file in `dir`?
fn probeWritable(io: std.Io, dir: []const u8, token: []const u8) bool {
    var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const probe = std.fmt.bufPrint(&buf, "{s}{c}.goban-write-test-{s}", .{ dir, std.fs.path.sep, token }) catch return false;
    var file = std.Io.Dir.createFileAbsolute(io, probe, .{ .exclusive = true }) catch return false;
    file.close(io);
    std.Io.Dir.deleteFileAbsolute(io, probe) catch {};
    return true;
}

pub const Target = struct {
    blocked: Blocked = .Unsupported,
    root_buf: [std.Io.Dir.max_path_bytes]u8 = undefined,
    root_len: usize = 0,

    pub fn root(self: *const Target) []const u8 {
        return self.root_buf[0..self.root_len];
    }
};

/// Find the installation and decide whether it can be replaced in place.
pub fn detectTarget(io: std.Io, token: []const u8) Target {
    var t: Target = .{};
    if (currentPlatform() == .unsupported) return t;
    var exe_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const exe_len = std.process.executablePath(io, &exe_buf) catch {
        t.blocked = .NotPackaged;
        return t;
    };
    const exe = exe_buf[0..exe_len];
    const root = installRootFromExe(exe, builtin.os.tag) orelse {
        t.blocked = .NotPackaged;
        return t;
    };
    @memcpy(t.root_buf[0..root.len], root);
    t.root_len = root.len;
    if (builtin.os.tag == .macos and std.mem.indexOf(u8, root, "/AppTranslocation/") != null) {
        t.blocked = .Translocated;
        return t;
    }
    if (builtin.os.tag == .windows) {
        var buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
        const res = std.fmt.bufPrint(&buf, "{s}\\resources\\frontend\\dist", .{root}) catch {
            t.blocked = .NotPackaged;
            return t;
        };
        var d = std.Io.Dir.cwd().openDir(io, res, .{}) catch {
            t.blocked = .NotPackaged;
            return t;
        };
        d.close(io);
    }
    const parent = dirname(root, if (builtin.os.tag == .windows) '\\' else '/') orelse {
        t.blocked = .NotPackaged;
        return t;
    };
    var inner_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const inner = std.fmt.bufPrint(&inner_buf, "{s}{c}{s}", .{ root, std.fs.path.sep, if (builtin.os.tag == .windows) "bin" else "Contents" }) catch {
        t.blocked = .NotPackaged;
        return t;
    };
    if (!probeWritable(io, parent, token) or !probeWritable(io, inner, token)) {
        t.blocked = .ReadOnlyLocation;
        return t;
    }
    t.blocked = .none;
    return t;
}

/// `<temp>/GobanStudio-update`, from TMPDIR (macOS) or TEMP/TMP (Windows).
pub fn stagingRoot(env: *const std.process.Environ.Map, buf: []u8) ?[]const u8 {
    const keys: []const []const u8 = if (builtin.os.tag == .windows) &.{ "TEMP", "TMP", "LOCALAPPDATA" } else &.{"TMPDIR"};
    for (keys) |key| {
        const dir = env.get(key) orelse continue;
        if (dir.len == 0 or !std.fs.path.isAbsolute(dir)) continue;
        const trimmed = std.mem.trimEnd(u8, dir, "/\\");
        return std.fmt.bufPrint(buf, "{s}{c}{s}", .{ trimmed, std.fs.path.sep, staging_dir_name }) catch null;
    }
    return null;
}

// ------------------------------------------------------------ launch args

/// What the helper told this launch, from argv.
pub const LaunchNote = struct {
    /// Write this file once the app is up (the helper is waiting for it).
    ack_buf: [1024]u8 = undefined,
    ack_len: usize = 0,
    /// Launched by the helper after a successful swap.
    just_updated: bool = false,
    /// Relaunched by the helper after a failed install was rolled back.
    install_failed: bool = false,
    acked: bool = false,

    pub fn ackPath(self: *const LaunchNote) []const u8 {
        return self.ack_buf[0..self.ack_len];
    }

    /// Accepts `--goban-update-ack=<absolute path to goban-update-ack-*.txt>`
    /// and `--goban-update-failed`; ignores everything else.
    pub fn noteArg(self: *LaunchNote, arg: []const u8) void {
        if (std.mem.eql(u8, arg, failed_arg)) {
            self.install_failed = true;
            return;
        }
        if (!std.mem.startsWith(u8, arg, ack_arg)) return;
        const path = arg[ack_arg.len..];
        if (!validAckPath(path) or path.len > self.ack_buf.len) return;
        @memcpy(self.ack_buf[0..path.len], path);
        self.ack_len = path.len;
        self.just_updated = true;
    }
};

pub fn validAckPath(path: []const u8) bool {
    if (path.len == 0 or path.len > 1024 or !std.fs.path.isAbsolute(path)) return false;
    for (path) |c| {
        if (c < 0x20) return false;
    }
    const name = std.fs.path.basename(path);
    if (!std.mem.startsWith(u8, name, ack_prefix) or !std.mem.endsWith(u8, name, ".txt")) return false;
    for (name[ack_prefix.len .. name.len - 4]) |c| {
        if (!std.ascii.isAlphanumeric(c)) return false;
    }
    return name.len > ack_prefix.len + 4;
}

/// Tell the waiting helper that this (new) app started and its page is up.
pub fn writeAck(io: std.Io, note: *LaunchNote) void {
    if (note.acked or note.ack_len == 0) return;
    note.acked = true;
    var file = std.Io.Dir.createFileAbsolute(io, note.ackPath(), .{ .exclusive = true }) catch return;
    defer file.close(io);
    file.writeStreamingAll(io, "ok\n") catch {};
}

// ------------------------------------------------------------ state

pub const Phase = enum { idle, downloading, verifying, unpacking, ready, installing, failed, cancelled };

pub const WakeFn = update.WakeFn;

const path_cap = std.Io.Dir.max_path_bytes;

pub const Snapshot = struct {
    phase: Phase = .idle,
    gen: u64 = 0,
    tag_buf: [64]u8 = undefined,
    tag_len: usize = 0,
    received: u64 = 0,
    total: u64 = 0,
    error_name: []const u8 = "",
    last_activity_ms: i64 = 0,
    /// Times this download was continued on a new connection after the
    /// old one went silent.
    retries: u32 = 0,

    pub fn tag(self: *const Snapshot) []const u8 {
        return self.tag_buf[0..self.tag_len];
    }
};

pub const Installer = struct {
    io: std.Io = undefined,
    lock: std.Io.Mutex = .init,
    platform: Platform = .unsupported,
    note: LaunchNote = .{},
    /// Set once before the first download (`setPublicKey`): when present,
    /// SHA256SUMS must carry a valid signature by it.
    public_key: ?[Ed25519.PublicKey.encoded_length]u8 = null,
    /// Set once before the first download (`setEnv`): where the proxy
    /// settings are read from (net.zig). Null: always connect directly.
    env: ?*const std.process.Environ.Map = null,
    /// Tests: called instead of starting a download thread.
    spawn_hook: ?*const fn (self: *Installer, job: *Job) void = null,

    // --- guarded by `lock`
    snap: Snapshot = .{},
    cancel_requested: bool = false,
    running: u32 = 0,
    /// Which thread of the current generation is the live one: a stalled
    /// connection is abandoned by starting the next attempt.
    attempt: u64 = 0,
    stall_retries: u32 = 0,
    wake_context: ?*anyopaque = null,
    wake_fn: ?WakeFn = null,
    /// The staging directory for the current generation (`<root>/<token>`).
    job_dir_buf: [path_cap]u8 = undefined,
    job_dir_len: usize = 0,
    /// The verified, unpacked package (`<job>/unpacked/<GobanStudio[.app]>`).
    staged_buf: [path_cap]u8 = undefined,
    staged_len: usize = 0,
    /// The root was emptied once this session (before the first download).
    root_cleaned: bool = false,

    pub fn init(self: *Installer, io: std.Io) void {
        self.* = .{};
        self.io = io;
        self.platform = currentPlatform();
    }

    pub fn setWake(self: *Installer, context: ?*anyopaque, wake_fn: ?WakeFn) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.wake_context = context;
        self.wake_fn = wake_fn;
    }

    pub fn setPublicKey(self: *Installer, key: ?[Ed25519.PublicKey.encoded_length]u8) void {
        self.public_key = key;
    }

    pub fn setEnv(self: *Installer, env: ?*const std.process.Environ.Map) void {
        self.env = env;
    }

    pub fn snapshot(self: *Installer) Snapshot {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.snap;
    }

    pub fn stagedPath(self: *Installer, out: []u8) ?[]const u8 {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.snap.phase != .ready or self.staged_len == 0 or out.len < self.staged_len) return null;
        @memcpy(out[0..self.staged_len], self.staged_buf[0..self.staged_len]);
        return out[0..self.staged_len];
    }

    /// Start downloading `tag` into a fresh directory under `root`. UI thread.
    pub fn start(self: *Installer, root: []const u8, tag: []const u8, now_ms: i64) !u64 {
        if (!validTag(tag)) return error.BadTag;
        const asset = self.platform.assetName() orelse return error.Unsupported;
        _ = asset;
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        switch (self.snap.phase) {
            .downloading, .verifying, .unpacking, .installing => return error.Busy,
            else => {},
        }
        // Threads abandoned earlier (stalled sockets) may still be running;
        // they only ever touch their own directory, and never write once
        // they are not the live attempt.
        if (self.running >= max_running) return error.Busy;
        if (!self.root_cleaned and self.running == 0) {
            std.Io.Dir.cwd().deleteTree(self.io, root) catch {};
            self.root_cleaned = true;
        } else if (self.job_dir_len > 0) {
            std.Io.Dir.cwd().deleteTree(self.io, self.job_dir_buf[0..self.job_dir_len]) catch {};
        }
        var token_bytes: [8]u8 = undefined;
        self.io.random(&token_bytes);
        const token = std.fmt.bytesToHex(token_bytes, .lower);
        const job_dir = std.fmt.bufPrint(&self.job_dir_buf, "{s}{c}{s}", .{ root, std.fs.path.sep, &token }) catch return error.NoTempDir;
        self.job_dir_len = job_dir.len;
        std.Io.Dir.cwd().createDirPath(self.io, job_dir) catch return error.Disk;
        self.staged_len = 0;
        self.cancel_requested = false;
        self.snap.gen += 1;
        self.attempt += 1;
        self.stall_retries = 0;
        self.snap.retries = 0;
        self.snap.phase = .downloading;
        self.snap.received = 0;
        self.snap.total = 0;
        self.snap.error_name = "";
        self.snap.last_activity_ms = now_ms;
        @memcpy(self.snap.tag_buf[0..tag.len], tag);
        self.snap.tag_len = tag.len;
        self.spawnLocked() catch |err| {
            self.snap.phase = .failed;
            self.snap.error_name = "Unavailable";
            return err;
        };
        return self.snap.gen;
    }

    /// Lock held: start a thread for the current generation and attempt,
    /// working in the current job directory.
    fn spawnLocked(self: *Installer) !void {
        const job = try std.heap.page_allocator.create(Job);
        job.* = .{ .gen = self.snap.gen, .attempt = self.attempt, .platform = self.platform, .public_key = self.public_key };
        const tag = self.snap.tag();
        @memcpy(job.tag_buf[0..tag.len], tag);
        job.tag_len = tag.len;
        @memcpy(job.dir_buf[0..self.job_dir_len], self.job_dir_buf[0..self.job_dir_len]);
        job.dir_len = self.job_dir_len;
        if (self.spawn_hook) |hook| {
            hook(self, job);
        } else {
            const thread = std.Thread.spawn(.{ .stack_size = 16 * 1024 * 1024 }, run, .{ self, job }) catch |err| {
                std.heap.page_allocator.destroy(job);
                return err;
            };
            thread.detach();
        }
        self.running += 1;
    }

    /// Stop the download, or discard a staged update. UI thread.
    pub fn cancel(self: *Installer) Phase {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        switch (self.snap.phase) {
            .downloading, .verifying, .unpacking => {
                // The thread notices at its next chunk and removes its
                // directory; the page is answered now.
                self.cancel_requested = true;
                self.snap.gen += 1;
                self.snap.phase = .cancelled;
                self.snap.error_name = "Cancelled";
                self.job_dir_len = 0;
            },
            .ready, .failed, .cancelled => {
                if (self.job_dir_len > 0) std.Io.Dir.cwd().deleteTree(self.io, self.job_dir_buf[0..self.job_dir_len]) catch {};
                self.job_dir_len = 0;
                self.staged_len = 0;
                self.snap.phase = .idle;
                self.snap.error_name = "";
            },
            .idle, .installing => {},
        }
        return self.snap.phase;
    }

    /// The UI thread's watchdog. A download without a byte for
    /// `stall_timeout_ms` is stuck on a dead connection: its thread is
    /// abandoned and a new one continues from the bytes on disk. After
    /// `max_stall_retries` of those the download fails as `Stalled` (true).
    pub fn checkStall(self: *Installer, now_ms: i64) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.snap.phase != .downloading) return false;
        if (now_ms - self.snap.last_activity_ms < stall_timeout_ms) return false;
        if (self.stall_retries < max_stall_retries and self.running < max_running and self.job_dir_len > 0) {
            const previous = self.attempt;
            self.attempt += 1;
            if (self.spawnLocked()) |_| {
                self.stall_retries += 1;
                self.snap.retries = self.stall_retries;
                self.snap.last_activity_ms = now_ms;
                return false;
            } else |_| {
                self.attempt = previous;
            }
        }
        self.cancel_requested = true;
        self.snap.gen += 1;
        self.snap.phase = .failed;
        self.snap.error_name = "Stalled";
        self.job_dir_len = 0;
        return true;
    }

    pub fn markInstalling(self: *Installer) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        self.snap.phase = .installing;
    }

    pub fn markApplyFailed(self: *Installer, name: []const u8) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.snap.phase == .installing) self.snap.phase = .ready;
        self.snap.error_name = name;
    }

    // -------------------------------------------------- download thread

    pub const Job = struct {
        gen: u64,
        attempt: u64 = 0,
        platform: Platform,
        public_key: ?[Ed25519.PublicKey.encoded_length]u8 = null,
        tag_buf: [64]u8 = undefined,
        tag_len: usize = 0,
        dir_buf: [path_cap]u8 = undefined,
        dir_len: usize = 0,

        fn tag(self: *const Job) []const u8 {
            return self.tag_buf[0..self.tag_len];
        }
        fn dir(self: *const Job) []const u8 {
            return self.dir_buf[0..self.dir_len];
        }
    };

    /// Lock held: is `job` the thread the UI is waiting for?
    fn liveLocked(self: *Installer, job: *const Job) bool {
        return self.snap.gen == job.gen and self.attempt == job.attempt and !self.cancel_requested;
    }

    fn current(self: *Installer, job: *const Job) bool {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        return self.liveLocked(job);
    }

    fn setPhase(self: *Installer, job: *const Job, phase: Phase) void {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (self.liveLocked(job)) self.snap.phase = phase;
    }

    /// Note that bytes arrived (the stall watchdog reads the time); with
    /// `report` also how many, for the page. False: `job` is not live.
    fn progress(self: *Installer, job: *const Job, report: bool, received: u64, total: u64) bool {
        const now = std.Io.Timestamp.now(self.io, .awake).toMilliseconds();
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        if (!self.liveLocked(job)) return false;
        if (report) {
            self.snap.received = received;
            self.snap.total = total;
        }
        self.snap.last_activity_ms = now;
        return true;
    }

    fn finish(self: *Installer, job: *Job, outcome: anyerror!void, staged: []const u8) void {
        self.lock.lockUncancelable(self.io);
        self.running -= 1;
        const same_gen = self.snap.gen == job.gen and !self.cancel_requested;
        const wanted = same_gen and self.attempt == job.attempt;
        // Replaced by a later attempt of the same download, which works in
        // the same directory: this thread leaves everything as it is.
        const superseded = same_gen and !wanted;
        if (wanted) {
            if (outcome) |_| {
                @memcpy(self.staged_buf[0..staged.len], staged);
                self.staged_len = staged.len;
                self.snap.phase = .ready;
                self.snap.error_name = "";
            } else |err| {
                self.snap.phase = .failed;
                self.snap.error_name = errorName(err);
            }
        }
        const wake_fn = self.wake_fn;
        const wake_context = self.wake_context;
        self.lock.unlock(self.io);
        // Cancelled, abandoned or failed: nothing in the directory is kept.
        const failed = if (outcome) |_| false else |_| true;
        if (!superseded and (!wanted or failed)) std.Io.Dir.cwd().deleteTree(self.io, job.dir()) catch {};
        std.heap.page_allocator.destroy(job);
        if (wanted) {
            if (wake_fn) |f| f(wake_context) catch {};
        }
    }

    fn run(self: *Installer, job: *Job) void {
        var staged_buf: [path_cap]u8 = undefined;
        var staged: []const u8 = "";
        const outcome = self.work(job, &staged_buf, &staged);
        self.finish(job, outcome, staged);
    }

    fn work(self: *Installer, job: *Job, staged_buf: []u8, staged: *[]const u8) !void {
        const io = self.io;
        const asset = job.platform.assetName() orelse return error.Unsupported;
        // Through the proxy the environment or the system names, if any.
        var session: net.Session = undefined;
        session.init(std.heap.page_allocator, io, self.env, "github.com");
        defer session.deinit();

        var url_buf: [512]u8 = undefined;
        var path_buf: [path_cap]u8 = undefined;

        // SHA256SUMS first: small, and a release without it is refused
        // before the large download starts.
        const sums_url = try downloadUrl(&url_buf, job.tag(), sums_name);
        const sums_path = std.fmt.bufPrint(&path_buf, "{s}{c}{s}", .{ job.dir(), std.fs.path.sep, sums_name }) catch return error.Disk;
        try self.fetchFile(&session, job, sums_url, sums_path, max_sums_bytes, false, false);
        var sums_text_buf: [max_sums_bytes]u8 = undefined;
        const sums_text = readHead(io, sums_path, &sums_text_buf) orelse return error.Disk;
        // Signed builds: the sums must be signed by the build's key before
        // anything in them is believed (and before the large download).
        if (job.public_key) |key| {
            var sig_path_buf: [path_cap]u8 = undefined;
            const sig_url = try downloadUrl(&url_buf, job.tag(), sig_name);
            const sig_path = std.fmt.bufPrint(&sig_path_buf, "{s}{c}{s}", .{ job.dir(), std.fs.path.sep, sig_name }) catch return error.Disk;
            self.fetchFile(&session, job, sig_url, sig_path, max_sig_bytes, false, false) catch |err| switch (err) {
                error.NoAsset => return error.NoSignature,
                else => return err,
            };
            var sig_text_buf: [max_sig_bytes]u8 = undefined;
            const sig_text = readHead(io, sig_path, &sig_text_buf) orelse return error.Disk;
            try verifySums(sums_text, sig_text, key);
        }
        // The (signed) sums must be the ones of the tag being installed.
        try checkBinding(sums_text, job.tag(), job.public_key != null);
        const expected = findSum(sums_text, asset) orelse return error.NoChecksum;

        // The package. A thread that takes over a stalled download finds
        // the file and continues it.
        const asset_url = try downloadUrl(&url_buf, job.tag(), asset);
        var zip_buf: [path_cap]u8 = undefined;
        const zip_path = std.fmt.bufPrint(&zip_buf, "{s}{c}{s}", .{ job.dir(), std.fs.path.sep, asset }) catch return error.Disk;
        try self.fetchFile(&session, job, asset_url, zip_path, max_asset_bytes, true, true);

        self.setPhase(job, .verifying);
        if (!self.current(job)) return error.Cancelled;
        // Hashed from disk: what gets unpacked is what was verified,
        // however many connections its bytes arrived on.
        const on_disk = hashFile(io, zip_path) catch return error.Disk;
        if (!sumsMatch(expected, on_disk)) return error.ChecksumMismatch;

        self.setPhase(job, .unpacking);
        if (!self.current(job)) return error.Cancelled;
        var unpack_buf: [path_cap]u8 = undefined;
        const unpacked = std.fmt.bufPrint(&unpack_buf, "{s}{c}unpacked", .{ job.dir(), std.fs.path.sep }) catch return error.Disk;
        // A second attempt starts from a clean tree.
        std.Io.Dir.cwd().deleteTree(io, unpacked) catch {};
        try unpack(io, job.platform, zip_path, unpacked);
        var staged_root: []const u8 = "";
        for (stagedRootNames(job.platform)) |root_name| {
            const candidate = std.fmt.bufPrint(staged_buf, "{s}{c}{s}", .{ unpacked, std.fs.path.sep, root_name }) catch return error.Disk;
            if (fileExists(io, candidate)) {
                staged_root = candidate;
                break;
            }
        }
        if (staged_root.len == 0) return error.BadPackage;
        if (!checkStaged(io, job.platform, staged_root)) return error.BadPackage;
        // The package itself must say it is the version that was asked for.
        if (!stagedVersionMatches(io, job.platform, staged_root, job.tag())) return error.VersionMismatch;
        if (builtin.os.tag == .macos) {
            if (!runTool(io, &.{ "/usr/bin/codesign", "--verify", "--deep", "--strict", staged_root })) return error.BadPackage;
        }
        // The zip is no longer needed; the staged tree is.
        std.Io.Dir.deleteFileAbsolute(io, zip_path) catch {};
        if (!self.current(job)) return error.Cancelled;
        staged.* = staged_root;
    }

    /// Where a download's bytes go: a file only the live attempt writes.
    const FileSink = struct {
        installer: *Installer,
        job: *const Job,
        file: std.Io.File,
        report: bool,
        /// Bytes on disk so far.
        stored: u64 = 0,

        fn sinkWrite(context: *anyopaque, bytes: []const u8, offset: u64) anyerror!void {
            const ctx: *FileSink = @ptrCast(@alignCast(context));
            const self = ctx.installer;
            self.lock.lockUncancelable(self.io);
            defer self.lock.unlock(self.io);
            if (!self.liveLocked(ctx.job)) return error.Cancelled;
            ctx.file.writePositionalAll(self.io, bytes, offset) catch return error.Disk;
            ctx.stored = offset + bytes.len;
        }

        fn sinkRestart(context: *anyopaque) anyerror!void {
            const ctx: *FileSink = @ptrCast(@alignCast(context));
            const self = ctx.installer;
            self.lock.lockUncancelable(self.io);
            defer self.lock.unlock(self.io);
            if (!self.liveLocked(ctx.job)) return error.Cancelled;
            ctx.file.setLength(self.io, 0) catch return error.Disk;
            ctx.stored = 0;
        }

        fn sinkProgress(context: *anyopaque, received: u64, total: u64) bool {
            const ctx: *FileSink = @ptrCast(@alignCast(context));
            return ctx.installer.progress(ctx.job, ctx.report, received, total);
        }

        fn sink(ctx: *FileSink) net.Sink {
            return .{ .context = ctx, .write = sinkWrite, .restart = sinkRestart, .progress = sinkProgress };
        }
    };

    /// Sleep `ms` before a retry, in short steps. False: no longer live.
    fn waitRetry(self: *Installer, job: *const Job, ms: i64) bool {
        var left = ms;
        while (left > 0) : (left -= 250) {
            if (!self.current(job)) return false;
            std.Io.sleep(self.io, .fromMilliseconds(250), .awake) catch {};
        }
        return self.current(job);
    }

    /// GET `url` (one of this repository's release downloads) into
    /// `out_path`, following redirects only to GitHub's download hosts.
    /// With `resume_existing` a file already there is continued with a
    /// Range request. A connection that breaks off is retried
    /// (`max_network_retries` times in a row without a byte), each time
    /// asking only for the rest.
    fn fetchFile(
        self: *Installer,
        session: *net.Session,
        job: *const Job,
        url: []const u8,
        out_path: []const u8,
        max_bytes: u64,
        report: bool,
        resume_existing: bool,
    ) !void {
        if (!validDownloadUrl(url)) return error.BadTag;
        const io = self.io;
        // Only the live attempt opens (and may empty) the file.
        const file = blk: {
            self.lock.lockUncancelable(io);
            defer self.lock.unlock(io);
            if (!self.liveLocked(job)) return error.Cancelled;
            break :blk std.Io.Dir.createFileAbsolute(io, out_path, .{ .read = true, .truncate = !resume_existing }) catch return error.Disk;
        };
        defer file.close(io);
        var ctx: FileSink = .{ .installer = self, .job = job, .file = file, .report = report };
        var offset: u64 = if (resume_existing) (file.length(io) catch 0) else 0;
        if (offset > max_bytes) {
            try FileSink.sinkRestart(&ctx);
            offset = 0;
        }
        const chunk = std.heap.page_allocator.alloc(u8, 64 * 1024) catch return error.OutOfMemory;
        defer std.heap.page_allocator.free(chunk);
        var failures: u32 = 0;
        var requests: u32 = 0;
        while (true) {
            ctx.stored = offset;
            requests += 1;
            _ = net.fetch(session, .{
                .url = url,
                .user_agent = user_agent,
                .offset = offset,
                .max_bytes = max_bytes,
            }, ctx.sink(), chunk) catch |err| switch (err) {
                error.Network => {
                    // What arrived is on disk; ask for the rest.
                    failures = nextFailureCount(failures, ctx.stored > offset);
                    if (failures > max_network_retries or requests > 64) return error.Network;
                    offset = ctx.stored;
                    if (!self.waitRetry(job, net.retryDelayMs(failures))) return error.Cancelled;
                    continue;
                },
                else => return err,
            };
            return;
        }
    }
};

/// Broken connections in a row that brought nothing: one that did bring
/// bytes starts the count again.
pub fn nextFailureCount(failures: u32, made_progress: bool) u32 {
    return if (made_progress) 1 else failures + 1;
}

fn unpack(io: std.Io, platform: Platform, zip_path: []const u8, dest: []const u8) !void {
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

/// The error names the page sees (`{ok:false, error}`).
pub fn errorName(err: anyerror) []const u8 {
    return switch (err) {
        error.Busy => "Busy",
        error.BadTag => "BadTag",
        error.Unsupported => "Unsupported",
        error.Network => "Network",
        error.BadRedirect => "BadRedirect",
        error.HttpStatus => "HttpStatus",
        error.NoAsset => "NoAsset",
        error.TooLarge => "TooLarge",
        error.NoChecksum => "NoChecksum",
        error.NoSignature => "NoSignature",
        error.BadSignature => "BadSignature",
        error.NoVersion => "NoVersion",
        error.VersionMismatch => "VersionMismatch",
        error.SizeMismatch => "Network",
        error.ChecksumMismatch => "ChecksumMismatch",
        error.Unpack => "Unpack",
        error.BadPackage => "BadPackage",
        error.Cancelled => "Cancelled",
        error.Disk => "Disk",
        error.NoTempDir => "NoTempDir",
        error.OutOfMemory => "OutOfMemory",
        else => "Unavailable",
    };
}

// ------------------------------------------------------------ apply

/// The installation's helper lock: `.<name>.goban-lock` beside it (a
/// directory holding the helper's pid on macOS, a delete-on-close file
/// held open without sharing on Windows; see src/updater/).
pub fn lockPath(buf: []u8, target: []const u8) ?[]const u8 {
    const parent = std.fs.path.dirname(target) orelse return null;
    const name = std.fs.path.basename(target);
    if (name.len == 0) return null;
    return std.fmt.bufPrint(buf, "{s}{c}.{s}.goban-lock", .{ parent, std.fs.path.sep, name }) catch null;
}

/// Is another update helper working on `target` right now? macOS: the
/// lock directory names a live process. Windows: the lock file exists at
/// all (it is deleted when its holder's handle closes, even on a crash).
pub fn helperLockHeld(io: std.Io, target: []const u8) bool {
    var buf: [path_cap]u8 = undefined;
    const lock = lockPath(&buf, target) orelse return false;
    switch (builtin.os.tag) {
        .windows => return fileExists(io, lock),
        .macos, .linux => {
            var pid_path_buf: [path_cap]u8 = undefined;
            const pid_path = std.fmt.bufPrint(&pid_path_buf, "{s}/pid", .{lock}) catch return false;
            var text_buf: [32]u8 = undefined;
            const text = readHead(io, pid_path, &text_buf) orelse return false;
            const pid = std.fmt.parseInt(std.posix.pid_t, std.mem.trim(u8, text, " \t\r\n"), 10) catch return false;
            if (pid <= 0) return false;
            // Signal 0: only "does it exist" (EPERM: it does, another user's).
            std.posix.kill(pid, @enumFromInt(0)) catch |err| return err == error.PermissionDenied;
            return true;
        },
        else => return false,
    }
}

/// A helper is done within minutes (it waits at most five for the app to
/// exit and a minute and a half for the new one). A lock older than this
/// was left behind by a helper that was killed, or names a process id that
/// now belongs to something else: it must not keep the app from starting.
pub const helper_lock_max_age_ms: i64 = 20 * 60 * 1000;

fn lockAgeMs(io: std.Io, target: []const u8) ?i64 {
    var buf: [path_cap]u8 = undefined;
    const lock = lockPath(&buf, target) orelse return null;
    const stat = std.Io.Dir.cwd().statFile(io, lock, .{}) catch return null;
    const now = std.Io.Timestamp.now(io, .real).toMilliseconds();
    return now - stat.mtime.toMilliseconds();
}

pub fn lockIsRecent(age_ms: i64) bool {
    // A clock that went backwards makes the lock look new: still recent.
    return age_ms < helper_lock_max_age_ms;
}

/// Is an update helper replacing the installation at `target` right now?
/// A launch must not get in its way: files opened from the folder being
/// swapped would make the swap fail. When the lock's age cannot be read
/// the answer is no: better a launch that disturbs an update (the helper
/// retries, then rolls back) than an app that will not start.
pub fn updateInProgress(io: std.Io, target: []const u8) bool {
    if (!helperLockHeld(io, target)) return false;
    return lockIsRecent(lockAgeMs(io, target) orelse return false);
}

/// `updateInProgress` for the installation this process runs from; false
/// for a development build.
pub fn ownUpdateInProgress(io: std.Io) bool {
    var exe_buf: [path_cap]u8 = undefined;
    const exe_len = std.process.executablePath(io, &exe_buf) catch return false;
    const root = installRootFromExe(exe_buf[0..exe_len], builtin.os.tag) orelse return false;
    return updateInProgress(io, root);
}

/// Did the helper create its "started" marker?
pub fn helperStarted(io: std.Io, path: []const u8) bool {
    var buf: [16]u8 = undefined;
    const text = readHead(io, path, &buf) orelse return false;
    return std.mem.startsWith(u8, text, "started");
}

/// The app stops waiting: create the marker itself, exclusively, so a
/// helper that starts later finds it taken and gives up without touching
/// anything. False when the helper got there first (it did start).
pub fn claimStarted(io: std.Io, path: []const u8) bool {
    var file = std.Io.Dir.createFileAbsolute(io, path, .{ .exclusive = true }) catch return false;
    defer file.close(io);
    file.writeStreamingAll(io, "cancelled\n") catch {};
    return true;
}

pub const HelperStart = struct {
    /// An error name for the page, or null when the helper was started.
    err: ?[]const u8 = null,
    /// The marker the helper creates once it holds the lock.
    started: []const u8 = "",
};

/// Write the embedded helper into the staging root and start it detached.
/// The caller waits for `HelperStart.started` to appear (`helperStarted`)
/// before it quits. `started_buf` holds the marker's path.
pub fn startHelper(
    io: std.Io,
    env: *const std.process.Environ.Map,
    root: []const u8,
    target: []const u8,
    staged: []const u8,
    started_buf: []u8,
) HelperStart {
    const fail = HelperStart{ .err = "Helper" };
    // A lock left behind long ago by a helper that was killed is not one;
    // a lock whose age cannot be read is taken at its word.
    if (helperLockHeld(io, target) and lockIsRecent(lockAgeMs(io, target) orelse 0)) return .{ .err = "HelperBusy" };
    var token_bytes: [8]u8 = undefined;
    io.random(&token_bytes);
    const token = std.fmt.bytesToHex(token_bytes, .lower);
    var script_buf: [path_cap]u8 = undefined;
    var ack_buf: [path_cap]u8 = undefined;
    var log_buf: [path_cap]u8 = undefined;
    const ext = if (builtin.os.tag == .windows) "ps1" else "sh";
    const script = std.fmt.bufPrint(&script_buf, "{s}{c}apply-{s}.{s}", .{ root, std.fs.path.sep, &token, ext }) catch return fail;
    const ack = std.fmt.bufPrint(&ack_buf, "{s}{c}{s}{s}.txt", .{ root, std.fs.path.sep, ack_prefix, &token }) catch return fail;
    const started = std.fmt.bufPrint(started_buf, "{s}{c}{s}{s}.txt", .{ root, std.fs.path.sep, started_prefix, &token }) catch return fail;
    const parent = std.fs.path.dirname(root) orelse return fail;
    const log = std.fmt.bufPrint(&log_buf, "{s}{c}{s}", .{ parent, std.fs.path.sep, log_name }) catch return fail;
    {
        var file = std.Io.Dir.createFileAbsolute(io, script, .{ .exclusive = true }) catch return fail;
        defer file.close(io);
        const text = if (builtin.os.tag == .windows) helper_windows else helper_macos;
        file.writeStreamingAll(io, text) catch return fail;
    }
    var pid_buf: [24]u8 = undefined;
    var timeout_buf: [12]u8 = undefined;
    const timeout = std.fmt.bufPrint(&timeout_buf, "{d}", .{ack_timeout_s}) catch return fail;
    switch (builtin.os.tag) {
        .macos => {
            const pid = std.fmt.bufPrint(&pid_buf, "{d}", .{std.c.getpid()}) catch return fail;
            _ = std.process.spawn(io, .{
                .argv = &.{ "/bin/sh", script, pid, target, staged, ack, log, timeout, root, started },
                // Never inside the bundle it is about to move.
                .cwd = .{ .path = root },
                .stdin = .ignore,
                .stdout = .ignore,
                .stderr = .ignore,
                // Its own process group: nothing sent to the app's group
                // while it quits reaches the helper.
                .pgid = 0,
            }) catch return fail;
        },
        .windows => {
            const pid = std.fmt.bufPrint(&pid_buf, "{d}", .{std.os.windows.GetCurrentProcessId()}) catch return fail;
            var ps_buf: [path_cap]u8 = undefined;
            const system_root = env.get("SystemRoot") orelse env.get("SYSTEMROOT") orelse "C:\\Windows";
            const powershell = std.fmt.bufPrint(&ps_buf, "{s}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", .{system_root}) catch return fail;
            _ = std.process.spawn(io, .{
                .argv = &.{
                    powershell,     "-NoProfile",  "-NonInteractive", "-ExecutionPolicy", "Bypass",
                    "-WindowStyle", "Hidden",      "-File",           script,             "-AppPid",
                    pid,            "-InstallDir", target,            "-StagedDir",       staged,
                    "-AckFile",     ack,           "-LogFile",        log,                "-AckTimeout",
                    timeout,        "-CleanupDir", root,              "-StartedFile",     started,
                },
                // A process whose current directory is inside the install
                // folder would keep Windows from renaming it.
                .cwd = .{ .path = root },
                .stdin = .ignore,
                .stdout = .ignore,
                .stderr = .ignore,
                .create_no_window = true,
            }) catch return fail;
        },
        else => return .{ .err = "Unsupported" },
    }
    return .{ .started = started };
}

// ------------------------------------------------------------ replies

/// The `studio.updateStatus` reply.
pub fn statusReply(out: []u8, snap: *const Snapshot, platform: Platform, blocked: Blocked, note: *const LaunchNote) []const u8 {
    var n: usize = 0;
    var num: [96]u8 = undefined;
    const counts = std.fmt.bufPrint(&num, ",\"received\":{d},\"total\":{d},\"retries\":{d}", .{ snap.received, snap.total, snap.retries }) catch "";
    const ok = json.append(out, &n, "{\"ok\":true,\"phase\":") and
        json.appendString(out, &n, @tagName(snap.phase)) and
        json.append(out, &n, ",\"tag\":") and
        json.appendString(out, &n, snap.tag()) and
        json.append(out, &n, ",\"asset\":") and
        json.appendString(out, &n, platform.assetName() orelse "") and
        json.append(out, &n, ",\"platform\":") and
        json.appendString(out, &n, platform.label()) and
        json.append(out, &n, counts) and
        json.append(out, &n, ",\"error\":") and
        json.appendString(out, &n, snap.error_name) and
        json.append(out, &n, ",\"canInstall\":") and
        json.append(out, &n, if (blocked == .none) "true" else "false") and
        json.append(out, &n, ",\"blocked\":") and
        json.appendString(out, &n, if (blocked == .none) "" else @tagName(blocked)) and
        json.append(out, &n, ",\"justUpdated\":") and
        json.append(out, &n, if (note.just_updated) "true" else "false") and
        json.append(out, &n, ",\"installFailed\":") and
        json.append(out, &n, if (note.install_failed) "true" else "false") and
        json.append(out, &n, "}");
    if (!ok) return "{\"ok\":false,\"error\":\"Unavailable\"}";
    return out[0..n];
}

pub fn errorReply(out: []u8, name: []const u8) []const u8 {
    var n: usize = 0;
    if (json.append(out, &n, "{\"ok\":false,\"error\":") and json.appendString(out, &n, name) and json.append(out, &n, "}")) return out[0..n];
    return "{\"ok\":false,\"error\":\"Unavailable\"}";
}

/// The `studio.updateDownload` reply once the download thread is done.
pub fn downloadReply(out: []u8, snap: *const Snapshot, platform: Platform) []const u8 {
    if (snap.phase != .ready) return errorReply(out, if (snap.error_name.len > 0) snap.error_name else "Unavailable");
    var n: usize = 0;
    const ok = json.append(out, &n, "{\"ok\":true,\"phase\":\"ready\",\"tag\":") and
        json.appendString(out, &n, snap.tag()) and
        json.append(out, &n, ",\"asset\":") and
        json.appendString(out, &n, platform.assetName() orelse "") and
        json.append(out, &n, "}");
    if (!ok) return "{\"ok\":false,\"error\":\"Unavailable\"}";
    return out[0..n];
}

// ------------------------------------------------------------ tests

const testing = std.testing;

test "asset names per platform, and the release download address" {
    try testing.expectEqualStrings("GobanStudio-macOS-arm64.zip", Platform.macos_arm64.assetName().?);
    try testing.expectEqualStrings("GobanStudio-macOS-x64.zip", Platform.macos_x64.assetName().?);
    try testing.expectEqualStrings("GobanStudio-Windows-x64.zip", Platform.windows_x64.assetName().?);
    try testing.expectEqual(@as(?[]const u8, null), Platform.unsupported.assetName());
    var buf: [256]u8 = undefined;
    try testing.expectEqualStrings(
        "https://github.com/hxddh/goban-studio/releases/download/v5.0.1/GobanStudio-macOS-arm64.zip",
        try downloadUrl(&buf, "v5.0.1", "GobanStudio-macOS-arm64.zip"),
    );
    try testing.expectEqualStrings(
        "https://github.com/hxddh/goban-studio/releases/download/v5.0.1/SHA256SUMS",
        try downloadUrl(&buf, "v5.0.1", sums_name),
    );
    try testing.expectError(error.BadTag, downloadUrl(&buf, "../v1", sums_name));
    try testing.expectError(error.BadTag, downloadUrl(&buf, "v5/../../x", sums_name));
    try testing.expectError(error.BadTag, downloadUrl(&buf, "v5.0.1", "evil.zip"));
    try testing.expectError(error.BadTag, downloadUrl(&buf, "", sums_name));
    try testing.expectError(error.BadTag, downloadUrl(&buf, "..", sums_name));
    try testing.expectError(error.BadTag, downloadUrl(&buf, "latest", sums_name));
}

test "only this repository's release downloads are valid starting points" {
    try testing.expect(validDownloadUrl("https://github.com/hxddh/goban-studio/releases/download/v5.0.0/SHA256SUMS"));
    try testing.expect(validDownloadUrl("https://github.com/hxddh/goban-studio/releases/download/v5.0.0/GobanStudio-Windows-x64.zip"));
    try testing.expect(!validDownloadUrl("http://github.com/hxddh/goban-studio/releases/download/v5.0.0/SHA256SUMS"));
    try testing.expect(!validDownloadUrl("https://github.com/someone/goban-studio/releases/download/v5.0.0/SHA256SUMS"));
    try testing.expect(!validDownloadUrl("https://github.com/hxddh/goban-studio/releases/download/v5.0.0/x/SHA256SUMS"));
    try testing.expect(!validDownloadUrl("https://github.com/hxddh/goban-studio/releases/download/v5.0.0/SHA256SUMS?x=1"));
    try testing.expect(!validDownloadUrl("https://github.com/hxddh/goban-studio/releases/download/../SHA256SUMS"));
    try testing.expect(!validDownloadUrl("https://github.com.evil.example/hxddh/goban-studio/releases/download/v5.0.0/SHA256SUMS"));
}

test "redirects only to GitHub's download hosts over HTTPS" {
    try testing.expect(allowedRedirect("https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r&sv=2018-11-09&sig=a%2Bb%3D"));
    try testing.expect(allowedRedirect("https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/2?X-Amz-Algorithm=AWS4"));
    try testing.expect(allowedRedirect("https://github.com/hxddh/goban-studio/releases/download/v5.0.0/SHA256SUMS"));
    try testing.expect(!allowedRedirect("http://objects.githubusercontent.com/x"));
    try testing.expect(!allowedRedirect("https://objects.githubusercontent.com.evil.example/x"));
    try testing.expect(!allowedRedirect("https://github.com@evil.example/x"));
    try testing.expect(!allowedRedirect("https://github.com:8443/x"));
    try testing.expect(!allowedRedirect("https://evil.example/https://github.com/x"));
    try testing.expect(!allowedRedirect("https://github.com"));
    try testing.expect(!allowedRedirect("https://github.com/a b"));
    try testing.expect(!allowedRedirect("/relative/path"));
    try testing.expect(!allowedRedirect("file:///etc/passwd"));
}

test "SHA256SUMS lines are found by exact name" {
    const a = "a" ** 64;
    const b = "B" ** 64;
    const sums = a ++ "  GobanStudio-macOS-arm64.zip\n" ++ b ++ " *GobanStudio-Windows-x64.zip\r\n" ++ ("c" ** 64) ++ "  GobanStudio-macOS-arm64.dmg\n";
    try testing.expectEqualStrings(a, &(findSum(sums, "GobanStudio-macOS-arm64.zip").?));
    try testing.expectEqualStrings("b" ** 64, &(findSum(sums, "GobanStudio-Windows-x64.zip").?));
    try testing.expect(findSum(sums, "GobanStudio-macOS-x64.zip") == null);
    try testing.expect(findSum(sums, "GobanStudio-macOS-arm64") == null);
    try testing.expect(findSum(("z" ** 64) ++ "  GobanStudio-macOS-arm64.zip\n", "GobanStudio-macOS-arm64.zip") == null);
    // Two different sums for one name is not an answer.
    try testing.expect(findSum(a ++ "  x.zip\n" ++ ("d" ** 64) ++ "  x.zip\n", "x.zip") == null);
    try testing.expect(findSum(a ++ "  x.zip\n" ++ a ++ "  x.zip\n", "x.zip") != null);
    try testing.expect(findSum("", "x.zip") == null);
}

test "checksum comparison" {
    var digest: [32]u8 = undefined;
    Sha256.hash("goban", &digest, .{});
    const hex = hexDigest(digest);
    try testing.expect(sumsMatch(hex, digest));
    var other = hex;
    other[0] = if (other[0] == '0') '1' else '0';
    try testing.expect(!sumsMatch(other, digest));
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

test "the installation is found from the executable path" {
    try testing.expectEqualStrings("/Applications/Goban Studio.app", installRootFromExe("/Applications/Goban Studio.app/Contents/MacOS/goban-studio", .macos).?);
    try testing.expectEqualStrings("/Users/a/Apps/GobanStudio.app", installRootFromExe("/Users/a/Apps/GobanStudio.app/Contents/MacOS/goban-studio", .macos).?);
    try testing.expect(installRootFromExe("/Users/a/src/goban/zig-out/bin/goban-studio", .macos) == null);
    try testing.expect(installRootFromExe("/x/Contents/MacOS/goban-studio", .macos) == null);
    try testing.expectEqualStrings("C:\\Users\\a\\Apps\\GobanStudio", installRootFromExe("C:\\Users\\a\\Apps\\GobanStudio\\bin\\goban-studio.exe", .windows).?);
    try testing.expectEqualStrings("D:\\Go Apps\\GobanStudio", installRootFromExe("D:\\Go Apps\\GobanStudio\\BIN\\goban-studio.exe", .windows).?);
    try testing.expect(installRootFromExe("C:\\bin\\goban-studio.exe", .windows) == null);
    try testing.expect(installRootFromExe("C:\\src\\goban\\zig-out\\bin2\\goban-studio.exe", .windows) == null);
    try testing.expect(installRootFromExe("/usr/bin/goban-studio", .linux) == null);
}

test "launch arguments from the helper" {
    var note: LaunchNote = .{};
    note.noteArg("--goban-update-ack=/var/folders/x/T/GobanStudio-update/goban-update-ack-0123abcd.txt");
    try testing.expect(note.just_updated);
    try testing.expectEqualStrings("/var/folders/x/T/GobanStudio-update/goban-update-ack-0123abcd.txt", note.ackPath());
    var bad: LaunchNote = .{};
    bad.noteArg("--goban-update-ack=relative/goban-update-ack-1.txt");
    bad.noteArg("--goban-update-ack=/etc/passwd");
    bad.noteArg("--goban-update-ack=/tmp/goban-update-ack-../../x.txt");
    bad.noteArg("--goban-update-ack=/tmp/goban-update-ack-.txt");
    bad.noteArg("game.sgf");
    try testing.expect(!bad.just_updated and bad.ack_len == 0 and !bad.install_failed);
    bad.noteArg(failed_arg);
    try testing.expect(bad.install_failed);
    if (builtin.os.tag == .windows) {
        try testing.expect(validAckPath("C:\\Users\\a\\AppData\\Local\\Temp\\GobanStudio-update\\goban-update-ack-ab12.txt"));
    }
}

test "status and download replies" {
    var out: [1024]u8 = undefined;
    var snap: Snapshot = .{ .phase = .downloading, .received = 10, .total = 100 };
    @memcpy(snap.tag_buf[0..6], "v5.0.1");
    snap.tag_len = 6;
    const note: LaunchNote = .{};
    try testing.expectEqualStrings(
        "{\"ok\":true,\"phase\":\"downloading\",\"tag\":\"v5.0.1\",\"asset\":\"GobanStudio-macOS-arm64.zip\",\"platform\":\"macos-arm64\",\"received\":10,\"total\":100,\"retries\":0,\"error\":\"\",\"canInstall\":true,\"blocked\":\"\",\"justUpdated\":false,\"installFailed\":false}",
        statusReply(&out, &snap, .macos_arm64, .none, &note),
    );
    try testing.expect(std.mem.indexOf(u8, statusReply(&out, &snap, .windows_x64, .ReadOnlyLocation, &note), "\"canInstall\":false,\"blocked\":\"ReadOnlyLocation\"") != null);
    snap.phase = .failed;
    snap.error_name = "ChecksumMismatch";
    try testing.expectEqualStrings("{\"ok\":false,\"error\":\"ChecksumMismatch\"}", downloadReply(&out, &snap, .macos_arm64));
    snap.phase = .ready;
    try testing.expectEqualStrings("{\"ok\":true,\"phase\":\"ready\",\"tag\":\"v5.0.1\",\"asset\":\"GobanStudio-Windows-x64.zip\"}", downloadReply(&out, &snap, .windows_x64));
}

test "the helpers are embedded and take the documented arguments" {
    try testing.expect(std.mem.indexOf(u8, helper_macos, "APP_PID=") != null);
    try testing.expect(std.mem.indexOf(u8, helper_macos, "--goban-update-ack=") != null);
    try testing.expect(std.mem.indexOf(u8, helper_macos, "STARTED=${8:-}") != null);
    try testing.expect(std.mem.indexOf(u8, helper_macos, ".goban-lock") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "$AppPid") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "--goban-update-ack=") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "[string]$StartedFile") != null);
    try testing.expect(std.mem.indexOf(u8, helper_windows, "DeleteOnClose") != null);
}

test "signed sums: a valid signature passes, anything else is refused" {
    // A test key only (RFC 8032 style deterministic seed); never a real one.
    const seed: [32]u8 = @splat(7);
    const kp = try Ed25519.KeyPair.generateDeterministic(seed);
    const pk = kp.public_key.toBytes();
    const sums = "aaaa  GobanStudio-macOS-arm64.zip\nbbbb  GobanStudio-Windows-x64.zip\n";
    const sig = try kp.sign(sums, null);
    var b64_buf: [128]u8 = undefined;
    const b64 = std.base64.standard.Encoder.encode(&b64_buf, &sig.toBytes());
    try verifySums(sums, b64, pk);
    // Trailing newline / spaces from `echo` are fine.
    var line_buf: [130]u8 = undefined;
    const line = try std.fmt.bufPrint(&line_buf, "{s}\n", .{b64});
    try verifySums(sums, line, pk);
    // One changed byte in the sums, a different key, garbage: refused.
    try testing.expectError(error.BadSignature, verifySums("aaab  GobanStudio-macOS-arm64.zip\nbbbb  GobanStudio-Windows-x64.zip\n", b64, pk));
    const other = (try Ed25519.KeyPair.generateDeterministic(@splat(8))).public_key.toBytes();
    try testing.expectError(error.BadSignature, verifySums(sums, b64, other));
    try testing.expectError(error.BadSignature, verifySums(sums, "", pk));
    try testing.expectError(error.BadSignature, verifySums(sums, "not base64!", pk));
    try testing.expectError(error.BadSignature, verifySums(sums, b64[0..40], pk));
    // Interop: what scripts/sign-sums.mjs (node:crypto) writes for the same
    // seed and bytes verifies here, and the public key it derives is ours
    // (scripts/tests/shell-signing.mjs checks the node side of this vector).
    var pk_text_buf: [64]u8 = undefined;
    try testing.expectEqualStrings("6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=", std.base64.standard.Encoder.encode(&pk_text_buf, &pk));
    try verifySums(sums, "4kHujrlWGlr4MAOpyzUpWK3WQwCgMLuw5nH17j7qDklf+8RMm8Ji10GLVem333h8FDjqBGn25dE4a5nhNXtLAw==\n", pk);
    try testing.expectEqualStrings("4kHujrlWGlr4MAOpyzUpWK3WQwCgMLuw5nH17j7qDklf+8RMm8Ji10GLVem333h8FDjqBGn25dE4a5nhNXtLAw==", b64);
    // The public key option: base64 of exactly 32 bytes, or empty.
    var pk_b64_buf: [64]u8 = undefined;
    const pk_b64 = std.base64.standard.Encoder.encode(&pk_b64_buf, &pk);
    try testing.expectEqualSlices(u8, &pk, &((try parsePublicKey(pk_b64)).?));
    try testing.expect((try parsePublicKey("")) == null);
    try testing.expect((try parsePublicKey("  \n")) == null);
    try testing.expectError(error.BadKey, parsePublicKey("AAAA"));
    try testing.expectError(error.BadKey, parsePublicKey("@@@@"));
    // The signature file is one of the few names that may be downloaded.
    var url_buf: [256]u8 = undefined;
    try testing.expectEqualStrings(download_prefix ++ "v13.0.0/SHA256SUMS.sig", try downloadUrl(&url_buf, "v13.0.0", sig_name));
    try testing.expect(validDownloadUrl(download_prefix ++ "v13.0.0/SHA256SUMS.sig"));
}

test "the helper's started marker is claimed by exactly one side" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const dir = try testTempDir(io, &tmp, &dir_buf);
    var path_buf: [path_cap]u8 = undefined;
    const marker = try std.fmt.bufPrint(&path_buf, "{s}{c}" ++ started_prefix ++ "00aa.txt", .{ dir, std.fs.path.sep });
    try testing.expect(!helperStarted(io, marker));
    // The helper wrote it first: the app cannot claim it, and sees it started.
    try writeTestFile(io, marker, "started 123\n");
    try testing.expect(helperStarted(io, marker));
    try testing.expect(!claimStarted(io, marker));
    // The app claims first: it is "cancelled", never "started".
    const late = try std.fmt.bufPrint(&path_buf, "{s}{c}" ++ started_prefix ++ "00bb.txt", .{ dir, std.fs.path.sep });
    try testing.expect(claimStarted(io, late));
    try testing.expect(!helperStarted(io, late));
    try testing.expect(!claimStarted(io, late));
}

test "a live helper's lock is seen; a stale one is not" {
    if (builtin.os.tag == .windows) return error.SkipZigTest;
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const dir = try testTempDir(io, &tmp, &dir_buf);
    var target_buf: [path_cap]u8 = undefined;
    const target = try std.fmt.bufPrint(&target_buf, "{s}/Goban Studio.app", .{dir});
    var lock_buf: [path_cap]u8 = undefined;
    const lock = lockPath(&lock_buf, target).?;
    try testing.expect(std.mem.endsWith(u8, lock, "/.Goban Studio.app.goban-lock"));
    try testing.expect(!helperLockHeld(io, target));
    try std.Io.Dir.cwd().createDirPath(io, lock);
    var pid_path_buf: [path_cap]u8 = undefined;
    const pid_path = try std.fmt.bufPrint(&pid_path_buf, "{s}/pid", .{lock});
    var pid_text: [24]u8 = undefined;
    try writeTestFile(io, pid_path, try std.fmt.bufPrint(&pid_text, "{d}\n", .{if (builtin.os.tag == .linux) std.os.linux.getpid() else std.c.getpid()}));
    try testing.expect(helperLockHeld(io, target));
    // A launch during the swap stays out of the way.
    try testing.expect(updateInProgress(io, target));
    // A pid that cannot be running.
    try std.Io.Dir.deleteFileAbsolute(io, pid_path);
    try writeTestFile(io, pid_path, "2147483646\n");
    try testing.expect(!helperLockHeld(io, target));
    try testing.expect(!updateInProgress(io, target));
    // A lock that outlived any helper never keeps the app from starting.
    try testing.expect(lockIsRecent(0));
    try testing.expect(lockIsRecent(5 * 60 * 1000));
    try testing.expect(!lockIsRecent(helper_lock_max_age_ms));
    try testing.expect(!updateInProgress(io, "/nowhere/Goban Studio.app"));
}

test "signed sums name their version: a release's files cannot be served under another tag" {
    // What release.yml writes: `printf '%s\n' "$TAG" > VERSION`, then a
    // `sha256sum` line for it.
    const zip = ("a" ** 64) ++ "  GobanStudio-macOS-arm64.zip\n";
    var digest: [32]u8 = undefined;
    Sha256.hash("v14.0.0\n", &digest, .{});
    const hex = hexDigest(digest);
    var buf: [512]u8 = undefined;
    const sums = try std.fmt.bufPrint(&buf, "{s}{s}  VERSION\n", .{ zip, &hex });
    try testing.expectEqual(Binding.bound, sumsBinding(sums, "v14.0.0"));
    // The line as `sha256sum VERSION` prints it (scripts/tests/shell-ci.mjs
    // has the same vector).
    try testing.expectEqual(Binding.bound, sumsBinding(zip ++ "03f8f8d787997ec97ed6273980f539025f918130669d7660b538ed4dbe40a0a2  VERSION\n", "v14.0.0"));
    try checkBinding(sums, "v14.0.0", true);
    try checkBinding(sums, "v14.0.0", false);
    // The same signed bytes offered as another release.
    try testing.expectEqual(Binding.mismatch, sumsBinding(sums, "v99.0.0"));
    try testing.expectEqual(Binding.mismatch, sumsBinding(sums, "v14.0.1"));
    try testing.expectEqual(Binding.mismatch, sumsBinding(sums, "14.0.0"));
    try testing.expectError(error.VersionMismatch, checkBinding(sums, "v99.0.0", true));
    try testing.expectError(error.VersionMismatch, checkBinding(sums, "v99.0.0", false));
    // Sums from before the binding: a signed build refuses them, an
    // unsigned one (which trusts the release anyway) does not.
    try testing.expectEqual(Binding.absent, sumsBinding(zip, "v13.0.0"));
    try testing.expectError(error.NoVersion, checkBinding(zip, "v13.0.0", true));
    try checkBinding(zip, "v13.0.0", false);
    // A VERSION line that cannot be read is not "absent".
    try testing.expectEqual(Binding.mismatch, sumsBinding(zip ++ "nothex  VERSION\n", "v14.0.0"));
    try testing.expectEqual(Binding.mismatch, sumsBinding(zip ++ ("z" ** 64) ++ "  VERSION\n", "v14.0.0"));
    var two_buf: [512]u8 = undefined;
    const two = try std.fmt.bufPrint(&two_buf, "{s}{s}  VERSION\n{s}  VERSION\n", .{ zip, &hex, "b" ** 64 });
    try testing.expectEqual(Binding.mismatch, sumsBinding(two, "v14.0.0"));
    // A file whose name only ends the same is not the binding.
    try testing.expectEqual(Binding.absent, sumsBinding(zip ++ ("c" ** 64) ++ "  NOT-VERSION\n", "v14.0.0"));
    // The line does not disturb the package lines (nor did it in the
    // parser of the versions before it, which is this same `findSum`).
    try testing.expectEqualStrings("a" ** 64, &(findSum(sums, "GobanStudio-macOS-arm64.zip").?));
    // The app never downloads VERSION: it is not one of its asset names.
    var url_buf: [256]u8 = undefined;
    try testing.expectError(error.BadTag, downloadUrl(&url_buf, "v14.0.0", version_name));
}

test "a package states its own version, and it must be the tag's" {
    var out: [64]u8 = undefined;
    try testing.expectEqualStrings("14.0.0", buildInfoVersion("{\n  \"app\": \"14.0.0\",\n  \"builtAt\": \"2026-11-11T00:00:00.000Z\"\n}\n", &out).?);
    try testing.expect(buildInfoVersion("{\"builtAt\":\"x\"}", &out) == null);
    try testing.expect(buildInfoVersion("not json", &out) == null);
    try testing.expect(buildInfoVersion("{\"app\":14}", &out) == null);
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
    try testing.expectEqualStrings("14.0.0", plistVersion(plist).?);
    try testing.expect(plistVersion("<key>CFBundleVersion</key><string>1</string>") == null);
    try testing.expect(plistVersion("<key>CFBundleShortVersionString</key><integer>1</integer><string>2</string>") == null);
    try testing.expect(versionIsTag("14.0.0", "v14.0.0"));
    try testing.expect(versionIsTag("14.0", "v14.0.0"));
    try testing.expect(versionIsTag("14.1.0-beta.1", "v14.1.0-beta.1"));
    try testing.expect(!versionIsTag("13.0.0", "v14.0.0"));
    try testing.expect(!versionIsTag("14.0.0", "v14.0.1"));
    try testing.expect(!versionIsTag("14.0.0-rc.1", "v14.0.0"));
    try testing.expect(!versionIsTag("", "v14.0.0"));
    try testing.expect(!versionIsTag("0.0.0", "latest"));

    // On disk, in the layout of the package (Windows layout here; the
    // macOS one adds the Info.plist check).
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const dir = try testTempDir(io, &tmp, &dir_buf);
    var p: [path_cap]u8 = undefined;
    const s = std.fs.path.sep;
    const dist = try std.fmt.bufPrint(&p, "{s}{c}resources{c}frontend{c}dist", .{ dir, s, s, s });
    try std.Io.Dir.cwd().createDirPath(io, dist);
    var f: [path_cap]u8 = undefined;
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

const TestSpawn = struct {
    var jobs: [8]*Installer.Job = undefined;
    var count: usize = 0;

    fn hook(self: *Installer, job: *Installer.Job) void {
        _ = self;
        jobs[count] = job;
        count += 1;
    }
};

test "a stalled download continues on a new connection, a few times, then fails" {
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const root = try testTempDir(io, &tmp, &dir_buf);

    const inst = try testing.allocator.create(Installer);
    defer testing.allocator.destroy(inst);
    inst.init(io);
    inst.platform = .windows_x64;
    inst.spawn_hook = TestSpawn.hook;
    TestSpawn.count = 0;

    const gen = try inst.start(root, "v14.0.0", 1_000);
    try testing.expectEqual(@as(usize, 1), TestSpawn.count);
    const first = TestSpawn.jobs[0];
    try testing.expect(inst.current(first));
    // Bytes arrive: no stall.
    try testing.expect(inst.progress(first, true, 500, 1000));
    const t0 = inst.snapshot().last_activity_ms;
    try testing.expect(!inst.checkStall(t0 + stall_timeout_ms - 1));
    try testing.expectEqual(@as(usize, 1), TestSpawn.count);

    // Silence: the first thread is replaced, the download goes on.
    try testing.expect(!inst.checkStall(t0 + stall_timeout_ms));
    try testing.expectEqual(@as(usize, 2), TestSpawn.count);
    const second = TestSpawn.jobs[1];
    var snap = inst.snapshot();
    try testing.expectEqual(Phase.downloading, snap.phase);
    try testing.expectEqual(gen, snap.gen);
    try testing.expectEqual(@as(u32, 1), snap.retries);
    try testing.expectEqual(@as(u64, 500), snap.received);
    try testing.expect(!inst.current(first));
    try testing.expect(inst.current(second));
    // Same directory: the new thread finds the partial file.
    try testing.expectEqualStrings(first.dir(), second.dir());
    // The abandoned thread wakes up: it may not report or write, and when
    // it ends it leaves the directory and the state alone.
    try testing.expect(!inst.progress(first, true, 600, 1000));
    try testing.expectEqual(@as(u64, 500), inst.snapshot().received);
    inst.finish(first, error.Cancelled, "");
    try testing.expect(fileExists(io, second.dir()));
    try testing.expectEqual(Phase.downloading, inst.snapshot().phase);

    // The watchdog starts counting again from the takeover.
    const t1 = inst.snapshot().last_activity_ms;
    try testing.expect(!inst.checkStall(t1 + stall_timeout_ms - 1));
    var now = t1;
    var n: u32 = 1;
    while (n < max_stall_retries) : (n += 1) {
        now += stall_timeout_ms;
        try testing.expect(!inst.checkStall(now));
        inst.finish(TestSpawn.jobs[TestSpawn.count - 2], error.Cancelled, "");
    }
    try testing.expectEqual(@as(usize, 1 + max_stall_retries), TestSpawn.count);
    try testing.expectEqual(max_stall_retries, inst.snapshot().retries);
    // Out of retries.
    now += stall_timeout_ms;
    try testing.expect(inst.checkStall(now));
    snap = inst.snapshot();
    try testing.expectEqual(Phase.failed, snap.phase);
    try testing.expectEqualStrings("Stalled", snap.error_name);
    // The last thread ends: nothing of the failed download is kept.
    const last = TestSpawn.jobs[TestSpawn.count - 1];
    var last_dir_buf: [path_cap]u8 = undefined;
    const last_dir = try std.fmt.bufPrint(&last_dir_buf, "{s}", .{last.dir()});
    inst.finish(last, error.Cancelled, "");
    try testing.expect(!fileExists(io, last_dir));
    try testing.expectEqual(@as(u32, 0), inst.running);

    // Broken connections: bytes that arrived reset the count.
    try testing.expectEqual(@as(u32, 1), nextFailureCount(0, false));
    try testing.expectEqual(@as(u32, 3), nextFailureCount(2, false));
    try testing.expectEqual(@as(u32, 1), nextFailureCount(3, true));
    try testing.expect(helper_start_timeout_ms >= 20_000);
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

fn testTempDir(io: std.Io, tmp: *testing.TmpDir, buf: []u8) ![]const u8 {
    const n = try tmp.dir.realPath(io, buf);
    return buf[0..n];
}

fn writeTestFile(io: std.Io, path: []const u8, data: []const u8) !void {
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
    const hex = hexDigest(digest);
    const sums = try std.fmt.allocPrint(testing.allocator, "{s}  GobanStudio-Windows-x64.zip\n", .{&hex});
    defer testing.allocator.free(sums);
    const expected = findSum(sums, "GobanStudio-Windows-x64.zip").?;
    try testing.expect(sumsMatch(expected, try hashFile(io, zip_path)));

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
    try testing.expect(!sumsMatch(expected, try hashFile(io, zip_path)));

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
    const platform = currentPlatform();
    // Under Rosetta the host binary is x86_64 but the wanted package is arm64.
    if (runningUnderRosetta()) return error.SkipZigTest;
    try unpack(io, platform, zip_path, out);
    var staged_buf: [std.Io.Dir.max_path_bytes]u8 = undefined;
    const staged = try std.fmt.bufPrint(&staged_buf, "{s}/GobanStudio.app", .{out});
    try testing.expect(checkStaged(io, platform, staged));
    try testing.expect(runTool(io, &.{ "/usr/bin/codesign", "--verify", "--deep", "--strict", staged }));
    // Files we unpack ourselves carry no quarantine flag, so Gatekeeper
    // does not assess the new app when the helper opens it.
    try testing.expect(!runTool(io, &.{ "/usr/bin/xattr", "-p", "com.apple.quarantine", staged }));
    // An app for the other CPU is refused.
    const other: Platform = if (platform == .macos_arm64) .macos_x64 else .macos_arm64;
    try testing.expect(!checkStaged(io, other, staged));
}

test "live (GOBAN_NET_LIVE=package): a published package is downloaded, verified, unpacked and checked" {
    // Needs the network and about 16 MB: `GOBAN_NET_LIVE=package zig build
    // test …`. The Windows package of a published release goes through the
    // same thread the app runs (std.zip unpacks it on any system), through
    // the environment's proxy when there is one.
    var env = try testing.environ.createMap(testing.allocator);
    defer env.deinit();
    if (!std.mem.eql(u8, env.get("GOBAN_NET_LIVE") orelse "", "package")) return error.SkipZigTest;
    const io = testing.io;
    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    var dir_buf: [path_cap]u8 = undefined;
    const base = try testTempDir(io, &tmp, &dir_buf);
    var root_buf: [path_cap]u8 = undefined;
    const root = try std.fmt.bufPrint(&root_buf, "{s}{c}{s}", .{ base, std.fs.path.sep, staging_dir_name });

    const inst = try testing.allocator.create(Installer);
    defer testing.allocator.destroy(inst);
    inst.init(io);
    inst.platform = .windows_x64;
    inst.setEnv(&env);
    const tag = "v13.0.0";
    const now = struct {
        fn ms(clock_io: std.Io) i64 {
            return std.Io.Timestamp.now(clock_io, .awake).toMilliseconds();
        }
    }.ms;
    _ = try inst.start(root, tag, now(io));
    const deadline = now(io) + 15 * 60 * 1000;
    var last_report: i64 = 0;
    while (true) {
        _ = inst.checkStall(now(io));
        const snap = inst.snapshot();
        if (snap.phase == .ready or snap.phase == .failed or snap.phase == .cancelled) break;
        if (now(io) - last_report > 5000) {
            last_report = now(io);
            std.debug.print("live: {s} {d} of {d} bytes, {d} retries\n", .{ @tagName(snap.phase), snap.received, snap.total, snap.retries });
        }
        try testing.expect(now(io) < deadline);
        std.Io.sleep(io, .fromMilliseconds(200), .awake) catch {};
    }
    const snap = inst.snapshot();
    std.debug.print("live: {s} {s}\n", .{ @tagName(snap.phase), snap.error_name });
    try testing.expectEqual(Phase.ready, snap.phase);
    try testing.expect(snap.received == snap.total and snap.total > 10 * 1024 * 1024);
    var staged_buf: [path_cap]u8 = undefined;
    const staged = inst.stagedPath(&staged_buf).?;
    try testing.expect(checkStaged(io, .windows_x64, staged));
    try testing.expect(stagedVersionMatches(io, .windows_x64, staged, tag));
    // The same package offered as a later release is not that release.
    try testing.expect(!stagedVersionMatches(io, .windows_x64, staged, "v99.0.0"));
    try testing.expectEqual(Phase.idle, inst.cancel());
    try testing.expect(!fileExists(io, staged));
}
