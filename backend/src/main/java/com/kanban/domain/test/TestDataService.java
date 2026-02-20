package com.kanban.domain.test;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.BlockType;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardRole;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.comment.Comment;
import com.kanban.domain.comment.CommentRepository;
import com.kanban.domain.feature.Feature;
import com.kanban.domain.meeting.Meeting;
import com.kanban.domain.meeting.MeetingRepository;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
import com.kanban.domain.subscription.BillingCycle;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.tag.TagRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TestDataService {

    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final BlockRepository blockRepository;
    private final FeatureRepository featureRepository;
    private final TaskRepository taskRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final ScheduleBlockRepository scheduleBlockRepository;
    private final TagRepository tagRepository;
    private final UserRepository userRepository;
    private final MilestoneRepository milestoneRepository;
    private final MilestoneFeatureRepository milestoneFeatureRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final CommentRepository commentRepository;
    private final MeetingRepository meetingRepository;
    private final ReportRepository reportRepository;

    private final Random random = new Random();

    private static final String SHARED_TEST_BOARD_NAME = "BRIDGE SPOTS Example";

    @Transactional
    public TestDataResponse createTestBoard(String userId) {
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 공용 테스트 보드가 이미 있는지 확인
        Optional<Board> existingBoard = boardRepository.findByName(SHARED_TEST_BOARD_NAME);

        if (existingBoard.isPresent()) {
            return joinExistingTestBoard(existingBoard.get(), currentUser);
        } else {
            return createNewTestBoard(currentUser);
        }
    }

    /**
     * 기존 공용 테스트 보드에 멤버로 참여
     */
    private TestDataResponse joinExistingTestBoard(Board board, User user) {
        // 이미 멤버인지 확인
        boolean isMember = boardMemberRepository.existsByBoardIdAndUserId(board.getId(), user.getId());

        if (!isMember) {
            // 멤버로 추가
            BoardMember newMember = BoardMember.builder()
                    .board(board)
                    .user(user)
                    .role(BoardRole.MEMBER)
                    .invitedBy(board.getOwner())
                    .build();
            boardMemberRepository.saveAndFlush(newMember);
            log.info("Added user {} as member to shared test board {}", user.getId(), board.getId());
        }

        // 현재 보드 통계 조회
        long memberCount = boardMemberRepository.countByBoardId(board.getId());
        long featureCount = featureRepository.countByBoardId(board.getId());
        long taskCount = taskRepository.countByBoardId(board.getId());
        long checklistCount = checklistItemRepository.countByTaskBoardId(board.getId());
        long scheduleCount = scheduleBlockRepository.countByBoardId(board.getId());

        String message = isMember
                ? "이미 테스트 보드의 멤버입니다. 보드로 이동합니다."
                : "테스트 보드에 멤버로 추가되었습니다!";

        return TestDataResponse.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .memberCount((int) memberCount)
                .featureCount((int) featureCount)
                .taskCount((int) taskCount)
                .checklistItemCount((int) checklistCount)
                .scheduleBlockCount((int) scheduleCount)
                .message(message)
                .build();
    }

    /**
     * 새 공용 테스트 보드 생성 (최초 1회만 실행됨)
     */
    private TestDataResponse createNewTestBoard(User owner) {
        // 1. 테스트 보드 생성
        Board board = Board.builder()
                .name(SHARED_TEST_BOARD_NAME)
                .description("팀 협업 및 통계 기능을 테스트하기 위한 공용 프로젝트 보드입니다. 모든 유저가 접근할 수 있습니다.")
                .owner(owner)
                .workHoursPerDay(10)
                .workStartTime(LocalTime.of(9, 0))
                .build();
        boardRepository.saveAndFlush(board);
        log.info("Created shared test board: {}", board.getId());

        // 2. Premium 구독 생성
        createPremiumSubscription(board);

        // 3. 테스트 멤버 생성
        List<User> members = createTestMembers(owner);

        // 4. 보드 멤버 추가
        for (int i = 0; i < members.size(); i++) {
            User member = members.get(i);
            if (!member.getId().equals(owner.getId())) {
                BoardMember boardMember = BoardMember.builder()
                        .board(board)
                        .user(member)
                        .role(i == 1 ? BoardRole.ADMIN : BoardRole.MEMBER)
                        .invitedBy(owner)
                        .build();
                boardMemberRepository.saveAndFlush(boardMember);
            }
        }
        // Owner도 멤버로 추가
        BoardMember ownerMember = BoardMember.builder()
                .board(board)
                .user(owner)
                .role(BoardRole.OWNER)
                .build();
        boardMemberRepository.saveAndFlush(ownerMember);

        // 5. 블록 생성 (기본 + 커스텀)
        List<Block> blocks = createBlocks(board);

        // 6. 태그 생성
        List<Tag> tags = createTags(board);

        // 7. 마일스톤 생성
        List<Milestone> milestones = createMilestones(board, owner);

        // 8. Feature 생성
        List<Feature> features = createFeatures(board, owner, members, tags);

        // 9. 마일스톤에 Feature 연결
        linkFeaturesToMilestones(milestones, features);

        // 10. Task 생성
        List<Task> tasks = createTasks(board, features, owner, members, tags, blocks);

        // 11. Checklist Items 생성
        List<ChecklistItem> checklistItems = createChecklistItems(tasks, members);

        // 12. Schedule Blocks 생성 (최근 30일치 데이터)
        List<ScheduleBlock> scheduleBlocks = createScheduleBlocksForStatistics(board, checklistItems, members);

        // 13. Comments 생성 (이번 주 활동 데이터)
        List<Comment> comments = createComments(board, tasks, members);

        // 14. Meetings 생성 (회의록 데이터)
        List<Meeting> meetings = createMeetings(board, members);

        // 15. Meeting ScheduleBlocks 생성 (회의 참석자 연결)
        List<ScheduleBlock> meetingScheduleBlocks = createMeetingScheduleBlocks(board, meetings, members);

        // 16. AI 보고서 생성
        List<WeeklyReport> reports = createReports(board, members);

        return TestDataResponse.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .memberCount(members.size())
                .featureCount(features.size())
                .taskCount(tasks.size())
                .checklistItemCount(checklistItems.size())
                .scheduleBlockCount(scheduleBlocks.size() + meetingScheduleBlocks.size())
                .commentCount(comments.size())
                .meetingCount(meetings.size())
                .reportCount(reports.size())
                .message("공용 테스트 보드가 성공적으로 생성되었습니다! (Premium 활성화, 마일스톤 " + milestones.size() + "개, 회의록 " + meetings.size() + "개, AI 보고서 " + reports.size() + "개 포함)")
                .build();
    }

    private void createPremiumSubscription(Board board) {
        Subscription subscription = Subscription.builder()
                .board(board)
                .status(SubscriptionStatus.ACTIVE)
                .plan("PREMIUM")
                .billingCycle(BillingCycle.YEARLY)
                .pricePerSeat(5000)
                .seatCount(5)
                .price(25000)
                .currentPeriodStart(LocalDateTime.now(ZoneOffset.UTC))
                .currentPeriodEnd(LocalDateTime.now(ZoneOffset.UTC).plusYears(1))
                .billableMemberCount(5)
                .build();
        subscriptionRepository.saveAndFlush(subscription);
        log.info("Created Premium subscription for board: {}", board.getId());
    }

    private List<User> createTestMembers(User owner) {
        List<User> members = new ArrayList<>();
        members.add(owner);

        String[] names = {"김철수", "이영희", "박민수", "정다은", "최준혁"};
        String[] emails = {"testuser1@bridge.com", "testuser2@bridge.com", "testuser3@bridge.com", "testuser4@bridge.com", "testuser5@bridge.com"};

        for (int i = 0; i < names.length; i++) {
            User existing = userRepository.findByEmail(emails[i]).orElse(null);
            if (existing != null) {
                members.add(existing);
            } else {
                User newUser = User.builder()
                        .id(UUID.randomUUID().toString())
                        .email(emails[i])
                        .name(names[i])
                        .passwordHash("$2a$10$dummyhashedpassword")
                        .build();
                userRepository.saveAndFlush(newUser);
                members.add(newUser);
            }
        }

        return members;
    }

    private List<Block> createBlocks(Board board) {
        List<Block> blocks = new ArrayList<>();

        // Feature 블록
        Block featureBlock = Block.builder()
                .board(board)
                .name("Feature")
                .type(BlockType.FIXED)
                .fixedType(FixedBlockType.FEATURE)
                .position(0)
                .build();
        blocks.add(featureBlock);

        // Task 블록
        Block taskBlock = Block.builder()
                .board(board)
                .name("Task")
                .type(BlockType.FIXED)
                .fixedType(FixedBlockType.TASK)
                .position(1)
                .build();
        blocks.add(taskBlock);

        // 커스텀 블록: In Progress
        Block inProgressBlock = Block.builder()
                .board(board)
                .name("In Progress")
                .color("#f59e0b")
                .type(BlockType.CUSTOM)
                .position(2)
                .build();
        blocks.add(inProgressBlock);

        // 커스텀 블록: Review
        Block reviewBlock = Block.builder()
                .board(board)
                .name("Review")
                .color("#8b5cf6")
                .type(BlockType.CUSTOM)
                .position(3)
                .build();
        blocks.add(reviewBlock);

        // Done 블록
        Block doneBlock = Block.builder()
                .board(board)
                .name("Done")
                .type(BlockType.FIXED)
                .fixedType(FixedBlockType.DONE)
                .position(4)
                .build();
        blocks.add(doneBlock);

        blockRepository.saveAllAndFlush(blocks);

        return blocks;
    }

    private List<Tag> createTags(Board board) {
        List<Tag> tags = new ArrayList<>();

        String[][] tagData = {
                {"버그", "#ef4444"},
                {"기능개선", "#3b82f6"},
                {"긴급", "#f97316"},
                {"문서화", "#8b5cf6"},
                {"UI/UX", "#ec4899"},
                {"Backend", "#10b981"},
                {"Frontend", "#6366f1"},
                {"DevOps", "#14b8a6"}
        };

        for (String[] data : tagData) {
            Tag tag = Tag.builder()
                    .board(board)
                    .name(data[0])
                    .color(data[1])
                    .build();
            tags.add(tag);
        }

        tagRepository.saveAllAndFlush(tags);

        return tags;
    }

    private List<Milestone> createMilestones(Board board, User createdBy) {
        List<Milestone> milestones = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 마일스톤 1: 완료된 마일스톤 (100% 달성)
        Milestone milestone1 = Milestone.builder()
                .board(board)
                .title("Sprint 1 - MVP 완료")
                .description("핵심 MVP 기능 개발 완료. 사용자 인증, 기본 대시보드, 칸반 보드 구현")
                .startDate(today.minusDays(45))
                .endDate(today.minusDays(25))
                .createdBy(createdBy)
                .build();
        milestones.add(milestone1);

        // 마일스톤 2: 순조롭게 진행 중 (ON_TRACK - 70% 완료, 7일 남음)
        Milestone milestone2 = Milestone.builder()
                .board(board)
                .title("Sprint 2 - 협업 기능")
                .description("팀 협업 및 실시간 알림 기능 개발. 댓글, 멘션, 실시간 업데이트")
                .startDate(today.minusDays(14))
                .endDate(today.plusDays(7))
                .createdBy(createdBy)
                .build();
        milestones.add(milestone2);

        // 마일스톤 3: 위험 상태 (AT_RISK - 30% 완료, 3일 남음)
        Milestone milestone3 = Milestone.builder()
                .board(board)
                .title("Sprint 3 - 스케줄 관리")
                .description("일일/주간 스케줄 뷰 및 타임블록 기능. 드래그앤드롭 스케줄링")
                .startDate(today.minusDays(10))
                .endDate(today.plusDays(3))
                .createdBy(createdBy)
                .build();
        milestones.add(milestone3);

        // 마일스톤 4: 지연됨 (OVERDUE - 50% 완료, 마감 2일 초과)
        Milestone milestone4 = Milestone.builder()
                .board(board)
                .title("Sprint 4 - 통계 대시보드")
                .description("생산성 분석 및 차트 시각화. 팀/개인 통계, 번다운 차트")
                .startDate(today.minusDays(21))
                .endDate(today.minusDays(2))
                .createdBy(createdBy)
                .build();
        milestones.add(milestone4);

        // 마일스톤 5: 예정된 마일스톤
        Milestone milestone5 = Milestone.builder()
                .board(board)
                .title("Sprint 5 - 고급 기능")
                .description("마일스톤 관리, 설정 페이지, 알림 시스템 고도화")
                .startDate(today.plusDays(8))
                .endDate(today.plusDays(28))
                .createdBy(createdBy)
                .build();
        milestones.add(milestone5);

        milestoneRepository.saveAllAndFlush(milestones);
        log.info("Created {} milestones", milestones.size());
        return milestones;
    }

    private List<Feature> createFeatures(Board board, User createdBy, List<User> members, List<Tag> tags) {
        List<Feature> features = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // Feature 데이터: title, description, color, dueDate offset
        // Milestone 1 (완료됨): Feature 0-2 (100% 완료)
        // Milestone 2 (ON_TRACK): Feature 3-4 (70% 완료)
        // Milestone 3 (AT_RISK): Feature 5-6 (30% 완료)
        // Milestone 4 (OVERDUE): Feature 7-8 (50% 완료)
        // Milestone 5 (예정): Feature 9-10 (0% 완료)

        Object[][] featureData = {
                // Sprint 1 - 완료된 Feature들
                {"사용자 인증 시스템", "로그인, 회원가입, OAuth 연동 구현", "#3b82f6", -30},
                {"기본 대시보드", "메인 대시보드 화면 및 보드 목록", "#10b981", -28},
                {"칸반 보드 기본", "드래그앤드롭 칸반 보드 기본 구현", "#8b5cf6", -26},

                // Sprint 2 - 진행 중 (ON_TRACK)
                {"실시간 알림", "웹소켓 기반 실시간 알림 시스템", "#ec4899", 5},
                {"댓글 시스템", "태스크/피처 댓글 및 멘션 기능", "#f472b6", 6},

                // Sprint 3 - 위험 상태 (AT_RISK)
                {"일일 스케줄 뷰", "하루 단위 타임블록 스케줄 뷰", "#f59e0b", 2},
                {"주간 스케줄 뷰", "주 단위 스케줄 뷰 및 드래그 조정", "#fbbf24", 3},

                // Sprint 4 - 지연됨 (OVERDUE) - 마감일이 과거
                {"생산성 통계", "팀/개인 생산성 분석 대시보드", "#6366f1", -5},
                {"번다운 차트", "마일스톤 진행률 시각화 차트", "#818cf8", -3},

                // Sprint 5 - 예정됨
                {"마일스톤 관리", "프로젝트 마일스톤 및 진행률 추적", "#14b8a6", 25},
                {"설정 페이지", "사용자 설정 및 알림 관리", "#64748b", 28}
        };

        for (int i = 0; i < featureData.length; i++) {
            Object[] data = featureData[i];
            Feature feature = Feature.builder()
                    .board(board)
                    .title((String) data[0])
                    .description((String) data[1])
                    .color((String) data[2])
                    .assignee(members.get(i % members.size()))
                    .position(i)
                    .dueDate(today.plusDays((Integer) data[3]))
                    .createdBy(createdBy)
                    .build();
            features.add(feature);
        }

        featureRepository.saveAllAndFlush(features);
        log.info("Created {} features", features.size());
        return features;
    }

    private void linkFeaturesToMilestones(List<Milestone> milestones, List<Feature> features) {
        List<MilestoneFeature> allLinks = new ArrayList<>();

        // 마일스톤 1 (완료됨): Feature 0, 1, 2
        for (int i = 0; i < 3 && i < features.size(); i++) {
            allLinks.add(MilestoneFeature.create(milestones.get(0), features.get(i)));
        }

        // 마일스톤 2 (ON_TRACK): Feature 3, 4
        for (int i = 3; i < 5 && i < features.size(); i++) {
            allLinks.add(MilestoneFeature.create(milestones.get(1), features.get(i)));
        }

        // 마일스톤 3 (AT_RISK): Feature 5, 6
        for (int i = 5; i < 7 && i < features.size(); i++) {
            allLinks.add(MilestoneFeature.create(milestones.get(2), features.get(i)));
        }

        // 마일스톤 4 (OVERDUE): Feature 7, 8
        for (int i = 7; i < 9 && i < features.size(); i++) {
            allLinks.add(MilestoneFeature.create(milestones.get(3), features.get(i)));
        }

        // 마일스톤 5 (예정): Feature 9, 10
        for (int i = 9; i < 11 && i < features.size(); i++) {
            allLinks.add(MilestoneFeature.create(milestones.get(4), features.get(i)));
        }

        milestoneFeatureRepository.saveAllAndFlush(allLinks);
        log.info("Linked features to milestones");
    }

    private List<Task> createTasks(Board board, List<Feature> features, User createdBy, List<User> members, List<Tag> tags, List<Block> blocks) {
        List<Task> tasks = new ArrayList<>();
        LocalDate today = LocalDate.now();

        Block taskBlock = blocks.stream()
                .filter(b -> b.getFixedType() == FixedBlockType.TASK)
                .findFirst().orElse(blocks.get(1));

        Block inProgressBlock = blocks.stream()
                .filter(b -> "In Progress".equals(b.getName()))
                .findFirst().orElse(taskBlock);

        Block reviewBlock = blocks.stream()
                .filter(b -> "Review".equals(b.getName()))
                .findFirst().orElse(taskBlock);

        Block doneBlock = blocks.stream()
                .filter(b -> b.getFixedType() == FixedBlockType.DONE)
                .findFirst().orElse(blocks.get(blocks.size() - 1));

        // Feature별 Task 생성 - 각 마일스톤의 상태에 맞게 진행률 조정
        // Feature 0-2: 100% 완료 (모두 Done)
        // Feature 3-4: 70% 완료 (대부분 Done, 일부 In Progress/Review)
        // Feature 5-6: 30% 완료 (일부 Done, 대부분 Task/In Progress)
        // Feature 7-8: 50% 완료 (반반)
        // Feature 9-10: 0% 완료 (모두 Task)

        String[][] taskTemplates = {
                {"API 설계", "DB 스키마", "백엔드 구현", "프론트 연동", "테스트 작성"},
                {"UI 디자인", "컴포넌트 개발", "스타일링", "반응형 대응", "코드 리뷰"},
                {"요구사항 분석", "설계 검토", "핵심 로직 구현", "에러 핸들링", "문서화"},
                {"프로토타입", "사용성 테스트", "피드백 반영", "성능 최적화", "배포 준비"}
        };

        int taskPosition = 0;

        for (int fi = 0; fi < features.size(); fi++) {
            Feature feature = features.get(fi);
            String[] templates = taskTemplates[fi % taskTemplates.length];
            int taskCount = 4 + random.nextInt(2); // 4-5개 고정

            // Feature 인덱스에 따른 완료율 결정
            double completionRate;
            if (fi < 3) completionRate = 1.0;       // Sprint 1: 100%
            else if (fi < 5) completionRate = 0.7;  // Sprint 2: 70%
            else if (fi < 7) completionRate = 0.3;  // Sprint 3: 30%
            else if (fi < 9) completionRate = 0.5;  // Sprint 4: 50%
            else completionRate = 0.0;              // Sprint 5: 0%

            for (int ti = 0; ti < taskCount && ti < templates.length; ti++) {
                // 블록 결정: 완료율에 따라 분배
                Block block;
                boolean isCompleted = false;
                LocalDateTime updatedAt = LocalDateTime.now(ZoneOffset.UTC);

                double taskProgress = (double) ti / taskCount;
                if (taskProgress < completionRate) {
                    // 완료된 Task
                    block = doneBlock;
                    isCompleted = true;
                    updatedAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(random.nextInt(14) + 1);
                } else if (taskProgress < completionRate + 0.2) {
                    // Review 중
                    block = reviewBlock;
                    updatedAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(random.nextInt(3));
                } else if (taskProgress < completionRate + 0.4) {
                    // In Progress - 일부는 정체된 상태 (stagnant)
                    block = inProgressBlock;
                    // 30% 확률로 7일 이상 정체
                    if (random.nextDouble() < 0.3) {
                        updatedAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(7 + random.nextInt(7));
                    } else {
                        updatedAt = LocalDateTime.now(ZoneOffset.UTC).minusDays(random.nextInt(3));
                    }
                } else {
                    // 대기 중
                    block = taskBlock;
                }

                // 마감일 설정: 일부 Task는 마감 초과
                LocalDate dueDate;
                if (fi >= 7 && fi < 9 && random.nextDouble() < 0.4) {
                    // OVERDUE 마일스톤의 일부 Task는 마감 초과
                    dueDate = today.minusDays(1 + random.nextInt(5));
                } else if (fi >= 5 && fi < 7 && random.nextDouble() < 0.3) {
                    // AT_RISK 마일스톤의 일부 Task도 마감 임박
                    dueDate = today.plusDays(random.nextInt(2));
                } else {
                    dueDate = today.plusDays(3 + random.nextInt(10));
                }

                Task task = Task.builder()
                        .board(board)
                        .feature(feature)
                        .block(block)
                        .title(feature.getTitle() + " - " + templates[ti])
                        .description(templates[ti] + " 관련 상세 작업. " + feature.getDescription())
                        .position(taskPosition++)
                        .startDate(today.minusDays(14 + random.nextInt(21)))
                        .dueDate(dueDate)
                        .estimatedMinutes(60 + random.nextInt(180)) // 60분 ~ 240분
                        .createdBy(createdBy)
                        .build();

                if (isCompleted) {
                    task.complete();
                }

                tasks.add(task);
                feature.incrementTotalTasks();
                if (block.getFixedType() == FixedBlockType.DONE) {
                    feature.incrementCompletedTasks();
                }
            }
        }

        taskRepository.saveAllAndFlush(tasks);
        featureRepository.saveAllAndFlush(features);

        log.info("Created {} tasks", tasks.size());
        return tasks;
    }

    private List<ChecklistItem> createChecklistItems(List<Task> tasks, List<User> members) {
        List<ChecklistItem> items = new ArrayList<>();
        LocalDate today = LocalDate.now();

        String[] checklistTemplates = {
                "요구사항 분석 및 정리",
                "기술 설계 검토",
                "핵심 기능 구현",
                "유닛 테스트 작성",
                "통합 테스트 수행",
                "코드 리뷰 요청",
                "문서 업데이트",
                "QA 검증"
        };

        // 멤버별 할당량 설정 (일부 멤버에게 더 많은 작업 배정 - 생산성 차이 시각화)
        // members[0]: Owner - 적당한 작업량
        // members[1]: 김철수 - 많은 작업량 (고성과자)
        // members[2]: 이영희 - 적당한 작업량
        // members[3]: 박민수 - 적은 작업량 (신입)
        // members[4]: 정다은 - 많은 작업량 (고성과자)
        // members[5]: 최준혁 - 지연 많음 (주의 필요)

        int taskIndex = 0;
        for (Task task : tasks) {
            int itemCount = 3 + random.nextInt(3); // 3-5개
            boolean isTaskCompleted = task.getIsCompleted();

            for (int i = 0; i < itemCount && i < checklistTemplates.length; i++) {
                // 멤버 배정: Task 인덱스에 따라 특정 패턴으로 배정
                int memberIndex;
                if (taskIndex % 5 == 0) memberIndex = 1;      // 김철수에게 많이
                else if (taskIndex % 5 == 1) memberIndex = 4; // 정다은에게 많이
                else if (taskIndex % 5 == 2) memberIndex = 5; // 최준혁에게 많이
                else memberIndex = i % members.size();

                User assignee = members.get(Math.min(memberIndex, members.size() - 1));

                // 완료 여부 결정
                boolean isCompleted;
                LocalDate createdDate;
                LocalDate dueDate;

                if (isTaskCompleted) {
                    // 완료된 Task의 체크리스트는 대부분 완료
                    isCompleted = true;
                    createdDate = today.minusDays(20 + random.nextInt(15));
                    dueDate = today.minusDays(random.nextInt(10));
                } else {
                    // 미완료 Task의 체크리스트
                    double progress = (double) i / itemCount;

                    // 최준혁(index 5)의 체크리스트는 완료율 낮음 + stuck 많음
                    if (memberIndex == 5) {
                        isCompleted = random.nextDouble() < 0.2; // 20%만 완료
                        // 오래된 생성일 (stuck 상태)
                        createdDate = today.minusDays(10 + random.nextInt(10));
                        dueDate = today.minusDays(random.nextInt(5)); // 마감 초과
                    } else if (memberIndex == 1 || memberIndex == 4) {
                        // 고성과자는 완료율 높음
                        isCompleted = progress < 0.7;
                        createdDate = today.minusDays(random.nextInt(7));
                        dueDate = today.plusDays(1 + random.nextInt(5));
                    } else {
                        isCompleted = progress < 0.4;
                        createdDate = today.minusDays(random.nextInt(10));
                        dueDate = today.plusDays(random.nextInt(7));
                    }
                }

                ChecklistItem item = ChecklistItem.builder()
                        .task(task)
                        .title(checklistTemplates[i % checklistTemplates.length])
                        .assignee(assignee)
                        .position(i)
                        .startDate(createdDate)
                        .dueDate(dueDate)
                        .isCompleted(isCompleted)
                        .build();
                items.add(item);
            }
            taskIndex++;
        }

        checklistItemRepository.saveAllAndFlush(items);

        log.info("Created {} checklist items", items.size());
        return items;
    }

    private List<ScheduleBlock> createScheduleBlocksForStatistics(Board board, List<ChecklistItem> checklistItems, List<User> members) {
        List<ScheduleBlock> blocks = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 멤버별 생산성 설정
        // members[0]: Owner - 보통 (하루 4-5시간)
        // members[1]: 김철수 - 높음 (하루 6-7시간)
        // members[2]: 이영희 - 보통 (하루 4-5시간)
        // members[3]: 박민수 - 낮음 (하루 2-3시간, 신입)
        // members[4]: 정다은 - 높음 (하루 6-7시간)
        // members[5]: 최준혁 - 낮음 (하루 2-3시간, 주의 필요)

        int[] memberBlockCounts = {4, 6, 4, 2, 6, 2}; // 멤버별 하루 평균 블록 수

        // 멤버별 체크리스트 아이템 그룹화
        List<List<ChecklistItem>> memberChecklistItems = new ArrayList<>();
        for (int i = 0; i < members.size(); i++) {
            final int idx = i;
            List<ChecklistItem> memberItems = checklistItems.stream()
                    .filter(item -> item.getAssignee() != null &&
                            item.getAssignee().getId().equals(members.get(idx).getId()))
                    .toList();
            memberChecklistItems.add(new ArrayList<>(memberItems));
        }

        // 지난 45일 동안의 스케줄 블록 생성 (더 긴 트렌드 데이터)
        for (int dayOffset = 45; dayOffset >= 0; dayOffset--) {
            LocalDate date = today.minusDays(dayOffset);

            // 주말은 스킵
            if (date.getDayOfWeek().getValue() > 5) {
                continue;
            }

            // 각 멤버별로 스케줄 블록 생성
            for (int memberIdx = 0; memberIdx < members.size(); memberIdx++) {
                User member = members.get(memberIdx);
                int baseBlockCount = memberBlockCounts[Math.min(memberIdx, memberBlockCounts.length - 1)];

                // 일별 변동성 추가 (+/- 1-2)
                int blocksPerDay = Math.max(1, baseBlockCount + random.nextInt(3) - 1);

                // 최근 날짜일수록 완료된 체크리스트와 연결
                List<ChecklistItem> availableItems = memberChecklistItems.get(memberIdx);

                List<LocalTime[]> timeSlots = generateTimeSlots(blocksPerDay);
                int actualBlockCount = Math.min(blocksPerDay, timeSlots.size());

                for (int i = 0; i < actualBlockCount; i++) {
                    ChecklistItem item = null;

                    // 80% 확률로 실제 체크리스트와 연결
                    if (!availableItems.isEmpty() && random.nextDouble() < 0.8) {
                        item = availableItems.get(random.nextInt(availableItems.size()));
                    }

                    LocalTime[] slot = timeSlots.get(i);

                    // 김철수, 정다은은 더 긴 작업 시간
                    if (memberIdx == 1 || memberIdx == 4) {
                        // 블록 시간 연장 (30분 추가)
                        slot[1] = slot[1].plusMinutes(30);
                        if (slot[1].isAfter(LocalTime.of(19, 0))) {
                            slot[1] = LocalTime.of(19, 0);
                        }
                    }

                    ScheduleBlock block = ScheduleBlock.builder()
                            .board(board)
                            .checklistItem(item)
                            .assignee(member)
                            .scheduledDate(date)
                            .startTime(slot[0])
                            .endTime(slot[1])
                            .build();
                    blocks.add(block);
                }
            }
        }

        scheduleBlockRepository.saveAllAndFlush(blocks);

        log.info("Created {} schedule blocks for statistics (last 45 days)", blocks.size());
        return blocks;
    }

    private List<LocalTime[]> generateTimeSlots(int count) {
        List<LocalTime[]> slots = new ArrayList<>();
        LocalTime currentTime = LocalTime.of(9, 0);

        for (int i = 0; i < count; i++) {
            int duration = 60 + random.nextInt(120); // 60-180분
            LocalTime endTime = currentTime.plusMinutes(duration);

            if (endTime.isAfter(LocalTime.of(18, 0))) {
                break;
            }

            slots.add(new LocalTime[]{currentTime, endTime});

            // 다음 슬롯 시작 시간 (30분 휴식 포함)
            currentTime = endTime.plusMinutes(30);
            if (currentTime.isAfter(LocalTime.of(17, 0))) {
                break;
            }
        }

        return slots;
    }

    private List<Meeting> createMeetings(Board board, List<User> members) {
        List<Meeting> meetings = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 1. Sprint 1 회고 미팅 (완료, 과거)
        meetings.add(Meeting.builder()
                .board(board)
                .title("Sprint 1 회고 미팅")
                .meetingDate(today.minusDays(25))
                .startTime(LocalTime.of(14, 0))
                .endTime(LocalTime.of(15, 30))
                .color("#10B981")
                .memo("## Sprint 1 회고\n\n### 잘된 점\n- MVP 기능 일정 내 완료\n- 코드 리뷰 프로세스 정착\n- 팀 커뮤니케이션 원활\n\n### 개선할 점\n- 테스트 커버리지 부족 (현재 45%)\n- API 문서 업데이트 지연\n- 디자인 시안 확정이 늦어 프론트 작업 병목\n\n### 액션 아이템\n- 테스트 커버리지 70% 목표 설정\n- API 문서 자동화 도구 도입 검토\n- 디자인 리뷰 주 1회 정례화")
                .createdBy(members.get(0))
                .build());

        // 2. Sprint 2 킥오프 (과거)
        meetings.add(Meeting.builder()
                .board(board)
                .title("Sprint 2 킥오프")
                .meetingDate(today.minusDays(14))
                .startTime(LocalTime.of(10, 0))
                .endTime(LocalTime.of(11, 0))
                .color("#3B82F6")
                .memo("## Sprint 2 목표\n\n### 핵심 기능\n1. 실시간 알림 시스템 (웹소켓)\n2. 댓글 및 멘션 기능\n3. 이메일 알림 연동\n\n### 담당자 배정\n- 김철수: 웹소켓 서버 구현\n- 정다은: 프론트 알림 UI\n- 이영희: 댓글 API\n- 박민수: 이메일 템플릿\n- 최준혁: 데이터 모델 설계\n\n### 일정\n- 1주차: 설계 + 핵심 구현\n- 2주차: 통합 테스트 + 버그 수정\n- 3주차: QA + 배포")
                .createdBy(members.get(0))
                .build());

        // 3. 주간 정기 회의 (지난주) - with transcript + AI suggestions
        meetings.add(Meeting.builder()
                .board(board)
                .title("주간 정기 회의")
                .meetingDate(today.minusDays(7))
                .startTime(LocalTime.of(10, 0))
                .endTime(LocalTime.of(11, 0))
                .color("#8B5CF6")
                .memo("## 주간 회의 안건\n\n### 진행 현황 공유\n- 웹소켓 알림: 80% 완료 (김철수)\n- 댓글 시스템: 60% 완료 (이영희)\n- 스케줄 뷰: 기획 확정 필요\n\n### 논의 사항\n- Redis pub/sub vs 인메모리 이벤트 버스\n- 댓글 실시간 반영 방식\n- Sprint 3 일정 조정 필요성")
                .transcript("김철수: 웹소켓 서버 구현은 거의 다 됐고, 지금 재연결 로직하고 하트비트 구현 중입니다. 이번 주 내로 끝낼 수 있을 것 같아요.\n\n이영희: 댓글 API 기본 CRUD는 완료했고, 멘션 기능 구현 중입니다. 멘션 검색 자동완성 UI가 좀 까다로운데, 정다은님이 도와주시면 좋겠어요.\n\n정다은: 네, 멘션 UI 도와드릴 수 있습니다. 알림 프론트는 웹소켓 연결 테스트만 하면 되거든요.\n\n박민수: 이메일 템플릿 디자인은 완료했는데, SES 연동에서 문제가 있어서 좀 지연되고 있습니다. 인증 관련 설정이 필요한데 도움 받을 수 있을까요?\n\n최준혁: 데이터 모델은 설계 완료했는데, 마이그레이션 적용에서 좀 막혀있습니다. Flyway 충돌 이슈가 있어서...\n\n김철수: Flyway는 제가 경험 있으니까 같이 봐드릴게요. 점심 먹고 같이 하시죠.\n\n이영희: Sprint 3 스케줄 뷰 기획서는 언제 나오나요? 빨리 확정되어야 병행 개발이 가능할 것 같은데.\n\n주인장: 스케줄 뷰 기획은 이번 주 수요일까지 확정하겠습니다. 디자인팀이랑 미팅 잡았어요.")
                .aiSuggestions("{\"key_points\":[\"웹소켓 알림 80% 완료, 재연결/하트비트 구현 중\",\"댓글 멘션 기능 구현 중, UI 협업 필요\",\"SES 이메일 연동 인증 설정 블로커\",\"Flyway 마이그레이션 충돌 이슈 해결 필요\",\"Sprint 3 스케줄 뷰 기획 수요일 확정 예정\"],\"summary\":[{\"topic\":\"실시간 알림\",\"important\":true,\"points\":[\"웹소켓 서버 80% 완료\",\"재연결 로직 및 하트비트 이번 주 내 완료 예정\",\"프론트 연동 테스트 대기 중\"]},{\"topic\":\"댓글 시스템\",\"important\":true,\"points\":[\"기본 CRUD 완료\",\"멘션 기능 구현 진행 중\",\"멘션 UI 자동완성 정다은님 협업\"]},{\"topic\":\"이메일 알림\",\"important\":false,\"points\":[\"템플릿 디자인 완료\",\"SES 인증 설정 블로커\"]},{\"topic\":\"블로커 이슈\",\"important\":true,\"points\":[\"Flyway 마이그레이션 충돌 - 김철수님 지원 예정\",\"SES 인증 설정 필요\"]}],\"features\":[{\"type\":\"EXISTING\",\"title\":\"실시간 알림\",\"description\":\"웹소켓 재연결 및 하트비트 구현 마무리\",\"tasks\":[{\"title\":\"웹소켓 재연결 로직 구현\",\"description\":\"연결 끊김 시 자동 재연결 with exponential backoff\",\"checklists\":[{\"title\":\"재연결 로직 구현\"},{\"title\":\"하트비트 핑/퐁 처리\"},{\"title\":\"연결 상태 UI 표시\"}]}]},{\"type\":\"EXISTING\",\"title\":\"댓글 시스템\",\"description\":\"멘션 기능 및 실시간 반영\",\"tasks\":[{\"title\":\"멘션 자동완성 UI 개발\",\"description\":\"@ 입력 시 팀원 검색 자동완성\",\"checklists\":[{\"title\":\"멘션 트리거 감지\"},{\"title\":\"검색 API 연동\"},{\"title\":\"드롭다운 UI 구현\"}]}]}]}")
                .createdBy(members.get(0))
                .build());

        // 4. 기술 검토 미팅 (지난주)
        meetings.add(Meeting.builder()
                .board(board)
                .title("기술 검토: Redis vs 인메모리")
                .meetingDate(today.minusDays(5))
                .startTime(LocalTime.of(15, 0))
                .endTime(LocalTime.of(16, 0))
                .color("#F59E0B")
                .memo("## Redis vs 인메모리 이벤트 버스 비교\n\n### Redis Pub/Sub\n- **장점**: 다중 인스턴스 지원, 스케일 아웃 용이\n- **단점**: 추가 인프라 비용, 네트워크 레이턴시\n- **비용**: ElastiCache t3.micro $15/월\n\n### 인메모리 (Spring Events)\n- **장점**: 추가 비용 없음, 낮은 레이턴시\n- **단점**: 단일 인스턴스 한정, 스케일 아웃 불가\n\n### 결론\n- **1단계**: 인메모리로 우선 구현 (현재 단일 인스턴스)\n- **2단계**: 사용자 증가 시 Redis 전환 (인터페이스 분리해두기)\n- 김철수 님이 EventBus 인터페이스 설계 담당")
                .createdBy(members.get(1))
                .build());

        // 5. Sprint 3 긴급 논의 (이번주 초)
        meetings.add(Meeting.builder()
                .board(board)
                .title("Sprint 3 일정 긴급 논의")
                .meetingDate(today.minusDays(3))
                .startTime(LocalTime.of(11, 0))
                .endTime(LocalTime.of(12, 0))
                .color("#EF4444")
                .memo("## 긴급 논의 사항\n\n### 현황\n- Sprint 3 마감 3일 남음, 진행률 30%\n- 스케줄 뷰 드래그앤드롭 구현 난이도 예상보다 높음\n- 박민수 님 SES 이슈 아직 미해결\n\n### 대응 방안\n1. 스케줄 뷰: 드래그앤드롭은 다음 스프린트로 이월\n2. 기본 타임블록 CRUD만 이번 스프린트에 완료\n3. 박민수 님 SES → 김철수 님이 페어 프로그래밍 지원\n4. 최준혁 님 작업 재배정 검토 필요")
                .transcript("주인장: Sprint 3 상황이 좋지 않습니다. 현재 30%밖에 진행이 안 됐는데, 마감이 3일밖에 안 남았어요.\n\n김철수: 드래그앤드롭이 생각보다 복잡합니다. dnd-kit 라이브러리 연동하는데 시간대 계산이 까다로워요.\n\n정다은: 기본 타임블록 표시는 거의 다 됐는데, 드래그 인터랙션이 문제예요.\n\n주인장: 드래그앤드롭은 Sprint 4로 넘기고, 이번에는 기본 CRUD만 마무리하는 게 어떨까요?\n\n김철수: 그게 현실적일 것 같습니다.\n\n박민수: 죄송한데 SES 연동이 아직 안 되고 있어서... AWS 콘솔 권한 문제 같습니다.\n\n김철수: 제가 오후에 같이 봐드릴게요. 예전에 비슷한 이슈 해결한 적 있어서요.\n\n주인장: 최준혁 님 진행 상황은 어떤가요?\n\n최준혁: Flyway 이슈는 해결했는데, 주간 뷰 레이아웃에서 좀 막혀있습니다.\n\n정다은: 제가 레이아웃 부분 도와드릴 수 있어요. 비슷한 그리드 작업 해본 적 있어서요.")
                .createdBy(members.get(0))
                .build());

        // 6. 디자인 리뷰 (이번주)
        meetings.add(Meeting.builder()
                .board(board)
                .title("통계 대시보드 디자인 리뷰")
                .meetingDate(today.minusDays(2))
                .startTime(LocalTime.of(14, 0))
                .endTime(LocalTime.of(15, 0))
                .color("#EC4899")
                .memo("## 통계 대시보드 디자인 리뷰\n\n### 화면 구성\n1. **팀 생산성 차트**: 주간 작업 완료 트렌드 (막대 + 라인)\n2. **개인별 워크로드**: 도넛 차트로 업무 분포\n3. **마일스톤 진행률**: 가로 프로그레스 바\n4. **번다운 차트**: 스프린트 잔여 작업량\n\n### 디자인 피드백\n- 다크 모드 기반 디자인 (Bridge 테마 적용)\n- 차트 라이브러리: Recharts 선정\n- 모바일 반응형 필수\n- 숫자 하이라이트에 bridge-accent 컬러 사용")
                .createdBy(members.get(4))
                .build());

        // 7. Sprint 4 블로커 논의 (어제) - with AI suggestions
        meetings.add(Meeting.builder()
                .board(board)
                .title("Sprint 4 블로커 및 대응 방안")
                .meetingDate(today.minusDays(1))
                .startTime(LocalTime.of(10, 0))
                .endTime(LocalTime.of(11, 30))
                .color("#F97316")
                .memo("## Sprint 4 블로커 현황\n\n### 주요 블로커\n1. 번다운 차트 데이터 집계 쿼리 성능 이슈 (3초 이상)\n2. 통계 API 캐싱 전략 미확정\n3. 차트 라이브러리 렌더링 최적화 필요\n\n### 해결 방안\n- 쿼리 최적화: 인덱스 추가 + 서브쿼리 리팩토링\n- 캐싱: 5분 TTL Redis 캐시 적용\n- 차트: React.memo + useMemo로 불필요한 리렌더 방지\n\n### 마감 초과 사유\n- 초기 예상보다 데이터 집계 로직 복잡\n- 다양한 기간 필터 조합 지원 요구")
                .transcript("주인장: Sprint 4 마감이 2일이나 초과됐습니다. 현재 상황 공유해주세요.\n\n김철수: 생산성 통계 API는 완성했는데, 번다운 차트가 문제입니다. 데이터 집계 쿼리가 3초 넘게 걸려요.\n\n정다은: 프론트 차트 컴포넌트는 다 만들었는데, API 응답이 느려서 UX가 안 좋습니다.\n\n이영희: 캐싱을 적용하면 해결될 것 같은데, Redis 캐시 전략을 먼저 정해야 해요.\n\n김철수: 쿼리 자체도 최적화가 필요합니다. 현재 N+1 문제가 있고, 복합 인덱스 추가하면 500ms 이내로 줄일 수 있을 것 같아요.\n\n주인장: 그러면 김철수 님이 쿼리 최적화, 이영희 님이 캐싱 전략 구현, 정다은 님이 프론트 성능 최적화 담당해주세요.\n\n최준혁: 제가 맡은 개인 통계 페이지는 데이터 가져오는 부분에서 막혀있어서... 김철수 님 API 최적화 끝나면 그 다음에 연동할게요.\n\n주인장: 내일까지 쿼리 최적화 완료하고, 모레까지 전체 마무리 목표로 합시다.")
                .aiSuggestions("{\"key_points\":[\"번다운 차트 데이터 집계 쿼리 3초 이상 성능 이슈\",\"N+1 쿼리 문제 + 복합 인덱스 필요\",\"Redis 5분 TTL 캐시 전략 적용 예정\",\"프론트 차트 React.memo/useMemo 최적화\",\"내일 쿼리 최적화 완료, 모레 전체 마무리 목표\"],\"summary\":[{\"topic\":\"쿼리 성능 최적화\",\"important\":true,\"points\":[\"번다운 차트 집계 쿼리 3초+ → 500ms 목표\",\"N+1 문제 해결 + 복합 인덱스 추가\",\"김철수 담당, 내일까지 완료\"]},{\"topic\":\"캐싱 전략\",\"important\":true,\"points\":[\"Redis 5분 TTL 캐시 적용\",\"이영희 담당\"]},{\"topic\":\"프론트 최적화\",\"important\":false,\"points\":[\"React.memo + useMemo 적용\",\"불필요한 리렌더 방지\",\"정다은 담당\"]}],\"features\":[{\"type\":\"EXISTING\",\"title\":\"생산성 통계\",\"description\":\"쿼리 최적화 및 캐싱 적용\",\"tasks\":[{\"title\":\"번다운 차트 쿼리 최적화\",\"description\":\"N+1 해결 및 복합 인덱스 추가\",\"checklists\":[{\"title\":\"N+1 쿼리 fetch join으로 변환\"},{\"title\":\"복합 인덱스 마이그레이션 작성\"},{\"title\":\"쿼리 성능 500ms 이하 확인\"}]},{\"title\":\"통계 API Redis 캐싱\",\"description\":\"5분 TTL 캐시 적용\",\"checklists\":[{\"title\":\"캐시 키 전략 설계\"},{\"title\":\"Redis 캐시 구현\"},{\"title\":\"캐시 무효화 로직 추가\"}]}]}]}")
                .createdBy(members.get(0))
                .build());

        // 8. 다음 주 계획 미팅 (미래)
        meetings.add(Meeting.builder()
                .board(board)
                .title("Sprint 5 계획 미팅")
                .meetingDate(today.plusDays(3))
                .startTime(LocalTime.of(10, 0))
                .endTime(LocalTime.of(11, 30))
                .color("#6366F1")
                .memo("## Sprint 5 계획 (예정)\n\n### 목표\n- 마일스톤 관리 기능\n- 설정 페이지 구현\n- 알림 시스템 고도화\n\n### 사전 준비 사항\n- Sprint 4 미완료 작업 이월 여부 확인\n- 마일스톤 기획서 최종 확정\n- 디자인 시안 준비")
                .createdBy(members.get(0))
                .build());

        meetingRepository.saveAllAndFlush(meetings);
        log.info("Created {} meetings", meetings.size());
        return meetings;
    }

    private List<ScheduleBlock> createMeetingScheduleBlocks(Board board, List<Meeting> meetings, List<User> members) {
        List<ScheduleBlock> blocks = new ArrayList<>();

        // 각 미팅에 참석자 스케줄 블록 연결 (과거 미팅만)
        for (Meeting meeting : meetings) {
            if (meeting.getMeetingDate().isAfter(LocalDate.now())) {
                continue; // 미래 미팅은 스킵
            }

            // 참석자 수: 3-6명 랜덤 (전체 멤버 중)
            int participantCount = 3 + random.nextInt(Math.min(4, members.size() - 2));
            List<User> participants = new ArrayList<>();
            participants.add(meeting.getCreatedBy()); // 생성자는 항상 참석

            List<User> shuffled = new ArrayList<>(members);
            shuffled.remove(meeting.getCreatedBy());
            java.util.Collections.shuffle(shuffled, random);
            for (int i = 0; i < participantCount - 1 && i < shuffled.size(); i++) {
                participants.add(shuffled.get(i));
            }

            for (User participant : participants) {
                ScheduleBlock block = ScheduleBlock.builder()
                        .board(board)
                        .meeting(meeting)
                        .assignee(participant)
                        .scheduledDate(meeting.getMeetingDate())
                        .startTime(meeting.getStartTime())
                        .endTime(meeting.getEndTime())
                        .build();
                blocks.add(block);
            }
        }

        scheduleBlockRepository.saveAllAndFlush(blocks);
        log.info("Created {} meeting schedule blocks", blocks.size());
        return blocks;
    }

    private List<WeeklyReport> createReports(Board board, List<User> members) {
        List<WeeklyReport> reports = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 1. TEAM 보고서 - Sprint 1 완료 기간
        reports.add(WeeklyReport.builder()
                .board(board)
                .generatedBy(members.get(0))
                .reportType(ReportType.TEAM)
                .periodStart(today.minusDays(45))
                .periodEnd(today.minusDays(25))
                .content(generateTeamReport1Content())
                .build());

        // 2. TEAM 보고서 - 최근 1주간
        reports.add(WeeklyReport.builder()
                .board(board)
                .generatedBy(members.get(0))
                .reportType(ReportType.TEAM)
                .periodStart(today.minusDays(7))
                .periodEnd(today)
                .content(generateTeamReport2Content())
                .build());

        // 3. PERSONAL 보고서 - 김철수 (고성과자)
        reports.add(WeeklyReport.builder()
                .board(board)
                .generatedBy(members.get(0))
                .reportType(ReportType.PERSONAL)
                .targetUserId(members.get(1).getId())
                .targetUserName(members.get(1).getName())
                .periodStart(today.minusDays(7))
                .periodEnd(today)
                .content(generatePersonalReportHighPerformer())
                .build());

        // 4. PERSONAL 보고서 - 최준혁 (주의 필요)
        reports.add(WeeklyReport.builder()
                .board(board)
                .generatedBy(members.get(0))
                .reportType(ReportType.PERSONAL)
                .targetUserId(members.get(Math.min(5, members.size() - 1)).getId())
                .targetUserName(members.get(Math.min(5, members.size() - 1)).getName())
                .periodStart(today.minusDays(7))
                .periodEnd(today)
                .content(generatePersonalReportAtRisk())
                .build());

        // 5. PERSONAL 보고서 - 정다은 (고성과자)
        reports.add(WeeklyReport.builder()
                .board(board)
                .generatedBy(members.get(0))
                .reportType(ReportType.PERSONAL)
                .targetUserId(members.get(4).getId())
                .targetUserName(members.get(4).getName())
                .periodStart(today.minusDays(7))
                .periodEnd(today)
                .content(generatePersonalReportHighPerformer2())
                .build());

        reportRepository.saveAllAndFlush(reports);
        log.info("Created {} weekly reports", reports.size());
        return reports;
    }

    private String generateTeamReport1Content() {
        return """
                ## 팀 주간 보고서: Sprint 1 - MVP 완료

                ### 핵심 요약
                Sprint 1이 성공적으로 완료되었습니다. 사용자 인증, 기본 대시보드, 칸반 보드 핵심 기능이 예정된 일정 내에 모두 구현되었습니다.

                ---

                ### 주요 성과
                - **사용자 인증 시스템**: 이메일 로그인, OAuth 연동 (Google, GitHub) 완료
                - **기본 대시보드**: 보드 목록, 생성/삭제, 멤버 초대 기능 완료
                - **칸반 보드**: 드래그앤드롭 기반 카드 이동, 블록 관리 완료
                - 전체 Task 15개 중 15개 완료 (100%)

                ### 팀원별 기여도
                | 팀원 | 완료 Task | 주요 작업 |
                |------|----------|----------|
                | 김철수 | 4개 | 인증 백엔드, JWT 구현 |
                | 정다은 | 4개 | 프론트 인증 UI, 대시보드 |
                | 이영희 | 3개 | API 설계, 문서화 |
                | 박민수 | 2개 | DB 스키마, 마이그레이션 |
                | 최준혁 | 2개 | 칸반 기본 레이아웃 |

                ### 리스크 및 주의사항
                - 테스트 커버리지가 45%로 목표(70%) 대비 부족
                - API 문서가 일부 미업데이트 상태
                - 코드 리뷰 적체 (평균 리뷰 대기 2.3일)

                > **한 줄 요약**: MVP를 일정 내 성공적으로 완료했으나, 기술 부채(테스트, 문서) 관리가 다음 스프린트 과제입니다.""";
    }

    private String generateTeamReport2Content() {
        return """
                ## 팀 주간 보고서: 최근 1주간 활동 분석

                ### 핵심 요약
                Sprint 2(협업 기능)가 70% 진행 중이며, Sprint 3(스케줄)와 Sprint 4(통계)에서 일정 지연이 발생하고 있습니다. 특히 Sprint 4는 마감일이 2일 초과되었습니다.

                ---

                ### 스프린트별 현황
                | 스프린트 | 진행률 | 상태 | 비고 |
                |---------|-------|------|------|
                | Sprint 2 - 협업 기능 | 70% | 🟢 순조로움 | 예정대로 진행 |
                | Sprint 3 - 스케줄 관리 | 30% | 🟡 위험 | 드래그앤드롭 이월 결정 |
                | Sprint 4 - 통계 대시보드 | 50% | 🔴 지연 | 마감 2일 초과 |

                ### 주요 블로커
                1. **번다운 차트 쿼리 성능**: 3초 이상 소요 → N+1 해결 + 인덱스 추가 진행 중
                2. **SES 이메일 연동**: AWS 권한 문제 → 페어 프로그래밍으로 해결 중
                3. **Flyway 마이그레이션 충돌**: 해결 완료

                ### 팀원 워크로드 분석
                | 팀원 | 일 평균 작업시간 | 완료 체크리스트 | 상태 |
                |------|----------------|---------------|------|
                | 김철수 | 6.5h | 12개 | ⭐ 고성과 |
                | 정다은 | 6.2h | 11개 | ⭐ 고성과 |
                | 이영희 | 4.3h | 7개 | ✅ 정상 |
                | 박민수 | 2.8h | 4개 | 📋 신입 적응 중 |
                | 최준혁 | 2.1h | 2개 | ⚠️ 주의 필요 |

                ### 이번 주 회의
                - Sprint 3 긴급 논의 (드래그앤드롭 이월 결정)
                - Sprint 4 블로커 대응 방안 수립
                - 기술 검토: Redis vs 인메모리 비교 (인메모리 우선 결정)

                ### 리스크 및 대응
                - **최준혁 님 작업 정체**: 체크리스트 완료율 20%, stuck 항목 다수 → 업무 재배정 및 멘토링 검토 필요
                - **Sprint 4 지연 영향**: Sprint 5 시작 일정 지연 가능성 → 병렬 진행 방안 모색

                > **한 줄 요약**: Sprint 2는 순조롭지만 Sprint 3-4 지연으로 전체 로드맵 조정이 필요하며, 최준혁 님에 대한 지원 강화가 시급합니다.""";
    }

    private String generatePersonalReportHighPerformer() {
        return """
                ## 개인 활동 보고서: 김철수

                ### 기간: 최근 1주간

                ---

                ### 주요 활동 요약
                김철수 님은 이번 주 팀 내 최고 성과를 기록했습니다. 웹소켓 알림 시스템 핵심 구현을 완료하고, 동료 지원(Flyway, SES)까지 병행하며 팀 전체 생산성 향상에 기여했습니다.

                ### 작업 현황
                | Feature | 담당 Task | 상태 | 비고 |
                |---------|----------|------|------|
                | 실시간 알림 | 웹소켓 서버 구현 | ✅ 완료 | 재연결 로직 포함 |
                | 실시간 알림 | 하트비트 구현 | 🔄 진행중 | 이번 주 내 완료 예정 |
                | 생산성 통계 | 번다운 차트 쿼리 최적화 | 🔄 진행중 | N+1 해결 진행 |
                | 생산성 통계 | API 설계 | ✅ 완료 | |

                ### 체크리스트 완료 현황
                - 전체: 18개 중 12개 완료 (67%)
                - 이번 주 완료: 8개
                - 일 평균 작업 시간: 6.5시간

                ### 강점
                - **기술 리더십**: Flyway 충돌 해결, SES 연동 지원 등 동료 기술 지원 적극적
                - **높은 생산성**: 일 평균 6.5시간 집중 작업, 체크리스트 완료율 팀 최고
                - **코드 품질**: 코드 리뷰에서 긍정적 피드백 다수

                ### 개선 포인트
                - 병렬 진행 Task가 많아 컨텍스트 스위칭 비용 발생 가능
                - 문서화 작업이 상대적으로 후순위로 밀리는 경향

                > **한 줄 요약**: 팀의 기술적 핵심 역할을 수행하며, 개인 작업과 동료 지원을 균형있게 병행하고 있습니다.""";
    }

    private String generatePersonalReportAtRisk() {
        return """
                ## 개인 활동 보고서: 최준혁

                ### 기간: 최근 1주간

                ---

                ### 주요 활동 요약
                최준혁 님은 이번 주 작업 진행에 어려움을 겪고 있습니다. Flyway 마이그레이션 이슈는 해결했으나, 이후 작업들에서 기술적 블로커가 지속되고 있어 지원이 필요한 상태입니다.

                ### 작업 현황
                | Feature | 담당 Task | 상태 | 비고 |
                |---------|----------|------|------|
                | 주간 스케줄 뷰 | 레이아웃 구현 | 🔴 정체 | 7일 이상 미진행 |
                | 주간 스케줄 뷰 | 데이터 모델 설계 | ✅ 완료 | |
                | 번다운 차트 | 개인 통계 페이지 | ⏸️ 대기 | API 최적화 완료 대기 |

                ### 체크리스트 완료 현황
                - 전체: 10개 중 2개 완료 (20%)
                - 마감 초과 항목: 5개
                - 일 평균 작업 시간: 2.1시간

                ### 블로커 분석
                1. **주간 스케줄 레이아웃**: CSS Grid 기반 시간대 표시 구현에 난이도 높음 → 정다은 님 지원 예정
                2. **개인 통계 페이지**: 김철수 님 API 최적화 완료 의존
                3. **전반적인 기술 적응**: 프로젝트 기술 스택(React + TypeScript)에 대한 추가 학습 필요

                ### 권장 액션
                - **즉시**: 주간 스케줄 레이아웃 작업에 정다은 님 페어 프로그래밍 배정
                - **단기**: React/TypeScript 기초 스터디 시간 확보 (주 2시간)
                - **중기**: Task 난이도 재배정 검토 (복잡도 낮은 작업부터 점진적 수행)

                > **한 줄 요약**: 기술적 난이도에 의한 작업 정체가 지속되고 있어, 페어 프로그래밍 및 멘토링을 통한 집중 지원이 필요합니다.""";
    }

    private String generatePersonalReportHighPerformer2() {
        return """
                ## 개인 활동 보고서: 정다은

                ### 기간: 최근 1주간

                ---

                ### 주요 활동 요약
                정다은 님은 프론트엔드 핵심 기능 구현과 함께 팀원 지원을 병행하며 높은 성과를 보여주고 있습니다. 알림 UI, 차트 컴포넌트 등 시각적 완성도가 높은 결과물을 산출했습니다.

                ### 작업 현황
                | Feature | 담당 Task | 상태 | 비고 |
                |---------|----------|------|------|
                | 실시간 알림 | 프론트 알림 UI | ✅ 완료 | 토스트 + 배지 |
                | 댓글 시스템 | 멘션 자동완성 UI | 🔄 진행중 | 이영희 님 협업 |
                | 번다운 차트 | 차트 컴포넌트 개발 | ✅ 완료 | Recharts 기반 |
                | 번다운 차트 | 프론트 성능 최적화 | 🔄 진행중 | memo/useMemo 적용 |
                | 통계 대시보드 | 디자인 리뷰 주도 | ✅ 완료 | |

                ### 체크리스트 완료 현황
                - 전체: 16개 중 11개 완료 (69%)
                - 이번 주 완료: 7개
                - 일 평균 작업 시간: 6.2시간

                ### 강점
                - **UI/UX 전문성**: 디자인 리뷰 주도, Bridge 테마 일관성 유지
                - **협업 능력**: 이영희 님(멘션 UI), 최준혁 님(레이아웃) 지원 병행
                - **빠른 실행력**: 차트 컴포넌트를 2일 만에 완성

                ### 개선 포인트
                - 동시 진행 작업이 4개로 다소 많음 → 우선순위 조정 권장
                - 테스트 코드 작성이 후순위로 밀리는 경향

                > **한 줄 요약**: 프론트엔드 핵심 역할을 수행하며 높은 생산성과 품질을 유지하고 있으나, 동시 진행 작업 수 관리가 필요합니다.""";
    }

    private List<Comment> createComments(Board board, List<Task> tasks, List<User> members) {
        List<Comment> comments = new ArrayList<>();

        // 진행 상황 업데이트 댓글
        String[] progressUpdates = {
                "작업 시작했습니다. 예상보다 복잡한 부분이 있어서 조금 더 걸릴 것 같습니다.",
                "1차 구현 완료했습니다. 리뷰 부탁드립니다!",
                "현재 약 70% 정도 진행되었습니다. 내일까지 마무리할 수 있을 것 같아요.",
                "구현 완료하고 테스트 코드 작성 중입니다.",
                "기본 기능 구현 끝났고, 엣지 케이스 처리 진행 중입니다.",
                "오늘 중으로 마무리 가능할 것 같습니다. 현재 마지막 디버깅 단계입니다."
        };

        // 코드 리뷰 관련 댓글
        String[] reviewComments = {
                "코드 리뷰 완료했습니다. 전체적으로 깔끔한데, 에러 핸들링 부분만 보완하면 좋겠어요.",
                "LGTM! 다만 null 체크 한 곳 추가하면 좋을 것 같습니다.",
                "리뷰 반영 완료했습니다. 다시 한번 확인 부탁드려요.",
                "성능 관련 의견 남겼습니다. N+1 쿼리가 발생할 수 있는 부분이 있어요.",
                "테스트 커버리지 80% 이상 확인했습니다. 머지해도 될 것 같아요.",
                "리팩토링 제안 드립니다. 이 로직은 서비스 레이어로 분리하는 게 좋을 것 같아요."
        };

        // 질문/논의 댓글
        String[] questionComments = {
                "이 부분 기획서랑 좀 다른 것 같은데, 확인 부탁드립니다.",
                "API 응답 형식을 어떻게 할지 논의가 필요할 것 같아요.",
                "이 기능은 기존 코드와 호환성 이슈가 있을 수 있는데, 어떻게 처리할까요?",
                "디자인 시안이 아직 안 나온 부분이 있어서, 임시로 작업해도 될까요?",
                "테스트 환경에서 간헐적으로 실패하는 케이스가 있는데 원인 파악 중입니다.",
                "이 부분 다른 팀에서도 비슷한 기능을 개발 중인데, 중복 작업이 아닌지 확인해주세요."
        };

        // 블로커/긴급 댓글
        String[] blockerComments = {
                "외부 API 연동 부분에서 블로커가 있습니다. 인증 토큰 발급이 지연되고 있어요.",
                "DB 마이그레이션이 먼저 완료되어야 이 작업을 진행할 수 있습니다.",
                "이 작업 우선순위를 올려야 할 것 같습니다. 다른 작업에 의존성이 있어요.",
                "긴급: 프로덕션에서 관련 버그가 발견되어 핫픽스가 필요합니다.",
                "스케줄 지연되고 있습니다. 추가 리소스 투입이 필요할 수 있어요."
        };

        // 완료/마무리 댓글
        String[] completionComments = {
                "모든 테스트 통과 확인했습니다. 배포 준비 완료!",
                "QA 검증 완료되었습니다. 이슈 없습니다.",
                "문서 업데이트까지 완료했습니다. 클로즈합니다.",
                "리뷰 반영 완료 후 머지했습니다. 수고하셨습니다!",
                "스테이징 환경에서 정상 동작 확인했습니다."
        };

        // 멘션이 포함된 댓글 템플릿 (멘션 대상 인덱스와 함께)
        String[][] mentionComments = {
                {"%s 이 부분 한번 봐주실 수 있을까요? 설계 방향이 맞는지 확인 부탁드립니다.", "1"},
                {"%s 리뷰 요청드립니다. PR 올려두었습니다.", "4"},
                {"%s %s 이 이슈 관련해서 같이 논의 필요합니다. 잠깐 시간 되실까요?", "1,4"},
                {"%s 체크리스트 업데이트 부탁드려요. 진행 상황이 궁금합니다.", "5"},
                {"%s 이 작업 인수인계 받았습니다. 추가 컨텍스트 있으면 공유 부탁드려요.", "2"},
                {"%s 배포 일정 확인 부탁드립니다. 이번 스프린트에 포함 가능한가요?", "0"},
        };

        for (int ti = 0; ti < tasks.size(); ti++) {
            Task task = tasks.get(ti);
            int featureIndex = ti / 4; // 대략적 feature 인덱스 (feature당 4-5개 task)

            // Feature 인덱스에 따라 댓글 수와 유형 결정
            int commentCount;
            if (featureIndex < 3) {
                // Sprint 1 (완료): 1-2개 완료 관련 댓글
                commentCount = 1 + random.nextInt(2);
            } else if (featureIndex < 5) {
                // Sprint 2 (ON_TRACK, 70%): 2-4개 활발한 댓글
                commentCount = 2 + random.nextInt(3);
            } else if (featureIndex < 7) {
                // Sprint 3 (AT_RISK, 30%): 2-3개 긴급/질문 댓글
                commentCount = 2 + random.nextInt(2);
            } else if (featureIndex < 9) {
                // Sprint 4 (OVERDUE, 50%): 3-4개 블로커/긴급 댓글
                commentCount = 3 + random.nextInt(2);
            } else {
                // Sprint 5 (예정): 0-1개 계획 관련 댓글
                commentCount = random.nextInt(2);
            }

            for (int ci = 0; ci < commentCount; ci++) {
                String content;
                String mentionIds = null;
                User author;

                // 댓글 유형 결정
                if (featureIndex < 3) {
                    // 완료된 Sprint: 완료 댓글
                    content = completionComments[random.nextInt(completionComments.length)];
                    author = members.get(random.nextInt(members.size()));
                } else if (featureIndex >= 7 && featureIndex < 9 && ci == 0) {
                    // OVERDUE Sprint 첫 댓글: 블로커
                    content = blockerComments[random.nextInt(blockerComments.length)];
                    author = members.get(Math.min(5, members.size() - 1)); // 최준혁
                } else if (random.nextDouble() < 0.25) {
                    // 25% 확률로 멘션 댓글
                    int mentionIdx = random.nextInt(mentionComments.length);
                    String[] mc = mentionComments[mentionIdx];
                    String[] targetIndices = mc[1].split(",");
                    List<String> mentionUserIds = new ArrayList<>();
                    List<String> mentionNames = new ArrayList<>();

                    for (String idx : targetIndices) {
                        int memberIdx = Integer.parseInt(idx.trim());
                        if (memberIdx < members.size()) {
                            mentionUserIds.add(members.get(memberIdx).getId());
                            mentionNames.add("@" + members.get(memberIdx).getName());
                        }
                    }

                    mentionIds = String.join(",", mentionUserIds);
                    content = String.format(mc[0], mentionNames.toArray());

                    // 멘션 대상이 아닌 사람이 작성
                    do {
                        author = members.get(random.nextInt(members.size()));
                    } while (mentionUserIds.contains(author.getId()) && members.size() > mentionUserIds.size());
                } else {
                    // 일반 댓글: 진행상황, 리뷰, 질문 중 랜덤
                    double typeRoll = random.nextDouble();
                    if (typeRoll < 0.35) {
                        content = progressUpdates[random.nextInt(progressUpdates.length)];
                    } else if (typeRoll < 0.65) {
                        content = reviewComments[random.nextInt(reviewComments.length)];
                    } else {
                        content = questionComments[random.nextInt(questionComments.length)];
                    }

                    // 작성자: 멤버 중 랜덤 (고성과자가 더 많이 작성)
                    double authorRoll = random.nextDouble();
                    if (authorRoll < 0.25) {
                        author = members.get(1); // 김철수 (고성과자)
                    } else if (authorRoll < 0.45) {
                        author = members.get(4); // 정다은 (고성과자)
                    } else if (authorRoll < 0.60) {
                        author = members.get(0); // Owner
                    } else if (authorRoll < 0.75) {
                        author = members.get(2); // 이영희
                    } else if (authorRoll < 0.88) {
                        author = members.get(3); // 박민수
                    } else {
                        author = members.get(Math.min(5, members.size() - 1)); // 최준혁
                    }
                }

                Comment comment = Comment.builder()
                        .task(task)
                        .board(board)
                        .author(author)
                        .content(content)
                        .mentions(mentionIds)
                        .build();
                comments.add(comment);
            }
        }

        commentRepository.saveAllAndFlush(comments);
        log.info("Created {} comments", comments.size());
        return comments;
    }
}
