package com.kanban.domain.report.service;

import com.kanban.domain.report.dto.ReportConfigDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 보드별로 <b>선택 가능한 리포트 AI 모델</b> 목록.
 *
 * <p>{@code ClaudeAIProvider}는 항상 빈으로 등록되고 {@code OpenAIProvider}는 {@code ai.provider=openai}
 * 일 때만 등록된다. 범용 {@code AIProvider} 주입 지점이 실제로 어느 쪽으로 해석되는지가 {@code ai.provider}로
 * 갈리므로, 모델 선택도 <b>활성 프로바이더 계열 안에서만</b> 허용한다 — 예컨대 provider=claude인데
 * gpt 모델 id를 보내면 Anthropic API가 거절한다.
 *
 * <p>보드 설정의 {@code aiModel}이 {@code null}이면 서버 기본(티어별 {@code @Value})을 그대로 쓰고,
 * 목록에 있는 id를 고르면 그 모델로 리포트 생성 호출 전체를 덮어쓴다. 프로바이더를 바꾼 뒤 남아있는
 * 옛 모델 id는 {@link #isAllowed}에서 걸러져 호출부가 티어 기본으로 폴백한다.
 */
@Component
public class ReportModelCatalog {

    /** 기본값은 {@code application.yml}의 {@code ai.provider}와 반드시 같아야 한다 — 어긋나면 화면 드롭다운과 실제 호출 프로바이더가 갈린다. */
    @Value("${ai.provider:claude}")
    private String provider;

    /** "기본"이 실제로 쓰는 모델을 표시용으로 보여주기 위해 티어 기본값을 읽어둔다(주간=team 티어 대표). */
    @Value("${ai.openai.model.team:gpt-4o-mini}")
    private String openaiDefault;

    @Value("${ai.claude.model.team:claude-haiku-4-5-20251001}")
    private String claudeDefault;

    private static final List<ReportConfigDto.ModelOption> OPENAI = List.of(
            new ReportConfigDto.ModelOption("gpt-4o-mini", "GPT-4o mini · 저렴·빠름"),
            new ReportConfigDto.ModelOption("gpt-4o", "GPT-4o · 고품질"),
            new ReportConfigDto.ModelOption("gpt-4.1-mini", "GPT-4.1 mini · 균형"),
            new ReportConfigDto.ModelOption("gpt-4.1", "GPT-4.1 · 고품질")
    );

    private static final List<ReportConfigDto.ModelOption> CLAUDE = List.of(
            new ReportConfigDto.ModelOption("claude-haiku-4-5-20251001", "Claude Haiku 4.5 · 저렴·빠름"),
            new ReportConfigDto.ModelOption("claude-sonnet-4-5-20250929", "Claude Sonnet 4.5 · 고품질")
    );

    private boolean isOpenai() {
        return "openai".equals(provider);
    }

    /** 활성 프로바이더에서 고를 수 있는 모델 목록. 화면 드롭다운이 이걸 그린다. */
    public List<ReportConfigDto.ModelOption> available() {
        return isOpenai() ? OPENAI : CLAUDE;
    }

    /** {@code aiModel}이 null일 때 실제로 쓰이는 서버 기본 모델 id — 화면에 "기본 (…)"으로 보여준다. */
    public String defaultModelId() {
        return isOpenai() ? openaiDefault : claudeDefault;
    }

    /**
     * 저장·사용 전에 검증한다. {@code null}·빈 문자열은 "기본 사용"이라 이 검사 대상이 아니며(호출부에서 처리),
     * 값이 있으면 반드시 활성 프로바이더 목록에 있어야 한다.
     */
    public boolean isAllowed(String modelId) {
        if (modelId == null || modelId.isBlank()) {
            return false;
        }
        return available().stream().anyMatch(o -> o.id().equals(modelId));
    }
}
