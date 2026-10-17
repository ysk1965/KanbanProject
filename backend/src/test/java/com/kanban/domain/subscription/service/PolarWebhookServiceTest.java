package com.kanban.domain.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.notification.service.NotificationService;
import com.kanban.domain.subscription.AiCreditPurchase;
import com.kanban.domain.subscription.AiCreditPurchaseRepository;
import com.kanban.domain.subscription.OrgPaymentHistoryRepository;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.subscription.PaymentHistory;
import com.kanban.domain.subscription.PaymentHistoryRepository;
import com.kanban.domain.subscription.PaymentStatus;
import com.kanban.domain.subscription.PolarWebhookDelivery;
import com.kanban.domain.subscription.PolarWebhookDeliveryRepository;
import com.kanban.domain.subscription.PolarWebhookDeliveryStatus;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.WebSocketAuthInterceptor;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * Polar 웹훅: Standard Webhooks HMAC 서명 검증, 이벤트 라우팅, 재전송 멱등성. 서명은 테스트가 같은 알고리즘으로
 * 직접 만든다(whsec_ + base64 시크릿, "{id}.{ts}.{payload}" 를 HMAC-SHA256 → base64, "v1," 접두).
 *
 * <p>멱등성 저장소는 map 으로 흉내 낸 mock — 같은 id 의 두 번째 {@code saveAndFlush} 가 PK 충돌
 * ({@link DataIntegrityViolationException})을 던지고, {@code reclaim} 은 attempts 가 맞을 때만 1 을 돌려준다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("PolarWebhookService")
class PolarWebhookServiceTest {

    private static final byte[] SECRET_BYTES = "polar-unit-test-secret".getBytes(StandardCharsets.UTF_8);
    private static final String SECRET_B64 = Base64.getEncoder().encodeToString(SECRET_BYTES);
    private static final String WEBHOOK_ID = "msg_abc123";
    private static final String BOARD = "board-1";

    @Mock
    SubscriptionRepository subscriptionRepository;

    @Mock
    OrgSubscriptionRepository orgSubscriptionRepository;

    @Mock
    PaymentHistoryRepository paymentHistoryRepository;

    @Mock
    OrgPaymentHistoryRepository orgPaymentHistoryRepository;

    @Mock
    AiCreditPurchaseRepository aiCreditPurchaseRepository;

    @Mock
    BoardRepository boardRepository;

    @Mock
    BoardMemberRepository boardMemberRepository;

    @Mock
    WebSocketAuthInterceptor webSocketAuthInterceptor;

    @Mock
    NotificationService notificationService;

    @Mock
    PolarWebhookDeliveryRepository deliveryRepository;

    @Mock
    PlatformTransactionManager transactionManager;

    /** 가짜 polar_webhook_events 테이블 */
    private final Map<String, PolarWebhookDelivery> deliveries = new HashMap<>();

    private PolarConfig polarConfig;
    private PolarWebhookService service;

    @BeforeEach
    void setUp() {
        polarConfig = new PolarConfig();
        polarConfig.setWebhookSecret("whsec_" + SECRET_B64);

        lenient().when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        lenient().when(deliveryRepository.saveAndFlush(any())).thenAnswer(inv -> {
            PolarWebhookDelivery d = inv.getArgument(0);
            if (deliveries.containsKey(d.getId())) {
                throw new DataIntegrityViolationException("duplicate key value violates unique constraint");
            }
            deliveries.put(d.getId(), d);
            return d;
        });
        lenient()
                .when(deliveryRepository.findById(anyString()))
                .thenAnswer(inv -> Optional.ofNullable(deliveries.get(inv.getArgument(0))));
        lenient()
                .when(deliveryRepository.reclaim(anyString(), anyInt(), any(), any()))
                .thenAnswer(inv -> {
                    String id = inv.getArgument(0);
                    int expectedAttempts = inv.getArgument(1);
                    PolarWebhookDelivery d = deliveries.get(id);
                    if (d == null || d.getAttempts() != expectedAttempts) return 0;
                    // UPDATE ... SET status = PROCESSING, attempts + 1 을 새 행으로 흉내 낸다
                    deliveries.put(id, new PolarWebhookDelivery(id, d.getEventType(), inv.getArgument(3)));
                    return 1;
                });

        service = new PolarWebhookService(
                polarConfig,
                new ObjectMapper(),
                subscriptionRepository,
                orgSubscriptionRepository,
                paymentHistoryRepository,
                orgPaymentHistoryRepository,
                aiCreditPurchaseRepository,
                boardRepository,
                boardMemberRepository,
                webSocketAuthInterceptor,
                notificationService,
                new PolarWebhookDeliveryWriter(deliveryRepository),
                transactionManager);
    }

