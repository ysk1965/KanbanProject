package com.kanban.global.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Base64;

@Slf4j
@Configuration
public class FirebaseConfig {

    @Value("${firebase.credentials-json:}")
    private String credentialsJson;

    @PostConstruct
    public void initialize() {
        if (credentialsJson == null || credentialsJson.isBlank()) {
            log.warn("[Firebase] No credentials configured. Push notifications disabled.");
            return;
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(credentialsJson);
            GoogleCredentials credentials = GoogleCredentials
                    .fromStream(new ByteArrayInputStream(decoded));
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(credentials)
                    .build();
            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(options);
                log.info("[Firebase] Admin SDK initialized successfully");
            }
        } catch (IOException e) {
            log.error("[Firebase] Failed to initialize Admin SDK", e);
        }
    }
}
