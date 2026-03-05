package com.kanban.domain.subscription.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.domain.subscription.dto.PolarWebhookEvent;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.WebSocketAuthInterceptor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Service for processing Polar.sh webhook events.
 *
 * <p>Handles webhook signature verification and routes events to appropriate handlers.
 * Processes subscription activation, updates, cancellation, and one-time purchases (AI credits, seats).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolarWebhookService {

    private final PolarConfig polarConfig;
    private final ObjectMapper objectMapper;
    private final SubscriptionRepository subscriptionRepository;
    private final OrgSubscriptionRepository orgSubscriptionRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final OrgPaymentHistoryRepository orgPaymentHistoryRepository;
    private final AiCreditPurchaseRepository aiCreditPurchaseRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NotificationService notificationService;

    /**
     * Main entry point for webhook processing.
     * Verifies the signature, parses the event, and routes to the appropriate handler.
     */
    @Transactional
    public void handleWebhook(String webhookId, String signature, String timestamp, String payload) {
        // 1. Verify webhook signature
        verifySignature(webhookId, signature, timestamp, payload);

        // 2. Parse the webhook event
        PolarWebhookEvent event;
        try {
            event = objectMapper.readValue(payload, PolarWebhookEvent.class);
        } catch (Exception e) {
            log.error("Failed to parse Polar webhook event: {}", e.getMessage());
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        log.info("Received Polar webhook event: type={}", event.type());

        // 3. Route to appropriate handler
        switch (event.type()) {
            case "checkout.created" -> handleCheckoutCreated(event);
            case "subscription.created" -> handleSubscriptionCreated(event);
            case "subscription.updated" -> handleSubscriptionUpdated(event);
            case "subscription.canceled" -> handleSubscriptionCanceled(event);
            case "order.created" -> handleOrderCreated(event);
            case "refund.created" -> handleRefundCreated(event);
            default -> log.warn("Unhandled Polar webhook event type: {}", event.type());
        }
    }

    /**
     * Verify the webhook signature using HMAC-SHA256.
     *
     * <p>Standard Webhook signature verification:
     * 1. Construct the signed content: "{webhookId}.{timestamp}.{payload}"
     * 2. Compute HMAC-SHA256 with the webhook secret (base64-decoded)
     * 3. Compare with the provided signature using constant-time comparison
     *
     * @throws BusinessException with INVALID_WEBHOOK_SIGNATURE if verification fails
     */
    void verifySignature(String webhookId, String signature, String timestamp, String payload) {
        try {
            // Validate timestamp to prevent replay attacks (5-minute tolerance)
            long webhookTimestamp = Long.parseLong(timestamp);
            long currentTimestamp = System.currentTimeMillis() / 1000;
            long tolerance = 300; // 5 minutes
            if (Math.abs(currentTimestamp - webhookTimestamp) > tolerance) {
                log.error("Polar webhook timestamp too old/future: webhookId={}, age={}s",
                        webhookId, currentTimestamp - webhookTimestamp);
                throw new BusinessException(ErrorCode.INVALID_WEBHOOK_SIGNATURE);
            }

            String secret = polarConfig.getWebhookSecret();

            // Standard Webhook format: the secret may have a "whsec_" prefix
            String secretKey = secret;
            if (secretKey.startsWith("whsec_")) {
                secretKey = secretKey.substring(6);
            }

            byte[] secretBytes = Base64.getDecoder().decode(secretKey);

            // Construct the signed content
            String signedContent = webhookId + "." + timestamp + "." + payload;

            // Compute HMAC-SHA256
            Mac hmac = Mac.getInstance("HmacSHA256");
            hmac.init(new SecretKeySpec(secretBytes, "HmacSHA256"));
            byte[] computedHash = hmac.doFinal(signedContent.getBytes(StandardCharsets.UTF_8));
            String computedSignature = Base64.getEncoder().encodeToString(computedHash);

            // The signature header may contain multiple signatures separated by spaces
            // Each signature is prefixed with "v1,"
            String[] signatures = signature.split(" ");
            boolean verified = false;

            for (String sig : signatures) {
                String sigValue = sig.startsWith("v1,") ? sig.substring(3) : sig;

                byte[] expectedBytes = sigValue.getBytes(StandardCharsets.UTF_8);
                byte[] computedBytes = computedSignature.getBytes(StandardCharsets.UTF_8);

                if (MessageDigest.isEqual(expectedBytes, computedBytes)) {
                    verified = true;
                    break;
                }
            }

            if (!verified) {
                log.error("Polar webhook signature verification failed: webhookId={}", webhookId);
                throw new BusinessException(ErrorCode.INVALID_WEBHOOK_SIGNATURE);
            }

            log.debug("Polar webhook signature verified: webhookId={}", webhookId);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Polar webhook signature verification error: {}", e.getMessage());
            throw new BusinessException(ErrorCode.INVALID_WEBHOOK_SIGNATURE);
        }
    }

    /**
     * Handle checkout.created event - log only.
     */
    private void handleCheckoutCreated(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        log.info("Polar checkout created: metadata={}", metadata);
        // Checkout created events are informational only - no action needed
    }

    /**
     * Handle subscription.created event.
     * Activates a Board or Org subscription based on metadata.
     */
    private void handleSubscriptionCreated(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        String polarSubscriptionId = event.extractSubscriptionId();
        String productId = event.extractProductId();

        log.info("Polar subscription created: subscriptionId={}, productId={}, metadata={}",
                polarSubscriptionId, productId, metadata);

        String bridgeType = metadata.getOrDefault("bridge_type", "");

        switch (bridgeType) {
            case "board_subscription" -> activateBoardSubscription(metadata, polarSubscriptionId);
            case "org_subscription" -> activateOrgSubscription(metadata, polarSubscriptionId);
            default -> log.warn("Unknown bridge_type in subscription.created: {}", bridgeType);
        }
    }

    /**
     * Handle subscription.updated event (renewal, plan change, status change).
     */
    private void handleSubscriptionUpdated(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        String polarSubscriptionId = event.extractSubscriptionId();
        String polarStatus = event.extractStatus();

        log.info("Polar subscription updated: subscriptionId={}, status={}, metadata={}",
                polarSubscriptionId, polarStatus, metadata);

        String bridgeType = metadata.getOrDefault("bridge_type", "");

        switch (bridgeType) {
            case "board_subscription" -> updateBoardSubscriptionStatus(metadata, polarStatus);
            case "org_subscription" -> updateOrgSubscriptionStatus(metadata, polarStatus);
            default -> log.warn("Unknown bridge_type in subscription.updated: {}", bridgeType);
        }
    }

    /**
     * Handle subscription.canceled event.
     */
    private void handleSubscriptionCanceled(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        String polarSubscriptionId = event.extractSubscriptionId();

        log.info("Polar subscription canceled: subscriptionId={}, metadata={}",
                polarSubscriptionId, metadata);

        String bridgeType = metadata.getOrDefault("bridge_type", "");

        switch (bridgeType) {
            case "board_subscription" -> cancelBoardSubscription(metadata);
            case "org_subscription" -> cancelOrgSubscription(metadata);
            default -> log.warn("Unknown bridge_type in subscription.canceled: {}", bridgeType);
        }
    }

    /**
     * Handle order.created event (one-time purchases: AI credits, seat additions).
     */
    private void handleOrderCreated(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        String productId = event.extractProductId();

        log.info("Polar order created: productId={}, metadata={}", productId, metadata);

        String bridgeType = metadata.getOrDefault("bridge_type", "");

        switch (bridgeType) {
            case "ai_credit" -> processAiCreditPurchase(metadata);
            case "seat_purchase" -> processSeatPurchase(metadata);
            default -> log.warn("Unknown bridge_type in order.created: {}", bridgeType);
        }
    }

    // === Private Handler Implementations ===

    private void activateBoardSubscription(Map<String, String> metadata, String polarSubscriptionId) {
        String boardId = metadata.get("board_id");
        String userId = metadata.get("user_id");
        String billingCycleStr = metadata.get("billing_cycle");
        int seatCount = parseIntSafe(metadata.get("seat_count"), 1);

        if (boardId == null) {
            log.error("board_id missing in subscription.created metadata");
            return;
        }

        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElse(null);
        if (subscription == null) {
            log.error("Subscription not found for board: {}", boardId);
            return;
        }

        BillingCycle billingCycle = parseBillingCycle(billingCycleStr);
        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        int finalSeatCount = Math.max(seatCount, currentBillable);

        // Activate subscription
        subscription.activateSeatSubscription(billingCycle, finalSeatCount, polarSubscriptionId);
        subscription.updateBillableMemberCount(currentBillable);

        // Upgrade board tier to PREMIUM
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null) {
            board.upgradeToPremium();
            webSocketAuthInterceptor.evictTierCache(boardId);
        }

        // Initialize AI credits
        int monthlyCredits = AiCreditService.getMonthlyCreditsForTier(BoardTier.PREMIUM, finalSeatCount);
        subscription.initializeCredits(monthlyCredits);

        // Record payment history
        PaymentHistory payment = PaymentHistory.builder()
                .subscription(subscription)
                .amount(subscription.getPrice() != null ? subscription.getPrice() : 0)
                .billingCycle(billingCycle)
                .status(PaymentStatus.PAID)
                .pgProvider("POLAR")
                .pgTransactionId(polarSubscriptionId)
                .periodStart(subscription.getCurrentPeriodStart())
                .periodEnd(subscription.getCurrentPeriodEnd())
                .memberCount(finalSeatCount)
                .paidAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
        paymentHistoryRepository.save(payment);

        log.info("Board subscription activated via Polar webhook: boardId={}, seats={}, cycle={}, userId={}",
                boardId, finalSeatCount, billingCycle, userId);
    }

    private void activateOrgSubscription(Map<String, String> metadata, String polarSubscriptionId) {
        String orgId = metadata.get("org_id");
        String userId = metadata.get("user_id");
        String billingCycleStr = metadata.get("billing_cycle");
        int seatCount = parseIntSafe(metadata.get("seat_count"), 1);

        if (orgId == null) {
            log.error("org_id missing in subscription.created metadata");
            return;
        }

        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
                .orElse(null);
        if (orgSub == null) {
            log.error("OrgSubscription not found for org: {}", orgId);
            return;
        }

        BillingCycle billingCycle = parseBillingCycle(billingCycleStr);

        // Activate team subscription
        orgSub.activateTeam(billingCycle, seatCount, polarSubscriptionId);

        // Record payment history
        OrgPaymentHistory history = OrgPaymentHistory.create(
                orgSub, orgSub.getTotalPrice(), 0, OrgPaymentType.SUBSCRIPTION);
        history.setStatus(PaymentStatus.PAID);
        history.setPaidAt(LocalDateTime.now(ZoneOffset.UTC));
        history.setPgProvider("POLAR");
        history.setPgTransactionId(polarSubscriptionId);
        orgPaymentHistoryRepository.save(history);

        log.info("Org subscription activated via Polar webhook: orgId={}, seats={}, cycle={}, userId={}",
                orgId, seatCount, billingCycle, userId);
    }

    private void updateBoardSubscriptionStatus(Map<String, String> metadata, String polarStatus) {
        String boardId = metadata.get("board_id");
        if (boardId == null) {
            log.error("board_id missing in subscription.updated metadata");
            return;
        }

        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElse(null);
        if (subscription == null) {
            log.error("Subscription not found for board: {}", boardId);
            return;
        }

        SubscriptionStatus newStatus = mapPolarStatusToSubscriptionStatus(polarStatus);
        if (newStatus != null && newStatus != subscription.getStatus()) {
            switch (newStatus) {
                case ACTIVE -> {
                    // Renewal - subscription is still active
                    log.info("Board subscription renewed: boardId={}", boardId);
                }
                case PAST_DUE -> {
                    subscription.markPastDue();
                    // Send payment failed notification to board owner
                    Board board = subscription.getBoard();
                    if (board != null && board.getOwner() != null) {
                        notificationService.createPaymentFailedNotification(
                                board.getOwner().getId(), boardId, board.getName());
                    }
                    log.info("Board subscription past_due (grace period started): boardId={}", boardId);
                }
                case SUSPENDED -> {
                    subscription.suspend();
                    log.info("Board subscription suspended: boardId={}", boardId);
                }
                case CANCELED -> {
                    subscription.cancel();
                    Board board = boardRepository.findById(boardId).orElse(null);
                    if (board != null) {
                        board.downgradeToStandard();
                        webSocketAuthInterceptor.evictTierCache(boardId);
                    }
                    log.info("Board subscription canceled via update: boardId={}", boardId);
                }
                default -> log.warn("Unhandled subscription status: {}", newStatus);
            }
        }
    }

    private void updateOrgSubscriptionStatus(Map<String, String> metadata, String polarStatus) {
        String orgId = metadata.get("org_id");
        if (orgId == null) {
            log.error("org_id missing in subscription.updated metadata");
            return;
        }

        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
                .orElse(null);
        if (orgSub == null) {
            log.error("OrgSubscription not found for org: {}", orgId);
            return;
        }

        SubscriptionStatus newStatus = mapPolarStatusToSubscriptionStatus(polarStatus);
        if (newStatus != null && newStatus != orgSub.getStatus()) {
            switch (newStatus) {
                case ACTIVE -> log.info("Org subscription renewed: orgId={}", orgId);
                case PAST_DUE -> {
                    orgSub.markPastDue();
                    log.info("Org subscription past_due (grace period started): orgId={}", orgId);
                }
                case SUSPENDED -> {
                    orgSub.suspend();
                    log.info("Org subscription suspended: orgId={}", orgId);
                }
                case CANCELED -> {
                    orgSub.cancel();
                    log.info("Org subscription canceled via update: orgId={}", orgId);
                }
                default -> log.warn("Unhandled org subscription status: {}", newStatus);
            }
        }
    }

    private void cancelBoardSubscription(Map<String, String> metadata) {
        String boardId = metadata.get("board_id");
        if (boardId == null) {
            log.error("board_id missing in subscription.canceled metadata");
            return;
        }

        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElse(null);
        if (subscription == null) {
            log.error("Subscription not found for board: {}", boardId);
            return;
        }

        subscription.cancel();

        // Downgrade board tier
        Board board = boardRepository.findById(boardId).orElse(null);
        if (board != null) {
            board.downgradeToStandard();
            webSocketAuthInterceptor.evictTierCache(boardId);
        }

        log.info("Board subscription canceled via Polar webhook: boardId={}", boardId);
    }

    private void cancelOrgSubscription(Map<String, String> metadata) {
        String orgId = metadata.get("org_id");
        if (orgId == null) {
            log.error("org_id missing in subscription.canceled metadata");
            return;
        }

        OrgSubscription orgSub = orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId)
                .orElse(null);
        if (orgSub == null) {
            log.error("OrgSubscription not found for org: {}", orgId);
            return;
        }

        orgSub.cancel();

        // Restore boards to STANDARD tier
        boardRepository.findByOrganizationId(orgId).forEach(board -> {
            board.updateTier(BoardTier.STANDARD);
            subscriptionRepository.findByBoardId(board.getId())
                    .ifPresent(Subscription::restoreFromOrg);
        });

        log.info("Org subscription canceled via Polar webhook: orgId={}", orgId);
    }

    private void processAiCreditPurchase(Map<String, String> metadata) {
        String boardId = metadata.get("board_id");
        String userId = metadata.get("user_id");
        int creditAmount = parseIntSafe(metadata.get("credit_amount"), 100);

        if (boardId == null) {
            log.error("board_id missing in order.created metadata for ai_credit");
            return;
        }

        // Add credits with pessimistic lock
        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElse(null);
        if (subscription == null) {
            log.error("Subscription not found for board: {}", boardId);
            return;
        }

        subscription.addPurchasedCredits(creditAmount);

        // Save purchase history
        AiCreditPurchase purchase = AiCreditPurchase.builder()
                .boardId(boardId)
                .userId(userId)
                .creditAmount(creditAmount)
                .unitPrice(10)
                .totalAmount(creditAmount * 10)
                .paymentKey("polar_order_" + UUID.randomUUID().toString().substring(0, 8))
                .orderId("polar_" + UUID.randomUUID().toString().substring(0, 12))
                .status("COMPLETED")
                .build();
        aiCreditPurchaseRepository.save(purchase);

        log.info("AI credits added via Polar webhook: boardId={}, credits={}, userId={}",
                boardId, creditAmount, userId);
    }

    private void processSeatPurchase(Map<String, String> metadata) {
        String boardId = metadata.get("board_id");
        String userId = metadata.get("user_id");
        int additionalSeats = parseIntSafe(metadata.get("additional_seats"), 1);

        if (boardId == null) {
            log.error("board_id missing in order.created metadata for seat_purchase");
            return;
        }

        Subscription subscription = subscriptionRepository.findByBoardIdForUpdate(boardId)
                .orElse(null);
        if (subscription == null) {
            log.error("Subscription not found for board: {}", boardId);
            return;
        }

        if (!subscription.isActive()) {
            log.error("Cannot add seats to inactive subscription: boardId={}", boardId);
            return;
        }

        int newSeatCount = subscription.getSeatCount() + additionalSeats;
        subscription.updateSeatCount(newSeatCount);

        int currentBillable = boardMemberRepository.countBillableMembers(boardId);
        subscription.updateBillableMemberCount(currentBillable);

        // Record payment history
        int additionalAmount = additionalSeats * (subscription.getPricePerSeat() != null ? subscription.getPricePerSeat() : 0);
        PaymentHistory payment = PaymentHistory.builder()
                .subscription(subscription)
                .amount(additionalAmount)
                .billingCycle(subscription.getBillingCycle())
                .status(PaymentStatus.PAID)
                .pgProvider("POLAR")
                .pgTransactionId("polar_seat_" + UUID.randomUUID().toString().substring(0, 12))
                .periodStart(subscription.getCurrentPeriodStart() != null
                        ? subscription.getCurrentPeriodStart()
                        : LocalDateTime.now(ZoneOffset.UTC))
                .periodEnd(subscription.getCurrentPeriodEnd() != null
                        ? subscription.getCurrentPeriodEnd()
                        : LocalDateTime.now(ZoneOffset.UTC).plusMonths(1))
                .memberCount(newSeatCount)
                .paidAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
        paymentHistoryRepository.save(payment);

        log.info("Seats added via Polar webhook: boardId={}, additionalSeats={}, newTotal={}, userId={}",
                boardId, additionalSeats, newSeatCount, userId);
    }

    // === Refund Handler ===

    private void handleRefundCreated(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        String orderId = metadata.get("order_id");

        if (orderId != null) {
            paymentHistoryRepository.findByPgTransactionId(orderId)
                .ifPresent(ph -> {
                    ph.updateStatus(PaymentStatus.REFUNDED);
                    log.info("Payment marked as refunded: orderId={}", orderId);
                });
        }

        log.info("Refund processed via Polar webhook: metadata={}", metadata);
    }

    // === Utility Methods ===

    private SubscriptionStatus mapPolarStatusToSubscriptionStatus(String polarStatus) {
        if (polarStatus == null) return null;
        return switch (polarStatus.toLowerCase()) {
            case "active" -> SubscriptionStatus.ACTIVE;
            case "past_due" -> SubscriptionStatus.PAST_DUE;
            case "canceled" -> SubscriptionStatus.CANCELED;
            case "unpaid" -> SubscriptionStatus.SUSPENDED;
            default -> {
                log.warn("Unknown Polar subscription status: {}", polarStatus);
                yield null;
            }
        };
    }

    private BillingCycle parseBillingCycle(String billingCycleStr) {
        if (billingCycleStr == null) return BillingCycle.MONTHLY;
        try {
            return BillingCycle.valueOf(billingCycleStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            return BillingCycle.MONTHLY;
        }
    }

    private int parseIntSafe(String value, int defaultValue) {
        if (value == null) return defaultValue;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
