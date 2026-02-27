package com.kanban.domain.subscription.dto;

public record MigrationPreviewResponse(
    int currentTotalMonthly,
    int newMonthly,
    int creditFromExisting,
    int firstPayment,
    int uniqueMembers
) {}
