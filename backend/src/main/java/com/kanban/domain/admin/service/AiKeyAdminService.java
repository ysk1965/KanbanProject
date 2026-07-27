package com.kanban.domain.admin.service;

import com.kanban.domain.admin.dto.AdminResponse;
import com.kanban.domain.system.AiKeyAuditLog;
import com.kanban.domain.system.AiKeyAuditLogRepository;
import com.kanban.domain.system.AiKeyAuditRecorder;
import com.kanban.domain.system.SystemConfig;
import com.kanban.domain.system.SystemConfigRepository;
import com.kanban.global.config.AiApiKeyResolver;
import com.kanban.global.config.AiProviderType;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.security.UserPrincipal;
import com.kanban.global.util.SecretCipher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Arrays;
import java.util.List;

/**
 * 관리자 대시보드에서 AI API 키를 확인·교체·검증한다.
 *
 * <p><b>설계 원칙: 키 원문은 절대 응답으로 나가지 않는다.</b> 조회는 마스킹된 표기만 돌려주고,
 * 교체는 쓰기 전용이다. 관리자가 실제로 확인해야 하는 것은 "어떤 키가 붙어 있고, 언제 누가
 * 넣었고, 지금 살아 있는가"이며 그건 원문 없이 전부 제공할 수 있다.
 */
@Slf4j
@Service
public class AiKeyAdminService {

    /** 마스킹할 때 노출하는 접두 길이. */
    private static final int MASK_PREFIX_LENGTH = 12;
    /** 마스킹할 때 노출하는 접미 길이. */
    private static final int MASK_SUFFIX_LENGTH = 4;
    /** 키 길이를 유추당하지 않도록 가운데는 고정 길이로 가린다. */
    private static final String MASK_FILLER = "…";

    private static final String CLAUDE_MODELS_URL = "https://api.anthropic.com/v1/models?limit=1";
    private static final String OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

    private final SystemConfigRepository systemConfigRepository;
    private final AiKeyAuditLogRepository auditLogRepository;
    private final AiKeyAuditRecorder auditRecorder;
    private final AiApiKeyResolver apiKeyResolver;
    private final SecretCipher secretCipher;
    private final RestTemplate aiRestTemplate;
    private final String activeProviderCode;

    public AiKeyAdminService(SystemConfigRepository systemConfigRepository,
                             AiKeyAuditLogRepository auditLogRepository,
                             AiKeyAuditRecorder auditRecorder,
                             AiApiKeyResolver apiKeyResolver,
                             SecretCipher secretCipher,
                             @Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
                             @Value("${ai.provider:claude}") String activeProviderCode) {
        this.systemConfigRepository = systemConfigRepository;
        this.auditLogRepository = auditLogRepository;
        this.auditRecorder = auditRecorder;
        this.apiKeyResolver = apiKeyResolver;
        this.secretCipher = secretCipher;
        this.aiRestTemplate = aiRestTemplate;
        this.activeProviderCode = activeProviderCode;
    }

    // ==================== 조회 ====================

    /** 전체 프로바이더의 키 상태를 마스킹해 돌려준다. */
    @Transactional(readOnly = true)
    public AdminResponse.AiKeyList getKeys() {
        List<AdminResponse.AiKeyStatus> keys = Arrays.stream(AiProviderType.values())
                .map(this::toStatus)
                .toList();
        return AdminResponse.AiKeyList.builder()
                .keys(keys)
                .activeProvider(activeProviderCode)
                .encryptionConfigured(secretCipher.isConfigured())
                .build();
    }

    private AdminResponse.AiKeyStatus toStatus(AiProviderType provider) {
        AiApiKeyResolver.ResolvedKey resolved = apiKeyResolver.resolve(provider);
        return AdminResponse.AiKeyStatus.builder()
                .provider(provider.getCode())
                .displayName(provider.getDisplayName())
                .configured(resolved.isPresent())
                .maskedKey(mask(resolved.value()))
                .source(resolved.source().name())
                .updatedAt(resolved.updatedAt())
                .updatedBy(resolved.updatedBy())
                .lastVerifiedAt(apiKeyResolver.lastVerifiedAt(provider))
                .isActiveProvider(provider.getCode().equalsIgnoreCase(activeProviderCode))
                .build();
    }

