package com.kanban.domain.subscription.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

/**
 * Polar.sh Webhook event DTO.
 *
 * <p>Event types handled:
 * <ul>
 *   <li>{@code checkout.created} - Checkout session created</li>
 *   <li>{@code subscription.created} - New subscription created</li>
 *   <li>{@code subscription.updated} - Subscription updated (renewal, plan change)</li>
 *   <li>{@code subscription.canceled} - Subscription canceled</li>
 *   <li>{@code order.created} - One-time order created (AI credits)</li>
 * </ul>
 */
public record PolarWebhookEvent(
        String type,
        JsonNode data
) {

    /**
     * Extract metadata from the webhook event data.
     * Metadata is stored at data.metadata for subscriptions and data.metadata for orders.
     */
    public Map<String, String> extractMetadata() {
        JsonNode metadata = data.path("metadata");
        if (metadata.isMissingNode() || metadata.isNull()) {
            return Map.of();
        }

        var result = new java.util.HashMap<String, String>();
        metadata.fields().forEachRemaining(entry ->
                result.put(entry.getKey(), entry.getValue().asText())
        );
        return result;
    }

    /**
     * Extract the Polar subscription ID from the event data.
     */
    public String extractSubscriptionId() {
        return data.path("id").asText(null);
    }

    /**
     * Extract the Polar product ID from the event data.
     */
    public String extractProductId() {
        JsonNode product = data.path("product");
        if (!product.isMissingNode() && !product.isNull()) {
            return product.path("id").asText(null);
        }
        return data.path("product_id").asText(null);
    }

    /**
     * Extract the subscription status from the event data.
     */
    public String extractStatus() {
        return data.path("status").asText(null);
    }
}
