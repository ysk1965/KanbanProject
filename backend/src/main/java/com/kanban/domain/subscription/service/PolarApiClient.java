package com.kanban.domain.subscription.service;

import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Polar.sh REST API client for checkout creation and subscription management.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolarApiClient {

    private final PolarConfig polarConfig;
    private final RestTemplate restTemplate;

    /**
     * Create a Polar checkout session and return the checkout URL.
     *
     * @param productId  Polar product ID
     * @param quantity   number of units (e.g., seats)
     * @param metadata   BRIDGE metadata (bridge_type, board_id, user_id, etc.)
     * @param successUrl URL to redirect on successful payment
     * @param cancelUrl  URL to redirect on canceled payment
     * @return checkout URL for the user to complete payment
     */
    public String createCheckout(String productId, int quantity, Map<String, String> metadata,
                                  String successUrl, String cancelUrl) {
        HttpHeaders headers = createHeaders();

        Map<String, Object> body = new HashMap<>();
        body.put("product_id", productId);
        body.put("success_url", successUrl);
        body.put("confirmation_url", cancelUrl);
        body.put("metadata", metadata);

        if (quantity > 1) {
            body.put("label", "x" + quantity);
        }

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            String checkoutUrl = polarConfig.getBaseUrl() + "/v1/checkouts/custom/";

            @SuppressWarnings("unchecked")
            ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                    checkoutUrl,
                    entity,
                    (Class<Map<String, Object>>) (Class<?>) Map.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String url = (String) response.getBody().get("url");
                if (url != null) {
                    log.info("Polar checkout created: productId={}, metadata={}", productId, metadata);
                    return url;
                }
            }

            log.error("Polar checkout creation failed: no URL in response");
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        } catch (HttpClientErrorException e) {
            log.error("Polar checkout creation failed: status={}, body={}",
                    e.getStatusCode(), e.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Polar checkout creation error", e);
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        }
    }

    /**
     * Cancel a Polar subscription.
     *
     * @param subscriptionId Polar subscription ID
     */
    public void cancelSubscription(String subscriptionId) {
        HttpHeaders headers = createHeaders();

        Map<String, Object> body = Map.of(
                "cancel_at_period_end", true
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            String url = polarConfig.getBaseUrl() + "/v1/subscriptions/" + subscriptionId;

            restTemplate.exchange(url, HttpMethod.PATCH, entity, Map.class);

            log.info("Polar subscription canceled: subscriptionId={}", subscriptionId);
        } catch (HttpClientErrorException e) {
            log.error("Polar subscription cancellation failed: status={}, body={}",
                    e.getStatusCode(), e.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        } catch (Exception e) {
            log.error("Polar subscription cancellation error", e);
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        }
    }

    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(polarConfig.getApiKey());
        return headers;
    }
}
