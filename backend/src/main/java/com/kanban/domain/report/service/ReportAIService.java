package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class ReportAIService {

    private static final Map<String, String> LANGUAGE_NAMES = Map.ofEntries(
            Map.entry("ko", "Korean"),
            Map.entry("en", "English"),
            Map.entry("ja", "Japanese"),
            Map.entry("zh", "Chinese (Simplified)"),
            Map.entry("zh-TW", "Chinese (Traditional)"),
            Map.entry("vi", "Vietnamese"),
            Map.entry("th", "Thai"),
            Map.entry("hi", "Hindi"),
            Map.entry("es", "Spanish"),
            Map.entry("pt-BR", "Portuguese (Brazil)")
    );

    private String getLanguageName(String lang) {
        if (lang == null) return "Korean";
        return LANGUAGE_NAMES.getOrDefault(lang, "English");
    }

    private final AIProvider aiProvider;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiCreditService aiCreditService;
    private final ObjectMapper objectMapper;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.team:claude-haiku-4-5-20251001}")
    private String claudeTeamModel;

    @Value("${ai.claude.model.personal:claude-haiku-4-5-20251001}")
    private String claudePersonalModel;

    @Value("${ai.claude.model.standup:claude-haiku-4-5-20251001}")
    private String claudeStandupModel;

    @Value("${ai.openai.model.team:gpt-4o-mini}")
    private String openaiTeamModel;

    @Value("${ai.openai.model.personal:gpt-4o-mini}")
    private String openaiPersonalModel;

    @Value("${ai.openai.model.standup:gpt-4o-mini}")
    private String openaiStandupModel;

    private static final int MAX_TOKENS_TEAM = 4096;
    private static final int MAX_TOKENS_PERSONAL = 2048;
    private static final int MAX_TOKENS_STANDUP = 1024;
    private static final int MAX_TOKENS_AUTO_DAILY = 4096;
    private static final int MAX_TOKENS_AUTO_WEEKLY = 4096;

    public ReportAIService(AIProvider aiProvider, AiUsageLogRepository aiUsageLogRepository,
                           AiCreditService aiCreditService, ObjectMapper objectMapper) {
        this.aiProvider = aiProvider;
        this.aiUsageLogRepository = aiUsageLogRepository;
        this.aiCreditService = aiCreditService;
        this.objectMapper = objectMapper;
    }

    private static final int MAX_TOKENS_CLASSIFY = 1024;

    /**
     * 담당자·키워드로 기능에 매핑되지 않은 잔여 커밋을 AI가 의미 기반으로 기능에 배정한다.
     * 한/영 교차(예: 커밋 scope "guild" ↔ 기능명 "길드전")를 보완하는 용도.
     *
     * <p>시스템 호출이라 크레딧은 차감하지 않고 사용량 로그만 남긴다. 실패하면 빈 배열을 돌려
     * 호출부가 기존(담당자·키워드) 결과를 그대로 쓰게 한다.
     *
     * @return commitLabels 길이의 배열. i번째 값은 커밋 i가 속한 기능 인덱스, 없으면 -1.
     */
    public int[] classifyCommits(List<String> featureLabels, List<String> commitLabels,
                                 String language, String boardId) {
        if (featureLabels == null || featureLabels.isEmpty()
                || commitLabels == null || commitLabels.isEmpty()) {
            return new int[0];
        }

        StringBuilder sb = new StringBuilder("FEATURES:\n");
        for (int i = 0; i < featureLabels.size(); i++) {
            sb.append(i).append(": ").append(featureLabels.get(i)).append('\n');
        }
        sb.append("\nCOMMITS:\n");
        for (int i = 0; i < commitLabels.size(); i++) {
            sb.append(i).append(": ").append(commitLabels.get(i)).append('\n');
        }

        String systemPrompt = """
                You map git commits to product features by meaning.
                You get a numbered FEATURES list and a numbered COMMITS list. For each commit,
                decide which feature it most likely belongs to, judging the commit message
                (type/scope/keywords, in any language) against the feature name/description.

                Output ONLY a JSON array of integers whose length equals the number of commits;
                the i-th value is the feature index for commit i, or -1 if it does not clearly
                belong to any feature. No prose, no code fences.

                Be conservative: use -1 when unsure. Match across languages
                (e.g. "guild"↔"길드", "receipt"↔"영수증", "crash"↔"크래시").
                """;

        String model = getStandupModel();
        try {
            AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, sb.toString(), model, MAX_TOKENS_CLASSIFY);
            logAiUsage("REPORT_COMMIT_CLASSIFY", model, boardId, null, aiResult);
            return parseAssignments(aiResult.content(), commitLabels.size(), featureLabels.size());
        } catch (Exception e) {
            log.warn("커밋 분류 AI 호출 실패: {}", e.getMessage());
            return new int[0];
        }
    }

    private static final int MAX_TOKENS_FEATURE_SUMMARY = 3072;

    /**
     * 기능별 요약을 한 번의 호출로 생성한다. 각 기능의 근거(태스크·체크리스트·커밋·연관 문서)를 담은 라벨을
     * 순서대로 받아, 기능마다 "그 기간에 실제로 무엇이 만들어졌는지"를 3~5문장으로 서술한 문자열 배열을 돌려준다.
     *
     * <p>시스템 호출이라 크레딧은 차감하지 않고 사용량 로그만 남긴다. 실패하면 빈 목록을 돌려
     * 호출부가 요약 없이(기존 description만으로) 진행하게 한다.
     *
     * @return featureBriefs 길이의 목록. i번째 값은 기능 i의 요약(없으면 빈 문자열). 실패 시 빈 목록.
     */
    public List<String> summarizeFeatures(List<String> featureBriefs, String language, String boardId) {
        if (featureBriefs == null || featureBriefs.isEmpty()) {
            return List.of();
        }
        String langName = getLanguageName(language);

        StringBuilder sb = new StringBuilder("FEATURES:\n");
        for (int i = 0; i < featureBriefs.size(); i++) {
            sb.append("=== FEATURE ").append(i).append(" ===\n")
                    .append(featureBriefs.get(i)).append("\n\n");
        }

        String systemPrompt = """
                You summarize what each product feature actually got built during a reporting period.
                You receive a numbered list of FEATURES; each has its NAME, DESCRIPTION, TASKS with their
                checklist items ([x] done / [ ] not done), connected COMMITS, and related DOCS.

                For each feature, write a summary of 3-5 sentences describing what was actually done in this
                period: which concrete pieces of work advanced or completed, cross-referencing the checklist
                items against the commit subjects and docs so the reader sees "what was built and how far it got."
                Be specific and grounded — never invent work that the tasks/commits/docs don't show. If a feature
                has little evidence, say briefly that it saw little activity. Do not just restate the feature name.
                Write every summary in %s.

                Output ONLY a JSON array of strings whose length equals the number of features; the i-th string
                is the summary for feature i. No prose, no code fences, no keys — just the array.
                """.formatted(langName);

        String model = getStandupModel();
        try {
            AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, sb.toString(), model, MAX_TOKENS_FEATURE_SUMMARY);
            logAiUsage("REPORT_FEATURE_SUMMARY", model, boardId, null, aiResult);
            return parseSummaries(aiResult.content(), featureBriefs.size());
        } catch (Exception e) {
            log.warn("기능 요약 AI 호출 실패: {}", e.getMessage());
            return List.of();
        }
    }

    private List<String> parseSummaries(String raw, int featureCount) {
        if (raw == null) {
            return List.of();
        }
        int start = raw.indexOf('[');
        int end = raw.lastIndexOf(']');
        if (start < 0 || end <= start) {
            return List.of();
        }
        try {
            String[] parsed = objectMapper.readValue(raw.substring(start, end + 1), String[].class);
            List<String> result = new java.util.ArrayList<>(featureCount);
            for (int i = 0; i < featureCount; i++) {
                result.add(i < parsed.length && parsed[i] != null ? parsed[i] : "");
            }
            return result;
        } catch (Exception e) {
            log.warn("기능 요약 응답 파싱 실패: {}", e.getMessage());
            return List.of();
        }
    }

    private int[] parseAssignments(String raw, int commitCount, int featureCount) {
        int[] result = new int[commitCount];
        Arrays.fill(result, -1);
        if (raw == null) return result;
        int start = raw.indexOf('[');
        int end = raw.lastIndexOf(']');
        if (start < 0 || end <= start) return result;
        try {
            int[] parsed = objectMapper.readValue(raw.substring(start, end + 1), int[].class);
            for (int i = 0; i < commitCount && i < parsed.length; i++) {
                int fi = parsed[i];
                result[i] = (fi >= 0 && fi < featureCount) ? fi : -1;
            }
        } catch (Exception e) {
            log.warn("커밋 분류 응답 파싱 실패: {}", e.getMessage());
        }
        return result;
    }

    private String getTeamModel() {
        return "openai".equals(provider) ? openaiTeamModel : claudeTeamModel;
    }

    private String getPersonalModel() {
        return "openai".equals(provider) ? openaiPersonalModel : claudePersonalModel;
    }

    private String getStandupModel() {
        return "openai".equals(provider) ? openaiStandupModel : claudeStandupModel;
    }

    public String generateReport(ReportType reportType, String dataJson, String language) {
        return generateReport(reportType, dataJson, language, null, null);
    }

    public String generateReport(ReportType reportType, String dataJson, String language, String boardId, String userId) {
        String featureType = reportType == ReportType.TEAM ? "REPORT_TEAM" : "REPORT_PERSONAL";

        // Consume AI credit before processing (only for user-initiated calls with boardId)
        if (boardId != null && userId != null) {
            aiCreditService.consumeCredit(boardId, userId, featureType, 1);
        }

        String systemPrompt = buildSystemPrompt(reportType, language);
        String userPrompt = buildUserPrompt(reportType, dataJson, language);
        int maxTokens = reportType == ReportType.TEAM ? MAX_TOKENS_TEAM : MAX_TOKENS_PERSONAL;
        String model = reportType == ReportType.TEAM ? getTeamModel() : getPersonalModel();

        log.info("Generating {} report via AI provider (language: {})", reportType, language);
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, maxTokens);

        logAiUsage(featureType, model, boardId, userId, aiResult);
        return aiResult.content();
    }

    public String generateStandupSummary(String dataJson, String language) {
        return generateStandupSummary(dataJson, language, null, null);
    }

    public String generateStandupSummary(String dataJson, String language, String boardId, String userId) {
        // Consume AI credit before processing (boardId required, userId nullable for scheduled calls)
        if (boardId != null) {
            aiCreditService.consumeCredit(boardId, userId, "STANDUP", 1);
        }

        String lang = language != null ? language : "ko";
        String systemPrompt = buildStandupSystemPrompt(lang);
        String userPrompt = "ko".equals(lang)
                ? "다음 데이터를 기반으로 데일리 스탠드업 요약을 작성해 주세요.\n\n" + dataJson
                : "Generate a daily standup summary from the following data:\n\n" + dataJson;

        String model = getStandupModel();
        log.info("Generating standup summary via AI provider (language: {})", lang);
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, MAX_TOKENS_STANDUP);

        logAiUsage("STANDUP", model, boardId, userId, aiResult);
        return aiResult.content();
    }

    /**
     * 자동 보고서(일일/주간)의 구조화 JSON 본문을 만든다.
     *
     * <p>산문이 아니라 고정 스키마 JSON을 받는 이유는, 같은 결과물에서 슬랙 요약과 웹 페이지가
     * 함께 나와야 하기 때문이다. 그래서 AI 호출은 보고서당 1회로 끝난다.
     *
     * <p><b>크레딧을 차감하지 않는다.</b> 시스템이 스케줄에 따라 보내는 것이라 사용자가 유발한 호출이 아니다.
     * 다만 비용 추적을 위해 사용량 로그는 남긴다.
     */
    public String generateAutoReportJson(ReportType reportType, String dataJson, String language, String boardId) {
        String lang = language != null ? language : "ko";
        boolean weekly = reportType == ReportType.WEEKLY_INTEGRATED;
        String featureType = weekly ? "REPORT_WEEKLY_AUTO" : "REPORT_DAILY_AUTO";

        String systemPrompt = buildAutoReportSystemPrompt(weekly, lang);
        String userPrompt = ("ko".equals(lang)
                ? "다음 수집 데이터로 보고서 JSON을 작성하세요.\n\n"
                : "Produce the report JSON from the following collected data.\n\n") + dataJson;

        String model = weekly ? getTeamModel() : getStandupModel();
        int maxTokens = weekly ? MAX_TOKENS_AUTO_WEEKLY : MAX_TOKENS_AUTO_DAILY;

        log.info("Generating {} auto report JSON (board: {}, language: {})", reportType, boardId, lang);
        AIResponse aiResult = aiProvider.chatWithUsage(systemPrompt, userPrompt, model, maxTokens);

        logAiUsage(featureType, model, boardId, null, aiResult);
        return aiResult.content();
    }

    private String buildAutoReportSystemPrompt(boolean weekly, String lang) {
        String schema = """
                {
                  "headline": "한 줄 요약 (60자 이내)",
                  "lede": "2~3문장 리드 문단",
                  "highlights": ["가장 중요한 것 (중요도 순, 최대 10개)", "...", "..."],
                  "sections": [
                    {"title": "섹션 제목", "body": "본문", "sources": ["GITHUB"]}
                  ],
                  "risks": ["확인이 필요한 것", "..."]
                }
                """;

        String sectionRule = weekly
                ? "sections는 반드시 4개: 성과 / 진행 중 / 리스크 / 다음 주 계획."
                : "sections는 1~2개. 어제 무엇이 바뀌었는지에 집중한다.";

        String digestRuleKo = weekly
                ? "- daily_digests는 이번 주에 이미 나간 일일 보고서 요약(날짜별 headline·highlights)입니다. "
                  + "이걸 참고해 한 주의 흐름(무엇이 어떤 순서로 이어졌는지)을 파악하고 서술을 매끄럽게 이으세요. "
                  + "다만 지표와 서술의 근거는 반드시 소스 데이터에서 확인하고, 일일 요약을 그대로 복사하지 말고 "
                  + "한 주 관점으로 다시 엮으세요."
                : "";
        String digestRuleEn = weekly
                ? "- daily_digests are summaries (headline · highlights per day) of the daily reports already "
                  + "sent this week. Use them to grasp the week's arc — what progressed in what order — and make "
                  + "the narrative flow. Still verify metrics and claims against the source data, and do not copy "
                  + "the daily summaries verbatim; re-weave them from a whole-week perspective."
                : "";

        if ("ko".equals(lang)) {
            return """
                    당신은 오토배틀러 팀배틀 수집형 RPG를 만드는 게임 개발팀의 보고서 작성자입니다. 수집된 원본
                    데이터(커밋, 칸반 태스크, Confluence 문서(주간보고 또는 부모 문서 하위의 추가·수정·삭제 변경 내역),
                    슬랙 채널 논의)를 "어떤 게임 콘텐츠·시스템이 만들어지고 다듬어지고 있는지"의 관점으로 해석해,
                    팀이 아침에 30초 안에 읽을 수 있는 보고서를 만듭니다.

                    <output>
                    반드시 아래 스키마의 JSON만 출력하세요. 코드펜스, 설명, 인사말을 붙이지 마세요.
                    %s
                    </output>

                    <rules>
                    - %s
                    %s
                    - 숫자를 지어내지 마세요. 지표는 시스템이 계산해 붙이므로 metrics 필드는 출력하지 않습니다.
                    - 커밋 메시지를 그대로 나열하지 마세요. 무엇이 왜 바뀌었는지로 묶어 서술하세요.
                    - 커밋·태스크·논의를 게임 요소 단위로 묶어 "무엇이 만들어지고 있는지"를 서술하세요. 예:
                      수집 유닛/캐릭터, 팀 조합·시너지, 전투·오토배틀 로직, 스킬·효과, 밸런스, 몹·보스, 맵·스테이지,
                      뽑기·수집 시스템, UI/UX, 인프라/툴. 커밋 type·scope(feat, fix, mob, map, skill 등)와 태스크·
                      체크리스트를 근거로 그 작업이 어떤 콘텐츠의 어느 단계인지 연결하세요. 게임 용어는 근거가
                      있을 때만 쓰고 지어내지 마세요.
                    - 태스크의 checklist(항목 title·done)는 그 태스크가 실제로 어떤 하위 작업인지 보여줍니다.
                      이걸 근거로 태스크의 실체를 파악하고, 커밋 subject를 해당 태스크·항목과 대조해
                      "어떤 커밋이 어떤 태스크의 어떤 작업인지"를 연결해 서술하세요.
                    - sources에는 그 섹션의 근거가 된 소스만 적으세요: GITHUB, KANBAN, CONFLUENCE, SLACK.
                    - Confluence 원문은 요약하지 말고 인용이 필요하면 그대로 두세요. 사람이 쓴 문장과
                      당신이 쓴 문장이 섞이면 보고서를 신뢰할 수 없게 됩니다.
                    - Confluence가 changelogs(문서 변경 내역)로 오면 added(추가)·modified(수정)·deleted(삭제)를
                      구분해 서술하세요. 어떤 문서가 새로 생기고 어떻게 바뀌었는지가 핵심이며, 삭제된 문서는 제목만 남습니다.
                    - 슬랙 채널 대화는 커밋·태스크에 안 남는 결정·막힌 지점의 근거로만 쓰세요. 잡담을 옮기지 말고,
                      결정된 것·논의 중인 것·차단된 것만 골라 SLACK을 근거로 서술하세요. 리액션(예: white_check_mark)은
                      합의·완료 신호이고, 결론은 스레드 답글(replies)에 있는 경우가 많으니 함께 보세요.
                    - members는 같은 사람의 여러 계정(이름·GitHub 로그인·슬랙 ID)을 잇는 명단입니다. 이걸로 한 사람의
                      활동을 소스 넘어 연결하세요 — GitHub author, 태스크 담당자, 슬랙 발화자가 같은 사람일 수 있습니다.
                    - risks에는 정말 확인이 필요한 것만 적으세요: 막힌 지점(블로커), 팀의 결정이 필요한 사안,
                      설정을 바꿨다 되돌리는 등 방향이 오락가락한 흔적. 이미지·GIF·스프라이트·맵 등 리소스/에셋이
                      자주 바뀌거나 교체되는 것은 게임 개발의 정상 과정이므로 리스크로 적지 마세요. 적을 게 없으면
                      risks는 비워 두세요.
                    - 수집 실패한 소스가 있으면 risks 첫 줄에 그 사실을 적으세요.
                    - highlights는 중요도 순으로 최대 10개까지 쓰세요. 그날 정리할 게 적으면 적게 쓰고 억지로 채우지 마세요.
                      각 60자 이내로, 슬랙 메시지에 그대로 나갑니다.
                    </rules>
                    """.formatted(schema, sectionRule, digestRuleKo);
        }
        return """
                You are the report writer for a game team building an auto-battler team-battle collection RPG.
                From raw collected data (commits, kanban tasks, Confluence documents (weekly notes, or
                added/modified/deleted changes under a parent page), Slack channel discussion), interpret
                "what game content and systems are being built and refined" and produce a report the team can
                read in 30 seconds.

                <output>
                Output ONLY JSON matching this schema. No code fences, no preamble.
                %s
                </output>

                <rules>
                - %s
                %s
                - Never invent numbers. Metrics are computed by the system, so do not output a metrics field.
                - Do not list commit messages verbatim. Group them by what changed and why.
                - Group commits, tasks, and discussion by game element and describe "what is being built." e.g.
                  collectible units/characters, team comps & synergies, combat/auto-battle logic, skills/effects,
                  balance, mobs/bosses, maps/stages, gacha/collection systems, UI/UX, infra/tooling. Use commit
                  type/scope (feat, fix, mob, map, skill, ...) and tasks/checklists to connect each piece of work
                  to which content it belongs to and what stage it's at. Use game terms only when the data
                  supports them; don't invent.
                - A task's checklist (item title · done) shows what the task actually consists of. Use it to
                  understand what each task really is, and match commit subjects against the task and its items to
                  connect "which commit belongs to which task and which piece of work."
                - In sources, name only the sources that back that section: GITHUB, KANBAN, CONFLUENCE, SLACK.
                - Keep Confluence prose as written when quoting. Mixing human-written and AI-written sentences
                  makes the report untrustworthy.
                - When Confluence arrives as changelogs, distinguish added / modified / deleted documents: what
                  was newly created and how things changed is the point; deleted docs keep only their title.
                - Use Slack channel discussion only as evidence for decisions or blockers that commits/tasks don't
                  capture. Don't transcribe chatter; surface only what was decided, is being discussed, or is blocked,
                  and cite SLACK. Reactions (e.g. white_check_mark) signal agreement/done, and the conclusion often
                  lives in the thread replies, so read those too.
                - members is a roster linking one person's identities (name · GitHub login · Slack ID). Use it to
                  connect a person's activity across sources — the GitHub author, task assignee, and Slack speaker may
                  be the same person.
                - Put in risks only what genuinely needs attention: blockers, decisions the team must make, or
                  signs of flip-flopping direction (a setting changed then rolled back). Frequently changing or
                  swapping resource/asset files (images, GIFs, sprites, maps) is a normal part of game
                  development, so do NOT flag it as a risk. Leave risks empty when there is nothing to raise.
                - If a source failed to collect, say so in the first risks entry.
                - highlights: up to 10 items ordered by importance. Write fewer when there's little to report; don't pad. Each under 60 characters. They go straight into Slack.
                </rules>
                """.formatted(schema, sectionRule, digestRuleEn);
    }

    private void logAiUsage(String featureType, String model, String boardId, String userId, AIResponse aiResult) {
        try {
            aiUsageLogRepository.save(AiUsageLog.builder()
                    .boardId(boardId).userId(userId)
                    .featureType(featureType).provider(provider.toUpperCase())
                    .model(model)
                    .inputTokens(aiResult.inputTokens())
                    .outputTokens(aiResult.outputTokens())
                    .estimatedCostUsd(AiUsageLog.calculateCost(model, aiResult.inputTokens(), aiResult.outputTokens()))
                    .build());
        } catch (Exception e) {
            log.debug("Failed to save AI usage log: {}", e.getMessage());
        }
    }

    private String buildSystemPrompt(ReportType reportType, String language) {
        String lang = language != null ? language : "ko";

        if (reportType == ReportType.PERSONAL) {
            return buildPersonalSystemPrompt(lang);
        }
        return buildTeamSystemPrompt(lang);
    }

    private String buildPersonalSystemPrompt(String lang) {
        if ("ko".equals(lang)) {
            return """
                    당신은 BRIDGE 프로젝트 관리 도구의 업무 분석가입니다.
                    피처 단위로 그룹핑된 태스크 데이터를 받습니다. 각 태스크에는
                    checklists(계획된 작업), time_details(언제, 얼마나), comments(실제 일어난 일)가 포함됩니다.
                    또한 해당 기간에 사용자가 참여한 미팅 데이터도 함께 제공됩니다.

                    <role>
                    당신의 역할은 수치를 나열하는 것이 아닙니다. 단순 집계는 대시보드에 이미 있습니다.
                    당신의 역할은 데이터를 교차 분석하여 각 태스크에서
                    "이번 주에 실제로 무슨 일이 있었는지"를 줄글로 서술하는 것입니다.
                    </role>

                    <analysis_method>
                    각 태스크에서 데이터를 교차 분석하세요. 반드시 여러 데이터 소스를 연결하세요:

                    교차 분석 패턴:
                    - 시간↔체크리스트: 시간 투입 대비 체크리스트 진행이 없으면 → 댓글에서 원인을 찾으세요 (블로커, 재작업, 대기)
                    - 댓글↔상태: 댓글에 다른 사람 언급, 스펙 변경, 이슈가 있다면 → 외부 의존성 또는 블로커로 표시
                    - 시간 분포↔댓글: 시간 분포가 불균일하다면 (며칠 0시간 후 급증) → 댓글 시점과 대조하여 패턴 설명
                    - 완료 패턴: 태스크 완료 + 체크리스트 달성 → 간단히 마무리 언급, 과도한 설명 불필요

                    댓글 키워드 분석:
                    - 의사결정 대기: "확인 부탁", "어떻게 할까요", "리뷰 요청"
                    - 이슈 보고: "에러", "안 됩니다", "변경 필요", "버그"
                    - 완료 보고: "완료", "머지", "반영", "배포"

                    미팅 연결:
                    - 미팅이 있다면 태스크 진행과 연결하세요
                    - 미팅 근처의 태스크 활동은 정렬 세션, 리뷰, 의사결정 포인트를 나타낼 수 있습니다
                    - 메모 내용으로 서술을 풍부하게 만드세요

                    구체적 예시:
                    - "인증 태스크에 약 5시간을 투입했지만 체크리스트 2개가 미완료로 남았다. 수요일 댓글에서 'OAuth 스펙이 변경되어 재작업 필요'라는 언급이 있어, 스펙 변경이 진행을 지연시킨 것으로 보인다."
                    - "배포 태스크는 월~수 활동이 없다가 목요일에 집중됐다. 수요일 미팅에서 배포 일정이 확정된 후 작업이 시작된 패턴이다."
                    </analysis_method>

                    <output_format>
                    한국어로 작성하세요. 마크다운을 반드시 다음 구조로 작성하세요:

                    1. 보고서 제목, 기간, 사용자 이름은 쓰지 마세요. 이미 다른 곳에 표시됩니다.
                    2. 같은 피처에 속하는 태스크끼리 묶어서 작성하세요:
                       ## 피처명

                       ### 태스크 제목 1
                       2~4문장의 줄글 서술.

                       ### 태스크 제목 2
                       2~4문장의 줄글 서술.

                       ---

                       같은 피처의 모든 태스크를 하나의 ## 헤더 아래에 배치하세요.
                       태스크가 1개뿐인 피처도 동일한 구조를 따릅니다.
                       피처 그룹 사이에 --- 구분선을 넣되, 그룹 내 태스크 사이에는 넣지 마세요.

                    3. 미팅 데이터가 있고 의미 있는 내용이 있다면 피처 그룹 뒤에 섹션을 추가하세요:
                       ## 미팅
                       미팅을 업무 맥락과 연결하는 간결한 서술 (의사결정, 정렬, 리뷰 등).
                       메모가 있거나 태스크 진행과 관련된 미팅만 포함하세요.

                       ---

                    4. 모든 섹션 서술 후, 마지막에 블록쿼트로 한 줄 요약을 작성하세요:
                       > **이번 주 한 줄 요약:** 이번 주 전체를 관통하는 한 문장.

                    "체크리스트 3/5 완료", "총 12.5시간 작업" 같은 수치 나열은 금지합니다.
                    숫자는 서술 문장 안에서 근거로만 사용하세요.
                    "완료된 작업", "진행 중인 작업" 같은 상태 그룹 헤더를 쓰지 마세요.
                    중요도 순서로 피처 그룹을 나열하세요.
                    </output_format>

                    <rules>
                    - 제공된 데이터에 없는 내용은 절대 추가하지 마세요.
                    - 시간 언급 시 분을 시간으로 변환하세요 (예: "약 3시간" not "180분").
                    - 불릿 나열 금지. 줄글만 사용하세요.
                    - 활동이 없는 태스크(시간 0, 댓글 0, 체크리스트 변경 0)는 건너뛰세요.
                    - 각 태스크 서술은 2~4문장으로 간결하게 작성하세요.
                    - 미팅은 논의/결정된 내용에 집중하세요. 단순히 미팅이 있었다는 것만 언급하지 마세요.
                    - 미팅이 없거나 모든 메모가 비어있다면 미팅 섹션을 아예 생략하세요.
                    </rules>""";
        }

        // Base English prompt - used for "en" and all other languages with a language instruction prefix
        String langName = getLanguageName(lang);
        String langTop;
        String langBottom;
        if ("en".equals(lang)) {
            langTop = "Write in English.";
            langBottom = "";
        } else {
            langTop = "CRITICAL LANGUAGE RULE: You MUST write your ENTIRE response in " + langName + ". " +
                    "All headings (##, ###), narratives, blockquote summary — everything MUST be in " + langName + ". " +
                    "Do NOT use English for any content.";
            langBottom = "REMINDER: Your entire response MUST be in " + langName + ". This is mandatory.";
        }

        return String.format("""
                You are a work analyst for the BRIDGE project management tool.
                You receive task-centric data grouped under features. Each task contains
                checklists (what was planned), time_details (when and how long), and comments (what actually happened).
                You also receive meetings data showing meetings the user participated in during the period.

                %s

                <role>
                Your job is NOT to summarize metrics. Simple counts and totals are already shown in the dashboard.
                Your job is to READ THE STORY of each task by cross-referencing these data sources,
                and write a narrative that answers: "What actually happened this week?"
                </role>

                <analysis_method>
                For each task, cross-reference multiple data sources — never describe a single metric in isolation:

                Cross-analysis patterns:
                - Time↔Checklists: If time was invested but checklists didn't progress → comments likely explain why (blocker, rework, waiting)
                - Comments↔Status: If comments mention other people, spec changes, or issues → flag as external dependency or blocker
                - Time distribution↔Comments: If time is uneven (0h for days then a spike) → correlate with comment timestamps to explain pattern
                - Completion: Task done + all checklists achieved → briefly note closure, don't over-explain

                Meeting connection:
                - Connect meetings to task progress when relevant
                - Activity near meetings may indicate alignment sessions, reviews, or decision points
                - Use memo content to enrich the narrative
                </analysis_method>

                <output_format>
                Use markdown with the following structure strictly:

                1. Do NOT write a report title, period, or user name. That info is already displayed elsewhere.
                2. Group tasks by their parent feature. For each feature with meaningful activity:
                   ## (feature name)

                   ### (task title)
                   2-4 sentences of narrative prose.

                   ---

                   Place all tasks belonging to the same feature under one ## header.
                   Use the same structure even for features with a single task.
                   Place a --- divider between feature groups, not between tasks within a group.

                3. If meetings data exists and has meaningful content, add a section after feature groups:
                   ## (meetings section heading)
                   Brief narrative connecting meetings to work context (decisions made, alignment, reviews).
                   Only include if meetings have memos or are relevant to task progress.

                   ---

                4. After all sections, write the weekly summary as a blockquote:
                   > **(weekly summary label):** A single sentence capturing the overall theme.

                Do NOT list metrics like "completed 3/5 checklists" or "worked 12.5 hours total".
                Numbers may only appear as supporting evidence within a narrative sentence.
                Do NOT group tasks under status headers.
                Order feature groups by significance.
                </output_format>

                <rules>
                - Write ONLY based on the provided data. Never fabricate.
                - Convert minutes to hours when referencing time.
                - No bullet lists. Flowing prose only.
                - Skip tasks with zero activity (no time, no comments, no checklist changes).
                - Keep each task narrative to 2-4 sentences. Be concise.
                - For meetings, focus on what was discussed/decided, not just that a meeting happened.
                - Skip the meetings section entirely if no meetings exist or all memos are empty.
                </rules>

                %s""", langTop, langBottom);
    }

    private String buildTeamSystemPrompt(String lang) {
        if ("ko".equals(lang)) {
            return """
                    당신은 BRIDGE 프로젝트 관리 도구의 팀 다이나믹스 분석가입니다.
                    팀 전체 데이터를 받습니다: 멤버별 통계, 피처 진행률, 마일스톤 건강,
                    지연 항목, 병목 분석, 기간 내 댓글, 그리고 미팅 기록.

                    <role>
                    당신의 역할은 수치를 반복하는 것이 아닙니다. 총계, 진행바, 멤버 통계는
                    이미 대시보드에 표시되어 있습니다. 당신의 역할은 데이터 포인트 사이의 연결고리를 찾고,
                    개별 지표만으로는 보이지 않는 인사이트를 도출하는 것입니다.
                    </role>

                    <analysis_method>
                    다음 데이터 차원을 교차 분석하세요. 반드시 2개 이상의 데이터 포인트를 연결하세요:

                    진행률↔시간 교차:
                    - 피처 진행률 낮은데 시간 투입 높음 → 댓글에서 블로커, 재작업, 스코프 변경을 찾으세요
                    - 피처 진행률 높은데 시간 투입 낮음 → 효율적 작업 또는 이전 준비가 결실을 맺은 것

                    멤버 간 관계:
                    - 한 멤버의 높은 작업시간 + 낮은 완료율 → 다른 멤버의 산출물에 블로킹되고 있는지 확인
                    - stagnant_tasks나 stuck_checklists → 누가 누구를 블로킹하는지 인적 의존성 식별
                    - 멤버 간 작업량 분포 비교 → 과부하/유휴 패턴

                    리스크 추적:
                    - 마일스톤 상태가 AT_RISK → 어떤 피처/멤버가 지연 체인을 일으키는지 추적
                    - 댓글에서 반복 주제, 미해결 의사결정 감지

                    미팅 효과 분석:
                    - 미팅 후 블로킹 해제 패턴이 있는지?
                    - 특정 피처에 미팅이 집중되어 있는지?
                    - 참가자와 태스크 진행의 관계는?

                    구체적 예시:
                    - "김OO님은 인증 피처에 약 12시간을 투입했지만 체크리스트 완료율은 40%에 머물렀다. 이OO님의 API 설계 태스크가 미완료 상태여서 인증 구현이 블로킹된 것으로 보인다."
                    </analysis_method>

                    <output_format>
                    한국어로 작성하세요. 마크다운을 반드시 다음 구조로 작성하세요:

                    1. 보고서 제목, 기간, 보드명은 쓰지 마세요. 이미 다른 곳에 표시됩니다.

                    2. 2~4개의 인사이트 섹션을 이 패턴으로 작성하세요:
                       ### 인사이트 제목
                       여러 데이터 포인트를 연결하는 2~4문장의 서술.
                       구체적인 멤버명, 피처명, 태스크명을 언급하세요.

                       ---

                    3. 리스크나 블로커가 있다면 섹션을 작성하세요:
                       ### 리스크 & 의존성
                       의존성 체인, 누가 누구를 블로킹하는지, 마감 리스크에 대한 서술.

                       ---

                    4. 마지막에 블록쿼트로 요약을 작성하세요:
                       > **이번 주 한 줄 요약:** 팀 전체의 다이나믹을 관통하는 한 문장.

                    "팀 총 45시간 작업", "3개 피처 완료" 같은 수치 나열은 금지합니다.
                    숫자는 서술 문장 안에서 근거로만 사용하세요.
                    "주간 요약", "멤버별 기여" 같이 대시보드 데이터를 반복하는 섹션을 만들지 마세요.
                    </output_format>

                    <rules>
                    - 제공된 데이터에 없는 내용은 절대 추가하지 마세요.
                    - 시간 언급 시 분을 시간으로 변환하세요 (예: "약 12시간" not "720분").
                    - 불릿 나열 금지. 줄글만 사용하세요.
                    - 팀원은 실명으로 언급하세요.
                    - 개별 데이터 포인트가 아닌 데이터 간 관계에 집중하세요.
                    - 간결하게: 500~1000자.
                    </rules>""";
        }

        // Base English prompt - used for "en" and all other languages with a language instruction prefix
        String langName = getLanguageName(lang);
        String langTop;
        String langBottom;
        if ("en".equals(lang)) {
            langTop = "Write in English.";
            langBottom = "";
        } else {
            langTop = "CRITICAL LANGUAGE RULE: You MUST write your ENTIRE response in " + langName + ". " +
                    "All headings (###), narratives, blockquote summary — everything MUST be in " + langName + ". " +
                    "Do NOT use English for any content.";
            langBottom = "REMINDER: Your entire response MUST be in " + langName + ". This is mandatory.";
        }

        return String.format("""
                You are a team dynamics analyst for the BRIDGE project management tool.
                You receive team-wide data: member statistics, feature progress, milestone health,
                delayed items, bottleneck analysis, comments from the period, and meeting records.

                %s

                <role>
                Your job is NOT to repeat metrics. Totals, progress bars, and member stats are already shown
                in the dashboard above your report. Your job is to CONNECT THE DOTS between data points
                and surface insights that aren't visible from individual metrics alone.
                </role>

                <analysis_method>
                Cross-reference multiple data dimensions — always connect 2+ data points in each insight:

                Progress↔Time:
                - Low feature progress + high time → read comments for blockers, rework, scope changes
                - High progress + low time → efficient work or prior preparation paying off

                Member relationships:
                - High hours + low completion for one member → check if blocked by another member's deliverables
                - stagnant_tasks or stuck_checklists → identify the human dependency (who is blocking whom)
                - Compare workload distribution → overloaded vs underutilized patterns

                Risk tracking:
                - AT_RISK milestones → trace which features/members cause the delay chain
                - Comment analysis: recurring themes, cross-team discussions, unresolved decisions

                Meeting impact:
                - Did meetings lead to decisions that unblocked work?
                - Are meetings concentrated around certain features?
                - Participant-to-task correlation?
                </analysis_method>

                <output_format>
                Use markdown with this structure strictly:

                1. Do NOT write a report title, period, or board name. Already displayed elsewhere.

                2. Write 2-4 insight sections using this pattern:
                   ### (insight title)
                   2-4 sentences of narrative connecting multiple data points.
                   Mention specific members, features, and tasks by name.

                   ---

                3. If there are risks or blockers, write a section:
                   ### (risks section heading)
                   Narrative about dependency chains, who is blocking whom, deadline risks.

                   ---

                4. End with a blockquote summary:
                   > **(weekly summary label):** A single sentence capturing the team's overall dynamic.

                Do NOT list metrics.
                Numbers may only appear as supporting evidence within narrative sentences.
                Do NOT create sections that just restate dashboard data.
                </output_format>

                <rules>
                - Write ONLY based on the provided data. Never fabricate.
                - Convert minutes to hours (e.g., "about 12 hours" not "720 minutes").
                - No bullet lists. Flowing prose only.
                - Mention team members by their actual names.
                - Focus on relationships between data, not individual data points.
                - Keep it concise: 500-1000 words.
                </rules>

                %s""", langTop, langBottom);
    }

    private String buildStandupSystemPrompt(String lang) {
        if ("ko".equals(lang)) {
            return """
                    당신은 BRIDGE 프로젝트 관리 도구의 데일리 스탠드업 요약 작성자입니다.
                    하루의 보드 전체 활동 데이터를 받습니다: 어떤 태스크에 시간이 기록되었고,
                    어떤 댓글이 작성되었으며, 현재 피처 진행률이 어떻게 되는지.

                    <role>
                    간결한 데일리 스탠드업 요약을 작성하세요. 다음에 집중:
                    1. 어제 달성한 내용
                    2. 댓글에서 언급된 블로커나 이슈
                    3. 가장 많은 관심을 받은 핵심 태스크
                    </role>

                    <output_format>
                    한국어로 작성하세요. 다음 구조를 사용:

                    *어제의 주요 성과*
                    핵심 성과 2~4개 불릿 포인트. 멤버 이름과 태스크를 언급.

                    *주요 논의 사항*
                    주목할 만한 댓글이나 의사결정 1~2개 불릿 (없으면 생략).

                    *주의 사항*
                    잠재적 블로커나 관심이 필요한 항목 1~2개 불릿 (없으면 생략).

                    200자 이내로 간결하고 실행 가능하게 작성하세요.
                    제목이나 날짜는 쓰지 마세요 - 이미 표시됩니다.
                    </output_format>

                    <rules>
                    - 제공된 데이터에 없는 내용은 절대 추가하지 마세요.
                    - 시간은 시간 단위로 변환 (예: "약 2시간" not "120분").
                    - 팀원은 실명으로 언급하세요.
                    - 관련 데이터가 없는 섹션은 생략하세요.
                    - 각 불릿 포인트는 1~2문장으로.
                    </rules>""";
        }

        // Base English prompt - used for "en" and all other languages
        String langName = getLanguageName(lang);
        String langTop;
        String langBottom;
        if ("en".equals(lang)) {
            langTop = "Write in English.";
            langBottom = "";
        } else {
            langTop = "CRITICAL LANGUAGE RULE: You MUST write your ENTIRE response in " + langName + ". " +
                    "All section headings and content MUST be in " + langName + ". Do NOT use English.";
            langBottom = "REMINDER: Your entire response MUST be in " + langName + ".";
        }

        return String.format("""
                You are a daily standup summarizer for the BRIDGE project management tool.
                You receive one day's board-wide activity data: which tasks had time logged,
                what comments were written, and current feature progress.

                %s

                <role>
                Write a brief daily standup summary. Focus on:
                1. What was accomplished yesterday
                2. Any blockers or issues mentioned in comments
                3. Key tasks that received the most attention
                </role>

                <output_format>
                Use this structure (translate section headings to the target language):

                *(yesterday's highlights)*
                2-4 bullet points of key accomplishments, mentioning member names and tasks.

                *(active discussions)*
                1-2 bullet points about notable comments or decisions (skip if none).

                *(heads up)*
                1-2 bullet points about potential blockers or items needing attention (skip if none).

                Keep it under 200 words. Be concise and actionable.
                Do NOT include a title or date - that's already displayed.
                </output_format>

                <rules>
                - Write ONLY based on the provided data.
                - Convert minutes to hours (e.g., "~2h" not "120 minutes").
                - Mention team members by name.
                - Skip sections with no relevant data.
                - Keep bullet points to 1-2 sentences each.
                </rules>

                %s""", langTop, langBottom);
    }

    private String buildUserPrompt(ReportType reportType, String dataJson, String language) {
        String lang = language != null ? language : "ko";
        if ("ko".equals(lang)) {
            if (reportType == ReportType.TEAM) {
                return "다음 데이터를 기반으로 팀 주간 보고서를 작성해 주세요.\n\n" + dataJson;
            }
            return "다음 데이터를 기반으로 이 사용자의 이번 주 활동을 자연어 서술형 보고서로 작성해 주세요.\n\n" + dataJson;
        }
        if (reportType == ReportType.TEAM) {
            return "Generate a team weekly report based on the following data.\n\n" + dataJson;
        }
        return "Generate a narrative weekly activity report for this user based on the following data.\n\n" + dataJson;
    }
}