    /**
     * 키를 마스킹한다. 예: {@code sk-ant-api03…a4f2}
     *
     * <p>가운데는 고정 길이로 가려 원문 길이가 드러나지 않게 한다.
     */
    static String mask(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return null;
        }
        if (rawKey.length() <= MASK_PREFIX_LENGTH + MASK_SUFFIX_LENGTH) {
            // 비정상적으로 짧은 값 — 앞뒤를 드러내면 사실상 전부 노출된다
            return MASK_FILLER;
        }
        return rawKey.substring(0, MASK_PREFIX_LENGTH)
                + MASK_FILLER
                + rawKey.substring(rawKey.length() - MASK_SUFFIX_LENGTH);
    }

    // ==================== 교체 ====================

    /**
     * 키를 교체한다. <b>저장 전에 프로바이더에 실제로 호출해 유효성을 확인한다.</b>
     * 오타 난 키를 그대로 저장하면 전 서비스 AI 기능이 즉시 죽기 때문이다.
     */
    @Transactional
    public AdminResponse.AiKeyStatus rotate(String providerCode, String rawKey, UserPrincipal actor) {
        AiProviderType provider = parseProvider(providerCode);
        String trimmed = rawKey == null ? "" : rawKey.trim();

        if (!secretCipher.isConfigured()) {
            audit(provider, AiKeyAuditLog.Action.ROTATE, actor, null, false, "CONFIG_ENCRYPTION_KEY 미설정");
            throw new BusinessException(ErrorCode.AI_KEY_ENCRYPTION_NOT_CONFIGURED);
        }
        if (trimmed.isBlank() || !trimmed.startsWith(provider.getKeyPrefix())) {
            audit(provider, AiKeyAuditLog.Action.ROTATE, actor, null, false, "형식 불일치");
            throw new BusinessException(ErrorCode.AI_KEY_INVALID_FORMAT);
        }

        VerificationResult verification = callProvider(provider, trimmed);
        if (!verification.reachable()) {
            audit(provider, AiKeyAuditLog.Action.ROTATE, actor, mask(trimmed), false, verification.detail());
            throw new BusinessException(ErrorCode.AI_KEY_VERIFICATION_UNAVAILABLE);
        }
        if (!verification.valid()) {
            audit(provider, AiKeyAuditLog.Action.ROTATE, actor, mask(trimmed), false, verification.detail());
            throw new BusinessException(ErrorCode.AI_KEY_REJECTED);
        }

        SystemConfig config = systemConfigRepository.findById(provider.getConfigKey())
                .orElseGet(() -> SystemConfig.builder().key(provider.getConfigKey()).build());
        config.updateValue(secretCipher.encrypt(trimmed), actor.getUserId());
        systemConfigRepository.save(config);

        apiKeyResolver.invalidate(provider);
        apiKeyResolver.markVerified(provider);
        audit(provider, AiKeyAuditLog.Action.ROTATE, actor, mask(trimmed), true, "교체 성공");
        log.info("AI API key rotated: provider={}, actor={}", provider.getCode(), actor.getEmail());

        return toStatus(provider);
    }

    // ==================== 검증 ====================

    /** 현재 유효한 키로 프로바이더를 호출해 살아있는지 확인한다. */
    @Transactional
    public AdminResponse.AiKeyStatus verify(String providerCode, UserPrincipal actor) {
        AiProviderType provider = parseProvider(providerCode);
        AiApiKeyResolver.ResolvedKey resolved = apiKeyResolver.resolve(provider);

        if (!resolved.isPresent()) {
            audit(provider, AiKeyAuditLog.Action.VERIFY, actor, null, false, "설정된 키 없음");
            throw new BusinessException(ErrorCode.AI_KEY_NOT_CONFIGURED);
        }

        VerificationResult verification = callProvider(provider, resolved.value());
        String maskedKey = mask(resolved.value());

        if (!verification.reachable()) {
            audit(provider, AiKeyAuditLog.Action.VERIFY, actor, maskedKey, false, verification.detail());
            throw new BusinessException(ErrorCode.AI_KEY_VERIFICATION_UNAVAILABLE);
        }
        if (!verification.valid()) {
            audit(provider, AiKeyAuditLog.Action.VERIFY, actor, maskedKey, false, verification.detail());
            throw new BusinessException(ErrorCode.AI_KEY_REJECTED);
        }

        apiKeyResolver.markVerified(provider);
        audit(provider, AiKeyAuditLog.Action.VERIFY, actor, maskedKey, true, "검증 성공");
        return toStatus(provider);
    }

    /**
     * 프로바이더의 모델 목록 엔드포인트를 호출해 키가 살아있는지 본다.
     * 토큰을 거의 쓰지 않는 가장 싼 인증 확인 방법이다.
     */
    private VerificationResult callProvider(AiProviderType provider, String apiKey) {
        HttpHeaders headers = new HttpHeaders();
        String url;
        if (provider == AiProviderType.CLAUDE) {
            url = CLAUDE_MODELS_URL;
            headers.set("x-api-key", apiKey);
            headers.set("anthropic-version", "2023-06-01");
        } else {
            url = OPENAI_MODELS_URL;
            headers.setBearerAuth(apiKey);
        }

        try {
            ResponseEntity<String> response = aiRestTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), String.class);
            boolean ok = response.getStatusCode().is2xxSuccessful();
            return new VerificationResult(true, ok, ok ? "OK" : "HTTP " + response.getStatusCode().value());
        } catch (HttpClientErrorException.Unauthorized | HttpClientErrorException.Forbidden e) {
            return new VerificationResult(true, false, "인증 거부 (HTTP " + e.getStatusCode().value() + ")");
        } catch (HttpClientErrorException.TooManyRequests e) {
            // 레이트 리밋은 "키가 살아있다"는 뜻이지만, 확정할 수 없으니 도달 불가로 처리한다
            return new VerificationResult(false, false, "레이트 리밋 (HTTP 429)");
        } catch (HttpClientErrorException e) {
            return new VerificationResult(true, false, "HTTP " + e.getStatusCode().value());
        } catch (Exception e) {
            log.warn("AI 프로바이더 검증 호출 실패: provider={}, error={}", provider.getCode(), e.getMessage());
            return new VerificationResult(false, false, "연결 실패: " + e.getMessage());
        }
    }

    /**
     * @param reachable 프로바이더에 도달해 판정할 수 있었는지
     * @param valid     키가 유효한지
     * @param detail    감사 로그에 남길 사유
     */
    private record VerificationResult(boolean reachable, boolean valid, String detail) {
    }

    // ==================== 감사 로그 ====================

    /** 키 관리 이력 조회. 최신순. */
    @Transactional(readOnly = true)
    public AdminResponse.AiKeyLogList getLogs(int page, int size) {
        Page<AiKeyAuditLog> logs = auditLogRepository
                .findAllByOrderByCreatedAtDesc(PageRequest.of(page, size));
        return AdminResponse.AiKeyLogList.builder()
                .logs(logs.getContent().stream().map(AdminResponse.AiKeyLogEntry::of).toList())
                .total(logs.getTotalElements())
                .page(page)
                .size(size)
                .build();
    }

    /** 감사 로그를 남긴다. 실제 기록은 독립 트랜잭션을 쓰는 {@link AiKeyAuditRecorder}가 담당한다. */
    private void audit(AiProviderType provider, AiKeyAuditLog.Action action, UserPrincipal actor,
                       String maskedKey, boolean success, String detail) {
        auditRecorder.record(
                provider,
                action,
                actor != null ? actor.getUserId() : null,
                actor != null ? actor.getEmail() : null,
                maskedKey,
                success,
                detail);
    }

    private AiProviderType parseProvider(String providerCode) {
        try {
            return AiProviderType.fromCode(providerCode);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.AI_KEY_UNKNOWN_PROVIDER);
        }
    }
}
