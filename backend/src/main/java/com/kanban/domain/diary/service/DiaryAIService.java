package com.kanban.domain.diary.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.diary.DiaryEntry;
import com.kanban.domain.diary.DiaryMessage;
import com.kanban.domain.diary.DiaryMessageRepository;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.personal.*;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.monitoring.entity.AiUsageLog;
import com.kanban.domain.monitoring.repository.AiUsageLogRepository;
import com.kanban.domain.subscription.service.AiCreditService;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiaryAIService {

    private final AIProvider aiProvider;
    private final DiaryMessageRepository diaryMessageRepository;
    // Personal domain
    private final PersonalTaskRepository personalTaskRepository;
    private final PersonalHabitRepository personalHabitRepository;
    private final PersonalHabitLogRepository personalHabitLogRepository;
    private final PersonalEventRepository personalEventRepository;
    // Board domain
    private final BoardRepository boardRepository;
    private final TaskRepository taskRepository;
    private final MeetingRepository meetingRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiCreditService aiCreditService;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.diary:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.diary:gpt-4o-mini}")
    private String openaiModel;

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

    private String getModel() {
        return "openai".equals(provider) ? openaiModel : claudeModel;
    }

    private boolean isKorean(String language) {
        return language == null || language.startsWith("ko");
    }

    // ============================
    // 대화형 AI 응답 생성
    // ============================

    private static final String CHAT_SYSTEM_PROMPT_KO = """
            당신은 사용자의 하루를 기록해주는 따뜻하고 공감적인 AI 다이어리 파트너입니다.
            친한 친구처럼 편안하게 대화하며, 사용자의 하루를 자연스럽게 끌어내 주세요.

            <역할>
            - 사용자의 이야기에 진심으로 공감하고, 적절한 후속 질문으로 더 깊은 이야기를 유도하세요
            - 다양한 각도에서 하루를 탐색하세요: 사건, 감정, 사람, 생각, 감사한 일, 내일의 다짐 등
            - 매번 다른 질문을 하세요. 같은 질문을 반복하지 마세요
            - 답변은 2~3문장으로 자연스럽고 따뜻하게 하세요
            </역할>

            <대화 흐름 가이드>
            - 초반(1~2회): 하루의 주요 사건이나 분위기를 파악하는 열린 질문
            - 중반(3~4회): 구체적인 에피소드, 감정, 관계에 대해 깊이 들어가기
            - 후반(5회~): 성찰, 배운 점, 감사한 일, 내일에 대한 생각 등으로 확장
            - 사용자가 계속 이야기하고 싶어하면 새로운 주제로 자연스럽게 전환하세요
            - 절대 "일기 완성" 이나 "마무리" 를 직접 언급하지 마세요. 마무리는 사용자가 UI에서 결정합니다
            </대화 흐름 가이드>

            <사용자 컨텍스트 활용>
            - 사용자의 오늘 일정/스케줄/할 일 정보가 제공될 수 있습니다
            - 이 정보를 대화에 자연스럽게 활용하세요 (예: "오늘 미팅이 있었는데, 어떻게 됐어?")
            - 하지만 직접적으로 데이터를 나열하지 마세요. 자연스러운 대화 소재로만 활용하세요
            - 모든 일정을 다 물어보지 마세요. 하나씩 자연스럽게 꺼내세요
            - 사용자가 먼저 언급한 주제를 우선으로, 컨텍스트는 화제가 부족할 때 보조로 사용하세요
            </사용자 컨텍스트 활용>

            <규칙>
            - 한국어로 대화하세요
            - 절대 AI라는 것을 강조하지 마세요
            - 이모지는 가끔만 자연스럽게 사용하세요
            - "~하셨군요" 같은 딱딱한 존칭보다 "~했구나", "~인 거야?" 같은 편안한 반말도 OK (사용자 톤에 맞춰주세요)
            - 사용자의 감정을 먼저 수용한 후 질문하세요
            - 매 응답마다 하나의 후속 질문을 포함하세요
            </규칙>
            """;

    private String buildChatSystemPrompt(String language) {
        if (isKorean(language)) {
            return CHAT_SYSTEM_PROMPT_KO;
        }

        String langName = LANGUAGE_NAMES.getOrDefault(language, "English");
        return String.format("""
                You are a warm and empathetic AI diary partner who helps users record their day.
                Chat naturally like a close friend, gently drawing out their daily stories.

                CRITICAL LANGUAGE RULE: You MUST respond in %s. All your messages must be in %s.

                <role>
                - Genuinely empathize with the user's stories, and use follow-up questions to draw out deeper narratives
                - Explore the day from various angles: events, emotions, people, thoughts, things to be grateful for, tomorrow's plans
                - Ask different questions each time. Never repeat the same question
                - Keep responses to 2-3 sentences, natural and warm
                </role>

                <conversation_flow_guide>
                - Early (1-2 turns): Open questions to understand the day's main events or mood
                - Middle (3-4 turns): Dive deeper into specific episodes, emotions, relationships
                - Later (5+ turns): Expand to reflection, lessons learned, gratitude, thoughts about tomorrow
                - If the user wants to keep talking, naturally transition to new topics
                - NEVER mention "completing the diary" or "wrapping up". The user decides when to finish via the UI
                </conversation_flow_guide>

                <user_context_usage>
                - The user's schedule/tasks/events for the day may be provided
                - Use this naturally in conversation (e.g., "I see you had a meeting today, how did it go?")
                - Don't list the data directly. Use it only as natural conversation material
                - Don't ask about every schedule item. Bring them up one at a time naturally
                - Prioritize topics the user brings up first; use context as backup when conversation runs low
                </user_context_usage>

                <rules>
                - ALWAYS respond in %s
                - Never emphasize that you are an AI
                - Use emojis only occasionally and naturally
                - Match the user's tone — casual or formal
                - First acknowledge the user's emotions, then ask a question
                - Include one follow-up question in each response
                </rules>

                REMINDER: You MUST respond in %s. This is mandatory.
                """, langName, langName, langName, langName);
    }

    /**
     * 대화 맥락을 기반으로 AI 응답 생성
     */
    public String generateChatReply(DiaryEntry entry, String userMessage, String language) {
        // Consume user-level AI credit before processing
        aiCreditService.consumeUserCredit(entry.getUser().getId(), "DIARY_CHAT", 1);

        List<DiaryMessage> messages = diaryMessageRepository.findByDiaryIdOrderByMessageOrder(entry.getId());
        boolean ko = isKorean(language);

        StringBuilder conversationContext = new StringBuilder();
        if (ko) {
            conversationContext.append("날짜: ").append(entry.getDiaryDate().format(DateTimeFormatter.ofPattern("yyyy년 M월 d일"))).append("\n\n");
        } else {
            conversationContext.append("Date: ").append(entry.getDiaryDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))).append("\n\n");
        }

        // 첫 대화 시 사용자의 하루 컨텍스트 포함
        int userMessageCount = (int) messages.stream().filter(m -> "USER".equals(m.getRole())).count() + 1;
        if (userMessageCount <= 3) {
            String dayContext = buildUserDayContext(entry.getUser().getId(), entry.getDiaryDate(), ko);
            if (!dayContext.isEmpty()) {
                if (ko) {
                    conversationContext.append("=== 사용자의 오늘 일정/활동 (참고용, 자연스럽게 활용) ===\n");
                } else {
                    conversationContext.append("=== User's today schedule/activities (reference only, use naturally) ===\n");
                }
                conversationContext.append(dayContext).append("\n\n");
            }
        }

        if (ko) {
            conversationContext.append("=== 대화 기록 ===\n");
        } else {
            conversationContext.append("=== Conversation History ===\n");
        }
        for (DiaryMessage msg : messages) {
            String role = "AI".equals(msg.getRole()) ? "AI" : (ko ? "사용자" : "User");
            conversationContext.append(role).append(": ").append(msg.getContent()).append("\n");
        }

        // 현재 사용자 메시지 추가
        conversationContext.append(ko ? "사용자: " : "User: ").append(userMessage).append("\n\n");
        conversationContext.append(ko
                ? "(현재 사용자 메시지 수: " + userMessageCount + "회차)\n위 대화에 이어서 자연스럽게 공감하고, 새로운 후속 질문을 해주세요."
                : "(Current user message count: turn " + userMessageCount + ")\nContinue the conversation naturally with empathy and a new follow-up question.");

        try {
            String model = getModel();
            String systemPrompt = buildChatSystemPrompt(language);
            AIResponse result = aiProvider.chatWithUsage(systemPrompt, conversationContext.toString(), model, 500);
            log.debug("Diary chat AI response generated for diary: {}, tokens: in={}, out={}",
                    entry.getId(), result.inputTokens(), result.outputTokens());
            logAiUsage("DIARY_CHAT", model, null, entry.getUser().getId(), result);
            return result.content();
        } catch (Exception e) {
            log.warn("AI chat reply failed for diary: {}, falling back to rule-based", entry.getId(), e);
            return generateFallbackReply(messages.size(), language);
        }
    }

    // ============================
    // 사용자 하루 컨텍스트 수집
    // ============================

    private String buildUserDayContext(String userId, LocalDate date, boolean ko) {
        try {
            StringBuilder context = new StringBuilder();
            buildPersonalContext(context, userId, date, ko);
            buildBoardContext(context, userId, date, ko);
            return context.toString().trim();
        } catch (Exception e) {
            log.warn("Failed to build user day context for diary, continuing without context", e);
            return "";
        }
    }

    private void buildPersonalContext(StringBuilder context, String userId, LocalDate date, boolean ko) {
        // 1-1. 개인 할 일 (오늘 마감 + 진행중)
        List<PersonalTask> dueTasks = personalTaskRepository.findByUserIdAndDueDate(userId, date);
        List<PersonalTask> inProgressTasks = personalTaskRepository.findInProgressByUserId(userId);

        Set<String> dueTaskIds = dueTasks.stream().map(PersonalTask::getId).collect(Collectors.toSet());
        List<PersonalTask> extraInProgress = inProgressTasks.stream()
                .filter(t -> !dueTaskIds.contains(t.getId()))
                .toList();

        if (!dueTasks.isEmpty() || !extraInProgress.isEmpty()) {
            context.append(ko ? "[개인 할 일]\n" : "[Personal Tasks]\n");
            for (PersonalTask t : dueTasks) {
                String status = t.getStatus() == PersonalTaskStatus.DONE
                        ? (ko ? "완료" : "Done") : (ko ? "미완료" : "Pending");
                context.append("- [").append(status).append("] ").append(t.getTitle());
                if (t.getCategory() != null) {
                    context.append(" (").append(t.getCategory()).append(")");
                }
                context.append("\n");
            }
            for (PersonalTask t : extraInProgress) {
                context.append("- [").append(ko ? "진행중" : "In Progress").append("] ").append(t.getTitle());
                if (t.getDueDate() != null) {
                    context.append(ko ? " (마감: " : " (Due: ").append(t.getDueDate().format(DateTimeFormatter.ofPattern("M/d"))).append(")");
                }
                context.append("\n");
            }
            context.append("\n");
        }

        // 1-2. 오늘 습관
        List<PersonalHabit> activeHabits = personalHabitRepository.findActiveByUserId(userId);
        List<PersonalHabit> todayHabits = activeHabits.stream()
                .filter(h -> isHabitScheduledForDate(h, date))
                .toList();

        if (!todayHabits.isEmpty()) {
            List<String> habitIds = todayHabits.stream().map(PersonalHabit::getId).toList();
            List<PersonalHabitLog> todayLogs = personalHabitLogRepository.findByHabitIdsAndDate(habitIds, date);
            Map<String, PersonalHabitLog> logMap = todayLogs.stream()
                    .collect(Collectors.toMap(l -> l.getHabit().getId(), l -> l));

            context.append(ko ? "[오늘 습관]\n" : "[Today's Habits]\n");
            for (PersonalHabit h : todayHabits) {
                PersonalHabitLog log = logMap.get(h.getId());
                boolean completed = log != null && Boolean.TRUE.equals(log.getIsCompleted());
                context.append(completed ? (ko ? "- [완료] " : "- [Done] ") : (ko ? "- [미완료] " : "- [Pending] "));
                context.append(h.getTitle());
                if (h.getTargetCount() > 1 && log != null) {
                    context.append(" (").append(log.getCompletedCount()).append("/").append(h.getTargetCount());
                    if (h.getUnit() != null) context.append(h.getUnit());
                    context.append(")");
                }
                context.append("\n");
            }
            context.append("\n");
        }

        // 1-3. 오늘 캘린더 일정
        List<PersonalEvent> events = personalEventRepository.findByUserIdAndDate(userId, date);
        if (!events.isEmpty()) {
            context.append(ko ? "[오늘 일정]\n" : "[Today's Events]\n");
            for (PersonalEvent e : events) {
                context.append("- ");
                if (Boolean.TRUE.equals(e.getAllDay())) {
                    context.append(ko ? "[종일] " : "[All Day] ");
                } else if (e.getStartTime() != null) {
                    context.append(e.getStartTime().format(DateTimeFormatter.ofPattern("HH:mm")));
                    if (e.getEndTime() != null) {
                        context.append("~").append(e.getEndTime().format(DateTimeFormatter.ofPattern("HH:mm")));
                    }
                    context.append(" ");
                }
                context.append(e.getTitle()).append("\n");
            }
            context.append("\n");
        }
    }

    private void buildBoardContext(StringBuilder context, String userId, LocalDate date, boolean ko) {
        List<Board> boards = boardRepository.findByMemberId(userId);
        if (boards.isEmpty()) return;

        List<String> boardIds = boards.stream().map(Board::getId).toList();

        // 2-1. 보드 마감 태스크
        List<Task> dateTasks = taskRepository.findWeekTasksByBoardIds(boardIds, date, date);
        if (!dateTasks.isEmpty()) {
            context.append(ko ? "[협업 보드 - 오늘 마감 태스크]\n" : "[Board - Today's Due Tasks]\n");
            for (Task t : dateTasks) {
                context.append("- ").append(t.getTitle());
                if (t.getFeature() != null) {
                    context.append(" (").append(t.getFeature().getTitle()).append(")");
                }
                context.append("\n");
            }
            context.append("\n");
        }

        // 2-2. 보드 미팅
        List<Meeting> allMeetings = new ArrayList<>();
        for (Board board : boards) {
            allMeetings.addAll(meetingRepository.findByBoardIdAndMeetingDateOrderByStartTimeAsc(board.getId(), date));
        }
        if (!allMeetings.isEmpty()) {
            context.append(ko ? "[협업 보드 - 오늘 미팅]\n" : "[Board - Today's Meetings]\n");
            for (Meeting m : allMeetings) {
                context.append("- ").append(m.getTitle());
                if (m.getStartTime() != null) {
                    context.append(" (").append(m.getStartTime().format(DateTimeFormatter.ofPattern("HH:mm")));
                    if (m.getEndTime() != null) {
                        context.append("~").append(m.getEndTime().format(DateTimeFormatter.ofPattern("HH:mm")));
                    }
                    context.append(")");
                }
                context.append("\n");
            }
            context.append("\n");
        }

        // 2-3. 보드 스케줄 블록
        List<ScheduleBlock> allSchedules = new ArrayList<>();
        for (Board board : boards) {
            allSchedules.addAll(scheduleBlockRepository
                    .findByBoardIdAndScheduledDateAndAssigneeIdOrderByStartTimeAsc(board.getId(), date, userId));
        }
        if (!allSchedules.isEmpty()) {
            context.append(ko ? "[협업 보드 - 오늘 스케줄]\n" : "[Board - Today's Schedule]\n");
            for (ScheduleBlock sb : allSchedules) {
                context.append("- ");
                if (sb.getStartTime() != null) {
                    context.append(sb.getStartTime().format(DateTimeFormatter.ofPattern("HH:mm")));
                    if (sb.getEndTime() != null) {
                        context.append("~").append(sb.getEndTime().format(DateTimeFormatter.ofPattern("HH:mm")));
                    }
                    context.append(" ");
                }
                if (sb.getChecklistItem() != null) {
                    context.append(sb.getChecklistItem().getTitle());
                    if (sb.getChecklistItem().getTask() != null) {
                        context.append(" [").append(sb.getChecklistItem().getTask().getTitle()).append("]");
                    }
                } else if (sb.getMeeting() != null) {
                    context.append(ko ? "미팅: " : "Meeting: ").append(sb.getMeeting().getTitle());
                }
                context.append("\n");
            }
            context.append("\n");
        }

        // 2-4. 보드 데일리 체크리스트
        List<DailyChecklist> allChecklists = new ArrayList<>();
        for (Board board : boards) {
            allChecklists.addAll(dailyChecklistRepository
                    .findByBoardIdAndAssignedDateAndAssigneeIdWithDetailsOrderByPositionAsc(board.getId(), date, userId));
        }
        if (!allChecklists.isEmpty()) {
            context.append(ko ? "[협업 보드 - 오늘 체크리스트]\n" : "[Board - Today's Checklist]\n");
            for (DailyChecklist dc : allChecklists) {
                boolean completed = dc.getChecklistItem() != null && Boolean.TRUE.equals(dc.getChecklistItem().getIsCompleted());
                context.append(completed ? (ko ? "- [완료] " : "- [Done] ") : (ko ? "- [미완료] " : "- [Pending] "));
                context.append(dc.getTitle());
                if (dc.getChecklistItem() != null && dc.getChecklistItem().getTask() != null) {
                    context.append(" (").append(dc.getChecklistItem().getTask().getTitle()).append(")");
                }
                context.append("\n");
            }
            context.append("\n");
        }
    }

    private boolean isHabitScheduledForDate(PersonalHabit habit, LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        int jsDay = dow == DayOfWeek.SUNDAY ? 0 : dow.getValue();

        return switch (habit.getFrequencyType()) {
            case DAILY -> true;
            case WEEKDAY -> jsDay >= 1 && jsDay <= 5;
            case WEEKEND -> jsDay == 0 || jsDay == 6;
            case CUSTOM -> {
                String days = habit.getFrequencyDays();
                if (days == null || days.isBlank()) yield true;
                yield Arrays.stream(days.split(","))
                        .map(String::trim)
                        .mapToInt(Integer::parseInt)
                        .anyMatch(d -> d == jsDay);
            }
        };
    }

    // ============================
    // 일기 컨텐츠 AI 생성
    // ============================

    private static final String DIARY_SYSTEM_PROMPT_KO = """
            당신은 대화 내용을 바탕으로 자연스러운 일기를 작성해주는 AI입니다.

            <규칙>
            - 사용자와 AI의 대화를 분석하여 하루의 이야기를 일기 형식으로 정리하세요
            - 1인칭 시점(나/저)으로 작성하세요
            - 시간순으로 자연스럽게 흘러가는 일기를 쓰세요
            - 사용자가 표현한 감정과 경험을 살려서 작성하세요
            - 문학적이지 않고 솔직하고 자연스러운 톤을 유지하세요
            - 대화에서 언급되지 않은 내용을 지어내지 마세요
            - 분량은 200~500자 내외로 작성하세요
            - 마크다운이나 특수 서식 없이 순수 텍스트로 작성하세요
            - 제목도 함께 생성하세요 (한 줄, 15자 이내)
            </규칙>

            <출력 형식>
            제목: (일기 제목)

            (일기 본문)
            </출력 형식>
            """;

    private String buildDiarySystemPrompt(String language) {
        if (isKorean(language)) {
            return DIARY_SYSTEM_PROMPT_KO;
        }

        String langName = LANGUAGE_NAMES.getOrDefault(language, "English");
        return String.format("""
                You are an AI that writes natural diary entries based on conversation content.

                CRITICAL LANGUAGE RULE: You MUST write the entire diary in %s.

                <rules>
                - Analyze the conversation between user and AI, and organize the day's story into diary format
                - Write in first person (I/me)
                - Write in natural chronological flow
                - Preserve the emotions and experiences the user expressed
                - Keep a honest, natural tone — not literary
                - Never fabricate content not mentioned in the conversation
                - Keep the length around 100-300 words
                - Write in plain text without markdown or special formatting
                - Generate a title too (one line, under 10 words)
                </rules>

                <output_format>
                Title: (diary title in %s)

                (diary body in %s)
                </output_format>

                REMINDER: The entire diary (title and body) MUST be in %s. This is mandatory.
                """, langName, langName, langName, langName);
    }

    /**
     * 대화 내용을 기반으로 AI 일기 컨텐츠 생성
     */
    public DiaryContent generateDiaryContent(DiaryEntry entry, String language) {
        // Consume user-level AI credit before processing
        aiCreditService.consumeUserCredit(entry.getUser().getId(), "DIARY_GENERATE", 1);

        List<DiaryMessage> messages = diaryMessageRepository.findByDiaryIdOrderByMessageOrder(entry.getId());
        boolean ko = isKorean(language);

        if (messages.isEmpty()) {
            return new DiaryContent(
                    ko ? entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기"
                       : "Diary — " + entry.getDiaryDate().format(DateTimeFormatter.ofPattern("MMM d")),
                    ""
            );
        }

        StringBuilder conversationContext = new StringBuilder();
        if (ko) {
            conversationContext.append("날짜: ").append(entry.getDiaryDate().format(DateTimeFormatter.ofPattern("yyyy년 M월 d일"))).append("\n\n");
        } else {
            conversationContext.append("Date: ").append(entry.getDiaryDate().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))).append("\n\n");
        }

        for (DiaryMessage msg : messages) {
            String role = "AI".equals(msg.getRole()) ? "AI" : (ko ? "사용자" : "User");
            conversationContext.append(role).append(": ").append(msg.getContent()).append("\n");
        }

        conversationContext.append(ko
                ? "\n위 대화를 바탕으로 이 날의 일기를 작성해주세요."
                : "\nBased on the conversation above, write a diary entry for this day.");

        try {
            String model = getModel();
            String systemPrompt = buildDiarySystemPrompt(language);
            AIResponse result = aiProvider.chatWithUsage(systemPrompt, conversationContext.toString(), model, 1024);
            log.info("Diary content generated for diary: {}, tokens: in={}, out={}",
                    entry.getId(), result.inputTokens(), result.outputTokens());
            logAiUsage("DIARY_GENERATE", model, null, entry.getUser().getId(), result);
            return parseDiaryContent(result.content(), entry, ko);
        } catch (Exception e) {
            log.warn("AI diary content generation failed for diary: {}, falling back to compilation", entry.getId(), e);
            return fallbackCompile(entry, messages, ko);
        }
    }

    // ============================
    // Helpers
    // ============================

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

    private DiaryContent parseDiaryContent(String aiResponse, DiaryEntry entry, boolean ko) {
        if (aiResponse == null || aiResponse.isBlank()) {
            return new DiaryContent(
                    ko ? entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기"
                       : "Diary — " + entry.getDiaryDate().format(DateTimeFormatter.ofPattern("MMM d")),
                    ""
            );
        }

        String trimmed = aiResponse.trim();
        String title = null;
        String content = trimmed;

        // "제목: xxx" or "Title: xxx" 패턴 파싱
        if (trimmed.startsWith("제목:") || trimmed.startsWith("제목 :")) {
            int titleEnd = trimmed.indexOf('\n');
            if (titleEnd > 0) {
                title = trimmed.substring(trimmed.indexOf(':') + 1, titleEnd).trim();
                content = trimmed.substring(titleEnd).trim();
            }
        } else if (trimmed.startsWith("Title:") || trimmed.startsWith("Title :")) {
            int titleEnd = trimmed.indexOf('\n');
            if (titleEnd > 0) {
                title = trimmed.substring(trimmed.indexOf(':') + 1, titleEnd).trim();
                content = trimmed.substring(titleEnd).trim();
            }
        }

        if (title == null || title.isBlank()) {
            title = ko ? entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기"
                       : "Diary — " + entry.getDiaryDate().format(DateTimeFormatter.ofPattern("MMM d"));
        }

        return new DiaryContent(title, content);
    }

    private DiaryContent fallbackCompile(DiaryEntry entry, List<DiaryMessage> messages, boolean ko) {
        StringBuilder sb = new StringBuilder();
        for (DiaryMessage msg : messages) {
            if ("USER".equals(msg.getRole())) {
                sb.append(msg.getContent()).append("\n\n");
            }
        }
        return new DiaryContent(
                ko ? entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기"
                   : "Diary — " + entry.getDiaryDate().format(DateTimeFormatter.ofPattern("MMM d")),
                sb.toString().trim()
        );
    }

    private static final String[] FALLBACK_REPLIES_KO = {
            "그렇구나! 조금 더 자세히 이야기해줄 수 있어? 어떤 상황이었어?",
            "그때 어떤 기분이 들었어? 감정을 표현해본다면?",
            "그 일이 있기 전에는 어떤 하루를 보내고 있었어?",
            "혹시 오늘 만난 사람 중에 기억에 남는 사람이 있어?",
            "오늘 하루 중 나 자신에게 해주고 싶은 말이 있다면?",
            "오늘 감사했던 일이 있었을까? 아주 작은 것이라도!",
            "내일은 어떤 하루가 되면 좋겠어?",
            "요즘 가장 많이 생각하는 건 뭐야?",
            "오늘 하루를 한 단어로 표현한다면 뭐라고 할 수 있을까?",
            "그 순간에 다시 돌아갈 수 있다면, 뭔가 다르게 하고 싶은 게 있어?",
    };

    private static final String[] FALLBACK_REPLIES_EN = {
            "I see! Can you tell me more about that? What was the situation like?",
            "How did that make you feel? Can you put your emotions into words?",
            "Before that happened, how was the rest of your day going?",
            "Was there anyone you met today who left a lasting impression?",
            "If you could say something to yourself about today, what would it be?",
            "Was there anything you felt grateful for today? Even something small!",
            "What kind of day do you hope tomorrow will be?",
            "What's been on your mind the most lately?",
            "If you could describe today in one word, what would it be?",
            "If you could go back to that moment, would you do anything differently?",
    };

    private String generateFallbackReply(int messageCount, String language) {
        String[] replies = isKorean(language) ? FALLBACK_REPLIES_KO : FALLBACK_REPLIES_EN;
        int index = Math.min(messageCount / 2, replies.length - 1);
        return replies[index];
    }

    /**
     * AI 생성 일기 컨텐츠 DTO
     */
    public record DiaryContent(String title, String content) {}
}
