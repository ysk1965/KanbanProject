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
import com.kanban.domain.schedule.ScheduleBlock;
import com.kanban.domain.schedule.ScheduleBlockRepository;
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
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
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

    @Transactional
    public TestDataResponse createTestBoard(String userId) {
        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // 1. 테스트 보드 생성
        Board board = Board.builder()
                .name("테스트 보드 - 스케줄 데모")
                .description("Schedule Block 기능을 테스트하기 위한 보드입니다.")
                .owner(owner)
                .workHoursPerDay(8)
                .workStartTime(LocalTime.of(9, 0))
                .build();
        boardRepository.saveAndFlush(board);  // saveAndFlush로 즉시 DB에 저장
        log.info("Created test board: {}", board.getId());

        // 2. 테스트 멤버 생성 (실제 유저가 없으면 더미 유저 생성)
        List<User> members = createTestMembers(owner);

        // 3. 보드 멤버 추가
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

        // 4. 기본 블록 생성
        List<Block> blocks = createDefaultBlocks(board);

        // 5. 태그 생성
        List<Tag> tags = createTags(board);

        // 6. Feature 생성
        List<Feature> features = createFeatures(board, owner, members, tags);

        // 7. Task 생성
        List<Task> tasks = createTasks(board, features, owner, members, tags, blocks);

        // 8. Checklist Items 생성
        List<ChecklistItem> checklistItems = createChecklistItems(tasks, members);

        // 9. Schedule Blocks 생성
        List<ScheduleBlock> scheduleBlocks = createScheduleBlocks(board, checklistItems, members);

        return TestDataResponse.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .memberCount(members.size())
                .featureCount(features.size())
                .taskCount(tasks.size())
                .checklistItemCount(checklistItems.size())
                .scheduleBlockCount(scheduleBlocks.size())
                .message("테스트 보드가 성공적으로 생성되었습니다!")
                .build();
    }

    private List<User> createTestMembers(User owner) {
        List<User> members = new ArrayList<>();
        members.add(owner);

        // 테스트용 더미 유저 생성 (이미 있으면 기존 것 사용)
        String[] names = {"김철수", "이영희", "박민수"};
        String[] emails = {"testuser1@test.com", "testuser2@test.com", "testuser3@test.com"};

        for (int i = 0; i < names.length; i++) {
            User existing = userRepository.findByEmail(emails[i]).orElse(null);
            if (existing != null) {
                members.add(existing);
            } else {
                User newUser = User.builder()
                        .id(UUID.randomUUID().toString())
                        .email(emails[i])
                        .name(names[i])
                        .passwordHash("$2a$10$dummyhashedpassword") // bcrypt dummy
                        .build();
                userRepository.saveAndFlush(newUser);  // saveAndFlush로 즉시 DB에 저장
                members.add(newUser);
            }
        }

        return members;
    }

    private List<Block> createDefaultBlocks(Board board) {
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

        // Done 블록
        Block doneBlock = Block.builder()
                .board(board)
                .name("Done")
                .type(BlockType.FIXED)
                .fixedType(FixedBlockType.DONE)
                .position(2)
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
                {"문서화", "#8b5cf6"}
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

    private List<Feature> createFeatures(Board board, User createdBy, List<User> members, List<Tag> tags) {
        List<Feature> features = new ArrayList<>();

        Object[][] featureData = {
                {"사용자 인증 시스템", "로그인, 회원가입, OAuth 연동", "#3b82f6", 0},
                {"대시보드 UI", "메인 대시보드 화면 개발", "#10b981", 1},
                {"스케줄 관리", "일일 스케줄 뷰 및 타임블록 기능", "#8b5cf6", 2}
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
                    .dueDate(LocalDate.now().plusDays(7 + i * 3))
                    .createdBy(createdBy)
                    .build();
            featureRepository.saveAndFlush(feature);
            features.add(feature);
        }

        return features;
    }

    private List<Task> createTasks(Board board, List<Feature> features, User createdBy, List<User> members, List<Tag> tags, List<Block> blocks) {
        List<Task> tasks = new ArrayList<>();

        Block taskBlock = blocks.stream()
                .filter(b -> b.getFixedType() == FixedBlockType.TASK)
                .findFirst().orElse(blocks.get(1));

        Block doneBlock = blocks.stream()
                .filter(b -> b.getFixedType() == FixedBlockType.DONE)
                .findFirst().orElse(blocks.get(2));

        // Feature 1의 Task들
        Feature feature1 = features.get(0);
        tasks.add(createTask(board, feature1, taskBlock, "로그인 API 개발", members.get(0), createdBy, 0));
        tasks.add(createTask(board, feature1, taskBlock, "회원가입 폼 구현", members.get(1), createdBy, 1));
        tasks.add(createTask(board, feature1, doneBlock, "OAuth 설정", members.get(0), createdBy, 2));

        // Feature 2의 Task들
        Feature feature2 = features.get(1);
        tasks.add(createTask(board, feature2, taskBlock, "대시보드 레이아웃", members.get(2 % members.size()), createdBy, 0));
        tasks.add(createTask(board, feature2, taskBlock, "차트 컴포넌트", members.get(1), createdBy, 1));

        // Feature 3의 Task들 (스케줄 관련)
        Feature feature3 = features.get(2);
        tasks.add(createTask(board, feature3, taskBlock, "DailyScheduleView 구현", members.get(0), createdBy, 0));
        tasks.add(createTask(board, feature3, taskBlock, "ScheduleBlock 컴포넌트", members.get(1), createdBy, 1));
        tasks.add(createTask(board, feature3, taskBlock, "드래그 선택 기능", members.get(2 % members.size()), createdBy, 2));

        return tasks;
    }

    private Task createTask(Board board, Feature feature, Block block, String title, User assignee, User createdBy, int position) {
        Task task = Task.builder()
                .board(board)
                .feature(feature)
                .block(block)
                .title(title)
                .assignee(assignee)
                .position(position)
                .dueDate(LocalDate.now().plusDays(position + 1))
                .createdBy(createdBy)
                .build();
        taskRepository.saveAndFlush(task);

        // Feature의 totalTasks 증가
        feature.incrementTotalTasks();

        return task;
    }

    private List<ChecklistItem> createChecklistItems(List<Task> tasks, List<User> members) {
        List<ChecklistItem> items = new ArrayList<>();

        // 각 Task에 2-3개의 체크리스트 아이템 생성
        for (Task task : tasks) {
            int itemCount = 2 + (int) (Math.random() * 2); // 2-3개
            for (int i = 0; i < itemCount; i++) {
                User assignee = members.get(i % members.size());
                boolean isCompleted = Math.random() < 0.3; // 30% 확률로 완료

                ChecklistItem item = ChecklistItem.builder()
                        .task(task)
                        .title(task.getTitle() + " - 세부작업 " + (i + 1))
                        .assignee(assignee)
                        .position(i)
                        .startDate(LocalDate.now())
                        .dueDate(LocalDate.now().plusDays(i + 1))
                        .isCompleted(isCompleted)
                        .build();
                checklistItemRepository.saveAndFlush(item);
                items.add(item);
            }
        }

        return items;
    }

    private List<ScheduleBlock> createScheduleBlocks(Board board, List<ChecklistItem> checklistItems, List<User> members) {
        List<ScheduleBlock> blocks = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 오늘 날짜에 몇 개의 스케줄 블록 생성
        LocalTime[] startTimes = {
                LocalTime.of(9, 0),
                LocalTime.of(10, 30),
                LocalTime.of(14, 0),
                LocalTime.of(15, 30)
        };
        LocalTime[] endTimes = {
                LocalTime.of(10, 30),
                LocalTime.of(12, 0),
                LocalTime.of(15, 30),
                LocalTime.of(17, 0)
        };

        int blockIndex = 0;
        for (int memberIndex = 0; memberIndex < Math.min(members.size(), 3); memberIndex++) {
            User member = members.get(memberIndex);

            // 각 멤버에게 1-2개의 블록 배정
            int blocksForMember = 1 + (int) (Math.random() * 2);
            for (int i = 0; i < blocksForMember && blockIndex < startTimes.length; i++) {
                ChecklistItem item = checklistItems.size() > blockIndex ? checklistItems.get(blockIndex) : null;

                ScheduleBlock block = ScheduleBlock.builder()
                        .board(board)
                        .checklistItem(item)
                        .assignee(member)
                        .scheduledDate(today)
                        .startTime(startTimes[blockIndex])
                        .endTime(endTimes[blockIndex])
                        .build();
                scheduleBlockRepository.saveAndFlush(block);
                blocks.add(block);
                blockIndex++;
            }
        }

        // 내일 날짜에도 몇 개 추가
        LocalDate tomorrow = today.plusDays(1);
        for (int memberIndex = 0; memberIndex < Math.min(members.size(), 2); memberIndex++) {
            User member = members.get(memberIndex);
            ChecklistItem item = checklistItems.size() > blockIndex ? checklistItems.get(blockIndex % checklistItems.size()) : null;

            ScheduleBlock block = ScheduleBlock.builder()
                    .board(board)
                    .checklistItem(item)
                    .assignee(member)
                    .scheduledDate(tomorrow)
                    .startTime(LocalTime.of(9, 0))
                    .endTime(LocalTime.of(11, 0))
                    .build();
            scheduleBlockRepository.saveAndFlush(block);
            blocks.add(block);
        }

        return blocks;
    }
}
