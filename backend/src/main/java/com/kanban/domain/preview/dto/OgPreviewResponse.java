package com.kanban.domain.preview.dto;

/**
 * 링크 미리보기 메타. Jackson SNAKE_CASE로 image_url / canonical_url 로 직렬화된다.
 * Lambda@Edge가 이 값으로 봇에게 줄 index.html의 &lt;meta og:*&gt; 태그를 조립한다.
 */
public record OgPreviewResponse(
        String type,
        String title,
        String description,
        String imageUrl,
        String canonicalUrl
) {
}
