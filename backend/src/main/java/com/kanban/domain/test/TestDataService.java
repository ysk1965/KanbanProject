package com.kanban.domain.test;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.BlockType;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.Role;
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
import java.util.ArrayList;
import java.util.List;
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

    @Transactional
    public TestDataResponse createTestBoard(String userId) {
        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 1. 테스트 보드 생성
        Board board = Board.builder()
                .name("BRIDGE 개발 프로젝트")
                .description("팀 협업 및 통계 기능을 테스트하기 위한 프로젝트 보드입니다.")
                .owner(owner)
                .workHoursPerDay(8)
                .workStartTime(LocalTime.of(9, 0))
                .build();
        boardRepository.saveAndFlush(board);
        log.info("Created test board: {}", board.getId());

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
                        .role(i == 1 ? Role.ADMIN : Role.MEMBER)
                        .invitedBy(owner)
                        .build();
                boardMemberRepository.saveAndFlush(boardMember);
            }
        }
        // Owner도 멤버로 추가
        BoardMember ownerMember = BoardMember.builder()
                .board(board)
                .user(owner)
                .role(Role.OWNER)
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
                .message("테스트 보드가 성공적으로 생성되었습니다! (Premium 활성화, 마일스톤 " + milestones.size() + "개 포함)")
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
                .currentPeriodStart(LocalDateTime.now())
                .currentPeriodEnd(LocalDateTime.now().plusYears(1))
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
        blockRepository.saveAndFlush(featureBlock);
        blocks.add(featureBlock);

        // Task 블록
        Block taskBlock = Block.builder()
                .board(board)
                .name("Task")
                .type(BlockType.FIXED)
                .fixedType(FixedBlockType.TASK)
                .position(1)
                .build();
        blockRepository.saveAndFlush(taskBlock);
        blocks.add(taskBlock);

        // 커스텀 블록: In Progress
        Block inProgressBlock = Block.builder()
                .board(board)
                .name("In Progress")
                .color("#f59e0b")
                .type(BlockType.CUSTOM)
                .position(2)
                .build();
        blockRepository.saveAndFlush(inProgressBlock);
        blocks.add(inProgressBlock);

        // 커스텀 블록: Review
        Block reviewBlock = Block.builder()
                .board(board)
                .name("Review")
                .color("#8b5cf6")
                .type(BlockType.CUSTOM)
                .position(3)
                .build();
        blockRepository.saveAndFlush(reviewBlock);
        blocks.add(reviewBlock);

        // Done 블록
        Block doneBlock = Block.builder()
                .board(board)
                .name("Done")
                .type(BlockType.FIXED)
                .fixedType(FixedBlockType.DONE)
                .position(4)
                .build();
        blockRepository.saveAndFlush(doneBlock);
        blocks.add(doneBlock);

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
            tagRepository.saveAndFlush(tag);
            tags.add(tag);
        }

        return tags;
    }

    private List<Milestone> createMilestones(Board board, User createdBy) {
        List<Milestone> milestones = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 마일스톤 1: 완료된 마일스톤
        Milestone milestone1 = Milestone.builder()
                .board(board)
                .title("Sprint 1 - MVP 기능")
                .description("핵심 MVP 기능 개발")
                .startDate(today.minusDays(30))
                .endDate(today.minusDays(15))
                .createdBy(createdBy)
                .build();
        milestoneRepository.saveAndFlush(milestone1);
        milestones.add(milestone1);

        // 마일스톤 2: 진행 중인 마일스톤
        Milestone milestone2 = Milestone.builder()
                .board(board)
                .title("Sprint 2 - 협업 기능")
                .description("팀 협업 및 실시간 기능 개발")
                .startDate(today.minusDays(14))
                .endDate(today.plusDays(7))
                .createdBy(createdBy)
                .build();
        milestoneRepository.saveAndFlush(milestone2);
        milestones.add(milestone2);

        // 마일스톤 3: 예정된 마일스톤
        Milestone milestone3 = Milestone.builder()
                .board(board)
                .title("Sprint 3 - 통계 및 분석")
                .description("통계 대시보드 및 생산성 분석 기능")
                .startDate(today.plusDays(8))
                .endDate(today.plusDays(21))
                .createdBy(createdBy)
                .build();
        milestoneRepository.saveAndFlush(milestone3);
        milestones.add(milestone3);

        log.info("Created {} milestones", milestones.size());
        return milestones;
    }

    private List<Feature> createFeatures(Board board, User createdBy, List<User> members, List<Tag> tags) {
        List<Feature> features = new ArrayList<>();

        Object[][] featureData = {
                {"사용자 인증 시스템", "로그인, 회원가입, OAuth 연동 구현", "#3b82f6", 0, "HIGH"},
                {"대시보드 UI", "메인 대시보드 화면 및 위젯 개발", "#10b981", 1, "MEDIUM"},
                {"칸반 보드", "드래그앤드롭 칸반 보드 구현", "#8b5cf6", 2, "HIGH"},
                {"스케줄 관리", "일일/주간 스케줄 뷰 및 타임블록", "#f59e0b", 3, "MEDIUM"},
                {"팀 협업 기능", "실시간 알림 및 댓글 시스템", "#ec4899", 4, "LOW"},
                {"통계 대시보드", "생산성 분석 및 차트 시각화", "#6366f1", 5, "HIGH"},
                {"마일스톤 관리", "프로젝트 마일스톤 및 진행률 추적", "#14b8a6", 6, "MEDIUM"},
                {"설정 페이지", "사용자 설정 및 알림 관리", "#64748b", 7, "LOW"}
        };

        for (int i = 0; i < featureData.length; i++) {
            Object[] data = featureData[i];
            Feature feature = Feature.builder()
                    .board(board)
                    .title((String) data[0])
                    .description((String) data[1])
                    .color((String) data[2])
                    .assignee(members.get(i % members.size()))
                    .position((Integer) data[3])
                    .priority(Priority.valueOf((String) data[4]))
                    .dueDate(LocalDate.now().plusDays(7 + i * 2))
                    .createdBy(createdBy)
                    .build();
            featureRepository.saveAndFlush(feature);
            features.add(feature);
        }

        log.info("Created {} features", features.size());
        return features;
    }

    private void linkFeaturesToMilestones(List<Milestone> milestones, List<Feature> features) {
        // 마일스톤 1: Feature 0, 1, 2
        for (int i = 0; i < 3 && i < features.size(); i++) {
            MilestoneFeature mf = MilestoneFeature.create(milestones.get(0), features.get(i));
            milestoneFeatureRepository.saveAndFlush(mf);
        }

        // 마일스톤 2: Feature 3, 4
        for (int i = 3; i < 5 && i < features.size(); i++) {
            MilestoneFeature mf = MilestoneFeature.create(milestones.get(1), features.get(i));
            milestoneFeatureRepository.saveAndFlush(mf);
        }

        // 마일스톤 3: Feature 5, 6, 7
        for (int i = 5; i < 8 && i < features.size(); i++) {
            MilestoneFeature mf = MilestoneFeature.create(milestones.get(2), features.get(i));
            milestoneFeatureRepository.saveAndFlush(mf);
        }

        log.info("Linked features to milestones");
    }

    private List<Task> createTasks(Board board, List<Feature> features, User createdBy, List<User> members, List<Tag> tags, List<Block> blocks) {
        List<Task> tasks = new ArrayList<>();

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

        // 각 Feature에 대해 3-5개의 Task 생성
        String[][] taskTemplates = {
                {"API 엔드포인트 구현", "DB 스키마 설계", "유닛 테스트 작성", "문서화"},
                {"UI 컴포넌트 개발", "스타일링 작업", "반응형 대응", "접근성 개선"},
                {"로직 구현", "에러 핸들링", "성능 최적화", "코드 리뷰"},
                {"설계 검토", "프로토타입", "사용성 테스트", "배포 준비"}
        };

        int taskPosition = 0;
        for (int fi = 0; fi < features.size(); fi++) {
            Feature feature = features.get(fi);
            String[] templates = taskTemplates[fi % taskTemplates.length];
            int taskCount = 3 + random.nextInt(3); // 3-5개

            for (int ti = 0; ti < taskCount && ti < templates.length; ti++) {
                // 블록 배정 (랜덤하게)
                Block block;
                double rand = random.nextDouble();
                if (rand < 0.2) {
                    block = doneBlock;
                } else if (rand < 0.4) {
                    block = reviewBlock;
                } else if (rand < 0.6) {
                    block = inProgressBlock;
                } else {
                    block = taskBlock;
                }

                Task task = Task.builder()
                        .board(board)
                        .feature(feature)
                        .block(block)
                        .title(feature.getTitle() + " - " + templates[ti])
                        .description(templates[ti] + " 관련 작업")
                        .assignee(members.get((fi + ti) % members.size()))
                        .position(taskPosition++)
                        .startDate(LocalDate.now().minusDays(random.nextInt(14)))
                        .dueDate(LocalDate.now().plusDays(ti + 1))
                        .estimatedMinutes(30 + random.nextInt(150)) // 30분 ~ 180분
                        .createdBy(createdBy)
                        .build();
                taskRepository.saveAndFlush(task);
                tasks.add(task);

                feature.incrementTotalTasks();
                if (block.getFixedType() == FixedBlockType.DONE) {
                    feature.incrementCompletedTasks();
                }
            }
        }

        log.info("Created {} tasks", tasks.size());
        return tasks;
    }

    private List<ChecklistItem> createChecklistItems(List<Task> tasks, List<User> members) {
        List<ChecklistItem> items = new ArrayList<>();

        String[] checklistTemplates = {
                "요구사항 분석",
                "설계 검토",
                "구현",
                "테스트 작성",
                "코드 리뷰",
                "문서 업데이트"
        };

        for (Task task : tasks) {
            int itemCount = 2 + random.nextInt(4); // 2-5개
            for (int i = 0; i < itemCount; i++) {
                User assignee = members.get(random.nextInt(members.size()));
                boolean isCompleted = random.nextDouble() < 0.4; // 40% 확률로 완료

                ChecklistItem item = ChecklistItem.builder()
                        .task(task)
                        .title(checklistTemplates[i % checklistTemplates.length])
                        .assignee(assignee)
                        .position(i)
                        .startDate(LocalDate.now().minusDays(random.nextInt(7)))
                        .dueDate(LocalDate.now().plusDays(random.nextInt(7)))
                        .isCompleted(isCompleted)
                        .build();
                checklistItemRepository.saveAndFlush(item);
                items.add(item);
            }
        }

        log.info("Created {} checklist items", items.size());
        return items;
    }

    private List<ScheduleBlock> createScheduleBlocksForStatistics(Board board, List<ChecklistItem> checklistItems, List<User> members) {
        List<ScheduleBlock> blocks = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 지난 30일 동안의 스케줄 블록 생성
        for (int dayOffset = 30; dayOffset >= 0; dayOffset--) {
            LocalDate date = today.minusDays(dayOffset);

            // 주말은 스킵 (선택적)
            if (date.getDayOfWeek().getValue() > 5) {
                continue;
            }

            // 각 멤버에게 하루에 2-4개의 스케줄 블록 배정
            for (User member : members) {
                int blocksPerDay = 2 + random.nextInt(3); // 2-4개
                List<LocalTime[]> timeSlots = generateTimeSlots(blocksPerDay);

                // timeSlots가 blocksPerDay보다 적을 수 있으므로 실제 슬롯 수만큼만 반복
                int actualBlockCount = Math.min(blocksPerDay, timeSlots.size());
                for (int i = 0; i < actualBlockCount; i++) {
                    ChecklistItem item = checklistItems.isEmpty() ? null :
                            checklistItems.get(random.nextInt(checklistItems.size()));

                    LocalTime[] slot = timeSlots.get(i);

                    ScheduleBlock block = ScheduleBlock.builder()
                            .board(board)
                            .checklistItem(item)
                            .assignee(member)
                            .scheduledDate(date)
                            .startTime(slot[0])
                            .endTime(slot[1])
                            .build();
                    scheduleBlockRepository.saveAndFlush(block);
                    blocks.add(block);
                }
            }
        }

        log.info("Created {} schedule blocks for statistics (last 30 days)", blocks.size());
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
