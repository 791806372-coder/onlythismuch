import CoreGraphics
import Foundation
import ImageIO

struct IconOutput {
    let filename: String
    let pixels: Int
}

let outputs = [
    IconOutput(filename: "icon_16x16.png", pixels: 16),
    IconOutput(filename: "icon_16x16@2x.png", pixels: 32),
    IconOutput(filename: "icon_32x32.png", pixels: 32),
    IconOutput(filename: "icon_32x32@2x.png", pixels: 64),
    IconOutput(filename: "icon_128x128.png", pixels: 128),
    IconOutput(filename: "icon_128x128@2x.png", pixels: 256),
    IconOutput(filename: "icon_256x256.png", pixels: 256),
    IconOutput(filename: "icon_256x256@2x.png", pixels: 512),
    IconOutput(filename: "icon_512x512.png", pixels: 512),
    IconOutput(filename: "icon_512x512@2x.png", pixels: 1024),
]

let repoRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceURL = repoRoot
    .appendingPathComponent("ios/AIUsageWidgetApp/Assets.xcassets/AppIcon.appiconset/Icon-1024.png")
let iconsetURL = repoRoot
    .appendingPathComponent("mac/AIUsageConnector/Resources/AppIcon.iconset", isDirectory: true)

try FileManager.default.createDirectory(at: iconsetURL, withIntermediateDirectories: true)

guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    throw NSError(domain: "AIUsageMacIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not read source app icon"])
}

func writeIcon(pixels: Int, to url: URL) throws {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: pixels,
        height: pixels,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw NSError(domain: "AIUsageMacIcon", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create bitmap context"])
    }

    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))

    guard let rendered = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        throw NSError(domain: "AIUsageMacIcon", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not create PNG destination"])
    }

    CGImageDestinationAddImage(destination, rendered, nil)
    if !CGImageDestinationFinalize(destination) {
        throw NSError(domain: "AIUsageMacIcon", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not encode PNG"])
    }
}

for output in outputs {
    try writeIcon(pixels: output.pixels, to: iconsetURL.appendingPathComponent(output.filename))
}

print("Generated \(outputs.count) macOS iconset images in \(iconsetURL.path)")
