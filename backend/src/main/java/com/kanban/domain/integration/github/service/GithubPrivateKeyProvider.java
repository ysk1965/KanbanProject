package com.kanban.domain.integration.github.service;

import com.kanban.domain.integration.github.config.GithubAppProperties;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ssm.SsmClient;
import software.amazon.awssdk.services.ssm.model.GetParameterRequest;

/**
 * GitHub App 개인키(PEM)를 가져온다.
 *
 * <p>키가 큰(~1.7KB) 반면 EB 환경변수는 전체 합쳐 4KB 한도라 직접 넣기 어렵다.
 * 그래서 <b>인라인 환경변수를 우선</b>으로 하되(로컬 개발용), 비어 있으면
 * <b>SSM Parameter Store</b>(SecureString)에서 읽는다(운영용).
 *
 * <p>SSM 클라이언트는 실제로 필요할 때만 만든다 — GitHub App을 안 쓰는 배포에서
 * 불필요한 AWS 연결을 만들지 않기 위해서다.
 */
@Slf4j
@Component
public class GithubPrivateKeyProvider {

    private final GithubAppProperties properties;
    private volatile String cachedPem;
    private volatile SsmClient ssmClient;

    public GithubPrivateKeyProvider(GithubAppProperties properties) {
        this.properties = properties;
    }

    /** PEM 원문. 인라인 → SSM 순서로 해석하고, 한 번 읽으면 캐시한다. */
    public String getPem() {
        String cached = cachedPem;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (cachedPem == null) {
                cachedPem = resolve();
            }
            return cachedPem;
        }
    }

    private String resolve() {
        if (properties.hasInlineKey()) {
            return properties.getPrivateKey();
        }
        if (properties.hasSsmKey()) {
            return fetchFromSsm(properties.getPrivateKeySsmName());
        }
        throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED,
                "GitHub App 개인키가 설정되지 않았습니다 (인라인·SSM 모두 없음)");
    }

    private String fetchFromSsm(String parameterName) {
        try {
            String value = ssm().getParameter(GetParameterRequest.builder()
                    .name(parameterName)
                    .withDecryption(true)
                    .build()).parameter().value();
            if (value == null || value.isBlank()) {
                throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED,
                        "SSM 파라미터가 비어 있습니다: " + parameterName);
            }
            log.info("GitHub App 개인키를 SSM에서 로드했습니다: {}", parameterName);
            return value;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("SSM에서 GitHub App 개인키 로드 실패 ({}): {}", parameterName, e.getMessage());
            throw new BusinessException(ErrorCode.GITHUB_APP_NOT_CONFIGURED,
                    "SSM에서 개인키를 읽지 못했습니다 — 파라미터 이름과 인스턴스 역할 권한을 확인하세요");
        }
    }

    private SsmClient ssm() {
        SsmClient client = ssmClient;
        if (client == null) {
            synchronized (this) {
                if (ssmClient == null) {
                    ssmClient = SsmClient.builder()
                            .region(Region.AP_NORTHEAST_2)
                            .credentialsProvider(DefaultCredentialsProvider.create())
                            .build();
                }
                client = ssmClient;
            }
        }
        return client;
    }
}
