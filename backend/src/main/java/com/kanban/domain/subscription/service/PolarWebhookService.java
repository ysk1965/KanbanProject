package com.kanban.domain.subscription.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.subscription.*;
import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.domain.subscription.dto.PolarWebhookEvent;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.WebSocketAuthInterceptor;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Service for processing Polar.sh webhook events.
 *
 * <p>Handles webhook signature verification and routes events to appropriate handlers.
 * Processes subscription activation, updates, cancellation, and one-time purchases (AI credits, seats).
 *
 * <p><b>멱등성</b>: Polar 는 2xx 를 못 받으면 같은 {@code webhook-id} 로 재전송한다. 서명 검증·파싱 뒤
 * {@link PolarWebhookDelivery} 행을 원자적 INSERT 로 선점하고 나서야 핸들러를 돌린다. 이미 PROCESSED 면
 * 200 으로 조용히 끝내고(크레딧 이중 가산 방지), FAILED 였거나 PROCESSING 에 {@value #STALE_PROCESSING_MINUTES}분
 * 넘게 멈춰 있던 행은 다시 선점해 재처리한다. 처리 중인 행의 동시 재전송은 "진행 중"으로 보고 200 으로 건너뛴다 —
 * 첫 전송의 결과(2xx / 5xx → Polar 재시도)가 최종 결과를 정한다.
 */
@Slf4j
@Service
public class PolarWebhookService {

    static final int STALE_PROCESSING_MINUTES = 10;

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
    private final PolarWebhookDeliveryWriter deliveryWriter;
    private final TransactionTemplate processingTransaction;

    public PolarWebhookService(
            PolarConfig polarConfig,
            ObjectMapper objectMapper,
            SubscriptionRepository subscriptionRepository,
            OrgSubscriptionRepository orgSubscriptionRepository,
            PaymentHistoryRepository paymentHistoryRepository,
            OrgPaymentHistoryRepository orgPaymentHistoryRepository,
            AiCreditPurchaseRepository aiCreditPurchaseRepository,
            BoardRepository boardRepository,
            BoardMemberRepository boardMemberRepository,
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NotificationService notificationService,
            PolarWebhookDeliveryWriter deliveryWriter,
            PlatformTransactionManager transactionManager) {
        this.polarConfig = polarConfig;
        this.objectMapper = objectMapper;
        this.subscriptionRepository = subscriptionRepository;
        this.orgSubscriptionRepository = orgSubscriptionRepository;
        this.paymentHistoryRepository = paymentHistoryRepository;
        this.orgPaymentHistoryRepository = orgPaymentHistoryRepository;
        this.aiCreditPurchaseRepository = aiCreditPurchaseRepository;
        this.boardRepository = boardRepository;
        this.boardMemberRepository = boardMemberRepository;
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.notificationService = notificationService;
        this.deliveryWriter = deliveryWriter;
        this.processingTransaction = new TransactionTemplate(transactionManager);
    }

    /**
     * Main entry point for webhook processing.
     * Verifies the signature, parses the event, claims the delivery id, and routes to the appropriate handler.
     *
     * @return {@code true} if the event was processed now; {@code false} if it was skipped as a duplicate
     *         delivery (already processed, or still being processed by another instance)
     */
    public boolean handleWebhook(String webhookId, String signature, String timestamp, String payload) {
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

        log.info("Received Polar webhook event: webhookId={}, type={}", webhookId, event.type());

        // 3. Claim the delivery id — exactly one delivery of this id gets past here
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (!claimDelivery(webhookId, event.type(), now)) {
            return false;
        }

        // 4. Route to the handler inside one transaction; the PROCESSED mark joins it so both commit together
        try {
            processingTransaction.executeWithoutResult(status -> {
                routeEvent(event);
                deliveryWriter.markProcessed(webhookId, LocalDateTime.now(ZoneOffset.UTC));
            });
        } catch (RuntimeException e) {
            // 처리 트랜잭션은 롤백됐다. FAILED 로 남겨 Polar 재전송 때 다시 처리되게 하고, 응답은 종전처럼 실패.
            try {
                deliveryWriter.markFailed(webhookId, e.toString(), LocalDateTime.now(ZoneOffset.UTC));
            } catch (RuntimeException markEx) {
                log.warn(
                        "Could not mark Polar webhook delivery FAILED: webhookId={}, error={}",
                        webhookId,
                        markEx.getMessage());
            }
            throw e;
        }
        return true;
    }

    /**
     * 선점 규칙 — INSERT 성공이면 내 것. PK 충돌이면 기존 행을 보고:
     * PROCESSED → 건너뜀, FAILED → 재선점, PROCESSING → 오래 멈췄을 때만 재선점(아니면 진행 중으로 보고 건너뜀).
     */
    private boolean claimDelivery(String webhookId, String eventType, LocalDateTime now) {
        try {
            deliveryWriter.insertNew(webhookId, eventType, now);
            return true;
        } catch (DataIntegrityViolationException duplicate) {
            // fall through — 이미 받은 id
        }

        PolarWebhookDelivery existing = deliveryWriter.find(webhookId).orElse(null);
        if (existing == null) {
            // 충돌 직후 행이 사라짐(청소와 경합) — 한 번만 더 시도
            try {
                deliveryWriter.insertNew(webhookId, eventType, now);
                return true;
            } catch (DataIntegrityViolationException duplicate) {
                log.info("Duplicate Polar webhook delivery skipped (in flight): webhookId={}", webhookId);
                return false;
            }
        }

        switch (existing.getStatus()) {
            case PROCESSED -> {
                log.info(
                        "Duplicate Polar webhook delivery skipped (already processed): webhookId={}, type={}",
                        webhookId,
                        eventType);
                return false;
            }
            case FAILED -> {
                boolean reclaimed = deliveryWriter.reclaim(webhookId, existing.getAttempts(), now);
                log.info(
                        "Polar webhook redelivery after failure: webhookId={}, attempt={}, reclaimed={}",
                        webhookId,
                        existing.getAttempts() + 1,
                        reclaimed);
                return reclaimed;
            }
            case PROCESSING -> {
                LocalDateTime staleBefore = now.minus(Duration.ofMinutes(STALE_PROCESSING_MINUTES));
                if (existing.getUpdatedAt() != null && existing.getUpdatedAt().isBefore(staleBefore)) {
                    boolean reclaimed = deliveryWriter.reclaim(webhookId, existing.getAttempts(), now);
                    log.warn(
                            "Polar webhook delivery stuck in PROCESSING since {} — reclaiming: webhookId={}, reclaimed={}",
                            existing.getUpdatedAt(),
                            webhookId,
                            reclaimed);
                    return reclaimed;
                }
                log.info("Duplicate Polar webhook delivery skipped (in flight): webhookId={}", webhookId);
                return false;
            }
            default -> {
                log.warn("Unknown Polar webhook delivery status {} for webhookId={}", existing.getStatus(), webhookId);
                return false;
            }
        }
    }

    /** Route to the appropriate handler (runs inside the processing transaction). */
    private void routeEvent(PolarWebhookEvent event) {
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
                log.error(
                        "Polar webhook timestamp too old/future: webhookId={}, age={}s",
                        webhookId,
                        currentTimestamp - webhookTimestamp);
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

        log.info(
                "Polar subscription created: subscriptionId={}, productId={}, metadata={}",
                polarSubscriptionId,
                productId,
                metadata);

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

        log.info(
                "Polar subscription updated: subscriptionId={}, status={}, metadata={}",
                polarSubscriptionId,
                polarStatus,
                metadata);

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

        log.info("Polar subscription canceled: subscriptionId={}, metadata={}", polarSubscriptionId, metadata);

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

        Subscription subscription =
                subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
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

        log.info(
                "Board subscription activated via Polar webhook: boardId={}, seats={}, cycle={}, userId={}",
                boardId,
                finalSeatCount,
                billingCycle,
                userId);
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

        OrgSubscription orgSub =
                orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId).orElse(null);
        if (orgSub == null) {
            log.error("OrgSubscription not found for org: {}", orgId);
            return;
        }

        BillingCycle billingCycle = parseBillingCycle(billingCycleStr);

        // Activate team subscription
        orgSub.activateTeam(billingCycle, seatCount, polarSubscriptionId);

        // Record payment history
        OrgPaymentHistory history =
                OrgPaymentHistory.create(orgSub, orgSub.getTotalPrice(), 0, OrgPaymentType.SUBSCRIPTION);
        history.setStatus(PaymentStatus.PAID);
        history.setPaidAt(LocalDateTime.now(ZoneOffset.UTC));
        history.setPgProvider("POLAR");
        history.setPgTransactionId(polarSubscriptionId);
        orgPaymentHistoryRepository.save(history);

        log.info(
                "Org subscription activated via Polar webhook: orgId={}, seats={}, cycle={}, userId={}",
                orgId,
                seatCount,
                billingCycle,
                userId);
    }

    private void updateBoardSubscriptionStatus(Map<String, String> metadata, String polarStatus) {
        String boardId = metadata.get("board_id");
        if (boardId == null) {
            log.error("board_id missing in subscription.updated metadata");
            return;
        }

        Subscription subscription =
                subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
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

        OrgSubscription orgSub =
                orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId).orElse(null);
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

        Subscription subscription =
                subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
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

        OrgSubscription orgSub =
                orgSubscriptionRepository.findByOrganizationIdForUpdate(orgId).orElse(null);
        if (orgSub == null) {
            log.error("OrgSubscription not found for org: {}", orgId);
            return;
        }

        orgSub.cancel();

        // Restore boards to STANDARD tier
        boardRepository.findByOrganizationId(orgId).forEach(board -> {
            board.updateTier(BoardTier.STANDARD);
            subscriptionRepository.findByBoardId(board.getId()).ifPresent(Subscription::restoreFromOrg);
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
        Subscription subscription =
                subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
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

        log.info(
                "AI credits added via Polar webhook: boardId={}, credits={}, userId={}", boardId, creditAmount, userId);
    }

    private void processSeatPurchase(Map<String, String> metadata) {
        String boardId = metadata.get("board_id");
        String userId = metadata.get("user_id");
        int additionalSeats = parseIntSafe(metadata.get("additional_seats"), 1);

        if (boardId == null) {
            log.error("board_id missing in order.created metadata for seat_purchase");
            return;
        }

        Subscription subscription =
                subscriptionRepository.findByBoardIdForUpdate(boardId).orElse(null);
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
        int additionalAmount =
                additionalSeats * (subscription.getPricePerSeat() != null ? subscription.getPricePerSeat() : 0);
        PaymentHistory payment = PaymentHistory.builder()
                .subscription(subscription)
                .amount(additionalAmount)
                .billingCycle(subscription.getBillingCycle())
                .status(PaymentStatus.PAID)
                .pgProvider("POLAR")
                .pgTransactionId("polar_seat_" + UUID.randomUUID().toString().substring(0, 12))
                .periodStart(
                        subscription.getCurrentPeriodStart() != null
                                ? subscription.getCurrentPeriodStart()
                                : LocalDateTime.now(ZoneOffset.UTC))
                .periodEnd(
                        subscription.getCurrentPeriodEnd() != null
                                ? subscription.getCurrentPeriodEnd()
                                : LocalDateTime.now(ZoneOffset.UTC).plusMonths(1))
                .memberCount(newSeatCount)
                .paidAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
        paymentHistoryRepository.save(payment);

        log.info(
                "Seats added via Polar webhook: boardId={}, additionalSeats={}, newTotal={}, userId={}",
                boardId,
                additionalSeats,
                newSeatCount,
                userId);
    }

    // === Refund Handler ===

    private void handleRefundCreated(PolarWebhookEvent event) {
        Map<String, String> metadata = event.extractMetadata();
        String orderId = metadata.get("order_id");

        if (orderId != null) {
            paymentHistoryRepository.findByPgTransactionId(orderId).ifPresent(ph -> {
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
