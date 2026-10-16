import Foundation

enum PackStoreError: LocalizedError {
    case packNotFound(String)
    case missingTrayIcon

    var errorDescription: String? {
        switch self {
        case .packNotFound(let id):
            return "sticker pack not found: \(id)"
        case .missingTrayIcon:
            return "sticker pack has no tray icon"
        }
    }
}

/// Reads the sticker pack index written by the web layer.
///
/// The web layer uses Capacitor Filesystem to store data under the app's `Documents/packs/`:
/// `index.json` holds the metadata of all sticker packs, and each pack's images live in the `packs/<id>/` subdirectory.
struct PackStore {
    private struct Index: Decodable {
        let packs: [Pack]
    }

    private struct Pack: Decodable {
        let id: String
        let name: String
        let author: String
        let animated: Bool?
        let trayIcon: String?
        let stickers: [Sticker]
        let fillers: [String]?
    }

    private struct Sticker: Decodable {
        let file: String
        let emojis: [String]?
    }

    /// Emoji tagged on filler stickers: white square. It is not in WhatsApp's search category list, so filler stickers are not put into any category.
    private static let fillerEmoji = "\u{2B1C}"

    private let root: URL

    init() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        root = documents.appendingPathComponent("packs", isDirectory: true)
    }

    /// Builds the JSON object required by WhatsApp's pasteboard protocol, with images embedded as base64.
    func pasteboardObject(packId: String) throws -> [String: Any] {
        let index = try JSONDecoder().decode(Index.self, from: Data(contentsOf: root.appendingPathComponent("index.json")))
        guard let pack = index.packs.first(where: { $0.id == packId }) else {
            throw PackStoreError.packNotFound(packId)
        }

        guard let trayIcon = pack.trayIcon else {
            throw PackStoreError.missingTrayIcon
        }

        let directory = root.appendingPathComponent(pack.id, isDirectory: true)
        let encode = { (file: String) throws -> String in
            try Data(contentsOf: directory.appendingPathComponent(file)).base64EncodedString()
        }

        var stickers: [[String: Any]] = try pack.stickers.map { sticker in
            ["image_data": try encode(sticker.file), "emojis": sticker.emojis ?? []]
        }

        // WhatsApp requires at least 3 stickers per sticker pack; pad with the transparent filler stickers prepared by the web layer when there are fewer.
        for filler in pack.fillers ?? [] {
            stickers.append(["image_data": try encode(filler), "emojis": [Self.fillerEmoji]])
        }

        return [
            "identifier": pack.id,
            "name": pack.name,
            "publisher": pack.author,
            "tray_image": try encode(trayIcon),
            "animated_sticker_pack": pack.animated ?? false,
            "stickers": stickers
        ]
    }
}
