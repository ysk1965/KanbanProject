package com.kanban.domain.auth.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import jakarta.annotation.PostConstruct;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.Map;

@Slf4j
@Service
public class GoogleAuthService {

    @Value("${google.oauth2.client-id}")
    private String clientId;

    @Value("${google.oauth2.client-secret:}")
    private String clientSecret;

    private GoogleIdTokenVerifier verifier;

    @PostConstruct
    public void init() {
        this.verifier = new GoogleIdTokenVerifier.Builder(
                new NetHttpTransport(),
                GsonFactory.getDefaultInstance())
                .setAudience(Collections.singletonList(clientId))
                .build();
    }

    public GoogleUserInfo verifyIdToken(String idTokenString) {
        try {
            GoogleIdToken idToken = verifier.verify(idTokenString);
            if (idToken == null) {
                throw new BusinessException(ErrorCode.INVALID_GOOGLE_TOKEN);
            }

            GoogleIdToken.Payload payload = idToken.getPayload();

            return GoogleUserInfo.builder()
                    .googleId(payload.getSubject())
                    .email(payload.getEmail())
                    .emailVerified(payload.getEmailVerified())
                    .name((String) payload.get("name"))
                    .pictureUrl((String) payload.get("picture"))
                    .build();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to verify Google ID token", e);
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_TOKEN);
        }
    }

    @SuppressWarnings("unchecked")
    public GoogleUserInfo exchangeAuthorizationCode(String code) {
        try {
            log.info("Google OAuth code exchange - clientId: {}..., clientSecret length: {}, code: {}...",
                    clientId != null && clientId.length() > 10 ? clientId.substring(0, 10) : clientId,
                    clientSecret != null ? clientSecret.length() : 0,
                    code != null && code.length() > 10 ? code.substring(0, 10) : code);

            RestTemplate restTemplate = new RestTemplate();

            MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
            params.add("code", code);
            params.add("client_id", clientId);
            params.add("client_secret", clientSecret);
            params.add("redirect_uri", "postmessage");
            params.add("grant_type", "authorization_code");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    "https://oauth2.googleapis.com/token", request, Map.class);

            Map<String, Object> body = response.getBody();
            if (body == null || !body.containsKey("id_token")) {
                log.error("Google token exchange failed: no id_token in response. body={}", body);
                throw new BusinessException(ErrorCode.INVALID_GOOGLE_TOKEN);
            }

            String idTokenString = (String) body.get("id_token");
            return verifyIdToken(idTokenString);

        } catch (BusinessException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Google token exchange HTTP error - status: {}, body: {}", e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_TOKEN);
        } catch (Exception e) {
            log.error("Failed to exchange Google authorization code", e);
            throw new BusinessException(ErrorCode.INVALID_GOOGLE_TOKEN);
        }
    }

    @Builder
    @Getter
    @AllArgsConstructor
    public static class GoogleUserInfo {
        private String googleId;
        private String email;
        private Boolean emailVerified;
        private String name;
        private String pictureUrl;
    }
}
