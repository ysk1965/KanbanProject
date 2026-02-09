package com.kanban.global.exception;

import lombok.Getter;

@Getter
public class SeatLimitException extends BusinessException {

    private final int seatCount;
    private final int billableMemberCount;
    private final int monthlyPricePerSeat;
    private final int yearlyPricePerSeat;

    public SeatLimitException(int seatCount, int billableMemberCount,
                               int monthlyPricePerSeat, int yearlyPricePerSeat) {
        super(ErrorCode.SEAT_LIMIT_EXCEEDED);
        this.seatCount = seatCount;
        this.billableMemberCount = billableMemberCount;
        this.monthlyPricePerSeat = monthlyPricePerSeat;
        this.yearlyPricePerSeat = yearlyPricePerSeat;
    }
}
