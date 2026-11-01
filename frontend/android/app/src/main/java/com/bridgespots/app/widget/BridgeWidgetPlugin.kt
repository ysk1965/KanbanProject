package com.bridgespots.app.widget

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** 웹 코드 ↔ 안드로이드 위젯 (utils/widgetBridge.ts 의 registerPlugin('BridgeWidget'), iOS 와 같은 이름·같은 메서드) */
@CapacitorPlugin(name = "BridgeWidget")
class BridgeWidgetPlugin : Plugin() {
    @PluginMethod
    fun setSnapshot(call: PluginCall) {
        val json = call.getString("json")
        if (json == null) {
            call.reject("json 이 없어요")
            return
        }
        WidgetStore.writeSnapshot(context, json)
        WidgetRefresh.all(context)
        call.resolve()
    }

    @PluginMethod
    fun takePending(call: PluginCall) {
        call.resolve(JSObject().put("ops", WidgetStore.takePending(context)))
    }

    @PluginMethod
    fun clearSnapshot(call: PluginCall) {
        WidgetStore.clearSnapshot(context)
        WidgetRefresh.all(context)
        call.resolve()
    }
}
