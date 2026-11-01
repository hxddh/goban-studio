#!/usr/bin/env python3
"""Create a ZIP with forward-slash paths and real Unix mode bits.

PowerShell's Compress-Archive writes backslash separators and leaves
external_attr at zero. Windows Explorer copes, but archive tools on macOS,
Linux and CI do not. This writer is deliberately small and deterministic
enough for a release artifact: every entry uses `/`, files carry 0644, and
executables carry 0755.

Usage: python3 scripts/make-zip.py <source-dir> <archive.zip> [root-name]
"""
from __future__ import annotations

import os
import sys
import zipfile


def main() -> int:
    if len(sys.argv) not in (3, 4):
        print("usage: make-zip.py <source-dir> <archive.zip> [root-name]", file=sys.stderr)
        return 2
    source, archive = sys.argv[1], sys.argv[2]
    root_name = sys.argv[3] if len(sys.argv) == 4 else os.path.basename(os.path.normpath(source))
    if not os.path.isdir(source):
        print(f"not a directory: {source}", file=sys.stderr)
        return 1
    if os.path.exists(archive):
        os.remove(archive)
    parent = os.path.dirname(archive)
    if parent:
        os.makedirs(parent, exist_ok=True)

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for current, dirs, files in os.walk(source):
            dirs.sort()
            files.sort()
            relative = os.path.relpath(current, source)
            prefix = "" if relative == "." else relative.replace(os.sep, "/") + "/"
            for name in files:
                full = os.path.join(current, name)
                arcname = f"{root_name}/{prefix}{name}".replace(os.sep, "/")
                mode = 0o755 if name.lower().endswith((".exe", ".dll")) else 0o644
                info = zipfile.ZipInfo.from_file(full, arcname)
                info.create_system = 3  # Unix, so external_attr is honoured
                info.external_attr = (mode & 0xFFFF) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(full, "rb") as handle:
                    zf.writestr(info, handle.read(), compress_type=zipfile.ZIP_DEFLATED)

    print(f"zip: {archive} ({os.path.getsize(archive)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
