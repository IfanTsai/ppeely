import Capacitor
import UIKit

/// The app's root view controller: registers the app's own native plugins once the Capacitor bridge is ready.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StickerBridgePlugin())
    }
}
