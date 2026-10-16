// Actually runs PackStore on Linux: reads a set of sticker pack data, builds the pasteboard JSON handed to WhatsApp, and checks that it meets
// the requirements of WhatsApp's iOS third-party sticker protocol (tray icon is a 96×96 PNG of at most 50 KB; 3 to 30 512×512 WebP stickers per pack,
// at most 100 KB for static and 500 KB for animated; at most 3 emoji per sticker).
// The data directory is set through the HOME environment variable: sticker packs are in $HOME/Documents/packs.
import Foundation

struct CheckFailure: Error, CustomStringConvertible {
    let description: String
}

func require(_ condition: Bool, _ message: @autoclosure () -> String) throws {
    if !condition {
        throw CheckFailure(description: message())
    }
}

func uint24(_ bytes: [UInt8], _ offset: Int) -> Int {
    Int(bytes[offset]) | Int(bytes[offset + 1]) << 8 | Int(bytes[offset + 2]) << 16
}

/// Returns the canvas size and frame count of a WebP.
func inspectWebp(_ data: Data) throws -> (width: Int, height: Int, frames: Int) {
    let bytes = [UInt8](data)
    try require(bytes.count > 16 && String(decoding: bytes[0..<4], as: UTF8.self) == "RIFF" && String(decoding: bytes[8..<12], as: UTF8.self) == "WEBP", "not a WebP image")

    var width = 0
    var height = 0
    var frames = 0
    var offset = 12
    while offset + 8 <= bytes.count {
        let type = String(decoding: bytes[offset..<offset + 4], as: UTF8.self)
        let size = Int(bytes[offset + 4]) | Int(bytes[offset + 5]) << 8 | Int(bytes[offset + 6]) << 16 | Int(bytes[offset + 7]) << 24
        if type == "VP8X" {
            width = uint24(bytes, offset + 12) + 1
            height = uint24(bytes, offset + 15) + 1
        } else if type == "ANMF" {
            frames += 1
        }

        offset += 8 + size + (size & 1)
    }

    return (width, height, max(1, frames))
}

func check(packId: String, name: String) throws {
    let object = try PackStore().pasteboardObject(packId: packId)
    let payload = try JSONSerialization.data(withJSONObject: object)

    try require(object["identifier"] as? String == packId, "identifier")
    try require((object["name"] as? String)?.isEmpty == false, "name")
    try require((object["publisher"] as? String)?.isEmpty == false, "publisher")

    let tray = Data(base64Encoded: object["tray_image"] as? String ?? "") ?? Data()
    let trayBytes = [UInt8](tray)
    try require(trayBytes.count > 24 && trayBytes[1] == 0x50 && trayBytes[2] == 0x4E && trayBytes[3] == 0x47, "tray image is not a PNG")
    try require(trayBytes[19] == 96 && trayBytes[23] == 96, "tray image is not 96x96")
    try require(tray.count <= 50 * 1024, "tray image exceeds 50 KB")

    let animated = object["animated_sticker_pack"] as? Bool ?? false
    let stickers = object["stickers"] as? [[String: Any]] ?? []
    try require((3...30).contains(stickers.count), "sticker count \(stickers.count)")

    for (index, sticker) in stickers.enumerated() {
        let image = Data(base64Encoded: sticker["image_data"] as? String ?? "") ?? Data()
        let info = try inspectWebp(image)
        try require(info.width == 512 && info.height == 512, "sticker \(index) is \(info.width)x\(info.height)")
        try require(((sticker["emojis"] as? [String])?.count ?? 0) <= 3, "sticker \(index) has too many emojis")
        if animated {
            try require(info.frames > 1 && image.count <= 500 * 1024, "sticker \(index) is not a valid animated sticker")
        } else {
            try require(info.frames == 1 && image.count <= 100 * 1024, "sticker \(index) is not a valid static sticker")
        }
    }

    print("ok    \(name): \(stickers.count) stickers, \(animated ? "animated" : "static"), payload \(payload.count) bytes")
}

@main
struct PackStoreCheck {
    static func main() throws {
        struct Index: Decodable {
            struct Pack: Decodable {
                let id: String
                let name: String
                let trayIcon: String?
            }

            let packs: [Pack]
        }

        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let index = try JSONDecoder().decode(Index.self, from: Data(contentsOf: documents.appendingPathComponent("packs/index.json")))
        var failures = 0

        for pack in index.packs {
            do {
                try check(packId: pack.id, name: pack.name)
            } catch PackStoreError.missingTrayIcon {
                // A sticker pack that has not been prepared for delivery yet has no tray icon; PackStore should reject it instead of producing incomplete data.
                print("ok    \(pack.name): rejected because it has no tray icon yet")
            } catch {
                failures += 1
                print("FAIL  \(pack.name): \(error)")
            }
        }

        if failures > 0 {
            exit(1)
        }
    }
}
