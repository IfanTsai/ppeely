// Minimal declarations written from the public interface of Capacitor iOS (MIT License), based on the source files in node_modules/@capacitor/ios/Capacitor/Capacitor/
// (CAPPlugin.h, CAPBridgedPlugin.h, CAPPluginMethod.h, CAPPluginCall.swift, JSTypes.swift,
// CAPBridgeProtocol.swift, CAPBridgeViewController.swift, CAPNotifications.swift); used only for type checking on Linux.
import Foundation
import UIKit

public typealias PluginCallResultData = [String: Any]

public typealias CAPPluginReturnType = String

public let CAPPluginReturnPromise: CAPPluginReturnType = "promise"

public class CAPPluginMethod: NSObject {
    public init(name: String, returnType: CAPPluginReturnType) {}
}

public protocol CAPBridgedPlugin {
    var identifier: String { get }
    var jsName: String { get }
    var pluginMethods: [CAPPluginMethod] { get }
}

public protocol CAPBridgeProtocol: AnyObject {
    func registerPluginInstance(_ pluginInstance: CAPPlugin)
}

open class CAPPlugin: NSObject {
    public weak var bridge: CAPBridgeProtocol?

    open func load() {}

    public func notifyListeners(_ eventName: String, data: [String: Any]?) {}

    public func notifyListeners(_ eventName: String, data: [String: Any]?, retainUntilConsumed retain: Bool) {}
}

public class CAPPluginCall: NSObject {
    public func getString(_ key: String) -> String? { nil }

    public func getString(_ key: String, _ defaultValue: String) -> String { defaultValue }

    public func getBool(_ key: String) -> Bool? { nil }

    public func resolve() {}

    public func resolve(_ data: PluginCallResultData = [:]) {}

    public func reject(_ message: String, _ code: String? = nil, _ error: Error? = nil, _ data: PluginCallResultData? = nil) {}
}

open class CAPBridgeViewController: UIViewController {
    public final var bridge: CAPBridgeProtocol? { nil }

    open func capacitorDidLoad() {}
}

extension Notification.Name {
    public static let capacitorOpenURL = Notification.Name(rawValue: "CapacitorOpenURLNotification")
}
