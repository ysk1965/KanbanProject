package com.kanban.domain.subscription;

/**
 * 한 번의 AI 크레딧 차감이 어느 풀에서 얼마나 빠졌는지.
 *
 * <p>차감은 월간 무료분 → 구매분 순서라 같은 비용이라도 어디서 빠졌는지는 그때의 잔액에 달려 있다.
 * 환불은 이 기록을 그대로 거꾸로 적용해야 한다 — 비용(int)만 알고는 구매분으로 돌려줄 양을 알 수 없다.
 *
 * @param monthlyUsed   월간 무료 크레딧에서 빠진 양
 * @param purchasedUsed 구매 크레딧에서 빠진 양
 */
public record CreditConsumption(int monthlyUsed, int purchasedUsed) {

    /** 아무것도 차감하지 않음 (수익화 off, 또는 비용 0) */
    public static final CreditConsumption NONE = new CreditConsumption(0, 0);

    public CreditConsumption {
        if (monthlyUsed < 0 || purchasedUsed < 0) {
            throw new IllegalArgumentException(
                    "credit consumption must not be negative: " + monthlyUsed + "/" + purchasedUsed);
        }
    }

    /** 전부 월간 풀에서 빠진 경우 (조직 풀은 월간 카운터만 있다) */
    public static CreditConsumption monthly(int amount) {
        return new CreditConsumption(amount, 0);
    }

    public int total() {
        return monthlyUsed + purchasedUsed;
    }

    public boolean isEmpty() {
        return total() == 0;
    }

    /** 여러 차감을 하나로 합친다 (예: 회의 전사 + 화자 분리) */
    public CreditConsumption plus(CreditConsumption other) {
        if (other == null) return this;
        return new CreditConsumption(monthlyUsed + other.monthlyUsed, purchasedUsed + other.purchasedUsed);
    }

    /** 로그용 — {@code MONTHLY} / {@code PURCHASED} / {@code MIXED} / {@code NONE} */
    public String source() {
        if (monthlyUsed > 0 && purchasedUsed > 0) return "MIXED";
        if (purchasedUsed > 0) return "PURCHASED";
        if (monthlyUsed > 0) return "MONTHLY";
        return "NONE";
    }
}
