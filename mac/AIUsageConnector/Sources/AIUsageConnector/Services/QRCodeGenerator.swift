import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins

struct QRCodeGenerator {
    static func image(for text: String, size: CGFloat = 260) -> NSImage? {
        let data = Data(text.utf8)
        let filter = CIFilter.qrCodeGenerator()
        filter.setValue(data, forKey: "inputMessage")
        filter.correctionLevel = "M"

        guard let output = filter.outputImage else {
            return nil
        }

        let scaleX = size / output.extent.width
        let scaleY = size / output.extent.height
        let transformed = output.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
        let representation = NSCIImageRep(ciImage: transformed)
        let image = NSImage(size: representation.size)
        image.addRepresentation(representation)
        return image
    }
}
