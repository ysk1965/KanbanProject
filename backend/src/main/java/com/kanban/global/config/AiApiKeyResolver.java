package com.kanban.global.config;

import com.kanban.domain.system.SystemConfig;
import com.kanban.domain.system.SystemConfigRepository;
import com.kanban.global.util.SecretCipher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI API 키를 <b>DB &gt; 환경변수</b> 순으로 해석한다.
 *
 * <p>이전에는 {@code @Value("${ai.claude.api-key:}")}로 부팅 시 1회 바인딩했기 때문에,
 * 관리자가 키를 교체해도 재배포 전까지 반영되지 않았다. 여기서 매 호출 시점에 해석하고
 * 짧은 TTL 캐시만 둔다.
 *
 * <p><b>다중 인스턴스:</b> 교체를 수행한 인스턴스는 즉시 캐시를 버리고, 나머지 인스턴스는
 * 늦어도 {@link #CACHE_TTL_MILLIS}ms 안에 새 키를 집는다. Redis pub/sub 의존성을 추가하는
 * 대신 짧은 TTL로 수렴시킨다 — 키 교체는 드물고, 30초 지연은 허용 가능하다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiApiKeyResolver {

    private static final long CACHE_TTL_MILLIS = 30_000L;

    private final SystemConfigRepository systemConfigRepository;
    private final SecretCipher secretCipher;

    @Value("${ai.claude.api-key:}")
    private String claudeEnvKey;

    @Value("${ai.openai.api-key:}")
    private String openaiEnvKey;

    /** 여러 요청 스레드가 동시에 읽고 쓴다 — EnumMap은 동기화되지 않으므로 쓰면 안 된다. */
    private final Map<AiProviderType, CacheEntry> cache = new ConcurrentHashMap<>();

    public enum KeySource {
        /** 관리자 대시보드에서 설정한 값 (system_config). */
        DATABASE,
        /** 배포 환경변수 폴백 (CLAUDE_API_KEY / OPENAI_API_KEY). */
        ENVIRONMENT,
        /** 어느 쪽에도 없음. */
        NONE
    }

    /**
     * @param value     실제 API 키. 없으면 {@code null}
     * @param source    어디서 왔는지
     * @param updatedAt DB 값일 때의 마지막 변경 시각
     * @param updatedBy DB 값일 때의 마지막 변경자 ID
     */
    public record ResolvedKey(String value, KeySource source, LocalDateTime updatedAt, String updatedBy) {

        public boolean isPresent() {
            return value != null && !value.isBlank();
        }

        static ResolvedKey none() {
            return new ResolvedKey(null, KeySource.NONE, null, null);
        }
    }

    /** 실제 호출에 쓸 API 키. 설정돼 있지 않으면 {@code null}. */
    public String resolveKey(AiProviderType provider) {
        return resolve(provider).value();
    }

    /** 출처·변경 이력까지 포함해 해석한다. */
    @Transactional(readOnly = true)
    public ResolvedKey resolve(AiProviderType provider) {
        CacheEntry cached = cache.get(provider);
        if (cached != null && !cached.isExpired()) {
            return cached.resolved();
        }
        ResolvedKey resolved = load(provider);
        cache.put(provider, new CacheEntry(resolved, System.currentTimeMillis() + CACHE_TTL_MILLIS));
        return resolved;
    }

    private ResolvedKey load(AiProviderType provider) {
        Optional<SystemConfig> stored = systemConfigRepository.findById(provider.getConfigKey());
        if (stored.isPresent()) {
            SystemConfig config = stored.get();
            String decrypted = secretCipher.decrypt(config.getValue());
            if (decrypted != null && !decrypted.isBlank()) {
                return new ResolvedKey(decrypted, KeySource.DATABASE, config.getUpdatedAt(), config.getUpdatedBy());
            }
            // 저장돼 있는데 복호화가 안 되면 환경변수로 폴백한다. 조용히 죽는 것보다 낫다.
            log.error("{} API 키를 DB에서 복호화하지 못해 환경변수로 폴백합니다", provider.getCode());
        }

        String envKey = envKeyOf(provider);
        if (envKey != null && !envKey.isBlank()) {
            return new ResolvedKey(envKey, KeySource.ENVIRONMENT, null, null);
        }
        return ResolvedKey.none();
    }

    private String envKeyOf(AiProviderType provider) {
        return switch (provider) {
            case CLAUDE -> claudeEnvKey;
            case OPENAI -> openaiEnvKey;
        };
    }

    /** 마지막으로 유효성 확인에 성공한 시각. */
    @Transactional(readOnly = true)
    public LocalDateTime lastVerifiedAt(AiProviderType provider) {
        return systemConfigRepository.findById(provider.verifiedAtConfigKey())
                .map(SystemConfig::getValue)
                .filter(value -> value != null && !value.isBlank())
                .map(value -> {
                    try {
                        return LocalDateTime.parse(value);
                    } catch (Exception e) {
                        return null;
                    }
                })
                .orElse(null);
    }

    /** 유효성 확인 성공 시각을 기록한다. */
    @Transactional
    public void markVerified(AiProviderType provider) {
        String key = provider.verifiedAtConfigKey();
        String now = LocalDateTime.now(ZoneOffset.UTC).toString();
        SystemConfig config = systemConfigRepository.findById(key)
                .orElseGet(() -> SystemConfig.builder().key(key).build());
        config.updateValue(now);
        systemConfigRepository.save(config);
    }

    /** 키 교체 직후 호출해 이 인스턴스의 캐시를 즉시 버린다. */
    public void invalidate(AiProviderType provider) {
        cache.remove(provider);
    }

    private record CacheEntry(ResolvedKey resolved, long expiresAtMillis) {
        boolean isExpired() {
            return System.currentTimeMillis() > expiresAtMillis;
        }
    }
}