    private static String nowTs() {
        return String.valueOf(System.currentTimeMillis() / 1000);
    }

    private static String sign(byte[] secret, String id, String ts, String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        byte[] h = mac.doFinal((id + "." + ts + "." + payload).getBytes(StandardCharsets.UTF_8));
        return "v1," + Base64.getEncoder().encodeToString(h);
    }

    private static void assertSignatureRejected(ThrowingRunnable r) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_WEBHOOK_SIGNATURE);
    }

    @FunctionalInterface
    interface ThrowingRunnable {
        void run() throws Exception;
    }

    @Nested
    @DisplayName("verifySignature")
    class Signature {

        @Test
        @DisplayName("올바른 서명은 통과한다")
        void validSignaturePasses() throws Exception {
            String ts = nowTs();
            String payload = "{\"type\":\"checkout.created\",\"data\":{}}";
            String sig = sign(SECRET_BYTES, WEBHOOK_ID, ts, payload);

            assertThatCode(() -> service.verifySignature(WEBHOOK_ID, sig, ts, payload))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("whsec_ 접두어 없는 시크릿도 동일하게 동작한다")
        void secretWithoutPrefix() throws Exception {
            polarConfig.setWebhookSecret(SECRET_B64);
            String ts = nowTs();
            String payload = "{}";
            String sig = sign(SECRET_BYTES, WEBHOOK_ID, ts, payload);

            assertThatCode(() -> service.verifySignature(WEBHOOK_ID, sig, ts, payload))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("여러 서명 중 하나만 맞아도 통과한다 (키 로테이션)")
        void anyOfMultipleSignatures() throws Exception {
            String ts = nowTs();
            String payload = "{}";
            String bad = sign("other-secret".getBytes(StandardCharsets.UTF_8), WEBHOOK_ID, ts, payload);
            String good = sign(SECRET_BYTES, WEBHOOK_ID, ts, payload);

            assertThatCode(() -> service.verifySignature(WEBHOOK_ID, bad + " " + good, ts, payload))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("다른 시크릿으로 만든 서명은 INVALID_WEBHOOK_SIGNATURE")
        void wrongSecretRejected() throws Exception {
            String ts = nowTs();
            String payload = "{}";
            String sig = sign("other-secret".getBytes(StandardCharsets.UTF_8), WEBHOOK_ID, ts, payload);

            assertSignatureRejected(() -> service.verifySignature(WEBHOOK_ID, sig, ts, payload));
        }

        @Test
        @DisplayName("페이로드가 바뀌면 서명이 맞지 않는다")
        void tamperedPayloadRejected() throws Exception {
            String ts = nowTs();
            String sig = sign(SECRET_BYTES, WEBHOOK_ID, ts, "{\"a\":1}");

            assertSignatureRejected(() -> service.verifySignature(WEBHOOK_ID, sig, ts, "{\"a\":2}"));
        }

        @Test
        @DisplayName("5분 넘게 오래된 타임스탬프는 리플레이로 보고 거부한다")
        void staleTimestampRejected() throws Exception {
            String ts = String.valueOf(System.currentTimeMillis() / 1000 - 600);
            String payload = "{}";
            String sig = sign(SECRET_BYTES, WEBHOOK_ID, ts, payload);

            assertSignatureRejected(() -> service.verifySignature(WEBHOOK_ID, sig, ts, payload));
        }

        @Test
        @DisplayName("숫자가 아닌 타임스탬프/깨진 서명도 INVALID_WEBHOOK_SIGNATURE 로 수렴한다")
        void garbageInputsRejected() {
            assertSignatureRejected(() -> service.verifySignature(WEBHOOK_ID, "v1,abc", "not-a-number", "{}"));
            assertSignatureRejected(() -> service.verifySignature(WEBHOOK_ID, "v1,###", nowTs(), "{}"));
        }
    }

    @Nested
    @DisplayName("handleWebhook — 이벤트 라우팅")
    class Routing {

        private void handle(String payload) throws Exception {
            String ts = nowTs();
            service.handleWebhook(WEBHOOK_ID, sign(SECRET_BYTES, WEBHOOK_ID, ts, payload), ts, payload);
        }

        @Test
        @DisplayName("subscription.created(board_subscription) → ACTIVE + PREMIUM + 크레딧 초기화 + 결제 이력")
        void subscriptionCreatedActivatesBoard() throws Exception {
            Board board = Board.builder().id(BOARD).tier(BoardTier.TRIAL).build();
            Subscription sub = Subscription.builder()
                    .id("sub-1")
                    .board(board)
                    .status(SubscriptionStatus.TRIAL)
                    .build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));
            when(boardRepository.findById(BOARD)).thenReturn(Optional.of(board));
            when(boardMemberRepository.countBillableMembers(BOARD)).thenReturn(2);

            handle("""
                    {"type":"subscription.created","data":{"id":"polar_sub_1","status":"active",
                     "product":{"id":"prod_1"},
                     "metadata":{"bridge_type":"board_subscription","board_id":"board-1","user_id":"u1",
                                 "billing_cycle":"yearly","seat_count":"3"}}}
                    """);

            assertThat(sub.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
            assertThat(sub.getSeatCount()).isEqualTo(3);
            assertThat(sub.getMonthlyAiCredits())
                    .isEqualTo(AiCreditService.getMonthlyCreditsForTier(BoardTier.PREMIUM, 3));
            assertThat(sub.getMonthlyCreditsUsed()).isZero();
            assertThat(board.getTier()).isEqualTo(BoardTier.PREMIUM);
            verify(webSocketAuthInterceptor).evictTierCache(BOARD);

            ArgumentCaptor<PaymentHistory> captor = ArgumentCaptor.forClass(PaymentHistory.class);
            verify(paymentHistoryRepository).save(captor.capture());
            assertThat(captor.getValue().getStatus()).isEqualTo(PaymentStatus.PAID);
            assertThat(captor.getValue().getPgTransactionId()).isEqualTo("polar_sub_1");
        }

        @Test
        @DisplayName("seat_count 가 현재 과금 멤버 수보다 작으면 멤버 수로 올려 잡는다")
        void seatCountNeverBelowBillableMembers() throws Exception {
            Board board = Board.builder().id(BOARD).build();
            Subscription sub = Subscription.builder().id("sub-1").board(board).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));
            when(boardRepository.findById(BOARD)).thenReturn(Optional.of(board));
            when(boardMemberRepository.countBillableMembers(BOARD)).thenReturn(5);

            handle("""
                    {"type":"subscription.created","data":{"id":"polar_sub_2",
                     "metadata":{"bridge_type":"board_subscription","board_id":"board-1","seat_count":"1"}}}
                    """);

            assertThat(sub.getSeatCount()).isEqualTo(5);
        }

        @Test
        @DisplayName("order.created(ai_credit) → 구매 크레딧 가산 + 구매 이력 저장")
        void orderCreatedAddsCredits() throws Exception {
            Subscription sub =
                    Subscription.builder().id("sub-1").purchasedCredits(20).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            handle("""
                    {"type":"order.created","data":{"id":"order_1","product_id":"prod_credit",
                     "metadata":{"bridge_type":"ai_credit","board_id":"board-1","user_id":"u1","credit_amount":"500"}}}
                    """);

            assertThat(sub.getPurchasedCredits()).isEqualTo(520);
            ArgumentCaptor<AiCreditPurchase> captor = ArgumentCaptor.forClass(AiCreditPurchase.class);
            verify(aiCreditPurchaseRepository).save(captor.capture());
            assertThat(captor.getValue().getCreditAmount()).isEqualTo(500);
            assertThat(captor.getValue().getTotalAmount()).isEqualTo(5000);
            assertThat(captor.getValue().getStatus()).isEqualTo("COMPLETED");
        }

        @Test
        @DisplayName("subscription.canceled → CANCELED + 보드 STANDARD 다운그레이드")
        void subscriptionCanceledDowngrades() throws Exception {
            Board board = Board.builder().id(BOARD).tier(BoardTier.PREMIUM).build();
            Subscription sub = Subscription.builder()
                    .id("sub-1")
                    .board(board)
                    .status(SubscriptionStatus.ACTIVE)
                    .build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));
            when(boardRepository.findById(BOARD)).thenReturn(Optional.of(board));

            handle("""
                    {"type":"subscription.canceled","data":{"id":"polar_sub_1",
                     "metadata":{"bridge_type":"board_subscription","board_id":"board-1"}}}
                    """);

            assertThat(sub.getStatus()).isEqualTo(SubscriptionStatus.CANCELED);
            assertThat(board.getTier()).isEqualTo(BoardTier.STANDARD);
            verify(webSocketAuthInterceptor).evictTierCache(BOARD);
        }

        @Test
        @DisplayName("subscription.updated(past_due) → PAST_DUE 전환 (상태가 같으면 아무 것도 안 함)")
        void subscriptionUpdatedPastDue() throws Exception {
            Subscription sub = Subscription.builder()
                    .id("sub-1")
                    .status(SubscriptionStatus.ACTIVE)
                    .build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            handle("""
                    {"type":"subscription.updated","data":{"id":"polar_sub_1","status":"past_due",
                     "metadata":{"bridge_type":"board_subscription","board_id":"board-1"}}}
                    """);

            assertThat(sub.getStatus()).isEqualTo(SubscriptionStatus.PAST_DUE);
        }

        @Test
        @DisplayName("알 수 없는 이벤트 타입은 무시하고 저장소를 건드리지 않는다")
        void unknownEventIgnored() throws Exception {
            assertThatCode(() -> handle("{\"type\":\"benefit.granted\",\"data\":{}}"))
                    .doesNotThrowAnyException();
            verifyNoInteractions(subscriptionRepository, boardRepository, paymentHistoryRepository);
        }

        @Test
        @DisplayName("board_id 가 없는 메타데이터는 로그만 남기고 끝난다")
        void missingBoardIdIsIgnored() throws Exception {
            handle("""
                    {"type":"subscription.created","data":{"id":"x","metadata":{"bridge_type":"board_subscription"}}}
                    """);
            verify(subscriptionRepository, never()).findByBoardIdForUpdate(any());
        }

        @Test
        @DisplayName("JSON 이 아니면 INVALID_INPUT_VALUE (서명은 통과한 뒤)")
        void invalidJsonRejected() throws Exception {
            String ts = nowTs();
            String payload = "not json";
            String sig = sign(SECRET_BYTES, WEBHOOK_ID, ts, payload);

            assertThatThrownBy(() -> service.handleWebhook(WEBHOOK_ID, sig, ts, payload))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.INVALID_INPUT_VALUE);
        }

        @Test
        @DisplayName("서명이 틀리면 본문을 파싱조차 하지 않는다 (멱등성 기록도 남기지 않는다)")
        void badSignatureShortCircuits() {
            assertSignatureRejected(
                    () -> service.handleWebhook(
                            WEBHOOK_ID,
                            "v1,bogus",
                            nowTs(),
                            "{\"type\":\"subscription.created\",\"data\":{\"metadata\":{\"bridge_type\":\"board_subscription\",\"board_id\":\"board-1\"}}}"));
            verifyNoInteractions(subscriptionRepository, deliveryRepository);
        }

        @Test
        @DisplayName("처리에 성공하면 PROCESSED 표식이 처리 트랜잭션과 함께 커밋된다")
        void processedMarkCommitsWithHandler() throws Exception {
            Subscription sub =
                    Subscription.builder().id("sub-1").purchasedCredits(0).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            boolean processed = handleReturning(AI_CREDIT_ORDER);

            assertThat(processed).isTrue();
            assertThat(deliveries.get(WEBHOOK_ID).getStatus()).isEqualTo(PolarWebhookDeliveryStatus.PROCESSED);
            assertThat(deliveries.get(WEBHOOK_ID).getEventType()).isEqualTo("order.created");
            verify(transactionManager).commit(any());
            verify(transactionManager, never()).rollback(any());
        }

        private boolean handleReturning(String payload) throws Exception {
            String ts = nowTs();
            return service.handleWebhook(WEBHOOK_ID, sign(SECRET_BYTES, WEBHOOK_ID, ts, payload), ts, payload);
        }
    }

    private static final String AI_CREDIT_ORDER = """
            {"type":"order.created","data":{"id":"order_1","product_id":"prod_credit",
             "metadata":{"bridge_type":"ai_credit","board_id":"board-1","user_id":"u1","credit_amount":"500"}}}
            """;

    @Nested
    @DisplayName("handleWebhook — 재전송 멱등성")
    class Idempotency {

        private boolean deliver(String webhookId, String payload) throws Exception {
            String ts = nowTs();
            return service.handleWebhook(webhookId, sign(SECRET_BYTES, webhookId, ts, payload), ts, payload);
        }

        @Test
        @DisplayName("같은 webhook-id 가 두 번 오면 한 번만 처리한다 — 크레딧은 한 번만 가산")
        void duplicateDeliveryProcessesOnce() throws Exception {
            Subscription sub =
                    Subscription.builder().id("sub-1").purchasedCredits(20).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            assertThat(deliver(WEBHOOK_ID, AI_CREDIT_ORDER)).isTrue();
            assertThat(deliver(WEBHOOK_ID, AI_CREDIT_ORDER)).isFalse();

            assertThat(sub.getPurchasedCredits()).isEqualTo(520);
            verify(aiCreditPurchaseRepository, times(1)).save(any(AiCreditPurchase.class));
            verify(subscriptionRepository, times(1)).findByBoardIdForUpdate(BOARD);
            verify(deliveryRepository, times(2)).saveAndFlush(any());
        }

        @Test
        @DisplayName("다른 webhook-id 면 둘 다 처리한다")
        void differentIdsBothProcess() throws Exception {
            Subscription sub =
                    Subscription.builder().id("sub-1").purchasedCredits(0).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            assertThat(deliver("msg_1", AI_CREDIT_ORDER)).isTrue();
            assertThat(deliver("msg_2", AI_CREDIT_ORDER)).isTrue();

            assertThat(sub.getPurchasedCredits()).isEqualTo(1000);
            verify(aiCreditPurchaseRepository, times(2)).save(any(AiCreditPurchase.class));
            assertThat(deliveries).containsKeys("msg_1", "msg_2");
        }

        @Test
        @DisplayName("처리 중 예외 → FAILED 로 남기고 예외는 그대로; 재전송이 오면 다시 처리한다")
        void failedDeliveryIsReprocessedOnRedelivery() throws Exception {
            Subscription sub =
                    Subscription.builder().id("sub-1").purchasedCredits(0).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD))
                    .thenThrow(new RuntimeException("db connection reset"))
                    .thenReturn(Optional.of(sub));

            assertThatThrownBy(() -> deliver(WEBHOOK_ID, AI_CREDIT_ORDER))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("db connection reset");

            PolarWebhookDelivery afterFailure = deliveries.get(WEBHOOK_ID);
            assertThat(afterFailure.getStatus()).isEqualTo(PolarWebhookDeliveryStatus.FAILED);
            assertThat(afterFailure.getErrorMessage()).contains("db connection reset");
            verify(transactionManager).rollback(any());
            assertThat(sub.getPurchasedCredits()).isZero();

            assertThat(deliver(WEBHOOK_ID, AI_CREDIT_ORDER)).isTrue();

            assertThat(sub.getPurchasedCredits()).isEqualTo(500);
            assertThat(deliveries.get(WEBHOOK_ID).getStatus()).isEqualTo(PolarWebhookDeliveryStatus.PROCESSED);
            verify(deliveryRepository)
                    .reclaim(
                            WEBHOOK_ID,
                            1,
                            PolarWebhookDeliveryStatus.PROCESSING,
                            deliveries.get(WEBHOOK_ID).getReceivedAt());
        }

        @Test
        @DisplayName("동시 중복: 두 번째 INSERT 가 PK 충돌이고 첫 번째가 아직 PROCESSING 이면 건너뛴다 (하나만 이긴다)")
        void concurrentDuplicateOnlyOneWins() throws Exception {
            // 다른 인스턴스가 방금 선점해 처리 중인 상태
            deliveries.put(
                    WEBHOOK_ID,
                    new PolarWebhookDelivery(WEBHOOK_ID, "order.created", LocalDateTime.now(ZoneOffset.UTC)));

            assertThat(deliver(WEBHOOK_ID, AI_CREDIT_ORDER)).isFalse();

            verify(deliveryRepository).saveAndFlush(any());
            verify(deliveryRepository, never()).reclaim(anyString(), anyInt(), any(), any());
            verifyNoInteractions(subscriptionRepository, aiCreditPurchaseRepository, transactionManager);
            assertThat(deliveries.get(WEBHOOK_ID).getStatus()).isEqualTo(PolarWebhookDeliveryStatus.PROCESSING);
        }

        @Test
        @DisplayName("PROCESSING 에 10분 넘게 멈춘 행(인스턴스 사망)은 재선점해 처리한다")
        void staleProcessingIsReclaimed() throws Exception {
            deliveries.put(
                    WEBHOOK_ID,
                    new PolarWebhookDelivery(
                            WEBHOOK_ID,
                            "order.created",
                            LocalDateTime.now(ZoneOffset.UTC)
                                    .minusMinutes(PolarWebhookService.STALE_PROCESSING_MINUTES + 1)));
            Subscription sub =
                    Subscription.builder().id("sub-1").purchasedCredits(0).build();
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            assertThat(deliver(WEBHOOK_ID, AI_CREDIT_ORDER)).isTrue();

            assertThat(sub.getPurchasedCredits()).isEqualTo(500);
            assertThat(deliveries.get(WEBHOOK_ID).getStatus()).isEqualTo(PolarWebhookDeliveryStatus.PROCESSED);
        }

        @Test
        @DisplayName("FAILED 재선점 경합에서 지면(UPDATE 0건) 처리하지 않는다")
        void losingReclaimRaceSkips() throws Exception {
            PolarWebhookDelivery failed =
                    new PolarWebhookDelivery(WEBHOOK_ID, "order.created", LocalDateTime.now(ZoneOffset.UTC));
            failed.markFailed("boom", LocalDateTime.now(ZoneOffset.UTC));
            deliveries.put(WEBHOOK_ID, failed);
            when(deliveryRepository.reclaim(anyString(), anyInt(), any(), any()))
                    .thenReturn(0);

            assertThat(deliver(WEBHOOK_ID, AI_CREDIT_ORDER)).isFalse();

            verifyNoInteractions(subscriptionRepository, aiCreditPurchaseRepository, transactionManager);
        }

        @Test
        @DisplayName("JSON 파싱 실패는 선점 전에 끝나므로 기록을 남기지 않는다 (재전송은 어차피 또 실패)")
        void parseFailureDoesNotClaim() throws Exception {
            assertThatThrownBy(() -> deliver(WEBHOOK_ID, "not json")).isInstanceOf(BusinessException.class);

            verifyNoInteractions(deliveryRepository);
        }
    }
}
