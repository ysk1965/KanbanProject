package com.kanban.domain.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.subscription.config.PolarConfig;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.WebSocketAuthInterceptor;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
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

/**
 * Polar 웹훅: Standard Webhooks HMAC 서명 검증과 이벤트 라우팅. 서명은 테스트가 같은 알고리즘으로
 * 직접 만든다(whsec_ + base64 시크릿, "{id}.{ts}.{payload}" 를 HMAC-SHA256 → base64, "v1," 접두).
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

    private PolarConfig polarConfig;
    private PolarWebhookService service;

    @BeforeEach
    void setUp() {
        polarConfig = new PolarConfig();
        polarConfig.setWebhookSecret("whsec_" + SECRET_B64);
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
                notificationService);
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
        @DisplayName("서명이 틀리면 본문을 파싱조차 하지 않는다")
        void badSignatureShortCircuits() {
            assertSignatureRejected(
                    () -> service.handleWebhook(
                            WEBHOOK_ID,
                            "v1,bogus",
                            nowTs(),
                            "{\"type\":\"subscription.created\",\"data\":{\"metadata\":{\"bridge_type\":\"board_subscription\",\"board_id\":\"board-1\"}}}"));
            verifyNoInteractions(subscriptionRepository);
        }
    }
}
