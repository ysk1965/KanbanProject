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
import com.kanban.domain.subscription.OrgSubscription;
import com.kanban.domain.subscription.OrgSubscriptionRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import com.kanban.domain.subscription.SubscriptionStatus;
import com.kanban.domain.tag.Tag;
import com.kanban.domain.tag.TagRepository;
import com.kanban.domain.task.Task;
import com.kanban.domain.task.TaskRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.domain.okr.OkrCheckIn;
import com.kanban.domain.okr.OkrCycle;
import com.kanban.domain.okr.OkrKeyResult;
import com.kanban.domain.okr.OkrObjective;
import com.kanban.domain.okr.repository.OkrCheckInRepository;
import com.kanban.domain.okr.repository.OkrCycleRepository;
import com.kanban.domain.okr.repository.OkrKeyResultRepository;
import com.kanban.domain.okr.repository.OkrObjectiveRepository;
import com.kanban.domain.organization.*;
import com.kanban.domain.organization.leave.*;
import com.kanban.domain.organization.leave.repository.LeaveBalanceRepository;
import com.kanban.domain.organization.leave.repository.LeavePolicyRepository;
import com.kanban.domain.organization.leave.repository.LeaveRequestRepository;
import com.kanban.domain.organization.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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

    // Organization repositories
    private final OrganizationRepository organizationRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final OrgDepartmentRepository orgDepartmentRepository;
    private final OrgJobGroupRepository orgJobGroupRepository;
    private final OrgPositionRepository orgPositionRepository;
    private final OrgTitleRepository orgTitleRepository;
    private final OrgGradeRepository orgGradeRepository;
    private final OrgMemberHistoryRepository orgMemberHistoryRepository;
    private final OrgMemberConcurrentDeptRepository orgMemberConcurrentDeptRepository;
    private final LeavePolicyRepository leavePolicyRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final LeaveBalanceRepository leaveBalanceRepository;
    private final OrgOnboardingTemplateRepository orgOnboardingTemplateRepository;
    private final OrgOnboardingInstanceRepository orgOnboardingInstanceRepository;
    private final OrgOnboardingInstanceItemRepository orgOnboardingInstanceItemRepository;
    private final OrgOneOnOneRepository orgOneOnOneRepository;
    private final OrgOneOnOneMeetingRepository orgOneOnOneMeetingRepository;
    private final OrgOneOnOneActionItemRepository orgOneOnOneActionItemRepository;
    private final OrgAttendancePolicyRepository orgAttendancePolicyRepository;
    private final OrgAttendanceRecordRepository orgAttendanceRecordRepository;
    private final OrgAnniversarySettingRepository orgAnniversarySettingRepository;
    private final OrgCelebrationMessageRepository orgCelebrationMessageRepository;
    private final OrgCustomHolidayRepository orgCustomHolidayRepository;
    private final OrgAnnouncementRepository orgAnnouncementRepository;
    private final OrgActivityRepository orgActivityRepository;
    private final OrgSubscriptionRepository orgSubscriptionRepository;

    // OKR repositories
    private final OkrCycleRepository okrCycleRepository;
    private final OkrObjectiveRepository okrObjectiveRepository;
    private final OkrKeyResultRepository okrKeyResultRepository;
    private final OkrCheckInRepository okrCheckInRepository;

    private final Random random = new Random();

    private static final String SHARED_TEST_BOARD_NAME = "BRIDGE SPOTS Example";
    private static final String SHARED_TEST_ORG_NAME = "BRIDGE SPOTS Example Org";

    @Transactional
    public TestDataResponse createTestBoard(String userId) {
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 공용 테스트 보드가 이미 있는지 확인
        Optional<Board> existingBoard = boardRepository.findActiveByName(SHARED_TEST_BOARD_NAME);

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

    // ========================================================================
    // Organization Test Data
    // ========================================================================

    @Transactional
    public TestOrgDataResponse createTestOrganization(String userId) {
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Optional<Organization> existingOrg = organizationRepository.findActiveByName(SHARED_TEST_ORG_NAME);

        if (existingOrg.isPresent()) {
            return joinExistingTestOrganization(existingOrg.get(), currentUser);
        } else {
            return createNewTestOrganization(currentUser);
        }
    }

    private TestOrgDataResponse joinExistingTestOrganization(Organization org, User user) {
        boolean isMember = orgMemberRepository.existsByOrganizationIdAndUserId(org.getId(), user.getId());

        if (!isMember) {
            // 1인 1조직 정책: 이미 다른 조직에 소속되어 있으면 해당 멤버십 제거
            List<OrganizationMember> existingMemberships = orgMemberRepository.findByUserIdWithOrganization(user.getId());
            if (!existingMemberships.isEmpty()) {
                orgMemberRepository.deleteAll(existingMemberships);
                orgMemberRepository.flush();
                log.info("Removed user {} from {} existing org(s) to join test org", user.getId(), existingMemberships.size());
            }

            OrganizationMember newMember = OrganizationMember.builder()
                    .organization(org)
                    .user(user)
                    .role(OrgRole.MEMBER)
                    .contractType(ContractType.FULL_TIME)
                    .workStatus(WorkStatus.ACTIVE)
                    .hireDate(LocalDate.now())
                    .joinedAt(LocalDateTime.now(ZoneOffset.UTC))
                    .build();
            orgMemberRepository.saveAndFlush(newMember);
            log.info("Added user {} as member to shared test organization {}", user.getId(), org.getId());
        }

        int memberCount = orgMemberRepository.countByOrganizationId(org.getId());

        String message = isMember
                ? "이미 테스트 조직의 멤버입니다. 조직 페이지로 이동합니다."
                : "테스트 조직에 멤버로 추가되었습니다!";

        return TestOrgDataResponse.builder()
                .organizationId(org.getId())
                .organizationName(org.getName())
                .memberCount(memberCount)
                .message(message)
                .build();
    }

    private TestOrgDataResponse createNewTestOrganization(User owner) {
        // 1. Organization
        Organization org = Organization.builder()
                .name(SHARED_TEST_ORG_NAME)
                .description("팀 구조, HR 기능, 조직도를 테스트하기 위한 공용 조직입니다.")
                .owner(owner)
                .build();
        organizationRepository.saveAndFlush(org);
        log.info("Created shared test organization: {}", org.getId());

        // 1-1. OrgSubscription (TEAM ACTIVE for testing HR features)
        OrgSubscription subscription = OrgSubscription.createTrial(org);
        subscription.activateTeam(BillingCycle.MONTHLY, 10, "test-payment-method");
        orgSubscriptionRepository.save(subscription);

        // 2. Test users (5 base + 4 org-only = 10 total incl. owner)
        List<User> users = createTestMembers(owner);
        List<User> extraUsers = createOrgExtraMembers();
        users.addAll(extraUsers);

        // 3. Structure
        List<OrganizationDepartment> departments = createOrgDepartments(org);
        List<OrganizationJobGroup> jobGroups = createOrgJobGroups(org);
        List<OrganizationPosition> positions = createOrgPositions(org);
        List<OrganizationTitle> titles = createOrgTitles(org);
        List<OrganizationGrade> grades = createOrgGrades(org);

        // 4. Members (10명)
        List<OrganizationMember> members = createOrgMembers(org, users, departments, jobGroups, positions, titles, grades);

        // 5. Department leaders
        setOrgDepartmentLeaders(departments, members);

        // 6. Concurrent department
        createOrgConcurrentDept(org, members, departments, positions);

        // 7. Leave policies & data
        List<LeavePolicy> leavePolicies = createOrgLeavePolicies(org);
        createOrgLeaveBalances(org, members, leavePolicies);
        List<LeaveRequest> leaveRequests = createOrgLeaveRequests(org, members, leavePolicies);

        // 8. Attendance (ACTIVE 멤버만)
        createOrgAttendancePolicy(org);
        List<OrganizationMember> activeMembers = members.stream()
                .filter(m -> m.getWorkStatus() == WorkStatus.ACTIVE)
                .toList();
        List<OrgAttendanceRecord> attendanceRecords = createOrgAttendanceRecords(org, activeMembers);

        // 9. Anniversary & Celebrations
        createOrgAnniversarySetting(org);
        createOrgCustomHolidays(org);
        createOrgCelebrationMessages(org, members, users);

        // 10. Onboarding (2 templates, 2 instances)
        OrgOnboardingTemplate template = createOrgOnboardingTemplate(org);
        createOrgOnboardingInstance(org, members, template);

        // 11. 1:1 meetings
        createOrgOneOnOnes(org, members, users);

        // 12. Announcements
        List<OrgAnnouncement> announcements = createOrgAnnouncements(org, members);

        // 13. Activities
        List<OrgActivity> activities = createOrgActivities(org, members, announcements, leaveRequests);

        // 14. Member histories
        List<OrgMemberHistory> histories = createOrgMemberHistories(org, members);

        // 15. Organization Boards (인사이트 데이터 포함)
        List<Board> orgBoards = createOrgBoards(org, owner, users, members);

        // 16. OKR (1 Cycle, 3 Objectives, 7 Key Results, CheckIns)
        int[] okrCounts = createOrgOkrData(org, members, departments);

        return TestOrgDataResponse.builder()
                .organizationId(org.getId())
                .organizationName(org.getName())
                .memberCount(members.size())
                .departmentCount(departments.size())
                .leavePolicyCount(leavePolicies.size())
                .leaveRequestCount(leaveRequests.size())
                .onboardingTemplateCount(1)
                .attendanceRecordCount(attendanceRecords.size())
                .announcementCount(announcements.size())
                .activityCount(activities.size())
                .okrCycleCount(okrCounts[0])
                .okrObjectiveCount(okrCounts[1])
                .okrKeyResultCount(okrCounts[2])
                .message("공용 테스트 조직이 성공적으로 생성되었습니다! (부서 " + departments.size() + "개, 멤버 " + members.size() + "명, 보드 " + orgBoards.size() + "개, 휴가정책 " + leavePolicies.size() + "개, OKR 사이클 " + okrCounts[0] + "개 포함)")
                .build();
    }

    /**
     * OKR 테스트 데이터 생성 (1 Cycle, 3 Objectives, 7 Key Results, CheckIns)
     */
    private int[] createOrgOkrData(Organization org, List<OrganizationMember> members, List<OrganizationDepartment> departments) {
        // members 배열: [0]=owner, [1~N]=일반 멤버
        // departments 배열: [0]=경영기획실, [1]=개발팀, [2]=디자인팀, [3]=마케팅팀, [4]=백엔드파트, [5]=프론트엔드파트

        // 1. Cycle 생성
        OkrCycle cycle = OkrCycle.builder()
                .organization(org)
                .name("2026 Q1")
                .cycleType("QUARTERLY")
                .startDate(LocalDate.of(2026, 1, 1))
                .endDate(LocalDate.of(2026, 3, 31))
                .status("ACTIVE")
                .createdBy(members.get(0).getUser())
                .build();
        okrCycleRepository.saveAndFlush(cycle);

        // 2. Company Objective: 글로벌 MAU 10만 달성
        OkrObjective companyObj = OkrObjective.builder()
                .cycle(cycle)
                .organization(org)
                .title("글로벌 MAU 10만 달성")
                .description("사용자 기반을 확대하여 글로벌 MAU 10만을 달성합니다")
                .level("COMPANY")
                .owner(members.get(0))
                .progress(72)
                .confidence("ON_TRACK")
                .sortOrder(0)
                .build();
        okrObjectiveRepository.saveAndFlush(companyObj);

        // 3. Department Objective: 플랫폼 안정성 확보 (개발팀)
        OkrObjective devObj = OkrObjective.builder()
                .cycle(cycle)
                .organization(org)
                .title("플랫폼 안정성 확보")
                .description("서버 가용성과 배포 주기를 개선합니다")
                .level("DEPARTMENT")
                .department(departments.size() > 1 ? departments.get(1) : null)
                .owner(members.size() > 2 ? members.get(2) : members.get(0))
                .parentObjective(companyObj)
                .progress(80)
                .confidence("ON_TRACK")
                .sortOrder(0)
                .build();
        okrObjectiveRepository.saveAndFlush(devObj);

        // 4. Department Objective: 브랜드 인지도 확대 (마케팅팀)
        OkrObjective mktObj = OkrObjective.builder()
                .cycle(cycle)
                .organization(org)
                .title("브랜드 인지도 확대")
                .description("광고 효율과 콘텐츠 도달률을 높입니다")
                .level("DEPARTMENT")
                .department(departments.size() > 3 ? departments.get(3) : null)
                .owner(members.size() > 1 ? members.get(1) : members.get(0))
                .parentObjective(companyObj)
                .progress(60)
                .confidence("AT_RISK")
                .sortOrder(1)
                .build();
        okrObjectiveRepository.saveAndFlush(mktObj);

        // 5. Key Results — Company Objective
        OkrKeyResult kr1 = createOkrKeyResult(companyObj, "신규 가입자 월 2만명 확보", "NUMBER", 0, 20000, 12500, "명", members, 1, 1.0, 0);
        OkrKeyResult kr2 = createOkrKeyResult(companyObj, "DAU 3만명 유지", "NUMBER", 0, 30000, 28000, "명", members, 2, 1.0, 1);
        OkrKeyResult kr3 = createOkrKeyResult(companyObj, "이탈률 5% 이하", "PERCENTAGE", 0, 100, 62, "%", members, 3, 1.0, 2);

        // 6. Key Results — Dev Objective
        OkrKeyResult kr4 = createOkrKeyResult(devObj, "서버 가용성 99.9%", "PERCENTAGE", 0, 100, 95, "%", members, 4, 1.0, 0);
        OkrKeyResult kr5 = createOkrKeyResult(devObj, "배포 주기 주 2회", "NUMBER", 0, 2.0, 1.5, "회", members, 5, 1.0, 1);

        // 7. Key Results — Marketing Objective
        OkrKeyResult kr6 = createOkrKeyResult(mktObj, "광고 CTR 3%", "PERCENTAGE", 0, 100, 70, "%", members, 6, 1.0, 0);
        OkrKeyResult kr7 = createOkrKeyResult(mktObj, "블로그 월 조회수 5만", "NUMBER", 0, 50000, 35000, "", members, 7, 1.0, 1);

        // 8. CheckIns — 각 KR에 2~3개
        createOkrCheckIns(kr1, members, 1, new double[]{5000, 10000, 12500}, new String[]{"ON_TRACK", "ON_TRACK", "ON_TRACK"},
                new String[]{"초기 마케팅 캠페인 시작", "소셜 미디어 효과 발생", "캠페인 2차 효과로 가입자 급증"});
        createOkrCheckIns(kr2, members, 2, new double[]{15000, 25000, 28000}, new String[]{"AT_RISK", "ON_TRACK", "ON_TRACK"},
                new String[]{"초기 유입 지속", "신규 기능 출시 효과", "안정적 유지 중"});
        createOkrCheckIns(kr3, members, 3, new double[]{30, 50, 62}, new String[]{"OFF_TRACK", "AT_RISK", "ON_TRACK"},
                new String[]{"리텐션 분석 시작", "온보딩 개선 진행", "이탈 방지 캠페인 효과"});
        createOkrCheckIns(kr4, members, 4, new double[]{90, 95}, new String[]{"AT_RISK", "ON_TRACK"},
                new String[]{"인프라 안정화 작업", "서버 이중화 완료"});
        createOkrCheckIns(kr5, members, 5, new double[]{1.0, 1.5}, new String[]{"AT_RISK", "ON_TRACK"},
                new String[]{"CI/CD 파이프라인 개선", "배포 자동화 안정화"});
        createOkrCheckIns(kr6, members, 6, new double[]{40, 70}, new String[]{"OFF_TRACK", "AT_RISK"},
                new String[]{"광고 타겟팅 재설정", "A/B 테스트 결과 반영"});
        createOkrCheckIns(kr7, members, 7, new double[]{15000, 35000}, new String[]{"AT_RISK", "ON_TRACK"},
                new String[]{"SEO 최적화 시작", "바이럴 콘텐츠 효과"});

        return new int[]{1, 3, 7}; // cycleCount, objectiveCount, keyResultCount
    }

    private OkrKeyResult createOkrKeyResult(OkrObjective objective, String title, String metricType,
            double startValue, double targetValue, double currentValue, String unit,
            List<OrganizationMember> members, int ownerIdx, double weight, int sortOrder) {
        OkrKeyResult kr = OkrKeyResult.builder()
                .objective(objective)
                .title(title)
                .metricType(metricType)
                .startValue(startValue)
                .targetValue(targetValue)
                .currentValue(currentValue)
                .unit(unit)
                .owner(members.size() > ownerIdx ? members.get(ownerIdx) : members.get(0))
                .weight(weight)
                .sortOrder(sortOrder)
                .build();
        return okrKeyResultRepository.saveAndFlush(kr);
    }

    private void createOkrCheckIns(OkrKeyResult kr, List<OrganizationMember> members, int authorIdx,
            double[] values, String[] confidences, String[] notes) {
        double prevValue = kr.getStartValue();
        for (int i = 0; i < values.length; i++) {
            OkrCheckIn checkIn = OkrCheckIn.builder()
                    .keyResult(kr)
                    .previousValue(prevValue)
                    .newValue(values[i])
                    .confidence(confidences[i])
                    .note(notes[i])
                    .author(members.size() > authorIdx ? members.get(authorIdx) : members.get(0))
                    .build();
            okrCheckInRepository.saveAndFlush(checkIn);
            prevValue = values[i];
        }
    }

    /**
     * 조직 전용 추가 유저 4명 생성 (testuser6~9)
     */
    private List<User> createOrgExtraMembers() {
        List<User> extras = new ArrayList<>();
        String[] names = {"한소희", "윤성민", "강지원", "임하늘"};
        String[] emails = {"testuser6@bridge.com", "testuser7@bridge.com", "testuser8@bridge.com", "testuser9@bridge.com"};

        for (int i = 0; i < names.length; i++) {
            User existing = userRepository.findByEmail(emails[i]).orElse(null);
            if (existing != null) {
                extras.add(existing);
            } else {
                User newUser = User.builder()
                        .id(UUID.randomUUID().toString())
                        .email(emails[i])
                        .name(names[i])
                        .passwordHash("$2a$10$dummyhashedpassword")
                        .build();
                userRepository.saveAndFlush(newUser);
                extras.add(newUser);
            }
        }
        return extras;
    }

    // --- Structure helpers ---

    private List<OrganizationDepartment> createOrgDepartments(Organization org) {
        // [0] 경영기획실 (root)
        OrganizationDepartment root = OrganizationDepartment.builder()
                .organization(org).name("경영기획실").displayOrder(0)
                .description("전사 전략 및 경영 기획").build();
        orgDepartmentRepository.saveAndFlush(root);

        // [1] 개발팀 (under root)
        OrganizationDepartment dev = OrganizationDepartment.builder()
                .organization(org).name("개발팀").displayOrder(1)
                .parentDepartment(root).description("소프트웨어 개발 총괄").build();
        orgDepartmentRepository.saveAndFlush(dev);

        // [2] 디자인팀
        OrganizationDepartment design = OrganizationDepartment.builder()
                .organization(org).name("디자인팀").displayOrder(2)
                .parentDepartment(root).description("UI/UX 디자인").build();
        orgDepartmentRepository.saveAndFlush(design);

        // [3] 마케팅팀
        OrganizationDepartment marketing = OrganizationDepartment.builder()
                .organization(org).name("마케팅팀").displayOrder(3)
                .parentDepartment(root).description("마케팅 및 브랜딩").build();
        orgDepartmentRepository.saveAndFlush(marketing);

        // [4] 백엔드파트 (under 개발팀)
        OrganizationDepartment backend = OrganizationDepartment.builder()
                .organization(org).name("백엔드파트").displayOrder(0)
                .parentDepartment(dev).description("서버 및 API 개발").build();
        orgDepartmentRepository.saveAndFlush(backend);

        // [5] 프론트엔드파트 (under 개발팀)
        OrganizationDepartment frontend = OrganizationDepartment.builder()
                .organization(org).name("프론트엔드파트").displayOrder(1)
                .parentDepartment(dev).description("웹/앱 클라이언트 개발").build();
        orgDepartmentRepository.saveAndFlush(frontend);

        log.info("Created 6 departments for org: {}", org.getId());
        // [0]=경영기획실, [1]=개발팀, [2]=디자인팀, [3]=마케팅팀, [4]=백엔드파트, [5]=프론트엔드파트
        return List.of(root, dev, design, marketing, backend, frontend);
    }

    private List<OrganizationJobGroup> createOrgJobGroups(Organization org) {
        List<OrganizationJobGroup> groups = new ArrayList<>();
        String[] names = {"엔지니어링", "디자인", "비즈니스"};
        for (int i = 0; i < names.length; i++) {
            OrganizationJobGroup jg = OrganizationJobGroup.builder()
                    .organization(org).name(names[i]).displayOrder(i).build();
            groups.add(jg);
        }
        orgJobGroupRepository.saveAllAndFlush(groups);
        log.info("Created {} job groups", groups.size());
        return groups;
    }

    private List<OrganizationPosition> createOrgPositions(Organization org) {
        List<OrganizationPosition> positions = new ArrayList<>();
        String[] names = {"대표", "팀장", "선임", "주니어"};
        for (int i = 0; i < names.length; i++) {
            OrganizationPosition pos = OrganizationPosition.builder()
                    .organization(org).name(names[i]).displayOrder(i).build();
            positions.add(pos);
        }
        orgPositionRepository.saveAllAndFlush(positions);
        log.info("Created {} positions", positions.size());
        return positions;
    }

    private List<OrganizationTitle> createOrgTitles(Organization org) {
        List<OrganizationTitle> titles = new ArrayList<>();
        String[] names = {"이사", "부장", "과장", "사원"};
        for (int i = 0; i < names.length; i++) {
            OrganizationTitle title = OrganizationTitle.builder()
                    .organization(org).name(names[i]).displayOrder(i).build();
            titles.add(title);
        }
        orgTitleRepository.saveAllAndFlush(titles);
        log.info("Created {} titles", titles.size());
        return titles;
    }

    private List<OrganizationGrade> createOrgGrades(Organization org) {
        List<OrganizationGrade> grades = new ArrayList<>();
        String[] names = {"G1", "G2", "G3"};
        for (int i = 0; i < names.length; i++) {
            OrganizationGrade grade = OrganizationGrade.builder()
                    .organization(org).name(names[i]).displayOrder(i).build();
            grades.add(grade);
        }
        orgGradeRepository.saveAllAndFlush(grades);
        log.info("Created {} grades", grades.size());
        return grades;
    }

    // --- Members ---

    private List<OrganizationMember> createOrgMembers(
            Organization org, List<User> users,
            List<OrganizationDepartment> depts, List<OrganizationJobGroup> jobGroups,
            List<OrganizationPosition> positions, List<OrganizationTitle> titles,
            List<OrganizationGrade> grades) {

        LocalDate today = LocalDate.now();
        int month = today.getMonthValue();
        List<OrganizationMember> members = new ArrayList<>();

        // 1인 1조직 정책: owner가 이미 다른 조직에 소속되어 있으면 기존 멤버십 제거
        List<OrganizationMember> ownerExisting = orgMemberRepository.findByUserIdWithOrganization(users.get(0).getId());
        if (!ownerExisting.isEmpty()) {
            orgMemberRepository.deleteAll(ownerExisting);
            orgMemberRepository.flush();
            log.info("Removed owner from {} existing org(s) for test org creation", ownerExisting.size());
        }

        // depts: [0]=경영기획실, [1]=개발팀, [2]=디자인팀, [3]=마케팅팀, [4]=백엔드파트, [5]=프론트엔드파트
        // jobGroups: [0]=엔지니어링, [1]=디자인, [2]=비즈니스
        // positions: [0]=대표, [1]=팀장, [2]=선임, [3]=주니어
        // titles: [0]=이사, [1]=부장, [2]=과장, [3]=사원
        // grades: [0]=G1, [1]=G2, [2]=G3
        // users: [0]=owner, [1]=김철수, [2]=이영희, [3]=박민수, [4]=정다은, [5]=최준혁, [6]=한소희, [7]=윤성민, [8]=강지원, [9]=임하늘

        // [0] Owner (CEO) — 경영기획실
        OrganizationMember ownerMember = OrganizationMember.builder()
                .organization(org).user(users.get(0)).role(OrgRole.OWNER)
                .department(depts.get(0)).position(positions.get(0)).title(titles.get(0)).grade(grades.get(0))
                .jobTitle("CEO").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-001").phone("010-1234-5678")
                .birthDate(LocalDate.of(1985, month, Math.min(today.getDayOfMonth() + 5, 28)))
                .hireDate(today.minusDays(730))
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(ownerMember);
        members.add(ownerMember);

        // [1] 김철수 (ADMIN, 개발팀장) — 개발팀
        OrganizationMember member1 = OrganizationMember.builder()
                .organization(org).user(users.get(1)).role(OrgRole.ADMIN)
                .department(depts.get(1)).jobGroup(jobGroups.get(0))
                .position(positions.get(1)).title(titles.get(1)).grade(grades.get(0))
                .jobTitle("개발팀장").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-002").phone("010-2345-6789")
                .birthDate(LocalDate.of(1990, 7, 20)).hireDate(today.minusDays(500))
                .manager(ownerMember)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member1);
        members.add(member1);

        // [2] 이영희 (MEMBER, 디자인팀 리드)
        OrganizationMember member2 = OrganizationMember.builder()
                .organization(org).user(users.get(2)).role(OrgRole.MEMBER)
                .department(depts.get(2)).jobGroup(jobGroups.get(1))
                .position(positions.get(1)).title(titles.get(2)).grade(grades.get(1))
                .jobTitle("디자인 리드").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-003").phone("010-3456-7890")
                .birthDate(LocalDate.of(1992, month, Math.min(today.getDayOfMonth() + 2, 28)))
                .hireDate(today.minusDays(400))
                .manager(ownerMember)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member2);
        members.add(member2);

        // [3] 박민수 (MEMBER, 프론트엔드파트 선임)
        OrganizationMember member3 = OrganizationMember.builder()
                .organization(org).user(users.get(3)).role(OrgRole.MEMBER)
                .department(depts.get(5)).jobGroup(jobGroups.get(0))
                .position(positions.get(2)).title(titles.get(2)).grade(grades.get(1))
                .jobTitle("프론트엔드 개발자").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-004").phone("010-4567-8901")
                .birthDate(LocalDate.of(1993, 5, 25)).hireDate(today.minusDays(300))
                .manager(member1)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member3);
        members.add(member3);

        // [4] 정다은 (MEMBER, 마케팅팀)
        OrganizationMember member4 = OrganizationMember.builder()
                .organization(org).user(users.get(4)).role(OrgRole.MEMBER)
                .department(depts.get(3)).jobGroup(jobGroups.get(2))
                .position(positions.get(2)).title(titles.get(3)).grade(grades.get(2))
                .jobTitle("콘텐츠 마케터").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-005").phone("010-5678-9012")
                .birthDate(LocalDate.of(1995, 1, 30)).hireDate(today.minusDays(200))
                .manager(ownerMember)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member4);
        members.add(member4);

        // [5] 최준혁 (MEMBER, 백엔드파트 주니어 — 신입)
        OrganizationMember member5 = OrganizationMember.builder()
                .organization(org).user(users.get(5)).role(OrgRole.MEMBER)
                .department(depts.get(4)).jobGroup(jobGroups.get(0))
                .position(positions.get(3)).title(titles.get(3)).grade(grades.get(2))
                .jobTitle("백엔드 개발자").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-006").phone("010-6789-0123")
                .birthDate(LocalDate.of(1996, 9, 12)).hireDate(today.minusDays(30))
                .manager(member1)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member5);
        members.add(member5);

        // [6] 한소희 (MEMBER, 프론트엔드파트, CONTRACT — 계약직)
        OrganizationMember member6 = OrganizationMember.builder()
                .organization(org).user(users.get(6)).role(OrgRole.MEMBER)
                .department(depts.get(5)).jobGroup(jobGroups.get(0))
                .position(positions.get(3)).title(titles.get(3)).grade(grades.get(2))
                .jobTitle("프론트엔드 개발자").contractType(ContractType.CONTRACT).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-007").phone("010-7890-1234")
                .birthDate(LocalDate.of(1997, month == 12 ? 1 : month + 1, 15))
                .hireDate(today.minusDays(90))
                .manager(member1)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member6);
        members.add(member6);

        // [7] 윤성민 (MEMBER, 백엔드파트, INTERN — 인턴)
        OrganizationMember member7 = OrganizationMember.builder()
                .organization(org).user(users.get(7)).role(OrgRole.MEMBER)
                .department(depts.get(4)).jobGroup(jobGroups.get(0))
                .position(positions.get(3)).title(titles.get(3)).grade(grades.get(2))
                .jobTitle("백엔드 인턴").contractType(ContractType.INTERN).workStatus(WorkStatus.ACTIVE)
                .employeeId("EMP-008").phone("010-8901-2345")
                .birthDate(LocalDate.of(2000, 4, 8)).hireDate(today.minusDays(14))
                .manager(member1)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member7);
        members.add(member7);

        // [8] 강지원 (MEMBER, 마케팅팀, ON_LEAVE — 휴직중)
        OrganizationMember member8 = OrganizationMember.builder()
                .organization(org).user(users.get(8)).role(OrgRole.MEMBER)
                .department(depts.get(3)).jobGroup(jobGroups.get(2))
                .position(positions.get(2)).title(titles.get(2)).grade(grades.get(1))
                .jobTitle("퍼포먼스 마케터").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.ON_LEAVE)
                .employeeId("EMP-009").phone("010-9012-3456")
                .birthDate(LocalDate.of(1994, 8, 22)).hireDate(today.minusDays(365))
                .bio("육아 휴직 중 (복귀 예정: 3개월 후)")
                .manager(ownerMember)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member8);
        members.add(member8);

        // [9] 임하늘 (MEMBER, 디자인팀, RESIGNED — 퇴사)
        OrganizationMember member9 = OrganizationMember.builder()
                .organization(org).user(users.get(9)).role(OrgRole.MEMBER)
                .department(depts.get(2)).jobGroup(jobGroups.get(1))
                .position(positions.get(3)).title(titles.get(3)).grade(grades.get(2))
                .jobTitle("주니어 디자이너").contractType(ContractType.FULL_TIME).workStatus(WorkStatus.RESIGNED)
                .employeeId("EMP-010").phone("010-0123-4567")
                .birthDate(LocalDate.of(1998, 6, 3)).hireDate(today.minusDays(180))
                .manager(member2)
                .joinedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        orgMemberRepository.saveAndFlush(member9);
        members.add(member9);

        log.info("Created {} organization members", members.size());
        return members;
    }

    private void setOrgDepartmentLeaders(List<OrganizationDepartment> depts, List<OrganizationMember> members) {
        // 개발팀 → 김철수(member[1])
        depts.get(1).updateLeader(members.get(1));
        orgDepartmentRepository.saveAndFlush(depts.get(1));
        // 디자인팀 → 이영희(member[2])
        depts.get(2).updateLeader(members.get(2));
        orgDepartmentRepository.saveAndFlush(depts.get(2));
        // 마케팅팀 → 정다은(member[4])
        depts.get(3).updateLeader(members.get(4));
        orgDepartmentRepository.saveAndFlush(depts.get(3));
        log.info("Set department leaders");
    }

    private void createOrgConcurrentDept(Organization org, List<OrganizationMember> members,
                                          List<OrganizationDepartment> depts, List<OrganizationPosition> positions) {
        // 이영희(member[2]) → 개발팀(dept[1]) 겸직
        OrganizationMemberConcurrentDept concurrent = OrganizationMemberConcurrentDept.builder()
                .organization(org)
                .member(members.get(2))
                .department(depts.get(1))
                .position(positions.get(2))
                .build();
        orgMemberConcurrentDeptRepository.saveAndFlush(concurrent);
        log.info("Created concurrent department assignment");
    }

    // --- Leave ---

    private List<LeavePolicy> createOrgLeavePolicies(Organization org) {
        List<LeavePolicy> policies = new ArrayList<>();

        policies.add(LeavePolicy.builder()
                .organization(org).name("연차").leaveCategory(LeaveCategory.ANNUAL)
                .defaultDays(new BigDecimal("15.0")).isPaid(true).requiresApproval(true)
                .description("법정 연차 휴가").displayOrder(0).build());

        policies.add(LeavePolicy.builder()
                .organization(org).name("병가").leaveCategory(LeaveCategory.SICK)
                .defaultDays(new BigDecimal("3.0")).isPaid(true).requiresApproval(false)
                .description("유급 병가").displayOrder(1).build());

        policies.add(LeavePolicy.builder()
                .organization(org).name("리프레시").leaveCategory(LeaveCategory.REFRESH)
                .defaultDays(new BigDecimal("5.0")).isPaid(true).requiresApproval(true)
                .description("리프레시 휴가").displayOrder(2).build());

        policies.add(LeavePolicy.builder()
                .organization(org).name("경조사").leaveCategory(LeaveCategory.OTHER)
                .defaultDays(new BigDecimal("5.0")).isPaid(true).requiresApproval(true)
                .description("경조사 휴가").displayOrder(3).build());

        leavePolicyRepository.saveAllAndFlush(policies);
        log.info("Created {} leave policies", policies.size());
        return policies;
    }

    private void createOrgLeaveBalances(Organization org, List<OrganizationMember> members, List<LeavePolicy> policies) {
        int year = LocalDate.now().getYear();
        List<LeaveBalance> balances = new ArrayList<>();

        for (LeavePolicy policy : policies) {
            for (OrganizationMember member : members) {
                BigDecimal totalDays = policy.getDefaultDays();
                int maxUsed;
                switch (policy.getLeaveCategory()) {
                    case ANNUAL -> maxUsed = 5;   // 0~4일 사용
                    case SICK -> maxUsed = 2;     // 0~1일 사용
                    case REFRESH -> maxUsed = 3;  // 0~2일 사용
                    default -> maxUsed = 2;       // 0~1일 사용
                }
                int used = random.nextInt(maxUsed);

                LeaveBalance balance = LeaveBalance.builder()
                        .organization(org).member(member).policy(policy)
                        .year(year)
                        .totalDays(totalDays)
                        .usedDays(new BigDecimal(used + ".0"))
                        .build();
                balances.add(balance);
            }
        }

        leaveBalanceRepository.saveAllAndFlush(balances);
        log.info("Created {} leave balances (all {} policies × {} members)", balances.size(), policies.size(), members.size());
    }

    private List<LeaveRequest> createOrgLeaveRequests(Organization org, List<OrganizationMember> members, List<LeavePolicy> policies) {
        LocalDate today = LocalDate.now();
        List<LeaveRequest> requests = new ArrayList<>();

        // 이영희: 연차 2일 APPROVED
        LeaveRequest req1 = LeaveRequest.builder()
                .organization(org).requester(members.get(2)).policy(policies.get(0))
                .startDate(today.plusDays(5)).endDate(today.plusDays(6))
                .totalDays(new BigDecimal("2.0")).reason("개인 사유")
                .build();
        leaveRequestRepository.saveAndFlush(req1);
        req1.approve(members.get(0)); // Owner approves
        leaveRequestRepository.saveAndFlush(req1);
        requests.add(req1);

        // 박민수: 병가 1일 APPROVED
        LeaveRequest req2 = LeaveRequest.builder()
                .organization(org).requester(members.get(3)).policy(policies.get(1))
                .startDate(today.minusDays(3)).endDate(today.minusDays(3))
                .totalDays(new BigDecimal("1.0")).reason("감기")
                .build();
        leaveRequestRepository.saveAndFlush(req2);
        req2.approve(members.get(1)); // 김철수 approves
        leaveRequestRepository.saveAndFlush(req2);
        requests.add(req2);

        // 정다은: 연차 5일 PENDING
        LeaveRequest req3 = LeaveRequest.builder()
                .organization(org).requester(members.get(4)).policy(policies.get(0))
                .startDate(today.plusDays(10)).endDate(today.plusDays(14))
                .totalDays(new BigDecimal("5.0")).reason("가족 여행")
                .build();
        leaveRequestRepository.saveAndFlush(req3);
        requests.add(req3);

        // 최준혁: 리프레시 3일 PENDING
        LeaveRequest req4 = LeaveRequest.builder()
                .organization(org).requester(members.get(5)).policy(policies.get(2))
                .startDate(today.plusDays(20)).endDate(today.plusDays(22))
                .totalDays(new BigDecimal("3.0")).reason("리프레시")
                .build();
        leaveRequestRepository.saveAndFlush(req4);
        requests.add(req4);

        // 강지원(member[8]): 육아휴직 APPROVED (장기)
        LeaveRequest req5 = LeaveRequest.builder()
                .organization(org).requester(members.get(8)).policy(policies.get(3))
                .startDate(today.minusDays(30)).endDate(today.plusDays(60))
                .totalDays(new BigDecimal("90.0")).reason("육아 휴직")
                .build();
        leaveRequestRepository.saveAndFlush(req5);
        req5.approve(members.get(0)); // Owner approves
        leaveRequestRepository.saveAndFlush(req5);
        requests.add(req5);

        // 한소희(member[6]): 반차 APPROVED
        LeaveRequest req6 = LeaveRequest.builder()
                .organization(org).requester(members.get(6)).policy(policies.get(0))
                .startDate(today.plusDays(3)).endDate(today.plusDays(3))
                .durationType(LeaveDurationType.AM_HALF)
                .totalDays(new BigDecimal("0.5")).reason("병원 진료")
                .build();
        leaveRequestRepository.saveAndFlush(req6);
        req6.approve(members.get(1)); // 김철수 approves
        leaveRequestRepository.saveAndFlush(req6);
        requests.add(req6);

        log.info("Created {} leave requests", requests.size());
        return requests;
    }

    // --- Attendance ---

    private void createOrgAttendancePolicy(Organization org) {
        OrgAttendancePolicy policy = new OrgAttendancePolicy(org);
        policy.update(
                new BigDecimal("8.00"),
                LocalTime.of(10, 0), LocalTime.of(16, 0),
                LocalTime.of(10, 0),
                true, LocalTime.of(23, 59), "6,7"
        );
        orgAttendancePolicyRepository.saveAndFlush(policy);
        log.info("Created attendance policy");
    }

    private List<OrgAttendanceRecord> createOrgAttendanceRecords(Organization org, List<OrganizationMember> members) {
        List<OrgAttendanceRecord> records = new ArrayList<>();
        LocalDate today = LocalDate.now();

        for (int dayOffset = 13; dayOffset >= 0; dayOffset--) {
            LocalDate date = today.minusDays(dayOffset);
            DayOfWeek dow = date.getDayOfWeek();
            if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) continue;

            for (OrganizationMember member : members) {
                int minuteOffset = random.nextInt(40); // 0~39분
                boolean isLate = minuteOffset > 30; // 10:00 이후 = 지각
                LocalTime clockInTime = LocalTime.of(9, 20 + minuteOffset); // 9:20~9:59
                LocalTime clockOutTime = LocalTime.of(18, random.nextInt(60)); // 18:00~18:59

                LocalDateTime clockIn = LocalDateTime.of(date, clockInTime);
                LocalDateTime clockOut = LocalDateTime.of(date, clockOutTime);
                int workMinutes = (int) java.time.Duration.between(clockIn, clockOut).toMinutes();

                OrgAttendanceRecord record = new OrgAttendanceRecord(
                        org, member, date, clockIn, AttendanceStatus.PRESENT, isLate
                );
                record.clockOut(clockOut);
                records.add(record);
            }
        }

        orgAttendanceRecordRepository.saveAllAndFlush(records);
        log.info("Created {} attendance records", records.size());
        return records;
    }

    // --- Anniversary & Holidays ---

    private void createOrgAnniversarySetting(Organization org) {
        OrgAnniversarySetting setting = OrgAnniversarySetting.builder()
                .organization(org)
                .birthdayEnabled(true)
                .hireAnniversaryEnabled(true)
                .build();
        orgAnniversarySettingRepository.saveAndFlush(setting);
        log.info("Created anniversary setting");
    }

    private void createOrgCustomHolidays(Organization org) {
        LocalDate today = LocalDate.now();
        List<OrgCustomHoliday> holidays = new ArrayList<>();

        holidays.add(new OrgCustomHoliday(org, today.withMonth(3).withDayOfMonth(1), "회사 창립기념일", true));
        holidays.add(new OrgCustomHoliday(org, today.plusMonths(2).withDayOfMonth(15), "여름 워크샵", false));
        holidays.add(new OrgCustomHoliday(org, today.withMonth(12).withDayOfMonth(24), "겨울 휴가", false));

        orgCustomHolidayRepository.saveAllAndFlush(holidays);
        log.info("Created {} custom holidays", holidays.size());
    }

    private void createOrgCelebrationMessages(Organization org, List<OrganizationMember> members, List<User> users) {
        LocalDate today = LocalDate.now();

        // 이영희 생일 축하 (이번 달 생일)
        OrgCelebrationMessage msg1 = OrgCelebrationMessage.create(
                org, members.get(2), users.get(0),
                AnniversaryType.BIRTHDAY, today.plusDays(2),
                "이영희님 생일 축하합니다! 항상 멋진 디자인 감사합니다 🎂"
        );
        orgCelebrationMessageRepository.saveAndFlush(msg1);

        // Owner 입사 기념일 축하
        OrgCelebrationMessage msg2 = OrgCelebrationMessage.create(
                org, members.get(0), users.get(1),
                AnniversaryType.HIRE_ANNIVERSARY, today.plusDays(5),
                "Admin님 입사 2주년 축하드립니다! 회사를 이끌어 주셔서 감사합니다."
        );
        orgCelebrationMessageRepository.saveAndFlush(msg2);

        // 김철수 입사 기념일 축하
        OrgCelebrationMessage msg3 = OrgCelebrationMessage.create(
                org, members.get(1), users.get(0),
                AnniversaryType.HIRE_ANNIVERSARY, today.minusDays(5),
                "김철수님 입사 기념일을 축하합니다. 개발팀의 든든한 리더!"
        );
        orgCelebrationMessageRepository.saveAndFlush(msg3);

        log.info("Created 3 celebration messages");
    }

    // --- Onboarding ---

    private OrgOnboardingTemplate createOrgOnboardingTemplate(Organization org) {
        OrgOnboardingTemplate template = OrgOnboardingTemplate.builder()
                .organization(org)
                .name("신규 입사자 온보딩")
                .description("새로운 팀원을 위한 기본 온보딩 체크리스트")
                .autoAssign(true)
                .build();

        template.getItems().add(OrgOnboardingTemplateItem.builder()
                .template(template).title("회사 소개 영상 시청").description("BRIDGE 회사 소개 영상을 시청합니다.")
                .dueDayOffset(1).assigneeRole(AssigneeRole.SELF).displayOrder(0).build());
        template.getItems().add(OrgOnboardingTemplateItem.builder()
                .template(template).title("개발 환경 세팅").description("로컬 개발 환경을 세팅합니다.")
                .dueDayOffset(3).assigneeRole(AssigneeRole.SELF).displayOrder(1).build());
        template.getItems().add(OrgOnboardingTemplateItem.builder()
                .template(template).title("팀원 소개 미팅").description("팀 리드와 1:1 미팅을 진행합니다.")
                .dueDayOffset(3).assigneeRole(AssigneeRole.MANAGER).displayOrder(2).build());
        template.getItems().add(OrgOnboardingTemplateItem.builder()
                .template(template).title("보안 교육 이수").description("정보보안 교육을 이수합니다.")
                .dueDayOffset(7).assigneeRole(AssigneeRole.SELF).displayOrder(3).build());
        template.getItems().add(OrgOnboardingTemplateItem.builder()
                .template(template).title("첫 번째 태스크 할당").description("첫 번째 업무를 할당받습니다.")
                .dueDayOffset(14).assigneeRole(AssigneeRole.MANAGER).displayOrder(4).build());

        orgOnboardingTemplateRepository.saveAndFlush(template);
        log.info("Created onboarding template with {} items", template.getItems().size());
        return template;
    }

    private void createOrgOnboardingInstance(Organization org, List<OrganizationMember> members, OrgOnboardingTemplate template) {
        // 최준혁 (members[5]) - 30일 전 입사, 3/5 완료
        OrganizationMember newbie = members.get(5);

        OrgOnboardingInstance instance = OrgOnboardingInstance.builder()
                .organization(org).member(newbie).sourceTemplate(template)
                .templateName(template.getName()).totalItems(5).completedItems(3)
                .status(OnboardingStatus.IN_PROGRESS)
                .startedAt(LocalDateTime.now(ZoneOffset.UTC).minusDays(30))
                .build();
        orgOnboardingInstanceRepository.saveAndFlush(instance);

        LocalDate startDate = LocalDate.now().minusDays(30);
        String[] titles = {"회사 소개 영상 시청", "개발 환경 세팅", "팀원 소개 미팅", "보안 교육 이수", "첫 번째 태스크 할당"};
        int[] dueDayOffsets = {1, 3, 3, 7, 14};

        for (int i = 0; i < titles.length; i++) {
            OrgOnboardingInstanceItem item = OrgOnboardingInstanceItem.builder()
                    .instance(instance).title(titles[i])
                    .dueDate(startDate.plusDays(dueDayOffsets[i]))
                    .displayOrder(i)
                    .completed(i < 3) // 처음 3개 완료
                    .completedAt(i < 3 ? LocalDateTime.now(ZoneOffset.UTC).minusDays(25 - i * 5) : null)
                    .build();
            orgOnboardingInstanceItemRepository.saveAndFlush(item);
        }

        log.info("Created onboarding instance for {}", newbie.getUser().getName());

        // 윤성민 (members[7]) - 인턴, 14일 전 입사, 1/5 완료
        OrganizationMember intern = members.get(7);

        OrgOnboardingInstance instance2 = OrgOnboardingInstance.builder()
                .organization(org).member(intern).sourceTemplate(template)
                .templateName(template.getName()).totalItems(5).completedItems(1)
                .status(OnboardingStatus.IN_PROGRESS)
                .startedAt(LocalDateTime.now(ZoneOffset.UTC).minusDays(14))
                .build();
        orgOnboardingInstanceRepository.saveAndFlush(instance2);

        LocalDate startDate2 = LocalDate.now().minusDays(14);
        for (int i = 0; i < titles.length; i++) {
            OrgOnboardingInstanceItem item2 = OrgOnboardingInstanceItem.builder()
                    .instance(instance2).title(titles[i])
                    .dueDate(startDate2.plusDays(dueDayOffsets[i]))
                    .displayOrder(i)
                    .completed(i < 1) // 첫 번째만 완료
                    .completedAt(i < 1 ? LocalDateTime.now(ZoneOffset.UTC).minusDays(12) : null)
                    .build();
            orgOnboardingInstanceItemRepository.saveAndFlush(item2);
        }

        log.info("Created onboarding instance for {}", intern.getUser().getName());
    }

    // --- 1:1 Meetings ---

    private void createOrgOneOnOnes(Organization org, List<OrganizationMember> members, List<User> users) {
        LocalDate today = LocalDate.now();

        // Owner <-> 김철수 (BIWEEKLY)
        OrgOneOnOne ono1 = new OrgOneOnOne(org, members.get(0), members.get(1),
                OneOnOneRecurrenceType.BIWEEKLY, 3, today.plusDays(7));
        orgOneOnOneRepository.saveAndFlush(ono1);

        OrgOneOnOneMeeting m1 = new OrgOneOnOneMeeting(ono1, today.minusDays(14),
                "상반기 목표 리뷰", "개발팀 목표 달성률 80%, Q2 계획 수립 필요", users.get(0));
        orgOneOnOneMeetingRepository.saveAndFlush(m1);

        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m1, "Q2 OKR 초안 작성", members.get(1), 0));
        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m1, "채용 계획 검토", members.get(0), 1));

        OrgOneOnOneMeeting m2 = new OrgOneOnOneMeeting(ono1, today.minusDays(28),
                "프로젝트 진행 상황", "BRIDGE v2.0 일정 검토 완료", users.get(0));
        orgOneOnOneMeetingRepository.saveAndFlush(m2);

        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m2, "기술 부채 목록 정리", members.get(1), 0));
        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m2, "성능 테스트 일정 확정", members.get(1), 1));

        // 김철수 <-> 박민수 (WEEKLY)
        OrgOneOnOne ono2 = new OrgOneOnOne(org, members.get(1), members.get(3),
                OneOnOneRecurrenceType.WEEKLY, 5, today.plusDays(3));
        orgOneOnOneRepository.saveAndFlush(ono2);

        OrgOneOnOneMeeting m3 = new OrgOneOnOneMeeting(ono2, today.minusDays(7),
                "프론트엔드 리팩토링 진행", "컴포넌트 구조 개선 방향 합의", users.get(1));
        orgOneOnOneMeetingRepository.saveAndFlush(m3);

        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m3, "컴포넌트 리팩토링 PR 생성", members.get(3), 0));
        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m3, "디자인 시스템 문서 업데이트", members.get(3), 1));

        OrgOneOnOneMeeting m4 = new OrgOneOnOneMeeting(ono2, today.minusDays(14),
                "스프린트 회고", "지난 스프린트 개선점 논의", users.get(1));
        orgOneOnOneMeetingRepository.saveAndFlush(m4);

        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m4, "테스트 커버리지 개선", members.get(3), 0));
        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m4, "코드 리뷰 가이드 작성", members.get(1), 1));

        // 김철수 <-> 최준혁 (MONTHLY, 신입 멘토링)
        OrgOneOnOne ono3 = new OrgOneOnOne(org, members.get(1), members.get(5),
                OneOnOneRecurrenceType.MONTHLY, 1, today.plusDays(14));
        orgOneOnOneRepository.saveAndFlush(ono3);

        OrgOneOnOneMeeting m5 = new OrgOneOnOneMeeting(ono3, today.minusDays(5),
                "신입 온보딩 체크인", "온보딩 진행률 60%, 개발 환경 세팅 완료", users.get(1));
        orgOneOnOneMeetingRepository.saveAndFlush(m5);

        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m5, "코드 스타일 가이드 숙지", members.get(5), 0));
        orgOneOnOneActionItemRepository.saveAndFlush(
                new OrgOneOnOneActionItem(m5, "첫 PR 생성 및 리뷰", members.get(5), 1));

        log.info("Created 3 one-on-one pairs with 5 meetings and 10 action items");
    }

    // --- Announcements ---

    private List<OrgAnnouncement> createOrgAnnouncements(Organization org, List<OrganizationMember> members) {
        List<OrgAnnouncement> announcements = new ArrayList<>();

        OrgAnnouncement a1 = OrgAnnouncement.builder()
                .organization(org).author(members.get(0))
                .title("2026년 상반기 전사 목표")
                .content("안녕하세요, 팀원 여러분.\n\n2026년 상반기 전사 목표를 공유합니다.\n\n1. 사용자 10만 달성\n2. MAU 50% 성장\n3. 엔터프라이즈 고객 5개사 확보\n\n각 팀별 세부 OKR은 팀장을 통해 공유될 예정입니다.")
                .isPinned(true).build();
        announcements.add(a1);

        OrgAnnouncement a2 = OrgAnnouncement.builder()
                .organization(org).author(members.get(1))
                .title("사내 해커톤 개최 안내")
                .content("다음 달 첫째 주 금요일에 사내 해커톤을 개최합니다.\n\n주제: AI 활용 업무 자동화\n참가 신청: 이번 주 금요일까지\n\n많은 참여 부탁드립니다!")
                .build();
        announcements.add(a2);

        OrgAnnouncement a3 = OrgAnnouncement.builder()
                .organization(org).author(members.get(0))
                .title("연말 워크샵 일정 공지")
                .content("12월 셋째 주 목-금 1박 2일로 연말 워크샵을 진행합니다.\n장소: 제주도\n\n세부 일정은 추후 공지드리겠습니다.")
                .build();
        announcements.add(a3);

        orgAnnouncementRepository.saveAllAndFlush(announcements);
        log.info("Created {} announcements", announcements.size());
        return announcements;
    }

    // --- Activities ---

    private List<OrgActivity> createOrgActivities(Organization org, List<OrganizationMember> members,
                                                   List<OrgAnnouncement> announcements, List<LeaveRequest> leaveRequests) {
        List<OrgActivity> activities = new ArrayList<>();

        // Member joined activities
        for (OrganizationMember member : members) {
            activities.add(OrgActivity.builder()
                    .organization(org).actorName(member.getUser().getName())
                    .activityType(OrgActivityType.MEMBER_JOINED)
                    .targetName(org.getName())
                    .build());
        }

        // Announcement posted
        activities.add(OrgActivity.builder()
                .organization(org).actorName(members.get(0).getUser().getName())
                .activityType(OrgActivityType.ANNOUNCEMENT_POSTED)
                .targetName(announcements.get(0).getTitle())
                .build());

        // Leave approved
        activities.add(OrgActivity.builder()
                .organization(org).actorName(members.get(0).getUser().getName())
                .activityType(OrgActivityType.LEAVE_APPROVED)
                .targetName(members.get(2).getUser().getName())
                .build());

        orgActivityRepository.saveAllAndFlush(activities);
        log.info("Created {} activities", activities.size());
        return activities;
    }

    // --- Member Histories ---

    private List<OrgMemberHistory> createOrgMemberHistories(Organization org, List<OrganizationMember> members) {
        List<OrgMemberHistory> histories = new ArrayList<>();

        for (OrganizationMember member : members) {
            OrgMemberHistory history = new OrgMemberHistory(
                    org, member,
                    member.getDepartment() != null ? member.getDepartment().getId() : null,
                    member.getDepartment() != null ? member.getDepartment().getName() : null,
                    member.getPosition() != null ? member.getPosition().getId() : null,
                    member.getPosition() != null ? member.getPosition().getName() : null,
                    member.getTitle() != null ? member.getTitle().getId() : null,
                    member.getTitle() != null ? member.getTitle().getName() : null,
                    member.getGrade() != null ? member.getGrade().getId() : null,
                    member.getGrade() != null ? member.getGrade().getName() : null,
                    member.getJobGroup() != null ? member.getJobGroup().getId() : null,
                    member.getJobGroup() != null ? member.getJobGroup().getName() : null,
                    member.getJobTitle(),
                    member.getHireDate() != null ? member.getHireDate() : LocalDate.now(),
                    member.getWorkStatus() == WorkStatus.RESIGNED ? LocalDate.now().minusDays(7) : null,
                    member.getWorkStatus() == WorkStatus.RESIGNED ? "퇴사" : "입사 시 초기 배치",
                    null, // createdById
                    "AUTO"
            );
            histories.add(history);
        }

        // 박민수(member[3]) 추가 이력: 과거 마케팅팀 → 현재 프론트엔드파트 이동
        OrganizationMember parkMinsu = members.get(3);
        OrgMemberHistory prevHistory = new OrgMemberHistory(
                org, parkMinsu,
                null, "마케팅팀", // 이전 부서
                null, "주니어",
                null, "사원",
                null, "G3",
                null, "비즈니스",
                "마케팅 어시스턴트",
                parkMinsu.getHireDate(), parkMinsu.getHireDate().plusDays(100),
                "마케팅팀에서 개발팀으로 전환 배치",
                null, "MANUAL"
        );
        histories.add(prevHistory);

        orgMemberHistoryRepository.saveAllAndFlush(histories);
        log.info("Created {} member histories", histories.size());
        return histories;
    }

    // --- Organization Boards ---

    /**
     * 조직에 연결된 보드 2개 생성 (인사이트 데이터 포함)
     */
    private List<Board> createOrgBoards(Organization org, User owner, List<User> users, List<OrganizationMember> members) {
        List<Board> orgBoards = new ArrayList<>();

        // Board 1: 스프린트 프로젝트 (개발)
        Board devBoard = Board.builder()
                .name("스프린트 프로젝트")
                .description("개발팀 스프린트 보드")
                .owner(owner)
                .workHoursPerDay(8)
                .workStartTime(LocalTime.of(9, 0))
                .build();
        boardRepository.saveAndFlush(devBoard);
        devBoard.setOrganization(org);
        boardRepository.saveAndFlush(devBoard);
        createPremiumSubscription(devBoard);

        // Board 2: 마케팅 캠페인
        Board mktBoard = Board.builder()
                .name("마케팅 캠페인")
                .description("마케팅팀 캠페인 관리 보드")
                .owner(owner)
                .workHoursPerDay(8)
                .workStartTime(LocalTime.of(9, 0))
                .build();
        boardRepository.saveAndFlush(mktBoard);
        mktBoard.setOrganization(org);
        boardRepository.saveAndFlush(mktBoard);
        createPremiumSubscription(mktBoard);

        // Add org members as board members
        addOrgMembersToBoardSimple(devBoard, owner, users);
        addOrgMembersToBoardSimple(mktBoard, owner, users);

        // Create blocks for each board
        List<Block> devBlocks = createBlocks(devBoard);
        List<Block> mktBlocks = createBlocks(mktBoard);

        // Create features & tasks for dev board
        List<Feature> devFeatures = createOrgBoardFeatures(devBoard, owner, users,
                new String[]{"사용자 인증 모듈", "대시보드 리팩토링", "API 성능 최적화", "모바일 반응형"},
                new String[]{"JWT 기반 인증 시스템 구현", "대시보드 UI/UX 개선", "API 응답 속도 50% 개선", "모바일 뷰 최적화"},
                devBlocks);

        List<Feature> mktFeatures = createOrgBoardFeatures(mktBoard, owner, users,
                new String[]{"SNS 캠페인 기획", "이벤트 페이지 제작", "콘텐츠 전략 수립"},
                new String[]{"인스타그램/X 통합 캠페인", "프로모션 랜딩 페이지", "분기별 콘텐츠 캘린더 작성"},
                mktBlocks);

        // Create tasks for each feature
        List<Task> devTasks = createOrgBoardTasks(devBoard, devFeatures, owner, users, devBlocks);
        List<Task> mktTasks = createOrgBoardTasks(mktBoard, mktFeatures, owner, users, mktBlocks);

        // Create checklist items for tasks
        List<ChecklistItem> devChecklist = createOrgBoardChecklistItems(devTasks, users);
        List<ChecklistItem> mktChecklist = createOrgBoardChecklistItems(mktTasks, users);

        // Create schedule blocks for insights (30 days)
        createOrgBoardScheduleBlocks(devBoard, devChecklist, users);
        createOrgBoardScheduleBlocks(mktBoard, mktChecklist, users);

        orgBoards.add(devBoard);
        orgBoards.add(mktBoard);
        log.info("Created {} organization boards with insights data", orgBoards.size());
        return orgBoards;
    }

    private void addOrgMembersToBoardSimple(Board board, User owner, List<User> users) {
        // Owner as board owner
        BoardMember ownerMember = BoardMember.builder()
                .board(board).user(owner).role(BoardRole.OWNER).build();
        boardMemberRepository.saveAndFlush(ownerMember);

        // First 5 users as board members (skip duplicates with owner)
        for (int i = 0; i < Math.min(users.size(), 6); i++) {
            User user = users.get(i);
            if (user.getId().equals(owner.getId())) continue;
            BoardMember bm = BoardMember.builder()
                    .board(board).user(user)
                    .role(i == 1 ? BoardRole.ADMIN : BoardRole.MEMBER)
                    .invitedBy(owner).build();
            boardMemberRepository.saveAndFlush(bm);
        }
    }

    private List<Feature> createOrgBoardFeatures(Board board, User owner, List<User> users,
                                                   String[] names, String[] descriptions, List<Block> blocks) {
        List<Feature> features = new ArrayList<>();
        String[] colors = {"#3b82f6", "#10b981", "#8b5cf6", "#ec4899"};

        for (int i = 0; i < names.length; i++) {
            Feature feature = Feature.builder()
                    .board(board)
                    .title(names[i])
                    .description(descriptions[i])
                    .color(colors[i % colors.length])
                    .assignee(users.get(i % users.size()))
                    .createdBy(users.get(i % users.size()))
                    .position(i)
                    .dueDate(LocalDate.now().plusDays(10 + i * 5))
                    .build();
            features.add(feature);
        }
        featureRepository.saveAllAndFlush(features);
        return features;
    }

    private List<Task> createOrgBoardTasks(Board board, List<Feature> features, User owner, List<User> users, List<Block> blocks) {
        List<Task> tasks = new ArrayList<>();
        Block taskBlock = blocks.stream()
                .filter(b -> b.getFixedType() == FixedBlockType.TASK)
                .findFirst().orElse(blocks.get(1));
        Block doneBlock = blocks.stream()
                .filter(b -> b.getFixedType() == FixedBlockType.DONE)
                .findFirst().orElse(blocks.get(blocks.size() - 1));

        String[][] taskNames = {
                {"DB 스키마 설계", "API 엔드포인트 구현", "단위 테스트 작성"},
                {"와이어프레임 작성", "컴포넌트 개발", "접근성 개선"},
                {"병목 분석", "쿼리 최적화", "캐시 레이어 추가"},
                {"반응형 레이아웃", "터치 인터랙션"},
        };

        for (int fi = 0; fi < features.size(); fi++) {
            String[] tNames = fi < taskNames.length ? taskNames[fi] : new String[]{"작업 1", "작업 2"};
            for (int ti = 0; ti < tNames.length; ti++) {
                boolean isDone = fi == 0 && ti < 2; // 첫 피처의 처음 2개 태스크 완료
                Task task = Task.builder()
                        .board(board)
                        .feature(features.get(fi))
                        .block(isDone ? doneBlock : taskBlock)
                        .title(tNames[ti])
                        .createdBy(users.get((fi + ti) % users.size()))
                        .position(ti)
                        .build();
                tasks.add(task);
            }
        }
        taskRepository.saveAllAndFlush(tasks);

        // Mark done tasks as completed
        for (Task task : tasks) {
            if (task.getBlock().isDoneBlock()) {
                task.complete();
            }
        }
        taskRepository.saveAllAndFlush(tasks);

        return tasks;
    }

    private List<ChecklistItem> createOrgBoardChecklistItems(List<Task> tasks, List<User> users) {
        List<ChecklistItem> items = new ArrayList<>();
        String[] checklistNames = {"설계 검토", "코드 작성", "테스트", "코드 리뷰", "배포 준비"};
        int boardMemberCount = Math.min(users.size(), 6); // 보드 멤버 범위 내에서만

        for (int ti = 0; ti < tasks.size(); ti++) {
            Task task = tasks.get(ti);
            int itemCount = 2 + random.nextInt(3); // 2~4개
            for (int ci = 0; ci < itemCount; ci++) {
                ChecklistItem item = ChecklistItem.builder()
                        .task(task)
                        .title(checklistNames[ci % checklistNames.length])
                        .assignee(users.get((ti + ci) % boardMemberCount))
                        .position(ci)
                        .isCompleted(ci < itemCount / 2) // 절반 완료
                        .build();
                items.add(item);
            }
        }
        checklistItemRepository.saveAllAndFlush(items);
        return items;
    }

    /**
     * 조직 보드용 스케줄 블록 생성 (인사이트 데이터)
     * 30일치 × 멤버별 2~4개 블록
     */
    private void createOrgBoardScheduleBlocks(Board board, List<ChecklistItem> checklistItems, List<User> users) {
        List<ScheduleBlock> blocks = new ArrayList<>();
        LocalDate today = LocalDate.now();
        int memberCount = Math.min(users.size(), 6);

        for (int dayOffset = 30; dayOffset >= 0; dayOffset--) {
            LocalDate date = today.minusDays(dayOffset);
            if (date.getDayOfWeek().getValue() > 5) continue; // 주말 스킵

            for (int mi = 0; mi < memberCount; mi++) {
                User member = users.get(mi);
                int blocksPerDay = 2 + random.nextInt(3); // 2~4
                List<LocalTime[]> timeSlots = generateTimeSlots(blocksPerDay);

                for (int i = 0; i < Math.min(blocksPerDay, timeSlots.size()); i++) {
                    ChecklistItem item = !checklistItems.isEmpty()
                            ? checklistItems.get(random.nextInt(checklistItems.size()))
                            : null;
                    LocalTime[] slot = timeSlots.get(i);

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
        log.info("Created {} org board schedule blocks for insights (board: {})", blocks.size(), board.getName());
    }
}
