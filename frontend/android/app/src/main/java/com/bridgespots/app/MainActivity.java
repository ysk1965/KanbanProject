package com.bridgespots.app;

import android.os.Bundle;
import com.bridgespots.app.widget.BridgeWidgetPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 홈 화면 위젯 브리지 (앱 안 플러그인이라 cap sync 목록에 없다)
        registerPlugin(BridgeWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
