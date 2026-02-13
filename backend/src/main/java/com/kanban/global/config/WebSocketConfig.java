package com.kanban.global.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.global.security.WebSocketAuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.converter.DefaultContentTypeResolver;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.util.MimeTypeUtils;
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
    private final ObjectMapper objectMapper;

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
                .setAllowedOrigins(origins.toArray(new String[0]));
    }

    @Override
    public boolean configureMessageConverters(List<MessageConverter> messageConverters) {
        DefaultContentTypeResolver resolver = new DefaultContentTypeResolver();
        resolver.setDefaultMimeType(MimeTypeUtils.APPLICATION_JSON);

        MappingJackson2MessageConverter converter = new MappingJackson2MessageConverter();
        converter.setObjectMapper(objectMapper);
        converter.setContentTypeResolver(resolver);

        messageConverters.add(converter);
        // return false = 기본 컨버터 등록하지 않음 (커스텀만 사용)
        return false;
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor);
    }
}
