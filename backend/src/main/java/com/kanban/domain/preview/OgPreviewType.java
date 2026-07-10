package com.kanban.domain.preview;

/**
 * 공개 공유 링크 미리보기(OG 카드) 대상 종류.
 * key는 프론트 경로 세그먼트와 일치하며, Lambda@Edge가 봇 요청 경로에서 뽑아 넘긴다.
 */
public enum OgPreviewType {
    NOTE("note", "/n/%s", "읽기 전용 공유 문서"),
    ALBUM("album", "/shared/album/%s", "공유 사진 앨범"),
    GALLERY("gallery", "/shared/gallery/%s", "공유 갤러리"),
    UPLOAD("upload", "/shared/upload/%s", "사진 업로드"),
    GALLERY_UPLOAD("gallery-upload", "/shared/gallery-upload/%s", "사진 업로드"),
    INVITE("invite", "/invite/%s", "보드 초대"),
    ORG_INVITE("org-invite", "/org-invite/%s", "조직 초대");

    private final String key;
    private final String pathTemplate;
    private final String defaultDescription;

    OgPreviewType(String key, String pathTemplate, String defaultDescription) {
        this.key = key;
        this.pathTemplate = pathTemplate;
        this.defaultDescription = defaultDescription;
    }

    public String getKey() {
        return key;
    }

    public String getDefaultDescription() {
        return defaultDescription;
    }

    public String canonicalPath(String token) {
        return String.format(pathTemplate, token);
    }

    public static OgPreviewType fromKey(String key) {
        for (OgPreviewType type : values()) {
            if (type.key.equalsIgnoreCase(key)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown OG preview type: " + key);
    }
}
