package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.report.ReportType;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class ReportAIService {

    private final RestTemplate aiRestTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.claude.api-key:}")
    private String apiKey;

    @Value("${ai.claude.model:claude-sonnet-4-20250514}")
    private String model;

    private static final String CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
    private static final int MAX_TOKENS = 4096;

    public ReportAIService(@Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
                           ObjectMapper objectMapper) {
        this.aiRestTemplate = aiRestTemplate;
        this.objectMapper = objectMapper;
    }

    public String generateReport(ReportType reportType, String dataJson, String language) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new BusinessException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }

        String systemPrompt = buildSystemPrompt(reportType, language);
        String userPrompt = buildUserPrompt(reportType, dataJson);

        try {
            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "max_tokens", MAX_TOKENS,
                    "system", systemPrompt,
                    "messages", List.of(Map.of("role", "user", "content", userPrompt))
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("x-api-key", apiKey);
            headers.set("anthropic-version", "2023-06-01");

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            log.info("Calling Claude API for {} report generation", reportType);
            ResponseEntity<Map> response = aiRestTemplate.postForEntity(CLAUDE_API_URL, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return extractContent(response.getBody());
            }

            log.error("Claude API returned non-success status: {}", response.getStatusCode());
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to call Claude API: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractContent(Map<String, Object> responseBody) {
        try {
            List<Map<String, Object>> contentList = (List<Map<String, Object>>) responseBody.get("content");
            if (contentList != null && !contentList.isEmpty()) {
                Map<String, Object> firstContent = contentList.get(0);
                if ("text".equals(firstContent.get("type"))) {
                    return (String) firstContent.get("text");
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse Claude API response: {}", e.getMessage());
        }
        throw new BusinessException(ErrorCode.AI_REPORT_GENERATION_FAILED);
    }

    private String buildSystemPrompt(ReportType reportType, String language) {
        String lang = language != null ? language : "ko";
        String reportTypeLabel = reportType == ReportType.TEAM ? "팀" : "개인";

        if ("en".equals(lang)) {
            reportTypeLabel = reportType == ReportType.TEAM ? "Team" : "Personal";
            return String.format("""
                    You are a weekly report writer for the BRIDGE project management tool.
                    Generate a %s weekly report based ONLY on the provided data.

                    Rules:
                    - Base ALL analysis strictly on the provided data. Never fabricate or infer data not present.
                    - Convert minutes to hours for display (e.g., "12.5 hours" not "750 minutes").
                    - Use markdown format: ## headers, tables, bullet points.
                    - Mention team members by their actual names.
                    - Keep the report concise: %s.
                    - Write in English.

                    Structure for %s report:
                    %s""",
                    reportTypeLabel,
                    reportType == ReportType.TEAM ? "500-800 words" : "300-500 words",
                    reportTypeLabel,
                    getReportStructure(reportType, "en"));
        }

        return String.format("""
                당신은 BRIDGE 프로젝트 관리 도구의 주간 보고서 작성자입니다.
                제공된 데이터만 기반으로 %s 주간 보고서를 작성하세요.

                규칙:
                - 제공된 데이터에 없는 내용은 절대 추가하지 마세요.
                - 시간은 분(minutes)을 시간(hours)으로 변환하여 표시하세요 (예: "12.5시간").
                - 마크다운 형식 사용: ## 헤더, 표, 불릿 포인트.
                - 팀원은 실명으로 언급하세요.
                - 보고서는 간결하게: %s.
                - 한국어로 작성하세요.

                %s 보고서 구조:
                %s""",
                reportTypeLabel,
                reportType == ReportType.TEAM ? "500~800자" : "300~500자",
                reportTypeLabel,
                getReportStructure(reportType, "ko"));
    }

    private String getReportStructure(ReportType reportType, String lang) {
        if (reportType == ReportType.TEAM) {
            if ("en".equals(lang)) {
                return """
                        1. Weekly Summary - Key metrics overview (total hours, tasks completed, focus rate)
                        2. Feature Progress - Progress changes per feature with status indicators
                        3. Team Contributions - Per-member work hours, completed tasks, impact scores
                        4. Milestone Health - Status of active milestones (ON_TRACK/AT_RISK/OVERDUE)
                        5. Attention Required - Delayed features, stagnant tasks, stuck checklists, bottlenecks
                        6. Key Discussions - Summary of active comment threads this week
                        7. Next Week Focus - Recommendations based on deadlines and risks""";
            }
            return """
                    1. 주간 요약 - 핵심 지표 개요 (총 작업시간, 완료 태스크, 포커스율)
                    2. 피처 진행 현황 - 각 피처별 진행률 변화와 상태 표시
                    3. 팀원별 기여 - 멤버별 작업시간, 완료 태스크, 임팩트 스코어
                    4. 마일스톤 건강 - 활성 마일스톤 상태 (ON_TRACK/AT_RISK/OVERDUE)
                    5. 주의 필요 항목 - 지연 피처, 정체 태스크, 멈춘 체크리스트, 병목 지점
                    6. 주요 논의 - 이번 주 활발했던 댓글 스레드 요약
                    7. 다음 주 포커스 - 마감 임박과 리스크 기반 권장 사항""";
        }

        // PERSONAL
        if ("en".equals(lang)) {
            return """
                    1. My Weekly Summary - Total hours, completed tasks, impact score
                    2. Feature Contributions - Time spent per feature with task details
                    3. Completed Work - List of completed tasks with time spent
                    4. In-Progress Work - Current tasks and their progress
                    5. My Discussions - Comments I wrote this week with context (task name, key points)
                    6. Next Week - Upcoming deadlines and unfinished tasks prioritized""";
        }
        return """
                1. 내 주간 요약 - 총 작업시간, 완료 태스크, 임팩트 스코어
                2. 피처별 기여 - 각 피처에 투입한 시간과 태스크 상세
                3. 완료한 작업 - 완료된 태스크 목록과 소요 시간
                4. 진행 중인 작업 - 현재 진행 중인 태스크와 진행도
                5. 내 논의 내용 - 이번 주 작성한 댓글 맥락 정리 (태스크명, 핵심 내용)
                6. 다음 주 할 일 - 마감 임박 항목과 미완료 태스크 우선순위 정리""";
    }

    private String buildUserPrompt(ReportType reportType, String dataJson) {
        if (reportType == ReportType.TEAM) {
            return "다음 데이터를 기반으로 팀 주간 보고서를 작성해 주세요.\n\n" + dataJson;
        }
        return "다음 데이터를 기반으로 개인 주간 보고서를 작성해 주세요.\n\n" + dataJson;
    }
}
