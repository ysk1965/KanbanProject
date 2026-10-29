import UIKit
import Capacitor

/// Main.storyboard 의 브리지 화면. 앱 안에만 있는 플러그인(npm 패키지가 아닌 것)을 여기서 등록한다.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BridgeWidgetPlugin())
    }
}
