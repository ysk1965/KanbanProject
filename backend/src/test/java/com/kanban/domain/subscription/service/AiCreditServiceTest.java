package com.kanban.domain.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardTier;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.subscription.AiCreditPurchaseRepository;
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.system.MonetizationService;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

/**
 * 크레딧 차감 순서(월간 무료 → 구매분)와 소진/환불 동작. 실제 {@link Subscription} 엔티티를 써서
 * 서비스 + 엔티티 산술을 함께 고정한다. 저장소는 모두 mock — pessimistic lock 쿼리가 호출되는지만 본다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AiCreditService — 소비/소진/환불")
class AiCreditServiceTest {

    private static final String BOARD = "board-1";
    private static final String USER = "user-1";
    private static final String FEATURE = "FEATURE_DECOMPOSE";

    @Mock
    SubscriptionRepository subscriptionRepository;

    @Mock
    OrgSubscriptionRepository orgSubscriptionRepository;

    @Mock
    BoardRepository boardRepository;

    @Mock
    AiCreditPurchaseRepository aiCreditPurchaseRepository;

    @Mock
    AiUsageLogRepository aiUsageLogRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    MonetizationService monetizationService;

    @InjectMocks
    AiCreditService service;

    private Subscription subscription(int monthly, int used, int purchased) {
        return Subscription.builder()
                .id("sub-1")
                .monthlyAiCredits(monthly)
                .monthlyCreditsUsed(used)
                .purchasedCredits(purchased)
                .build();
    }

    @Nested
    @DisplayName("consumeCredit — 보드 구독")
    class Consume {

        @BeforeEach
        void monetizationOn() {
            when(monetizationService.isMonetizationEnabled()).thenReturn(true);
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(
                            Board.builder().id(BOARD).tier(BoardTier.PREMIUM).build()));
        }

        @Test
        @DisplayName("월간 무료분이 충분하면 월간에서만 차감하고 구매분은 건드리지 않는다")
        void monthlyFirst() {
            Subscription sub = subscription(10, 0, 5);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            service.consumeCredit(BOARD, USER, FEATURE, 4);

            assertThat(sub.getMonthlyCreditsUsed()).isEqualTo(4);
            assertThat(sub.getPurchasedCredits()).isEqualTo(5);
            assertThat(sub.getTotalAvailableCredits()).isEqualTo(11);
        }

        @Test
        @DisplayName("월간 잔여가 모자라면 월간을 다 쓰고 나머지만 구매분에서 뺀다 (MIXED)")
        void mixedMonthlyThenPurchased() {
            Subscription sub = subscription(10, 8, 5);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));
            assertThat(sub.getCreditSource(4)).isEqualTo("MIXED");

            service.consumeCredit(BOARD, USER, FEATURE, 4);

            assertThat(sub.getMonthlyCreditsUsed()).isEqualTo(10);
            assertThat(sub.getPurchasedCredits()).isEqualTo(3);
        }

        @Test
        @DisplayName("월간이 바닥나면 구매분에서만 차감한다 (PURCHASED)")
        void purchasedOnly() {
            Subscription sub = subscription(10, 10, 5);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));
            assertThat(sub.getCreditSource(3)).isEqualTo("PURCHASED");

            service.consumeCredit(BOARD, USER, FEATURE, 3);

            assertThat(sub.getMonthlyCreditsUsed()).isEqualTo(10);
            assertThat(sub.getPurchasedCredits()).isEqualTo(2);
        }

        @Test
        @DisplayName("정확히 남은 만큼은 소비할 수 있다 (경계값)")
        void exactRemainingAllowed() {
            Subscription sub = subscription(10, 9, 2);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            service.consumeCredit(BOARD, USER, FEATURE, 3);

            assertThat(sub.getTotalAvailableCredits()).isZero();
            assertThat(sub.getWarningLevel()).isEqualTo("EXHAUSTED");
        }

        @Test
        @DisplayName("잔여보다 많이 요구하면 AI_CREDITS_EXHAUSTED(402) 이고 잔액은 변하지 않는다")
        void exhaustedThrows402AndLeavesStateIntact() {
            Subscription sub = subscription(10, 10, 2);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            assertThatThrownBy(() -> service.consumeCredit(BOARD, USER, FEATURE, 3))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> {
                        ErrorCode code = ((BusinessException) e).getErrorCode();
                        assertThat(code).isEqualTo(ErrorCode.AI_CREDITS_EXHAUSTED);
                        assertThat(code.getStatus()).isEqualTo(HttpStatus.PAYMENT_REQUIRED);
                    });

            assertThat(sub.getMonthlyCreditsUsed()).isEqualTo(10);
            assertThat(sub.getPurchasedCredits()).isEqualTo(2);
        }

        @Test
        @DisplayName("구독이 없으면 SUBSCRIPTION_NOT_FOUND")
        void missingSubscription() {
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.consumeCredit(BOARD, USER, FEATURE, 1))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SUBSCRIPTION_NOT_FOUND);
        }
    }

    @Test
    @DisplayName("과금이 꺼져 있으면 아무 저장소도 건드리지 않는다")
    void monetizationDisabledIsNoop() {
        when(monetizationService.isMonetizationEnabled()).thenReturn(false);

        assertThatCode(() -> service.consumeCredit(BOARD, USER, FEATURE, 100)).doesNotThrowAnyException();

        verifyNoInteractions(boardRepository, subscriptionRepository, orgSubscriptionRepository);
    }

    @Test
    @DisplayName("ORG_MANAGED 보드는 조직 크레딧 풀에서 차감한다 (보드 구독은 조회하지 않음)")
    void orgManagedBoardUsesOrgPool() {
        when(monetizationService.isMonetizationEnabled()).thenReturn(true);
        Organization org = Organization.builder().id("org-1").build();
        when(boardRepository.findById(BOARD))
                .thenReturn(Optional.of(Board.builder()
                        .id(BOARD)
                        .tier(BoardTier.ORG_MANAGED)
                        .organization(org)
                        .build()));
        OrgSubscription orgSub = mock(OrgSubscription.class);
        when(orgSub.hasEnoughCredits(5)).thenReturn(true);
        when(orgSubscriptionRepository.findByOrganizationIdForUpdate("org-1")).thenReturn(Optional.of(orgSub));

        service.consumeCredit(BOARD, USER, FEATURE, 5);

        verify(orgSub).consumeCredits(5);
        verify(subscriptionRepository, never()).findByBoardIdForUpdate(any());
    }

    @Test
    @DisplayName("조직 풀 소진 시에도 AI_CREDITS_EXHAUSTED")
    void orgPoolExhausted() {
        when(monetizationService.isMonetizationEnabled()).thenReturn(true);
        Organization org = Organization.builder().id("org-1").build();
        when(boardRepository.findById(BOARD))
                .thenReturn(Optional.of(Board.builder()
                        .id(BOARD)
                        .tier(BoardTier.ORG_MANAGED)
                        .organization(org)
                        .build()));
        OrgSubscription orgSub = mock(OrgSubscription.class);
        when(orgSub.hasEnoughCredits(5)).thenReturn(false);
        when(orgSubscriptionRepository.findByOrganizationIdForUpdate("org-1")).thenReturn(Optional.of(orgSub));

        assertThatThrownBy(() -> service.consumeCredit(BOARD, USER, FEATURE, 5))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_CREDITS_EXHAUSTED);
        verify(orgSub, never()).consumeCredits(any(Integer.class));
    }

    @Nested
    @DisplayName("refundCredit")
    class Refund {

        @Test
        @DisplayName("월간 사용량을 되돌린다")
        void refundRestoresMonthlyUsage() {
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder().id(BOARD).build()));
            Subscription sub = subscription(10, 4, 0);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            service.refundCredit(BOARD, USER, FEATURE, 3);

            assertThat(sub.getMonthlyCreditsUsed()).isEqualTo(1);
        }

        @Test
        @DisplayName("사용량보다 많이 환불해도 0 아래로 내려가지 않는다")
        void refundFloorsAtZero() {
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder().id(BOARD).build()));
            Subscription sub = subscription(10, 2, 0);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            service.refundCredit(BOARD, USER, FEATURE, 5);

            assertThat(sub.getMonthlyCreditsUsed()).isZero();
        }

        @Test
        @DisplayName("현재 구현은 구매분에서 차감된 크레딧을 구매분으로 되돌리지 않는다 (월간 카운터만 조정)")
        void refundDoesNotRestorePurchasedCredits() {
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder().id(BOARD).build()));
            Subscription sub = subscription(10, 10, 2);
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.of(sub));

            service.refundCredit(BOARD, USER, FEATURE, 3);

            assertThat(sub.getPurchasedCredits()).isEqualTo(2);
            assertThat(sub.getMonthlyCreditsUsed()).isEqualTo(7);
        }

        @Test
        @DisplayName("구독/보드가 없어도 예외 없이 끝난다 (비동기 실패 롤백 경로가 다시 죽지 않도록)")
        void refundWithoutSubscriptionIsSilent() {
            when(boardRepository.findById(BOARD)).thenReturn(Optional.empty());
            when(subscriptionRepository.findByBoardIdForUpdate(BOARD)).thenReturn(Optional.empty());

            assertThatCode(() -> service.refundCredit(BOARD, USER, FEATURE, 3)).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("ORG_MANAGED 보드는 조직 풀로 환불한다")
        void refundToOrgPool() {
            Organization org = Organization.builder().id("org-1").build();
            when(boardRepository.findById(BOARD))
                    .thenReturn(Optional.of(Board.builder()
                            .id(BOARD)
                            .tier(BoardTier.ORG_MANAGED)
                            .organization(org)
                            .build()));
            OrgSubscription orgSub = mock(OrgSubscription.class);
            when(orgSubscriptionRepository.findByOrganizationIdForUpdate("org-1"))
                    .thenReturn(Optional.of(orgSub));

            service.refundCredit(BOARD, USER, FEATURE, 4);

            verify(orgSub).refundCredits(4);
            verify(subscriptionRepository, never()).findByBoardIdForUpdate(any());
        }
    }

    @Test
    @DisplayName("티어별 월간 크레딧: TRIAL=100, STANDARD=30, PREMIUM/ORG=200+seats*50")
    void monthlyCreditsPerTier() {
        assertThat(AiCreditService.getMonthlyCreditsForTier(BoardTier.TRIAL, 99))
                .isEqualTo(100);
        assertThat(AiCreditService.getMonthlyCreditsForTier(BoardTier.STANDARD, 99))
                .isEqualTo(30);
        assertThat(AiCreditService.getMonthlyCreditsForTier(BoardTier.PREMIUM, 3))
                .isEqualTo(350);
        assertThat(AiCreditService.getMonthlyCreditsForTier(BoardTier.ORG_MANAGED, 0))
                .isEqualTo(200);
    }
}
