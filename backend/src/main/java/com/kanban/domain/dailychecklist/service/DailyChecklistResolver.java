package com.kanban.domain.dailychecklist.service;

import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.dailychecklist.DailyChecklist;
import com.kanban.domain.dailychecklist.DailyChecklistRepository;
import com.kanban.domain.dailychecklist.DailySource;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * "오늘의 체크리스트"를 만들어내는 단일 지점.
 *
 * <p>오늘의 체크리스트는 별도 목록이 아니라 내 체크리스트를 날짜로 거른 뷰다.</p>
 * <pre>
 * 오늘의 체크리스트(담당자, D)
 *   = { 기간이 D를 덮는 항목 }        ← 파생 (checklist_items.start_date~due_date)
 *   + { D에 PIN 한 항목 }             ← daily_checklists (kind = PIN)
 *   - { D에서 EXCLUDE 한 항목 }       ← daily_checklists (kind = EXCLUDE)
 * </pre>
 *
 * <p>데일리 뷰({@code ScheduleFacadeService})와 타임블록 모달({@code DailyChecklistService})이
 * 서로 다른 목록을 보던 문제를 없애기 위해, 두 곳 모두 이 리졸버를 통해 목록을 얻는다.</p>
 */
@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DailyChecklistResolver {

    private final DailyChecklistRepository dailyChecklistRepository;
    private final ChecklistItemRepository checklistItemRepository;

    /**
     * 병합된 오늘의 체크리스트 한 건.
     *
     * @param id         프론트가 쓰는 식별자. 예외 행이 있으면 그 행 ID, 파생 전용이면 {@code derived-{checklistItemId}}
     * @param row        예외 행 (PIN). 파생 전용이면 null
     * @param item       원본 체크리스트 항목. 임시(ad-hoc) 항목이면 null
     * @param pinned     사용자가 명시적으로 그 날로 당겨왔는지
     */
    public record ResolvedItem(
            String id,
            DailyChecklist row,
            ChecklistItem item,
            String title,
            User assignee,
            LocalDate assignedDate,
            int position,
            boolean completed,
            DailySource source,
            boolean pinned,
            LocalDate startDate,
            LocalDate dueDate
    ) {
        public String checklistItemId() {
            return item != null ? item.getId() : null;
        }
    }

    /** 파생 항목에 부여하는 ID 접두사. 실제 daily_checklists 행이 없는 항목이라는 표식. */
    public static final String DERIVED_ID_PREFIX = "derived-";

    public static boolean isDerivedId(String id) {
        return id != null && id.startsWith(DERIVED_ID_PREFIX);
    }

    public static String checklistItemIdFromDerivedId(String id) {
        return isDerivedId(id) ? id.substring(DERIVED_ID_PREFIX.length()) : null;
    }

    /**
     * 보드 전체의 담당자별 오늘의 체크리스트.
     *
     * @return assigneeId → 항목 목록 (핀이 앞, 파생이 뒤)
     */
    public Map<String, List<ResolvedItem>> resolveByAssignee(String boardId, LocalDate date) {
        List<DailyChecklist> overrides = dailyChecklistRepository
                .findOverridesByBoardIdAndAssignedDate(boardId, date);

        Set<String> excludedItemIds = new HashSet<>();
        Set<String> pinnedItemIds = new HashSet<>();
        List<DailyChecklist> pins = new ArrayList<>();

        for (DailyChecklist override : overrides) {
            String itemId = override.getChecklistItem() != null ? override.getChecklistItem().getId() : null;
            if (override.isExclude()) {
                if (itemId != null) excludedItemIds.add(itemId);
                continue;
            }
            pins.add(override);
            if (itemId != null) pinnedItemIds.add(itemId);
        }

        Map<String, List<ResolvedItem>> result = new LinkedHashMap<>();

        // 1. 핀 항목 — position 순서를 그대로 유지한다 (사용자가 직접 정렬한 결과)
        for (DailyChecklist pin : pins) {
            ChecklistItem item = pin.getChecklistItem();
            boolean completed = item != null && Boolean.TRUE.equals(item.getIsCompleted());
            DailySource source = item == null
                    ? DailySource.ADHOC
                    : classify(item, date, completed);

            result.computeIfAbsent(pin.getAssignee().getId(), k -> new ArrayList<>())
                    .add(new ResolvedItem(
                            pin.getId(),
                            pin,
                            item,
                            pin.getTitle(),
                            pin.getAssignee(),
                            date,
                            pin.getPosition(),
                            completed,
                            source,
                            true,
                            item != null ? item.getStartDate() : null,
                            item != null ? item.getDueDate() : null
                    ));
        }

        // 2. 파생 항목 — 이미 핀으로 잡혀 있거나 제외된 항목은 건너뛴다
        Map<String, Integer> nextPosition = new HashMap<>();
        result.forEach((assigneeId, items) -> nextPosition.put(assigneeId, items.size()));

        List<ChecklistItem> derived = checklistItemRepository
                .findDailyDerivedByBoardIdAndDate(boardId, date);

        for (ChecklistItem item : derived) {
            if (excludedItemIds.contains(item.getId())) continue;
            if (pinnedItemIds.contains(item.getId())) continue;

            User assignee = item.getAssignee();
            if (assignee == null) continue;

            boolean completed = Boolean.TRUE.equals(item.getIsCompleted());
            int position = nextPosition.merge(assignee.getId(), 1, Integer::sum) - 1;

            result.computeIfAbsent(assignee.getId(), k -> new ArrayList<>())
                    .add(new ResolvedItem(
                            DERIVED_ID_PREFIX + item.getId(),
                            null,
                            item,
                            item.getTitle(),
                            assignee,
                            date,
                            position,
                            completed,
                            classify(item, date, completed),
                            false,
                            item.getStartDate(),
                            item.getDueDate()
                    ));
        }

        return result;
    }

    /** 담당자 한 명의 오늘의 체크리스트. */
    public List<ResolvedItem> resolveForAssignee(String boardId, LocalDate date, String assigneeId) {
        if (assigneeId == null) return List.of();
        return resolveByAssignee(boardId, date).getOrDefault(assigneeId, List.of());
    }

    /**
     * 항목이 그 날짜에 보이는 이유를 판정한다.
     * 지연 판정을 기간 판정보다 먼저 하지 않는다 — 기간 안에 있으면 아직 지연이 아니다.
     */
    private DailySource classify(ChecklistItem item, LocalDate date, boolean completed) {
        if (covers(item, date)) return DailySource.DERIVED;

        LocalDate due = item.getDueDate();
        if (!completed && due != null && due.isBefore(date)) return DailySource.OVERDUE;

        return DailySource.PINNED;
    }

    /** 항목의 기간이 해당 날짜를 덮는가. */
    private boolean covers(ChecklistItem item, LocalDate date) {
        LocalDate start = item.getStartDate();
        LocalDate due = item.getDueDate();

        if (start != null && due != null) {
            return !start.isAfter(date) && !due.isBefore(date);
        }
        if (start == null && due != null) {
            return due.isEqual(date);
        }
        if (start != null) {
            return start.isEqual(date);
        }
        return false;
    }
}
