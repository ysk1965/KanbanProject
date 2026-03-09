package com.kanban.domain.subscription.dto;

/**
 * Response containing the Polar checkout URL.
 * Jackson SNAKE_CASE strategy will serialize checkoutUrl as checkout_url.
 */
public record CheckoutResponse(String checkoutUrl) {
}
