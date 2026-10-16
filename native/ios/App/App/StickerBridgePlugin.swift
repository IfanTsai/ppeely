import Capacitor
import UIKit

/// Bridge between the web layer and iOS native capabilities: hands sticker packs to WhatsApp and receives sticker pack files opened from other apps.
///
/// WhatsApp on iOS does not read stickers through a ContentProvider; it defines a pasteboard protocol instead:
/// the third-party app serializes the whole sticker pack to JSON, puts it on the system pasteboard under a dedicated type, and then opens `whatsapp://stickerPack`;
/// once launched, WhatsApp takes the data from the pasteboard and asks the user whether to add it.
@objc(StickerBridgePlugin)
public class StickerBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StickerBridgePlugin"
    public let jsName = "StickerBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getWhatsAppStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPackAdded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addStickerPack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeIncomingFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getImporterEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setImporterEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getKeyboardStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openKeyboardSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showKeyboardPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStickerLibraryStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestStickerLibraryAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listStickerLibrary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "copyDocumentToCache", returnType: CAPPluginReturnPromise)
    ]

    private static let whatsAppScheme = URL(string: "whatsapp://")!
    private static let stickerPackURL = URL(string: "whatsapp://stickerPack")!
    private static let pasteboardType = "net.whatsapp.third-party.sticker-pack"

    /// Sticker pack data on the pasteboard expires after this interval, so it does not occupy the pasteboard for long.
    private static let pasteboardExpiration: TimeInterval = 60

    private static let incomingDirectory = "incoming"

    /// Read and written only on the main thread: the writer `handleOpenURL` is triggered by a notification on the main queue, and the reader `consumeIncomingFile` switches to the main thread before reading.
    private var pendingImport: [String: Any]?
    private var openURLObserver: NSObjectProtocol?

    override public func load() {
        openURLObserver = NotificationCenter.default.addObserver(forName: .capacitorOpenURL, object: nil, queue: .main) { [weak self] notification in
            self?.handleOpenURL(notification)
        }
    }

    deinit {
        if let openURLObserver {
            NotificationCenter.default.removeObserver(openURLObserver)
        }
    }

    @objc func getWhatsAppStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // On iOS the regular and Business editions respond to the same URL scheme and cannot be told apart.
            let installed = UIApplication.shared.canOpenURL(Self.whatsAppScheme)
            call.resolve(["consumerInstalled": installed, "businessInstalled": false])
        }
    }

    @objc func isPackAdded(_ call: CAPPluginCall) {
        // WhatsApp on iOS provides no query interface.
        call.resolve(["consumer": false, "business": false])
    }

    @objc func addStickerPack(_ call: CAPPluginCall) {
        guard let packId = call.getString("id") else {
            call.reject("id is required")
            return
        }

        let payload: Data
        do {
            payload = try JSONSerialization.data(withJSONObject: try PackStore().pasteboardObject(packId: packId))
        } catch {
            call.reject("failed to read sticker pack: \(error.localizedDescription)")
            return
        }

        DispatchQueue.main.async {
            guard UIApplication.shared.canOpenURL(Self.whatsAppScheme) else {
                call.reject("WhatsApp is not installed", "WHATSAPP_NOT_INSTALLED")
                return
            }

            UIPasteboard.general.setItems(
                [[Self.pasteboardType: payload]],
                options: [.localOnly: true, .expirationDate: Date(timeIntervalSinceNow: Self.pasteboardExpiration)]
            )

            UIApplication.shared.open(Self.stickerPackURL, options: [:]) { opened in
                // WhatsApp does not report back whether the user confirmed adding the pack, so this can only report "handed to WhatsApp".
                call.resolve(["added": false, "handedOff": opened])
            }
        }
    }

    @objc func consumeIncomingFile(_ call: CAPPluginCall) {
        // Plugin methods run on Capacitor's background queue; switch to the main thread before reading or writing pendingImport.
        DispatchQueue.main.async {
            let file = self.pendingImport
            self.pendingImport = nil

            call.resolve(["file": file ?? NSNull()])
        }
    }

    @objc func getImporterEnabled(_ call: CAPPluginCall) {
        // File type associations are declared in Info.plist and cannot be toggled at runtime on iOS.
        call.resolve(["enabled": true])
    }

    @objc func setImporterEnabled(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func getKeyboardStatus(_ call: CAPPluginCall) {
        call.resolve(["available": false, "enabled": false])
    }

    @objc func openKeyboardSettings(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func showKeyboardPicker(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func getStickerLibraryStatus(_ call: CAPPluginCall) {
        // The iOS sandbox does not allow reading other apps' media directories.
        call.resolve(["available": false, "granted": false])
    }

    @objc func requestStickerLibraryAccess(_ call: CAPPluginCall) {
        call.resolve(["granted": false])
    }

    @objc func listStickerLibrary(_ call: CAPPluginCall) {
        call.resolve(["stickers": []])
    }

    @objc func copyDocumentToCache(_ call: CAPPluginCall) {
        call.reject("documents are not available on this platform")
    }

    /// When another app hands over a file via "Open with", copies it to the cache directory and notifies the web layer to fetch it.
    private func handleOpenURL(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL, url.isFileURL else {
            return
        }

        let scoped = url.startAccessingSecurityScopedResource()
        defer {
            if scoped {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let directory = caches.appendingPathComponent(Self.incomingDirectory, isDirectory: true)
        let name = "\(UUID().uuidString).bin"
        let target = directory.appendingPathComponent(name)

        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: target)
        } catch {
            return
        }

        let size = (try? target.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        pendingImport = ["path": "\(Self.incomingDirectory)/\(name)", "name": url.lastPathComponent, "size": size]
        notifyListeners("incomingFile", data: [:], retainUntilConsumed: true)
    }
}
