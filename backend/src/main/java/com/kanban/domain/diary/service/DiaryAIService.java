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
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.global.config.AIProvider;
import com.kanban.global.config.AIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiaryAIService {

    private final AIProvider aiProvider;
    private final DiaryMessageRepository diaryMessageRepository;
    private final BoardRepository boardRepository;
    private final TaskRepository taskRepository;
    private final MeetingRepository meetingRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final DailyChecklistRepository dailyChecklistRepository;

    @Value("${ai.provider:claude}")
    private String provider;

    @Value("${ai.claude.model.diary:claude-haiku-4-5-20251001}")
    private String claudeModel;

    @Value("${ai.openai.model.diary:gpt-4o-mini}")
    private String openaiModel;

    private String getModel() {
        return "openai".equals(provider) ? openaiModel : claudeModel;
    }

    // ============================
    // 대화형 AI 응답 생성
    // ============================

    private static final String CHAT_SYSTEM_PROMPT = """
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
            - 한국어로 대화하세요 (사용자가 다른 언어를 쓰면 그 언어에 맞춰주세요)
            - 절대 AI라는 것을 강조하지 마세요
            - 이모지는 가끔만 자연스럽게 사용하세요
            - "~하셨군요" 같은 딱딱한 존칭보다 "~했구나", "~인 거야?" 같은 편안한 반말도 OK (사용자 톤에 맞춰주세요)
            - 사용자의 감정을 먼저 수용한 후 질문하세요
            - 매 응답마다 하나의 후속 질문을 포함하세요
            </규칙>
            """;

    /**
     * 대화 맥락을 기반으로 AI 응답 생성
     */
    public String generateChatReply(DiaryEntry entry, String userMessage) {
        List<DiaryMessage> messages = diaryMessageRepository.findByDiaryIdOrderByMessageOrder(entry.getId());

        StringBuilder conversationContext = new StringBuilder();
        conversationContext.append("날짜: ").append(entry.getDiaryDate().format(DateTimeFormatter.ofPattern("yyyy년 M월 d일"))).append("\n\n");

        // 첫 대화 시 사용자의 하루 컨텍스트 포함
        int userMessageCount = (int) messages.stream().filter(m -> "USER".equals(m.getRole())).count() + 1;
        if (userMessageCount <= 3) {
            String dayContext = buildUserDayContext(entry.getUser().getId(), entry.getDiaryDate());
            if (!dayContext.isEmpty()) {
                conversationContext.append("=== 사용자의 오늘 일정/활동 (참고용, 자연스럽게 활용) ===\n");
                conversationContext.append(dayContext).append("\n\n");
            }
        }

        conversationContext.append("=== 대화 기록 ===\n");
        for (DiaryMessage msg : messages) {
            String role = "AI".equals(msg.getRole()) ? "AI" : "사용자";
            conversationContext.append(role).append(": ").append(msg.getContent()).append("\n");
        }

        // 현재 사용자 메시지 추가
        conversationContext.append("사용자: ").append(userMessage).append("\n\n");
        conversationContext.append("(현재 사용자 메시지 수: ").append(userMessageCount).append("회차)\n");
        conversationContext.append("위 대화에 이어서 자연스럽게 공감하고, 새로운 후속 질문을 해주세요.");

        try {
            String model = getModel();
            AIResponse result = aiProvider.chatWithUsage(CHAT_SYSTEM_PROMPT, conversationContext.toString(), model, 500);
            log.debug("Diary chat AI response generated for diary: {}, tokens: in={}, out={}",
                    entry.getId(), result.inputTokens(), result.outputTokens());
            return result.content();
        } catch (Exception e) {
            log.warn("AI chat reply failed for diary: {}, falling back to rule-based", entry.getId(), e);
            return generateFallbackReply(messages.size());
        }
    }

    // ============================
    // 사용자 하루 컨텍스트 수집
    // ============================

    /**
     * 사용자의 해당 날짜 일정/태스크/미팅/체크리스트 정보를 수집하여 문자열로 반환
     */
    private String buildUserDayContext(String userId, LocalDate date) {
        try {
            List<Board> boards = boardRepository.findByMemberId(userId);
            if (boards.isEmpty()) return "";

            List<String> boardIds = boards.stream().map(Board::getId).toList();
            StringBuilder context = new StringBuilder();

            // 1. 오늘 마감 태스크
            List<Task> todayTasks = taskRepository.findTodayTasksByBoardIds(boardIds);
            // 마감일이 해당 날짜인 것만 필터 (findTodayTasksByBoardIds는 CURRENT_DATE 기준이므로)
            if (date.equals(LocalDate.now()) && !todayTasks.isEmpty()) {
                context.append("[오늘 마감 태스크]\n");
                for (Task t : todayTasks) {
                    context.append("- ").append(t.getTitle());
                    if (t.getFeature() != null) {
                        context.append(" (").append(t.getFeature().getTitle()).append(")");
                    }
                    context.append("\n");
                }
                context.append("\n");
            }

            // 2. 미팅
            List<Meeting> allMeetings = new ArrayList<>();
            for (Board board : boards) {
                List<Meeting> meetings = meetingRepository.findByBoardIdAndMeetingDateOrderByStartTimeAsc(board.getId(), date);
                allMeetings.addAll(meetings);
            }
            if (!allMeetings.isEmpty()) {
                context.append("[오늘 미팅]\n");
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

            // 3. 스케줄 블록 (해당 유저의 일정)
            List<ScheduleBlock> allSchedules = new ArrayList<>();
            for (Board board : boards) {
                List<ScheduleBlock> blocks = scheduleBlockRepository
                        .findByBoardIdAndScheduledDateAndAssigneeIdOrderByStartTimeAsc(board.getId(), date, userId);
                allSchedules.addAll(blocks);
            }
            if (!allSchedules.isEmpty()) {
                context.append("[오늘 스케줄]\n");
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
                        context.append("미팅: ").append(sb.getMeeting().getTitle());
                    }
                    context.append("\n");
                }
                context.append("\n");
            }

            // 4. 데일리 체크리스트
            List<DailyChecklist> allChecklists = new ArrayList<>();
            for (Board board : boards) {
                List<DailyChecklist> checklists = dailyChecklistRepository
                        .findByBoardIdAndAssignedDateAndAssigneeIdWithDetailsOrderByPositionAsc(board.getId(), date, userId);
                allChecklists.addAll(checklists);
            }
            if (!allChecklists.isEmpty()) {
                context.append("[오늘 할 일 체크리스트]\n");
                for (DailyChecklist dc : allChecklists) {
                    boolean completed = dc.getChecklistItem() != null && Boolean.TRUE.equals(dc.getChecklistItem().getIsCompleted());
                    context.append(completed ? "- [완료] " : "- [미완료] ");
                    context.append(dc.getTitle());
                    if (dc.getChecklistItem() != null && dc.getChecklistItem().getTask() != null) {
                        context.append(" (").append(dc.getChecklistItem().getTask().getTitle()).append(")");
                    }
                    context.append("\n");
                }
                context.append("\n");
            }

            return context.toString().trim();
        } catch (Exception e) {
            log.warn("Failed to build user day context for diary, continuing without context", e);
            return "";
        }
    }

    // ============================
    // 일기 컨텐츠 AI 생성
    // ============================

    private static final String DIARY_SYSTEM_PROMPT = """
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

    /**
     * 대화 내용을 기반으로 AI 일기 컨텐츠 생성
     */
    public DiaryContent generateDiaryContent(DiaryEntry entry) {
        List<DiaryMessage> messages = diaryMessageRepository.findByDiaryIdOrderByMessageOrder(entry.getId());

        if (messages.isEmpty()) {
            return new DiaryContent(
                    entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기",
                    ""
            );
        }

        StringBuilder conversationContext = new StringBuilder();
        conversationContext.append("날짜: ").append(entry.getDiaryDate().format(DateTimeFormatter.ofPattern("yyyy년 M월 d일"))).append("\n\n");

        for (DiaryMessage msg : messages) {
            String role = "AI".equals(msg.getRole()) ? "AI" : "사용자";
            conversationContext.append(role).append(": ").append(msg.getContent()).append("\n");
        }

        conversationContext.append("\n위 대화를 바탕으로 이 날의 일기를 작성해주세요.");

        try {
            String model = getModel();
            AIResponse result = aiProvider.chatWithUsage(DIARY_SYSTEM_PROMPT, conversationContext.toString(), model, 1024);
            log.info("Diary content generated for diary: {}, tokens: in={}, out={}",
                    entry.getId(), result.inputTokens(), result.outputTokens());
            return parseDiaryContent(result.content(), entry);
        } catch (Exception e) {
            log.warn("AI diary content generation failed for diary: {}, falling back to compilation", entry.getId(), e);
            return fallbackCompile(entry, messages);
        }
    }

    // ============================
    // Helpers
    // ============================

    /**
     * AI 응답에서 제목과 본문을 파싱
     */
    private DiaryContent parseDiaryContent(String aiResponse, DiaryEntry entry) {
        if (aiResponse == null || aiResponse.isBlank()) {
            return new DiaryContent(
                    entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기",
                    ""
            );
        }

        String trimmed = aiResponse.trim();
        String title = null;
        String content = trimmed;

        // "제목: xxx" 패턴 파싱
        if (trimmed.startsWith("제목:") || trimmed.startsWith("제목 :")) {
            int titleEnd = trimmed.indexOf('\n');
            if (titleEnd > 0) {
                title = trimmed.substring(trimmed.indexOf(':') + 1, titleEnd).trim();
                content = trimmed.substring(titleEnd).trim();
            }
        }

        if (title == null || title.isBlank()) {
            title = entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기";
        }

        return new DiaryContent(title, content);
    }

    /**
     * AI 실패 시 폴백: 사용자 메시지를 이어붙임
     */
    private DiaryContent fallbackCompile(DiaryEntry entry, List<DiaryMessage> messages) {
        StringBuilder sb = new StringBuilder();
        for (DiaryMessage msg : messages) {
            if ("USER".equals(msg.getRole())) {
                sb.append(msg.getContent()).append("\n\n");
            }
        }
        return new DiaryContent(
                entry.getDiaryDate().format(DateTimeFormatter.ofPattern("M월 d일")) + "의 일기",
                sb.toString().trim()
        );
    }

    private static final String[] FALLBACK_REPLIES = {
            "그렇구나! 조금 더 자세히 이야기해줄 수 있어? 어떤 상황이었어?",
            "그때 어떤 기분이 들었어? 감정을 표현해본다면?",
            "그 일이 있기 전에는 어떤 하루를 보내고 있었어?",
            "혹시 오늘 만난 사람 중에 기억에 남는 사람이 있어?",
            "오늘 하루 중 스스로에게 해주고 싶은 말이 있다면?",
            "오늘 감사했던 일이 있었을까? 아주 작은 것이라도!",
            "내일은 어떤 하루가 되면 좋겠어?",
            "요즘 가장 많이 생각하는 건 뭐야?",
            "오늘 하루를 한 단어로 표현한다면 뭐라고 할 수 있을까?",
            "그 순간에 다시 돌아갈 수 있다면, 뭔가 다르게 하고 싶은 게 있어?",
    };

    /**
     * AI 실패 시 폴백 응답 (다양한 질문을 순환)
     */
    private String generateFallbackReply(int messageCount) {
        int index = Math.min(messageCount / 2, FALLBACK_REPLIES.length - 1);
        return FALLBACK_REPLIES[index];
    }

    /**
     * AI 생성 일기 컨텐츠 DTO
     */
    public record DiaryContent(String title, String content) {}
}
