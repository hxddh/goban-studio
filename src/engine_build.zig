//! Which KataGo executable to start (v15).
//!
//! A package carries the plain build, `katago` / `katago.exe`, which runs on
//! every machine the app supports, and may carry a faster one beside it:
//!
//!   * Windows: `katago-avx2.exe`, KataGo's official `eigenavx2` release
//!     build, for CPUs with AVX2 and FMA (and an OS that saves the AVX
//!     registers). Run on a CPU without them it dies with an illegal
//!     instruction, so the host checks first.
//!   * macOS on Apple Silicon: `katago-metal`, built from the same KataGo
//!     commit with the Metal backend (GPU and Neural Engine), for macOS 13
//!     or later. The Eigen build stays as `katago`.
//!
//! The host prefers the faster build when the machine can run it, and falls
//! back to the plain one for the rest of the session when the faster one
//! fails to start (it does not answer its first GTP command: a missing
//! library, a GPU it cannot use, a crash while loading the network). The
//! plain build is the one every package is checked with, so a fallback
//! is never worse than an app without the faster build.
const std = @import("std");
const builtin = @import("builtin");

/// The file name of the faster build for `os`/`arch`, if the app ships one.
pub fn preferredName(os: std.Target.Os.Tag, arch: std.Target.Cpu.Arch) ?[]const u8 {
    return switch (os) {
        .windows => if (arch == .x86_64) "katago-avx2.exe" else null,
        .macos => if (arch == .aarch64) "katago-metal" else null,
        else => null,
    };
}

pub const preferred_name: ?[]const u8 = preferredName(builtin.os.tag, builtin.cpu.arch);

pub const Choice = enum { preferred, plain };

/// The whole decision: the faster build when it is in the package, this
/// machine can run it, and it has not already failed to start this session.
pub fn choose(preferred_present: bool, host_capable: bool, preferred_failed: bool) Choice {
    return if (preferred_present and host_capable and !preferred_failed) .preferred else .plain;
}

// ------------------------------------------------------------------ AVX2

/// What CPUID and XGETBV report, as far as AVX2 is concerned.
pub const X86Features = struct {
    /// CPUID leaf 0: the highest standard leaf.
    max_leaf: u32,
    /// CPUID leaf 1, ECX.
    leaf1_ecx: u32,
    /// CPUID leaf 7 sub-leaf 0, EBX (0 when `max_leaf` < 7).
    leaf7_ebx: u32,
    /// XCR0, the state the OS saves on a context switch (0 without OSXSAVE).
    xcr0: u64,
};

/// AVX2 and FMA in the CPU, and the OS saving the SSE and AVX registers
/// (OSXSAVE set and XCR0 bits 1 and 2): without the latter the instructions
/// fault even on a CPU that has them.
pub fn avx2Usable(f: X86Features) bool {
    const fma = f.leaf1_ecx & (1 << 12) != 0;
    const osxsave = f.leaf1_ecx & (1 << 27) != 0;
    const avx = f.leaf1_ecx & (1 << 28) != 0;
    if (!(fma and osxsave and avx)) return false;
    if (f.xcr0 & 0b110 != 0b110) return false;
    if (f.max_leaf < 7) return false;
    return f.leaf7_ebx & (1 << 5) != 0;
}

fn cpuid(leaf: u32, subleaf: u32) [4]u32 {
    var eax: u32 = undefined;
    var ebx: u32 = undefined;
    var ecx: u32 = undefined;
    var edx: u32 = undefined;
    asm volatile ("cpuid"
        : [_] "={eax}" (eax),
          [_] "={ebx}" (ebx),
          [_] "={ecx}" (ecx),
          [_] "={edx}" (edx),
        : [_] "{eax}" (leaf),
          [_] "{ecx}" (subleaf),
    );
    return .{ eax, ebx, ecx, edx };
}

fn xgetbv0() u64 {
    var lo: u32 = undefined;
    var hi: u32 = undefined;
    asm volatile ("xgetbv"
        : [_] "={eax}" (lo),
          [_] "={edx}" (hi),
        : [_] "{ecx}" (@as(u32, 0)),
    );
    return (@as(u64, hi) << 32) | lo;
}

/// This machine's CPU and OS, read once.
pub fn hostX86Features() X86Features {
    if (comptime builtin.cpu.arch != .x86_64) return .{ .max_leaf = 0, .leaf1_ecx = 0, .leaf7_ebx = 0, .xcr0 = 0 };
    const max_leaf = cpuid(0, 0)[0];
    const leaf1_ecx = if (max_leaf >= 1) cpuid(1, 0)[2] else 0;
    const leaf7_ebx = if (max_leaf >= 7) cpuid(7, 0)[1] else 0;
    // XGETBV is an illegal instruction unless OSXSAVE is set.
    const xcr0 = if (leaf1_ecx & (1 << 27) != 0) xgetbv0() else 0;
    return .{ .max_leaf = max_leaf, .leaf1_ecx = leaf1_ecx, .leaf7_ebx = leaf7_ebx, .xcr0 = xcr0 };
}

