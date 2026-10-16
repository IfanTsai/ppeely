// Minimal interface declarations written from Apple's public UIKit documentation, covering only what this project uses; used only for type checking on Linux.
// The real UIKit re-exports Foundation, so files that import only UIKit can also use Foundation types.
@_exported import Foundation

open class UIResponder: NSObject {}

open class UIViewController: UIResponder {}

open class UIApplication: UIResponder {
    public struct OpenExternalURLOptionsKey: Hashable {
        public let rawValue: String
    }

    public static let shared = UIApplication()

    open func canOpenURL(_ url: URL) -> Bool { false }

    open func open(_ url: URL, options: [OpenExternalURLOptionsKey: Any] = [:], completionHandler completion: ((Bool) -> Void)? = nil) {}
}

open class UIPasteboard: NSObject {
    public struct OptionsKey: Hashable {
        public let rawValue: String

        public static let expirationDate = OptionsKey(rawValue: "expirationDate")
        public static let localOnly = OptionsKey(rawValue: "localOnly")
    }

    public static let general = UIPasteboard()

    open func setItems(_ items: [[String: Any]], options: [OptionsKey: Any] = [:]) {}
}

// The following two methods belong to Foundation on Apple platforms and are missing from Foundation on Linux, so they are declared here.
extension URL {
    public func startAccessingSecurityScopedResource() -> Bool { false }

    public func stopAccessingSecurityScopedResource() {}
}
