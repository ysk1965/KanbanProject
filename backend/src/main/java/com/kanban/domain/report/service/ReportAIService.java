package com.kanban.domain.report.service;

import com.kanban.domain.report.ReportType;
import com.kanban.global.config.AIProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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

    public ReportAIService(AIProvider aiProvider) {
        this.aiProvider = aiProvider;
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
        String systemPrompt = buildSystemPrompt(reportType, language);
        String userPrompt = buildUserPrompt(reportType, dataJson, language);
        int maxTokens = reportType == ReportType.TEAM ? MAX_TOKENS_TEAM : MAX_TOKENS_PERSONAL;
        String model = reportType == ReportType.TEAM ? getTeamModel() : getPersonalModel();

        log.info("Generating {} report via AI provider (language: {})", reportType, language);
        return aiProvider.chat(systemPrompt, userPrompt, model, maxTokens);
    }

    public String generateStandupSummary(String dataJson, String language) {
        String lang = language != null ? language : "ko";
        String systemPrompt = buildStandupSystemPrompt(lang);
        String userPrompt = "ko".equals(lang)
                ? "다음 데이터를 기반으로 데일리 스탠드업 요약을 작성해 주세요.\n\n" + dataJson
                : "Generate a daily standup summary from the following data:\n\n" + dataJson;

        log.info("Generating standup summary via AI provider (language: {})", lang);
        return aiProvider.chat(systemPrompt, userPrompt, getStandupModel(), MAX_TOKENS_STANDUP);
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
                    각 태스크에서 데이터를 교차 분석하세요:
                    - 시간을 투입했는데 체크리스트가 진행되지 않았다면 → 댓글에서 원인을 찾으세요 (블로커, 재작업, 대기)
                    - 댓글에 다른 사람 언급, 스펙 변경, 이슈가 있다면 → 외부 의존성 또는 블로커로 표시
                    - 시간 분포가 불균일하다면 (며칠 0시간 후 급증) → 댓글 맥락으로 패턴 설명
                    - 태스크가 완료되고 체크리스트가 모두 달성됐다면 → 간단히 마무리 언급, 과도한 설명 불필요
                    - 댓글 내용에서 키워드를 추출하세요: 의사결정 대기("확인 부탁", "어떻게 할까요"), 이슈 보고("에러", "안 됩니다", "변경 필요"), 완료 보고("완료", "머지", "반영")
                    - 미팅이 있다면 태스크 진행과 연결하세요: 미팅 근처의 태스크 활동은 정렬 세션, 리뷰, 의사결정 포인트를 나타낼 수 있습니다. 메모 내용으로 서술을 풍부하게 만드세요.
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
        String writeInLang = "en".equals(lang)
                ? "Write in English."
                : "IMPORTANT: Write your ENTIRE response in " + langName + ". All headings, narratives, and the summary must be in " + langName + ".";

        return String.format("""
                You are a work analyst for the BRIDGE project management tool.
                You receive task-centric data grouped under features. Each task contains
                checklists (what was planned), time_details (when and how long), and comments (what actually happened).
                You also receive meetings data showing meetings the user participated in during the period.

                <role>
                Your job is NOT to summarize metrics. Simple counts and totals are already shown in the dashboard.
                Your job is to READ THE STORY of each task by cross-referencing these data sources,
                and write a narrative that answers: "What actually happened this week?"
                </role>

                <analysis_method>
                For each task, cross-reference the data sources:
                - If time was invested but checklists didn't progress → the comments likely explain why (blocker, rework, waiting on someone)
                - If comments mention other people, spec changes, or issues → flag as external dependency or blocker
                - If time distribution is uneven (e.g., 0h for days then a spike) → explain the pattern from comment context
                - If a task is marked completed with all checklists done → briefly note closure, don't over-explain
                - Read comment CONTENT to extract keywords: decision-waiting ("please confirm", "need input"), issue-reporting ("error", "doesn't work", "change needed"), completion ("done", "merged", "deployed")
                - If meetings exist, connect them to task progress: meetings near task activity may indicate alignment sessions, reviews, or decision points. Use memo content to enrich the narrative.
                </analysis_method>

                <output_format>
                %s Use markdown with the following structure strictly:

                1. Do NOT write a report title, period, or user name. That info is already displayed elsewhere.
                2. Group tasks by their parent feature. For each feature with meaningful activity:
                   ## Feature Name

                   ### Task Title 1
                   2-4 sentences of narrative prose.

                   ### Task Title 2
                   2-4 sentences of narrative prose.

                   ---

                   Place all tasks belonging to the same feature under one ## header.
                   Use the same structure even for features with a single task.
                   Place a --- divider between feature groups, not between tasks within a group.

                3. If meetings data exists and has meaningful content, add a section after feature groups:
                   ## Meetings
                   Brief narrative connecting meetings to work context (decisions made, alignment, reviews).
                   Only include if meetings have memos or are relevant to task progress.

                   ---

                4. After all sections, write the weekly summary as a blockquote:
                   > **This week in one line:** A single sentence capturing the overall theme.

                Do NOT list metrics like "completed 3/5 checklists" or "worked 12.5 hours total".
                Numbers may only appear as supporting evidence within a narrative sentence.
                Do NOT group tasks under status headers like "Completed" or "In Progress".
                Order feature groups by significance.
                </output_format>

                <rules>
                - Write ONLY based on the provided data. Never fabricate.
                - Convert minutes to hours when referencing time (e.g., "about 3 hours" not "180 minutes").
                - No bullet lists. Flowing prose only.
                - Skip tasks with zero activity (no time, no comments, no checklist changes).
                - Keep each task narrative to 2-4 sentences. Be concise.
                - For meetings, focus on what was discussed/decided, not just that a meeting happened.
                - Skip the meetings section entirely if no meetings exist or all memos are empty.
                </rules>""", writeInLang);
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
                    다음 데이터 차원을 교차 분석하세요:
                    - 피처의 진행률이 낮은데 시간 투입이 높다면 → 댓글에서 블로커, 재작업, 스코프 변경을 찾으세요
                    - 한 멤버가 높은 작업시간 대비 낮은 완료율이면 → 다른 멤버의 산출물에 블로킹되고 있는지 확인
                    - 마일스톤 상태가 AT_RISK라면 → 어떤 피처/멤버가 지연 체인을 일으키는지 추적
                    - stagnant_tasks나 stuck_checklists가 있다면 → 누가 누구를 블로킹하는지 인적 의존성 식별
                    - 댓글 내용에서 감지: 반복 주제, 팀 간 논의, 미해결 의사결정
                    - 멤버 간 작업량 분포 비교 → 노력이 균형적인지, 과부하/유휴 멤버가 있는지
                    - 미팅이 있다면 미팅의 역할을 분석하세요: 미팅이 업무 블로킹 해제로 이어졌는지? 특정 피처에 미팅이 집중되어 있는지? 참가자와 태스크 진행의 관계는?
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
                    - 간결하게: 400~700자.
                    </rules>""";
        }

        // Base English prompt - used for "en" and all other languages with a language instruction prefix
        String langName = getLanguageName(lang);
        String writeInLang = "en".equals(lang)
                ? "Write in English."
                : "IMPORTANT: Write your ENTIRE response in " + langName + ". All headings, narratives, and the summary must be in " + langName + ".";

        return String.format("""
                You are a team dynamics analyst for the BRIDGE project management tool.
                You receive team-wide data: member statistics, feature progress, milestone health,
                delayed items, bottleneck analysis, comments from the period, and meeting records.

                <role>
                Your job is NOT to repeat metrics. Totals, progress bars, and member stats are already shown
                in the dashboard above your report. Your job is to CONNECT THE DOTS between data points
                and surface insights that aren't visible from individual metrics alone.
                </role>

                <analysis_method>
                Cross-reference these data dimensions:
                - If a feature has low progress but high time investment → read comments for blockers, rework, or scope changes
                - If one member has high hours but low completion → check if their tasks are blocked by another member's deliverables
                - If milestone status is AT_RISK → trace which specific features/members are causing the delay chain
                - If stagnant_tasks or stuck_checklists exist → identify the human dependency (who is blocking whom)
                - Read comment content to detect: recurring themes, cross-team discussions, unresolved decisions
                - Compare member workload distribution → is effort balanced or is someone overloaded/underutilized?
                - If meetings exist, analyze their role: did meetings lead to decisions that unblocked work? Are meetings concentrated around certain features? Who participated and how does that relate to task progress?
                </analysis_method>

                <output_format>
                %s Use markdown with this structure strictly:

                1. Do NOT write a report title, period, or board name. Already displayed elsewhere.

                2. Write 2-4 insight sections using this pattern:
                   ### Insight Title
                   2-4 sentences of narrative connecting multiple data points.
                   Mention specific members, features, and tasks by name.

                   ---

                3. If there are risks or blockers, write a section:
                   ### Risks & Dependencies
                   Narrative about dependency chains, who is blocking whom, deadline risks.

                   ---

                4. End with a blockquote summary:
                   > **This week in one line:** A single sentence capturing the team's overall dynamic.

                Do NOT list metrics like "Team worked 45 hours" or "3 features completed".
                Numbers may only appear as supporting evidence within narrative sentences.
                Do NOT create sections like "Weekly Summary" or "Member Contributions" that just restate dashboard data.
                </output_format>

                <rules>
                - Write ONLY based on the provided data. Never fabricate.
                - Convert minutes to hours (e.g., "about 12 hours" not "720 minutes").
                - No bullet lists. Flowing prose only.
                - Mention team members by their actual names.
                - Focus on relationships between data, not individual data points.
                - Keep it concise: 400-700 words.
                </rules>""", writeInLang);
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
        String writeInLang = "en".equals(lang)
                ? "Write in English."
                : "IMPORTANT: Write your ENTIRE response in " + langName + ".";

        return String.format("""
                You are a daily standup summarizer for the BRIDGE project management tool.
                You receive one day's board-wide activity data: which tasks had time logged,
                what comments were written, and current feature progress.

                <role>
                Write a brief daily standup summary. Focus on:
                1. What was accomplished yesterday
                2. Any blockers or issues mentioned in comments
                3. Key tasks that received the most attention
                </role>

                <output_format>
                %s Use this structure:

                *Yesterday's Highlights*
                2-4 bullet points of key accomplishments, mentioning member names and tasks.

                *Active Discussions*
                1-2 bullet points about notable comments or decisions (skip if none).

                *Heads Up*
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
                </rules>""", writeInLang);
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
