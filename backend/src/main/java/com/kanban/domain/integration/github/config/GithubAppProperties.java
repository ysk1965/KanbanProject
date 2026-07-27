package com.kanban.domain.integration.github.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * GitHub App 자격증명. github.com/settings/apps 에 등록한 값.
 * {@code JiraOAuthProperties} / {@code SlackAppConfig}와 같은 바인딩 패턴.
 */
@Configuration
@ConfigurationProperties(prefix = "github.app")
@Getter
@Setter
public class GithubAppProperties {

    /** App ID (숫자) */
    private String appId = "";

    /**
     * PEM 개인키 전문. 환경변수로 넣을 때 줄바꿈은 \n으로 이스케이프해도 된다.
     *
     * <p>EB 환경변수는 전체 합쳐 4KB를 못 넘어 PEM(~1.7KB)을 직접 넣기 어렵다.
     * 이 값이 비어 있으면 {@link #privateKeySsmName}의 SSM Parameter Store에서 읽는다.
     */
    private String privateKey = "";

    /** SSM Parameter Store 파라미터 이름 (SecureString). privateKey가 비어 있을 때 사용. */
    private String privateKeySsmName = "";

    /** 설치 페이지 주소 — 사용자를 보낼 곳. https://github.com/apps/{slug}/installations/new */
    private String slug = "";

    private String apiBaseUrl = "https://api.github.com";

    /** 커밋 상세(변경 파일 수)를 추가 조회할 최대 건수. 커밋 1건당 API 1회라 상한을 둔다. */
    private int commitDetailLimit = 50;

    /**
     * 커밋 상세 조회 전체에 허용하는 시간 예산(ms). 상세는 커밋당 1회씩 순차 호출이라,
     * GitHub가 느려지면 (상한 × read timeout)만큼 매달릴 수 있다. 예산을 넘기면 남은 커밋은
     * 상세 없이 넘어간다 — 상세는 부가 지표라 보고서를 막지 않는다.
     */
    private long commitDetailBudgetMillis = 20_000;

    /** 한 저장소에서 가져올 최대 커밋 수 */
    private int maxCommitsPerRepo = 300;

    public boolean isConfigured() {
        return appId != null && !appId.isBlank()
            && (hasInlineKey() || hasSsmKey());
    }

    public boolean hasInlineKey() {
        return privateKey != null && !privateKey.isBlank();
    }

    public boolean hasSsmKey() {
        return privateKeySsmName != null && !privateKeySsmName.isBlank();
    }
}
