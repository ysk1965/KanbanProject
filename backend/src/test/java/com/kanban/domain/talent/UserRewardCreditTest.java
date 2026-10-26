package com.kanban.domain.talent;

import static org.assertj.core.api.Assertions.assertThat;

import com.kanban.domain.user.User;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("개인 크레딧 소비 순서: 월 무료 → 리워드(만료 전) → 구매")
class UserRewardCreditTest {

    private static User user(int purchased) {
        User u = User.builder().email("r@example.com").name("r").build();
        u.initializePersonalCredits(); // 월 30
        u.addPersonalPurchasedCredits(purchased);
        return u;
    }

    @Test
    void consumeOrder() {
        User u = user(10);
        u.addPersonalRewardCredits(5, LocalDateTime.now(ZoneOffset.UTC).plusDays(10));
        assertThat(u.getPersonalAvailableCredits()).isEqualTo(45);

        u.consumePersonalCredits(28); // 월 2 남음
        assertThat(u.getActivePersonalRewardCredits()).isEqualTo(5);
        u.consumePersonalCredits(4); // 월 2 + 리워드 2
        assertThat(u.getActivePersonalRewardCredits()).isEqualTo(3);
        assertThat(u.getPersonalPurchasedCredits()).isEqualTo(10);
        u.consumePersonalCredits(5); // 리워드 3 + 구매 2
        assertThat(u.getActivePersonalRewardCredits()).isZero();
        assertThat(u.getPersonalPurchasedCredits()).isEqualTo(8);
        assertThat(u.getPersonalAvailableCredits()).isEqualTo(8);

        // 환불: 월 사용량 먼저
        u.refundPersonalCredits(3);
        assertThat(u.getPersonalCreditsUsed()).isEqualTo(27);
    }

    @Test
    void expiredRewardIsIgnored() {
        User u = user(0);
        u.addPersonalRewardCredits(5, LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1));
        assertThat(u.getActivePersonalRewardCredits()).isZero();
        assertThat(u.getPersonalAvailableCredits()).isEqualTo(30);
        u.consumePersonalCredits(30);
        assertThat(u.hasEnoughPersonalCredits(1)).isFalse();
        // 새로 교환하면 만료된 잔여는 버리고 새 만료일
        u.addPersonalRewardCredits(2, LocalDateTime.now(ZoneOffset.UTC).plusDays(30));
        assertThat(u.getActivePersonalRewardCredits()).isEqualTo(2);
    }
}
