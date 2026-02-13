package com.kanban.global.config;

import com.kanban.global.security.WebSocketAuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${app.testprod-frontend-url:}")
    private String testprodFrontendUrl;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // SimpleBroker for local/dev (can be replaced with Redis Pub/Sub for prod later)
        config.enableSimpleBroker("/topic", "/queue");
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
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

        registry.addEndpoint("/ws")
                .setAllowedOrigins(origins.toArray(new String[0]))
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor);
    }
}
