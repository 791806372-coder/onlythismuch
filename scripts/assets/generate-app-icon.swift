import CoreGraphics
import CoreText
import Foundation
import ImageIO

struct IconOutput {
    let filename: String
    let pixels: Int
}

let outputs = [
    IconOutput(filename: "Icon-20@2x.png", pixels: 40),
    IconOutput(filename: "Icon-20@3x.png", pixels: 60),
    IconOutput(filename: "Icon-29@2x.png", pixels: 58),
    IconOutput(filename: "Icon-29@3x.png", pixels: 87),
    IconOutput(filename: "Icon-40@2x.png", pixels: 80),
    IconOutput(filename: "Icon-40@3x.png", pixels: 120),
    IconOutput(filename: "Icon-60@2x.png", pixels: 120),
    IconOutput(filename: "Icon-60@3x.png", pixels: 180),
    IconOutput(filename: "Icon-1024.png", pixels: 1024),
]

let repoRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputDir = repoRoot
    .appendingPathComponent("ios/AIUsageWidgetApp/Assets.xcassets/AppIcon.appiconset", isDirectory: true)

try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: alpha)
}

func point(_ value: CGFloat, _ scale: CGFloat) -> CGFloat {
    value * scale
}

func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat, _ scale: CGFloat) -> CGRect {
    CGRect(x: x * scale, y: y * scale, width: width * scale, height: height * scale)
}

func fillRounded(_ context: CGContext, _ rect: CGRect, radius: CGFloat, color: CGColor) {
    context.setFillColor(color)
    context.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
    context.fillPath()
}

func drawText(
    _ text: String,
    context: CGContext,
    fontName: String,
    fontSize: CGFloat,
    color: CGColor,
    x: CGFloat,
    y: CGFloat,
    kern: CGFloat = 0
) {
    let font = CTFontCreateWithName(fontName as CFString, fontSize, nil)
    let attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
        NSAttributedString.Key(kCTKernAttributeName as String): kern,
    ]
    let attributed = NSAttributedString(string: text, attributes: attributes)
    let line = CTLineCreateWithAttributedString(attributed)
    context.textPosition = CGPoint(x: x, y: y)
    CTLineDraw(line, context)
}

func drawCenteredText(
    _ text: String,
    context: CGContext,
    fontName: String,
    fontSize: CGFloat,
    color: CGColor,
    centerX: CGFloat,
    y: CGFloat,
    kern: CGFloat = 0
) {
    let font = CTFontCreateWithName(fontName as CFString, fontSize, nil)
    let attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
        NSAttributedString.Key(kCTKernAttributeName as String): kern,
    ]
    let attributed = NSAttributedString(string: text, attributes: attributes)
    let line = CTLineCreateWithAttributedString(attributed)
    let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    context.textPosition = CGPoint(x: centerX - width / 2, y: y)
    CTLineDraw(line, context)
}

func drawIcon(pixels: Int, to url: URL) throws {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: pixels,
        height: pixels,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        throw NSError(domain: "AIUsageIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create bitmap context"])
    }

    let scale = CGFloat(pixels) / 1024

    context.setFillColor(color(4, 5, 7))
    context.fill(CGRect(x: 0, y: 0, width: CGFloat(pixels), height: CGFloat(pixels)))

    guard let gradient = CGGradient(
        colorsSpace: colorSpace,
        colors: [
            color(38, 40, 43),
            color(14, 15, 18),
            color(4, 5, 7),
        ] as CFArray,
        locations: [0, 0.58, 1]
    ) else {
        throw NSError(domain: "AIUsageIcon", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create gradient"])
    }

    context.drawLinearGradient(
        gradient,
        start: CGPoint(x: point(120, scale), y: point(980, scale)),
        end: CGPoint(x: point(900, scale), y: point(80, scale)),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )

    fillRounded(context, rect(70, 70, 884, 884, scale), radius: point(206, scale), color: color(255, 255, 255, 0.045))
    drawCenteredText(
        "USAGE",
        context: context,
        fontName: "HelveticaNeue-CondensedBlack",
        fontSize: point(102, scale),
        color: color(250, 251, 252, 0.92),
        centerX: point(512, scale),
        y: point(812, scale),
        kern: point(6, scale)
    )

    fillRounded(context, rect(128, 156, 768, 92, scale), radius: point(46, scale), color: color(255, 255, 255, 0.11))
    fillRounded(context, rect(158, 180, 230, 44, scale), radius: point(22, scale), color: color(255, 164, 86))
    fillRounded(context, rect(432, 180, 386, 44, scale), radius: point(22, scale), color: color(16, 163, 127))
    fillRounded(context, rect(128, 288, 768, 92, scale), radius: point(46, scale), color: color(255, 255, 255, 0.095))
    fillRounded(context, rect(158, 312, 326, 44, scale), radius: point(22, scale), color: color(255, 164, 86, 0.92))
    fillRounded(context, rect(526, 312, 292, 44, scale), radius: point(22, scale), color: color(48, 212, 109, 0.94))

    drawText(
        "AI",
        context: context,
        fontName: "HelveticaNeue-CondensedBlack",
        fontSize: point(382, scale),
        color: color(250, 251, 252),
        x: point(158, scale),
        y: point(424, scale),
        kern: point(-10, scale)
    )

    drawText(
        "🤏",
        context: context,
        fontName: "AppleColorEmoji",
        fontSize: point(252, scale),
        color: color(255, 255, 255),
        x: point(566, scale),
        y: point(480, scale)
    )

    guard let image = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        throw NSError(domain: "AIUsageIcon", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not create PNG destination"])
    }

    CGImageDestinationAddImage(destination, image, nil)
    if !CGImageDestinationFinalize(destination) {
        throw NSError(domain: "AIUsageIcon", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not encode PNG"])
    }
}

for output in outputs {
    try drawIcon(pixels: output.pixels, to: outputDir.appendingPathComponent(output.filename))
}

print("Generated \(outputs.count) app icon images in \(outputDir.path)")