// ------------------------------------------------------------------ Metal

/// The first number of a macOS product version ("13.6.1" → 13).
pub fn macosMajor(product_version: []const u8) ?u32 {
    const text = std.mem.trim(u8, product_version, " \t\r\n\x00");
    const end = std.mem.indexOfScalar(u8, text, '.') orelse text.len;
    if (end == 0) return null;
    return std.fmt.parseInt(u32, text[0..end], 10) catch null;
}

/// KataGo's Metal build targets macOS 13 (its deployment target).
pub const metal_min_macos: u32 = 13;

pub fn metalUsable(major: ?u32) bool {
    const m = major orelse return false;
    return m >= metal_min_macos;
}

extern "c" fn sysctlbyname(name: [*:0]const u8, oldp: ?*anyopaque, oldlenp: ?*usize, newp: ?*const anyopaque, newlen: usize) c_int;

fn hostMacosMajor() ?u32 {
    if (comptime builtin.os.tag != .macos) return null;
    var buf: [32]u8 = undefined;
    var len: usize = buf.len;
    if (sysctlbyname("kern.osproductversion", &buf, &len, null, 0) != 0) return null;
    return macosMajor(buf[0..@min(len, buf.len)]);
}

/// Can this machine run the faster build at all (before trying it)?
pub fn hostCapable() bool {
    return switch (builtin.os.tag) {
        .windows => builtin.cpu.arch == .x86_64 and avx2Usable(hostX86Features()),
        .macos => builtin.cpu.arch == .aarch64 and metalUsable(hostMacosMajor()),
        else => false,
    };
}

// ------------------------------------------------------------------ tests

test "the faster build: AVX2 on Windows x64, Metal on Apple Silicon, none elsewhere" {
    try std.testing.expectEqualStrings("katago-avx2.exe", preferredName(.windows, .x86_64).?);
    try std.testing.expectEqualStrings("katago-metal", preferredName(.macos, .aarch64).?);
    try std.testing.expect(preferredName(.macos, .x86_64) == null);
    try std.testing.expect(preferredName(.windows, .aarch64) == null);
    try std.testing.expect(preferredName(.linux, .x86_64) == null);
}

test "choose: the faster build only when present, usable, and not failed" {
    try std.testing.expectEqual(Choice.preferred, choose(true, true, false));
    try std.testing.expectEqual(Choice.plain, choose(false, true, false));
    try std.testing.expectEqual(Choice.plain, choose(true, false, false));
    try std.testing.expectEqual(Choice.plain, choose(true, true, true));
    try std.testing.expectEqual(Choice.plain, choose(false, false, true));
}

test "AVX2 needs the CPU bits and the OS saving the AVX state" {
    const fma: u32 = 1 << 12;
    const osxsave: u32 = 1 << 27;
    const avx: u32 = 1 << 28;
    const avx2: u32 = 1 << 5;
    const haswell: X86Features = .{ .max_leaf = 0xd, .leaf1_ecx = fma | osxsave | avx, .leaf7_ebx = avx2, .xcr0 = 0b111 };
    try std.testing.expect(avx2Usable(haswell));
    // A CPU without AVX2 (Sandy Bridge, many Atoms and Pentiums).
    var f = haswell;
    f.leaf7_ebx = 0;
    try std.testing.expect(!avx2Usable(f));
    // AVX2 without FMA.
    f = haswell;
    f.leaf1_ecx = osxsave | avx;
    try std.testing.expect(!avx2Usable(f));
    // The OS does not save the YMM registers (XCR0 bit 2 clear), or has
    // not enabled XSAVE at all.
    f = haswell;
    f.xcr0 = 0b011;
    try std.testing.expect(!avx2Usable(f));
    f = haswell;
    f.leaf1_ecx = fma | avx;
    f.xcr0 = 0;
    try std.testing.expect(!avx2Usable(f));
    // An old CPU whose highest leaf is below 7: leaf 7's bits mean nothing.
    f = haswell;
    f.max_leaf = 6;
    try std.testing.expect(!avx2Usable(f));
}

test "Metal needs macOS 13 or later" {
    try std.testing.expectEqual(@as(u32, 13), macosMajor("13.6.1").?);
    try std.testing.expectEqual(@as(u32, 26), macosMajor("26.0").?);
    try std.testing.expectEqual(@as(u32, 15), macosMajor("15\x00").?);
    try std.testing.expect(macosMajor("") == null);
    try std.testing.expect(macosMajor(".1") == null);
    try std.testing.expect(macosMajor("x.1") == null);
    try std.testing.expect(metalUsable(13));
    try std.testing.expect(metalUsable(26));
    try std.testing.expect(!metalUsable(12));
    try std.testing.expect(!metalUsable(null));
}

test "the host check runs on this machine" {
    // Whatever the answer, reading CPUID/XGETBV (or sysctl) must not fault.
    _ = hostCapable();
    if (builtin.cpu.arch == .x86_64) _ = hostX86Features();
}
