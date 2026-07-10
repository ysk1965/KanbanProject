package com.kanban.domain.preview.service;

import com.kanban.domain.invite.service.InviteService;
import com.kanban.domain.note.dto.NoteResponse;
import com.kanban.domain.note.service.NoteService;
import com.kanban.domain.organization.service.OrgInviteService;
import com.kanban.domain.photo.service.OrgPhotoService;
import com.kanban.domain.preview.OgPreviewType;
import com.kanban.domain.preview.dto.OgPreviewResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Arrays;

/**
 * 공개 공유 링크의 미리보기 메타를 조립한다.
 * 종류별로 기존 공개 서비스(permitAll)를 그대로 재사용하며, 조회 실패 시 종류별 일반 카드로 폴백한다.
 * 이 응답은 Lambda@Edge가 봇 요청에 대해 index.html에 og:* 태그로 주입한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OgPreviewService {

    private final NoteService noteService;
    private final OrgPhotoService orgPhotoService;
    private final InviteService inviteService;
    private final OrgInviteService orgInviteService;

    @Value("${app.public-base-url:https://milkyway.pe.kr}")
    private String baseUrl;

    public OgPreviewResponse resolve(String typeKey, String token) {
        OgPreviewType type;
        try {
            type = OgPreviewType.fromKey(typeKey);
        } catch (IllegalArgumentException e) {
            // 알 수 없는 종류 → 사이트 일반 카드 (크롤러가 항상 유효한 응답을 받도록)
            return new OgPreviewResponse(typeKey, "Milkyway",
                    "팀 프로젝트를 효율적으로 관리하는 스마트 협업 플랫폼", null, baseUrl);
        }
        try {
            return switch (type) {
                case NOTE -> notePreview(token);
                case ALBUM -> albumPreview(token);
                case GALLERY -> galleryPreview(token);
                case UPLOAD -> uploadPreview(token);
                case GALLERY_UPLOAD -> galleryUploadPreview(token);
                case INVITE -> invitePreview(token);
                case ORG_INVITE -> orgInvitePreview(token);
            };
        } catch (Exception e) {
            log.debug("OG preview fallback for {}/{}: {}", typeKey, token, e.getMessage());
            return fallback(type, token);
        }
    }

    // ===== 종류별 미리보기 =====

    private OgPreviewResponse notePreview(String rawToken) {
        NoteResponse.SharedNote note = noteService.getSharedNote(extractUuidToken(rawToken));
        String description = firstNonBlank(
                note.getExcerpt(),
                orgAnd(note.getBoardName(), "읽기 전용 공유 문서"),
                OgPreviewType.NOTE.getDefaultDescription());
        return build(OgPreviewType.NOTE, note.getTitle(), description, null, rawToken);
    }

    private OgPreviewResponse albumPreview(String rawToken) {
        var info = orgPhotoService.getSharedAlbum(extractUuidToken(rawToken));
        String description = firstNonBlank(
                info.getAlbumDescription(),
                orgAnd(info.getOrganizationName(), "사진 " + info.getPhotoCount() + "장"));
        String image = firstNonBlank(info.getCoverPhotoUrl(), info.getOrganizationLogoUrl());
        return build(OgPreviewType.ALBUM, info.getAlbumName(), description, image, rawToken);
    }

    private OgPreviewResponse galleryPreview(String rawToken) {
        var info = orgPhotoService.getSharedGallery(extractUuidToken(rawToken));
        String title = firstNonBlank(info.getGalleryTitle(), info.getOrganizationName(), "공유 갤러리");
        String description = orgAnd(info.getOrganizationName(), "사진 " + info.getTotalPhotoCount() + "장");
        String image = info.getOrganizationLogoUrl();
        if (isBlank(image) && info.getAlbums() != null && !info.getAlbums().isEmpty()) {
            image = info.getAlbums().get(0).getCoverPhotoUrl();
        }
        return build(OgPreviewType.GALLERY, title, description, image, rawToken);
    }

    private OgPreviewResponse uploadPreview(String rawToken) {
        var info = orgPhotoService.getUploadAlbumInfo(extractUuidToken(rawToken));
        String description = orgAnd(info.getOrganizationName(), "사진 업로드");
        return build(OgPreviewType.UPLOAD, info.getAlbumName(), description, info.getOrganizationLogoUrl(), rawToken);
    }

    private OgPreviewResponse galleryUploadPreview(String rawToken) {
        var info = orgPhotoService.getGalleryUploadInfo(extractUuidToken(rawToken));
        String title = firstNonBlank(info.getOrganizationName(), "사진 업로드");
        return build(OgPreviewType.GALLERY_UPLOAD, title, "사진 업로드", info.getOrganizationLogoUrl(), rawToken);
    }

    private OgPreviewResponse invitePreview(String rawCode) {
        var info = inviteService.getInviteLinkInfo(extractUuidToken(rawCode));
        String title = firstNonBlank(info.getBoardName(), "보드 초대");
        String description = info.isValid()
                ? "보드에 초대되었습니다"
                : firstNonBlank(info.getMessage(), "초대 링크");
        return build(OgPreviewType.INVITE, title, description, null, rawCode);
    }

    private OgPreviewResponse orgInvitePreview(String rawCode) {
        var info = orgInviteService.getInviteInfo(extractUuidToken(rawCode));
        String description = "구성원 " + info.getMemberCount() + "명 · 조직에 초대되었습니다";
        return build(OgPreviewType.ORG_INVITE, firstNonBlank(info.getOrganizationName(), "조직 초대"),
                description, info.getLogoUrl(), rawCode);
    }

    // ===== 공통 =====

    private OgPreviewResponse fallback(OgPreviewType type, String token) {
        return build(type, "Milkyway", type.getDefaultDescription(), null, token);
    }

    private OgPreviewResponse build(OgPreviewType type, String title, String description,
                                    String imageUrl, String token) {
        String canonicalUrl = baseUrl + type.canonicalPath(token);
        // 상대 경로 이미지(로컬 프로필 등)는 절대 URL로 보정 — og:image는 절대 URL이어야 한다.
        if (imageUrl != null && imageUrl.startsWith("/")) {
            imageUrl = baseUrl + imageUrl;
        }
        return new OgPreviewResponse(
                type.getKey(),
                firstNonBlank(title, "Milkyway"),
                firstNonBlank(description, type.getDefaultDescription()),
                imageUrl,
                canonicalUrl);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (notBlank(value)) {
                return value;
            }
        }
        return null;
    }

    /** name이 있으면 "name · suffix", 없으면 suffix */
    private static String orgAnd(String name, String suffix) {
        return notBlank(name) ? name + " · " + suffix : suffix;
    }

    /**
     * 제목 슬러그가 앞에 붙은 링크에서 실제 UUID 토큰을 추출한다.
     * UUID는 항상 하이픈 5그룹(8-4-4-4-12)의 마지막이며, 순수 토큰/초대코드는 그대로 반환된다.
     */
    static String extractUuidToken(String raw) {
        if (raw == null) {
            return null;
        }
        String[] parts = raw.split("-");
        return parts.length >= 5
                ? String.join("-", Arrays.copyOfRange(parts, parts.length - 5, parts.length))
                : raw;
    }
}
