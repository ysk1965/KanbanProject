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
import com.kanban.domain.feature.Feature;
import com.kanban.domain.feature.FeatureRepository;
import com.kanban.domain.feature.Priority;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.milestone.MilestoneFeature;
import com.kanban.domain.milestone.MilestoneFeatureRepository;
import com.kanban.domain.milestone.MilestoneRepository;
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
                .workHoursPerDay(8)
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

        return TestDataResponse.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .memberCount(members.size())
                .featureCount(features.size())
                .taskCount(tasks.size())
                .checklistItemCount(checklistItems.size())
                .scheduleBlockCount(scheduleBlocks.size())
                .message("공용 테스트 보드가 성공적으로 생성되었습니다! (Premium 활성화, 마일스톤 " + milestones.size() + "개 포함)")
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

        // Feature 데이터: title, description, color, priority, dueDate offset, milestone index
        // Milestone 1 (완료됨): Feature 0-2 (100% 완료)
        // Milestone 2 (ON_TRACK): Feature 3-4 (70% 완료)
        // Milestone 3 (AT_RISK): Feature 5-6 (30% 완료)
        // Milestone 4 (OVERDUE): Feature 7-8 (50% 완료)
        // Milestone 5 (예정): Feature 9-10 (0% 완료)

        Object[][] featureData = {
                // Sprint 1 - 완료된 Feature들
                {"사용자 인증 시스템", "로그인, 회원가입, OAuth 연동 구현", "#3b82f6", "HIGH", -30},
                {"기본 대시보드", "메인 대시보드 화면 및 보드 목록", "#10b981", "HIGH", -28},
                {"칸반 보드 기본", "드래그앤드롭 칸반 보드 기본 구현", "#8b5cf6", "HIGH", -26},

                // Sprint 2 - 진행 중 (ON_TRACK)
                {"실시간 알림", "웹소켓 기반 실시간 알림 시스템", "#ec4899", "MEDIUM", 5},
                {"댓글 시스템", "태스크/피처 댓글 및 멘션 기능", "#f472b6", "MEDIUM", 6},

                // Sprint 3 - 위험 상태 (AT_RISK)
                {"일일 스케줄 뷰", "하루 단위 타임블록 스케줄 뷰", "#f59e0b", "HIGH", 2},
                {"주간 스케줄 뷰", "주 단위 스케줄 뷰 및 드래그 조정", "#fbbf24", "MEDIUM", 3},

                // Sprint 4 - 지연됨 (OVERDUE) - 마감일이 과거
                {"생산성 통계", "팀/개인 생산성 분석 대시보드", "#6366f1", "HIGH", -5},
                {"번다운 차트", "마일스톤 진행률 시각화 차트", "#818cf8", "MEDIUM", -3},

                // Sprint 5 - 예정됨
                {"마일스톤 관리", "프로젝트 마일스톤 및 진행률 추적", "#14b8a6", "MEDIUM", 25},
                {"설정 페이지", "사용자 설정 및 알림 관리", "#64748b", "LOW", 28}
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
                    .priority(Priority.valueOf((String) data[3]))
                    .dueDate(today.plusDays((Integer) data[4]))
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
}
