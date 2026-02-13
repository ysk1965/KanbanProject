package com.kanban.global.config;

import com.kanban.global.websocket.NoteCollabHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class NoteCollabWebSocketConfig implements WebSocketConfigurer {

    private final NoteCollabHandler noteCollabHandler;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.testprod-frontend-url:}")
    private String testprodFrontendUrl;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        List<String> origins = new ArrayList<>(List.of(
                frontendUrl,
                "https://bridgespots.com",
                "https://www.bridgespots.com",
                "https://milkyway.pe.kr",
                "https://www.milkyway.pe.kr",
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:3000"
        ));
        if (testprodFrontendUrl != null && !testprodFrontendUrl.isBlank()) {
            origins.add(testprodFrontendUrl);
        }

        registry.addHandler(noteCollabHandler, "/ws-collab/*")
                .setAllowedOrigins(origins.toArray(new String[0]));
    }
}
