import Foundation
import Capacitor
import WidgetKit

/// 웹 코드 ↔ iOS 위젯 (utils/widgetBridge.ts 의 registerPlugin('BridgeWidget')).
@objc(BridgeWidgetPlugin)
public class BridgeWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BridgeWidgetPlugin"
    public let jsName = "BridgeWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise),
    ]

    @objc func setSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json 이 없어요")
            return
        }
        WidgetShared.writeSnapshot(json)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func takePending(_ call: CAPPluginCall) {
        call.resolve(["ops": WidgetShared.takePending()])
    }

    @objc func clearSnapshot(_ call: CAPPluginCall) {
        WidgetShared.clearSnapshot()
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
