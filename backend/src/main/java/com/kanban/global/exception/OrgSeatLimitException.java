package com.kanban.global.exception;

import lombok.Getter;

@Getter
public class OrgSeatLimitException extends BusinessException {

    private final String orgId;
    private final int seatCount;
    private final int activeMemberCount;
    private final int monthlyPricePerSeat;
    private final int yearlyPricePerSeat;
    private final boolean isOrgAdmin;

    public OrgSeatLimitException(String orgId, int seatCount, int activeMemberCount,
                                  int monthlyPricePerSeat, int yearlyPricePerSeat, boolean isOrgAdmin) {
        super(ErrorCode.ORG_SEAT_LIMIT_EXCEEDED);
        this.orgId = orgId;
        this.seatCount = seatCount;
        this.activeMemberCount = activeMemberCount;
        this.monthlyPricePerSeat = monthlyPricePerSeat;
        this.yearlyPricePerSeat = yearlyPricePerSeat;
        this.isOrgAdmin = isOrgAdmin;
    }
}
