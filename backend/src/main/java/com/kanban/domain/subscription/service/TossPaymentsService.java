package com.kanban.domain.subscription.service;

import com.kanban.domain.subscription.config.TossPaymentsConfig;
import com.kanban.domain.subscription.dto.TossPaymentResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class TossPaymentsService {

    private final TossPaymentsConfig config;
    private final RestTemplate restTemplate;

    /**
     * Toss Payments 결제 승인 API 호출
     */
    public TossPaymentResponse confirmPayment(String paymentKey, String orderId, int amount) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBasicAuth(config.getSecretKey(), "");
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
            "paymentKey", paymentKey,
            "orderId", orderId,
            "amount", amount
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<TossPaymentResponse> response = restTemplate.postForEntity(
                config.getConfirmUrl(),
                entity,
                TossPaymentResponse.class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                log.info("Toss payment confirmed: orderId={}, paymentKey={}, amount={}",
                    orderId, paymentKey, amount);
                return response.getBody();
            }

            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        } catch (HttpClientErrorException e) {
            log.error("Toss payment confirm failed: status={}, body={}",
                e.getStatusCode(), e.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Toss payment confirm error", e);
            throw new BusinessException(ErrorCode.PAYMENT_CONFIRM_FAILED);
        }
    }
}
