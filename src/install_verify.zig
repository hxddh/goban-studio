//! Update install: what makes a download trustworthy. The release
//! download address, built from a validated tag; the Ed25519 signature
//! over SHA256SUMS; the version the signed sums name; the checksums.
//! install.zig describes the whole flow.
const std = @import("std");
const update = @import("update.zig");
const net = @import("net.zig");
const install_mod = @import("install.zig");

const Sha256 = std.crypto.hash.sha2.Sha256;
const testing = std.testing;

/// Every download starts with exactly this prefix, then `<tag>/<name>`.
pub const download_prefix = "https://github.com/hxddh/goban-studio/releases/download/";
pub const sums_name = "SHA256SUMS";
/// The detached Ed25519 signature of SHA256SUMS (base64, one line).
pub const sig_name = "SHA256SUMS.sig";
pub const Ed25519 = std.crypto.sign.Ed25519;
/// A small text file holding the release's tag and a newline. SHA256SUMS
/// lists its hash, so the signed bytes name the version they are for.
pub const version_name = "VERSION";
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
    inline for (.{ install_mod.Platform.macos_arm64, install_mod.Platform.macos_x64, install_mod.Platform.windows_x64 }) |p| {
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

test "asset names per platform, and the release download address" {
    try testing.expectEqualStrings("GobanStudio-macOS-arm64.zip", install_mod.Platform.macos_arm64.assetName().?);
    try testing.expectEqualStrings("GobanStudio-macOS-x64.zip", install_mod.Platform.macos_x64.assetName().?);
    try testing.expectEqualStrings("GobanStudio-Windows-x64.zip", install_mod.Platform.windows_x64.assetName().?);
    try testing.expectEqual(@as(?[]const u8, null), install_mod.Platform.unsupported.assetName());
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

