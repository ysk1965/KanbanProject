package com.kanban.domain.photo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.photo.OrgPhoto;
import com.kanban.domain.photo.OrgPhotoRepository;
import com.kanban.domain.photo.OrgPhotoTab;
import com.kanban.domain.photo.OrgPhotoTabRepository;
import com.kanban.domain.photo.PhotoUploadIntent;
import com.kanban.domain.photo.PhotoUploadIntentRepository;
import com.kanban.domain.photo.dto.OrgPhotoRequest;
import com.kanban.domain.photo.dto.OrgPhotoResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.service.AsyncThumbnailService;
import com.kanban.global.service.FileUploadService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PhotoDirectUploadServiceTest {

    private static final String ORG = "org-1";
    private static final String TAB = "tab-1";
    private static final String USER = "user-1";
    private static final long MAX = 30L * 1024 * 1024;
    private static final byte[] JPEG_HEAD = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0, 0, 0, 0, 0};
    private static final byte[] PNG_HEAD = {(byte) 0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0, 0, 0};

    private final ObjectMapper json = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

    @Mock OrgPhotoTabRepository orgPhotoTabRepository;
    @Mock OrgPhotoRepository orgPhotoRepository;
    @Mock PhotoUploadIntentRepository intentRepository;
    @Mock OrganizationService organizationService;
    @Mock PhotoShareLinkService photoShareLinkService;
    @Mock FileUploadService fileUploadService;
    @Mock AsyncThumbnailService asyncThumbnailService;
    @Mock UserRepository userRepository;

    @InjectMocks PhotoDirectUploadService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "maxFileSize", MAX);
        Organization org = mock(Organization.class);
        when(org.getId()).thenReturn(ORG);
        OrgPhotoTab tab = mock(OrgPhotoTab.class);
        when(tab.getId()).thenReturn(TAB);
        User user = mock(User.class);
        when(user.getId()).thenReturn(USER);
        when(organizationService.getActiveOrgOrThrow(ORG)).thenReturn(org);
        when(orgPhotoTabRepository.findByIdAndOrganizationId(TAB, ORG)).thenReturn(Optional.of(tab));
        when(userRepository.findById(USER)).thenReturn(Optional.of(user));
        when(fileUploadService.resolveUrl(anyString())).thenAnswer(i -> "https://cdn/" + i.getArgument(0));
    }

    // ==================== presign ====================

    @Test
    void presign_issuesUrlsAndIntents_andRejectsBadFiles() throws Exception {
        when(fileUploadService.presignUploadToKey(anyString(), anyString(), anyLong(), anyLong()))
                .thenAnswer(i -> new FileUploadService.PresignResult(i.getArgument(0), "https://s3/put", "presigned"));

        OrgPhotoResponse.UploadPresignResult result = service.presign(ORG, USER, presignRequest("""
                {"tab_id":"tab-1","files":[
                  {"client_id":"a","filename":"C:\\\\photos\\\\IMG_1.JPG","content_type":"image/jpeg","size":1000},
                  {"client_id":"b","filename":"clip.mov","content_type":"video/quicktime","size":1000},
                  {"client_id":"c","filename":"huge.png","content_type":"image/png","size":%d},
                  {"client_id":"d","filename":"empty.png","content_type":"image/png","size":0}
                ]}""".formatted(MAX + 1)));

        assertThat(result.getMode()).isEqualTo("presigned");
        assertThat(result.getItems()).hasSize(1);
        OrgPhotoResponse.PresignItem item = result.getItems().get(0);
        assertThat(item.getClientId()).isEqualTo("a");
        assertThat(item.getS3Key()).startsWith("photos/org/org-1/tab-1/").endsWith(".jpg");
        assertThat(item.getThumbnailUploadUrl()).isNotNull();
        assertThat(result.getRejected()).extracting(OrgPhotoResponse.UploadRejected::getReason)
                .containsExactly("UNSUPPORTED_TYPE", "FILE_TOO_LARGE", "INVALID_CONTENT");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<PhotoUploadIntent>> captor = ArgumentCaptor.forClass(List.class);
        verify(intentRepository).saveAll(captor.capture());
        PhotoUploadIntent intent = captor.getValue().get(0);
        assertThat(intent.getOriginalFilename()).isEqualTo("IMG_1.JPG");
        assertThat(intent.getUploadedBy()).isEqualTo(USER);
        assertThat(intent.getThumbnailKey()).endsWith("_thumb.jpg");
    }

    @Test
    void presign_withoutS3_fallsBackToDirectMode() throws Exception {
        when(fileUploadService.presignUploadToKey(anyString(), anyString(), anyLong(), anyLong())).thenReturn(null);

        OrgPhotoResponse.UploadPresignResult result = service.presign(ORG, USER, presignRequest("""
                {"tab_id":"tab-1","files":[{"client_id":"a","filename":"a.jpg","content_type":"image/jpeg","size":10}]}"""));

        assertThat(result.getMode()).isEqualTo("direct");
        assertThat(result.getItems()).isEmpty();
        verify(intentRepository, never()).saveAll(anyList());
    }

    // ==================== confirm ====================

    @Test
    void confirm_registersPhoto_usesClientThumbnail_andIncrementsCountOnce() throws Exception {
        PhotoUploadIntent intent = intent("photos/org/org-1/tab-1/u1.jpg", TAB);
        when(intentRepository.findByS3KeyForUpdate(intent.getS3Key())).thenReturn(Optional.of(intent));
        when(fileUploadService.probeObjectSize(intent.getS3Key())).thenReturn(2048L);
        when(fileUploadService.readHeadBytes(intent.getS3Key(), 12)).thenReturn(JPEG_HEAD);
        when(fileUploadService.readHeadBytes(intent.getThumbnailKey(), 12)).thenReturn(JPEG_HEAD);

        OrgPhotoResponse.UploadConfirmResult result = service.confirm(ORG, USER, confirmRequest("""
                {"tab_id":"tab-1","items":[{"s3_key":"photos/org/org-1/tab-1/u1.jpg","width":4032,"height":3024,"has_thumbnail":true}]}"""));

        assertThat(result.getFailed()).isEmpty();
        assertThat(result.getSucceeded()).hasSize(1);
        ArgumentCaptor<OrgPhoto> saved = ArgumentCaptor.forClass(OrgPhoto.class);
        verify(orgPhotoRepository).save(saved.capture());
        assertThat(saved.getValue().getFileSize()).isEqualTo(2048L);
        assertThat(saved.getValue().getContentType()).isEqualTo("image/jpeg");
        assertThat(saved.getValue().getWidth()).isEqualTo(4032);
        verify(intentRepository).delete(intent);
        verify(orgPhotoTabRepository).incrementPhotoCount(TAB, 1);
        verify(asyncThumbnailService, never()).generateAndUploadThumbnail(any(), any(), any(), anyInt(), anyInt());
    }

    @Test
    void confirm_withoutClientThumbnail_generatesOnServer() throws Exception {
        PhotoUploadIntent intent = intent("photos/org/org-1/tab-1/u2.jpg", TAB);
        when(intentRepository.findByS3KeyForUpdate(intent.getS3Key())).thenReturn(Optional.of(intent));
        when(fileUploadService.probeObjectSize(intent.getS3Key())).thenReturn(10L);
        when(fileUploadService.readHeadBytes(intent.getS3Key(), 12)).thenReturn(JPEG_HEAD);

        service.confirm(ORG, USER, confirmRequest("""
                {"tab_id":"tab-1","items":[{"s3_key":"photos/org/org-1/tab-1/u2.jpg","has_thumbnail":false}]}"""));

        verify(asyncThumbnailService).generateAndUploadThumbnail(
                eq(intent.getS3Key()), eq(intent.getThumbnailKey()), eq("image/jpeg"), anyInt(), anyInt());
    }

    @Test
    void confirm_isIdempotent_forAlreadyRegisteredKey() throws Exception {
        String key = "photos/org/org-1/tab-1/u3.jpg";
        OrgPhoto existing = mock(OrgPhoto.class);
        OrgPhotoTab tab = mock(OrgPhotoTab.class);
        when(tab.getId()).thenReturn(TAB);
        when(existing.getTab()).thenReturn(tab);
        when(intentRepository.findByS3KeyForUpdate(key)).thenReturn(Optional.empty());
        when(orgPhotoRepository.findByS3KeyAndTabId(key, TAB)).thenReturn(Optional.of(existing));

        OrgPhotoResponse.UploadConfirmResult result = service.confirm(ORG, USER, confirmRequest("""
                {"tab_id":"tab-1","items":[{"s3_key":"photos/org/org-1/tab-1/u3.jpg"}]}"""));

        assertThat(result.getSucceeded()).hasSize(1);
        verify(orgPhotoRepository, never()).save(any());
        verify(orgPhotoTabRepository, never()).incrementPhotoCount(anyString(), anyInt());
    }

    @Test
    void confirm_missingObject_keepsIntentForRetry() throws Exception {
        PhotoUploadIntent intent = intent("photos/org/org-1/tab-1/u4.jpg", TAB);
        when(intentRepository.findByS3KeyForUpdate(intent.getS3Key())).thenReturn(Optional.of(intent));
        when(fileUploadService.probeObjectSize(intent.getS3Key())).thenReturn(-1L);

        OrgPhotoResponse.UploadConfirmResult result = service.confirm(ORG, USER, confirmRequest("""
                {"tab_id":"tab-1","items":[{"s3_key":"photos/org/org-1/tab-1/u4.jpg"}]}"""));

        assertThat(result.getFailed()).extracting(OrgPhotoResponse.ConfirmFailed::getReason)
                .containsExactly("OBJECT_NOT_FOUND");
        verify(intentRepository, never()).delete(any());
        verify(fileUploadService, never()).delete(anyString());
    }

    @Test
    void confirm_contentMismatch_deletesObjectsAndIntent() throws Exception {
        PhotoUploadIntent intent = intent("photos/org/org-1/tab-1/u5.jpg", TAB);
        when(intentRepository.findByS3KeyForUpdate(intent.getS3Key())).thenReturn(Optional.of(intent));
        when(fileUploadService.probeObjectSize(intent.getS3Key())).thenReturn(10L);
        when(fileUploadService.readHeadBytes(intent.getS3Key(), 12)).thenReturn(PNG_HEAD);

        OrgPhotoResponse.UploadConfirmResult result = service.confirm(ORG, USER, confirmRequest("""
                {"tab_id":"tab-1","items":[{"s3_key":"photos/org/org-1/tab-1/u5.jpg"}]}"""));

        assertThat(result.getFailed()).extracting(OrgPhotoResponse.ConfirmFailed::getReason)
                .containsExactly("INVALID_CONTENT");
        verify(fileUploadService).delete(intent.getS3Key());
        verify(fileUploadService).delete(intent.getThumbnailKey());
        verify(intentRepository).delete(intent);
        verify(orgPhotoRepository, never()).save(any());
    }

    @Test
    void confirm_rejectsKeyIssuedForAnotherAlbum() throws Exception {
        PhotoUploadIntent intent = intent("photos/org/org-1/tab-2/u6.jpg", "tab-2");
        when(intentRepository.findByS3KeyForUpdate(intent.getS3Key())).thenReturn(Optional.of(intent));

        OrgPhotoResponse.UploadConfirmResult result = service.confirm(ORG, USER, confirmRequest("""
                {"tab_id":"tab-1","items":[{"s3_key":"photos/org/org-1/tab-2/u6.jpg"}]}"""));

        assertThat(result.getFailed()).extracting(OrgPhotoResponse.ConfirmFailed::getReason)
                .containsExactly("UNKNOWN_KEY");
        verify(fileUploadService, never()).probeObjectSize(anyString());
    }

    // ==================== cleanup ====================

    @Test
    void cleanup_deletesExpiredObjectsAndRows() {
        PhotoUploadIntent intent = intent("photos/org/org-1/tab-1/u7.jpg", TAB);
        when(intentRepository.findExpired(any(LocalDateTime.class), any())).thenReturn(List.of(intent));

        assertThat(service.cleanupExpiredIntents()).isEqualTo(1);
        verify(fileUploadService).delete(intent.getS3Key());
        verify(fileUploadService).delete(intent.getThumbnailKey());
        verify(intentRepository).deleteAll(List.of(intent));
    }

    // ==================== helpers ====================

    private OrgPhotoRequest.UploadPresign presignRequest(String body) throws Exception {
        return json.readValue(body, OrgPhotoRequest.UploadPresign.class);
    }

    private OrgPhotoRequest.UploadConfirm confirmRequest(String body) throws Exception {
        return json.readValue(body, OrgPhotoRequest.UploadConfirm.class);
    }

    private static PhotoUploadIntent intent(String s3Key, String tabId) {
        return PhotoUploadIntent.builder()
                .id("intent-" + s3Key.hashCode())
                .s3Key(s3Key)
                .thumbnailKey(s3Key.replace(".jpg", "_thumb.jpg"))
                .organizationId(ORG)
                .tabId(tabId)
                .originalFilename("IMG.jpg")
                .contentType("image/jpeg")
                .uploadedBy(USER)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .expiresAt(LocalDateTime.now(ZoneOffset.UTC).plusHours(24))
                .build();
    }
}
