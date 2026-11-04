// Print the CGWindowID of the largest normal on-screen window owned by a
// process, for `screencapture -l`. Used by scripts/tour-app.mjs.
//
//   swiftc -O -o window-id scripts/macos-window-id.swift && ./window-id <pid>
import CoreGraphics
import Foundation

guard CommandLine.arguments.count > 1, let pid = Int(CommandLine.arguments[1]) else {
    FileHandle.standardError.write("usage: window-id <pid>\n".data(using: .utf8)!)
    exit(2)
}

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let list = (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]]) ?? []
var best: (id: Int, area: Double)? = nil
for window in list {
    guard (window[kCGWindowOwnerPID as String] as? Int) == pid,
          (window[kCGWindowLayer as String] as? Int) == 0,
          let id = window[kCGWindowNumber as String] as? Int,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          let width = bounds["Width"] as? Double,
          let height = bounds["Height"] as? Double
    else { continue }
    let area = width * height
    if best == nil || area > best!.area { best = (id, area) }
}
guard let found = best else { exit(1) }
print(found.id)
