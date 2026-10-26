package com.kanban.domain.readingplan.service;

import com.kanban.domain.readingplan.ReadingCheck;
import com.kanban.domain.readingplan.ReadingCheckRepository;
import com.kanban.domain.readingplan.ReadingPlan;
import com.kanban.domain.readingplan.ReadingPlanDay;
import com.kanban.domain.readingplan.ReadingPlanDayRepository;
import com.kanban.domain.readingplan.ReadingPlanRepository;
import com.kanban.domain.readingplan.dto.ReadingPlanRequest;
import com.kanban.domain.readingplan.dto.ReadingPlanResponse;
import com.kanban.domain.sermongroup.SermonGroup;
import com.kanban.domain.sermongroup.SermonGroupMember;
import com.kanban.domain.sermongroup.SermonGroupMemberRepository;
import com.kanban.domain.sermongroup.SermonGroupRepository;
import com.kanban.domain.sermongroup.service.SermonGroupSupport;
import com.kanban.domain.user.User;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 함께 읽는 길 (통독). 계약서: docs/Tech/sermon-reading-plans-api.md
 *
 * <p>날 나누기는 프런트가 하고 서버는 받은 날 목록을 검증해 저장한다. 조회도 쓰기 트랜잭션 — 끝난 날이 지난 active 길을
 * done 으로 바꾸기 때문.
 *
 * <p>권한: 모임 길은 그 모임 active 멤버만 보고 찍는다(아니면 RP006), 만들기·끝내기는 리더·함께 리더(SG003). 나의 길은
 * 주인만.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ReadingPlanService {

    public static final int MAX_SOLO_ACTIVE = 3;
    public static final int MAX_DAYS = 400;
    public static final int MAX_CHAPTERS_PER_DAY = 10;
    public static final int MAX_TOTAL_CHAPTERS = 1300;
    public static final int MAX_DUE = 30;

    private static final int TITLE_MAX = 40;
    private static final int TEMPLATE_MAX = 20;
    private static final String DEFAULT_TEMPLATE = "custom";
    private static final int LAST_BOOK = 65;
    private static final int LAST_CHAPTER = 150;
    private static final Pattern CHAPTER = Pattern.compile("(0|[1-9]\\d?):([1-9]\\d{0,2})");

    private final ReadingPlanRepository planRepository;
    private final ReadingPlanDayRepository dayRepository;
    private final ReadingCheckRepository checkRepository;
    private final SermonGroupRepository groupRepository;
    private final SermonGroupMemberRepository memberRepository;
    private final SermonGroupSupport groupSupport;

    /** 길을 보고 찍는 사람들(모임 active 멤버 가입순 · 나의 길은 주인)과 보는 사람의 관리 권한 */
    private record Access(String groupName, List<Reader> readers, boolean canManage) {}

    private record Reader(String userId, String displayName) {}

    /** 내 active 길 — 모임 길(모임 이름순) 먼저, 나의 길(만든 순) 다음 */
    private record MyPlans(List<ReadingPlan> plans, Map<String, String> groupNames) {}

    // ───────────────── 만들기 ─────────────────

    public ReadingPlanResponse.PlanDetail create(String userId, ReadingPlanRequest.Create request) {
        LocalDate today = utcToday();
        String title = validateTitle(request.getTitle());
        String template = validateTemplate(request.getTemplate());
        List<ReadingPlanRequest.Day> inputDays = request.getDays();
        List<LocalDate> dates = new ArrayList<>();
        List<List<String>> chapters = new ArrayList<>();
        validateDays(inputDays, today, dates, chapters);

        String groupId = blankToNull(request.getGroupId());
        Access access;
        if (groupId != null) {
            SermonGroup group = groupSupport.requireGroup(groupId);
            groupSupport.requireManager(groupId, userId);
            if (countStillActive(planRepository.findByGroupIdAndStatus(groupId, ReadingPlan.STATUS_ACTIVE), today)
                    > 0) {
                throw new BusinessException(ErrorCode.READING_PLAN_GROUP_ACTIVE_EXISTS);
            }
            access = groupAccess(group, userId);
        } else {
            if (countStillActive(
                            planRepository.findByOwnerUserIdAndStatusOrderByCreatedAtAsc(
                                    userId, ReadingPlan.STATUS_ACTIVE),
                            today)
                    >= MAX_SOLO_ACTIVE) {
                throw new BusinessException(ErrorCode.READING_PLAN_SOLO_LIMIT);
            }
            access = soloAccess(userId);
        }

        ReadingPlan plan = planRepository.save(ReadingPlan.builder()
                .groupId(groupId)
                .ownerUserId(groupId == null ? userId : null)
                .title(title)
                .template(template)
                .status(ReadingPlan.STATUS_ACTIVE)
                .startDate(dates.get(0))
                .endDate(dates.get(dates.size() - 1))
                .createdBy(userId)
                .build());
        List<ReadingPlanDay> days = new ArrayList<>();
        for (int i = 0; i < dates.size(); i++) {
            days.add(ReadingPlanDay.builder()
                    .planId(plan.getId())
                    .dayNo(i + 1)
                    .date(dates.get(i))
                    .chapters(chapters.get(i))
                    .build());
        }
        dayRepository.saveAll(days);
        return toDetail(plan, access, userId, today);
    }

    // ───────────────── 조회 ─────────────────

    public ReadingPlanResponse.Mine mine(String userId, String rawToday) {
        LocalDate today = resolveToday(rawToday);
        MyPlans mine = myActivePlans(userId, today);
        if (mine.plans().isEmpty()) {
            return ReadingPlanResponse.Mine.builder().plans(List.of()).build();
        }
        List<String> planIds = mine.plans().stream().map(ReadingPlan::getId).toList();
        Map<String, List<ReadingPlanDay>> daysByPlan = dayRepository.findByPlanIdInOrderByDayNoAsc(planIds).stream()
                .collect(Collectors.groupingBy(ReadingPlanDay::getPlanId));
        Map<String, Map<Integer, Set<String>>> myChecks =
                byPlanAndDay(checkRepository.findByPlanIdInAndUserId(planIds, userId));

        List<ReadingPlanResponse.PlanSummary> out = new ArrayList<>();
        for (ReadingPlan plan : mine.plans()) {
            List<ReadingPlanDay> days = daysByPlan.getOrDefault(plan.getId(), List.of());
            Map<Integer, Set<String>> stamped = myChecks.getOrDefault(plan.getId(), Map.of());
            Integer todayDayNo = null;
            int doneDays = 0;
            int behindDays = 0;
            List<ReadingPlanResponse.Due> due = new ArrayList<>();
            for (ReadingPlanDay day : days) {
                Set<String> mineOnDay = stamped.getOrDefault(day.getDayNo(), Set.of());
                boolean done = mineOnDay.containsAll(day.getChapters());
                if (done) doneDays++;
                if (day.getDate().equals(today)) todayDayNo = day.getDayNo();
                if (day.getDate().isAfter(today)) continue;
                if (!done) behindDays++;
                for (String chapter : day.getChapters()) {
                    if (due.size() < MAX_DUE && !mineOnDay.contains(chapter)) {
                        due.add(ReadingPlanResponse.Due.builder()
                                .dayNo(day.getDayNo())
                                .date(day.getDate())
                                .chapter(chapter)
                                .build());
                    }
                }
            }
            out.add(ReadingPlanResponse.PlanSummary.builder()
                    .id(plan.getId())
                    .title(plan.getTitle())
                    .template(plan.getTemplate())
                    .groupId(plan.getGroupId())
                    .groupName(plan.isGroupPlan() ? mine.groupNames().get(plan.getGroupId()) : null)
                    .startDate(plan.getStartDate())
                    .endDate(plan.getEndDate())
                    .totalDays(days.size())
                    .todayDayNo(todayDayNo)
                    .myDoneDays(doneDays)
                    .behindDays(behindDays)
                    .due(due)
                    .build());
        }
        return ReadingPlanResponse.Mine.builder().plans(out).build();
    }

    public ReadingPlanResponse.PlanDetail get(String userId, String planId, String rawToday) {
        LocalDate today = resolveToday(rawToday);
        ReadingPlan plan = requirePlan(planId);
        Access access = requireAccess(plan, userId);
        plan.expireIfOver(today);
        return toDetail(plan, access, userId, today);
    }

    /** 모임의 active 길. 없으면 plan 키 없는 {} */
    public ReadingPlanResponse.GroupPlan groupPlan(String userId, String groupId, String rawToday) {
        LocalDate today = resolveToday(rawToday);
        SermonGroup group = groupSupport.requireGroup(groupId);
        groupSupport.requireActiveMember(groupId, userId);
        ReadingPlan active = null;
        for (ReadingPlan plan : planRepository.findByGroupIdAndStatus(groupId, ReadingPlan.STATUS_ACTIVE)) {
            if (!plan.expireIfOver(today) && active == null) active = plan;
        }
        if (active == null) return ReadingPlanResponse.GroupPlan.builder().build();
        return ReadingPlanResponse.GroupPlan.builder()
                .plan(toDetail(active, groupAccess(group, userId), userId, today))
                .build();
    }

    // ───────────────── 도장 ─────────────────

    /** 장 끝 「다 읽었어요」 — 내 active 길마다 date ≤ today 이고 이 장을 아직 안 찍은 가장 이른 날 하나에 찍는다. */
    public ReadingPlanResponse.Stamped stampChapter(String userId, ReadingPlanRequest.StampChapter request) {
        LocalDate today = resolveToday(request.getToday());
        String chapter = validateChapter(request.getChapter());
        MyPlans mine = myActivePlans(userId, today);
        if (mine.plans().isEmpty()) {
            return ReadingPlanResponse.Stamped.builder().stamped(List.of()).build();
        }
        List<String> planIds = mine.plans().stream().map(ReadingPlan::getId).toList();
        planRepository.lockAllByIdIn(planIds);

        Map<String, List<ReadingPlanDay>> daysByPlan = dayRepository.findByPlanIdInOrderByDayNoAsc(planIds).stream()
                .collect(Collectors.groupingBy(ReadingPlanDay::getPlanId));
        Map<String, Map<Integer, Set<String>>> myChecks =
                byPlanAndDay(checkRepository.findByPlanIdInAndUserId(planIds, userId));

        List<ReadingPlanResponse.Stamp> stamped = new ArrayList<>();
        for (ReadingPlan plan : mine.plans()) {
            Map<Integer, Set<String>> mineByDay = myChecks.computeIfAbsent(plan.getId(), k -> new HashMap<>());
            for (ReadingPlanDay day : daysByPlan.getOrDefault(plan.getId(), List.of())) {
                if (day.getDate().isAfter(today)) break;
                Set<String> mineOnDay = mineByDay.computeIfAbsent(day.getDayNo(), k -> new HashSet<>());
                if (!day.getChapters().contains(chapter) || mineOnDay.contains(chapter)) continue;
                checkRepository.save(ReadingCheck.builder()
                        .planId(plan.getId())
                        .dayNo(day.getDayNo())
                        .userId(userId)
                        .chapter(chapter)
                        .via(ReadingCheck.VIA_SCROLL)
                        .build());
                mineOnDay.add(chapter);
                stamped.add(ReadingPlanResponse.Stamp.builder()
                        .planId(plan.getId())
                        .title(plan.getTitle())
                        .groupName(plan.isGroupPlan() ? mine.groupNames().get(plan.getGroupId()) : null)
                        .dayNo(day.getDayNo())
                        .dayDone(mineOnDay.containsAll(day.getChapters()))
                        .build());
                break;
            }
        }
        return ReadingPlanResponse.Stamped.builder().stamped(stamped).build();
    }

    /** 「따로 읽었어요」 — 그날 장 전부를 찍거나(checked=true) 지운다. */
    public ReadingPlanResponse.PlanDetail manualCheck(
            String userId, String planId, int dayNo, ReadingPlanRequest.ManualCheck request) {
        LocalDate today = resolveToday(request.getToday());
        if (request.getChecked() == null) throw invalid();
        ReadingPlan plan = planRepository.lockAllByIdIn(List.of(planId)).stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.READING_PLAN_NOT_FOUND));
        Access access = requireAccess(plan, userId);
        ReadingPlanDay day = dayRepository.findByPlanIdAndDayNo(planId, dayNo).orElseThrow(ReadingPlanService::invalid);
        if (day.getDate().isAfter(today)) {
            throw new BusinessException(ErrorCode.READING_PLAN_DAY_NOT_YET);
        }

        List<ReadingCheck> existing = checkRepository.findByPlanIdAndDayNoAndUserId(planId, dayNo, userId);
        if (request.getChecked()) {
            Set<String> have = existing.stream().map(ReadingCheck::getChapter).collect(Collectors.toSet());
            checkRepository.saveAll(day.getChapters().stream()
                    .filter(c -> !have.contains(c))
                    .map(c -> ReadingCheck.builder()
                            .planId(planId)
                            .dayNo(dayNo)
                            .userId(userId)
                            .chapter(c)
                            .via(ReadingCheck.VIA_MANUAL)
                            .build())
                    .toList());
        } else {
            checkRepository.deleteAll(existing);
        }
        plan.expireIfOver(today);
        return toDetail(plan, access, userId, today);
    }

    // ───────────────── 끝내기 ─────────────────

    public void end(String userId, String planId) {
        ReadingPlan plan = requirePlan(planId);
        Access access = requireAccess(plan, userId);
        if (!access.canManage()) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
        }
        plan.end();
    }

    // ───────────────── 권한 ─────────────────

    private ReadingPlan requirePlan(String planId) {
        return planRepository
                .findById(planId)
                .orElseThrow(() -> new BusinessException(ErrorCode.READING_PLAN_NOT_FOUND));
    }

    /** 볼 권한이 없으면 길이 없는 것처럼 RP006 */
    private Access requireAccess(ReadingPlan plan, String userId) {
        if (!plan.isGroupPlan()) {
            if (!userId.equals(plan.getOwnerUserId())) {
                throw new BusinessException(ErrorCode.READING_PLAN_NOT_FOUND);
            }
            return soloAccess(userId);
        }
        SermonGroup group = groupRepository
                .findByIdAndDeletedAtIsNull(plan.getGroupId())
                .orElseThrow(() -> new BusinessException(ErrorCode.READING_PLAN_NOT_FOUND));
        Access access = groupAccess(group, userId);
        if (access.readers().stream().noneMatch(r -> r.userId().equals(userId))) {
            throw new BusinessException(ErrorCode.READING_PLAN_NOT_FOUND);
        }
        return access;
    }

    private Access groupAccess(SermonGroup group, String userId) {
        List<SermonGroupMember> active = memberRepository.findByGroupIdOrderByJoinedAtAsc(group.getId()).stream()
                .filter(SermonGroupMember::isActive)
                .toList();
        boolean canManage = active.stream().anyMatch(m -> m.getUserId().equals(userId) && m.isManager());
        return new Access(
                group.getName(),
                active.stream()
                        .map(m -> new Reader(m.getUserId(), m.getDisplayName()))
                        .toList(),
                canManage);
    }

    private Access soloAccess(String userId) {
        User user = groupSupport.requireUser(userId);
        return new Access(null, List.of(new Reader(userId, user.getName())), true);
    }

    /** 내 active 길(끝난 날이 지난 길은 done 으로 바꾸고 뺀다) */
    private MyPlans myActivePlans(String userId, LocalDate today) {
        List<String> groupIds = memberRepository.findByUserId(userId).stream()
                .filter(SermonGroupMember::isActive)
                .map(SermonGroupMember::getGroupId)
                .toList();
        Map<String, String> groupNames = new LinkedHashMap<>();
        if (!groupIds.isEmpty()) {
            for (SermonGroup g : groupRepository.findByIdInAndDeletedAtIsNullOrderByCreatedAtAsc(groupIds)) {
                groupNames.put(g.getId(), g.getName());
            }
        }
        List<ReadingPlan> groupPlans = new ArrayList<>();
        if (!groupNames.isEmpty()) {
            for (ReadingPlan p :
                    planRepository.findByGroupIdInAndStatus(groupNames.keySet(), ReadingPlan.STATUS_ACTIVE)) {
                if (!p.expireIfOver(today)) groupPlans.add(p);
            }
            groupPlans.sort(Comparator.comparing((ReadingPlan p) -> groupNames.get(p.getGroupId()))
                    .thenComparing(ReadingPlan::getCreatedAt));
        }
        List<ReadingPlan> plans = new ArrayList<>(groupPlans);
        for (ReadingPlan p :
                planRepository.findByOwnerUserIdAndStatusOrderByCreatedAtAsc(userId, ReadingPlan.STATUS_ACTIVE)) {
            if (!p.expireIfOver(today)) plans.add(p);
        }
        return new MyPlans(plans, groupNames);
    }

    private static long countStillActive(List<ReadingPlan> plans, LocalDate today) {
        long count = 0;
        for (ReadingPlan p : plans) {
            if (!p.expireIfOver(today)) count++;
        }
        return count;
    }

    // ───────────────── 응답 조립 ─────────────────

    private ReadingPlanResponse.PlanDetail toDetail(ReadingPlan plan, Access access, String viewerId, LocalDate today) {
        List<ReadingPlanDay> days = dayRepository.findByPlanIdOrderByDayNoAsc(plan.getId());
        Set<String> readerIds = access.readers().stream().map(Reader::userId).collect(Collectors.toSet());

        // day_no → user_id → 도장 수 (지금 active 멤버 것만 센다 — team_done ≤ team_total)
        Map<Integer, Map<String, Long>> counts = new HashMap<>();
        long teamDone = 0;
        for (Object[] row : checkRepository.countByDayAndUser(plan.getId())) {
            String uid = (String) row[1];
            if (!readerIds.contains(uid)) continue;
            long n = ((Number) row[2]).longValue();
            counts.computeIfAbsent(((Number) row[0]).intValue(), k -> new HashMap<>())
                    .put(uid, n);
            teamDone += n;
        }
        Map<Integer, Set<String>> mine = byPlanAndDay(checkRepository.findByPlanIdAndUserId(plan.getId(), viewerId))
                .getOrDefault(plan.getId(), Map.of());

        long totalChapters = 0;
        ReadingPlanDay todayDay = null;
        List<ReadingPlanResponse.Day> outDays = new ArrayList<>();
        for (ReadingPlanDay day : days) {
            int need = day.getChapters().size();
            totalChapters += need;
            if (day.getDate().equals(today)) todayDay = day;
            Set<String> mineOnDay = mine.getOrDefault(day.getDayNo(), Set.of());
            int doneCount = (int) counts.getOrDefault(day.getDayNo(), Map.of()).values().stream()
                    .filter(n -> n >= need)
                    .count();
            outDays.add(ReadingPlanResponse.Day.builder()
                    .dayNo(day.getDayNo())
                    .date(day.getDate())
                    .chapters(day.getChapters())
                    .doneCount(doneCount)
                    .myChapters(day.getChapters().stream()
                            .filter(mineOnDay::contains)
                            .toList())
                    .build());
        }

        ReadingPlanResponse.Today todayBlock = null;
        if (todayDay != null) {
            int need = todayDay.getChapters().size();
            Map<String, Long> todayCounts = counts.getOrDefault(todayDay.getDayNo(), Map.of());
            Map<String, User> users = groupSupport.usersById(readerIds);
            List<ReadingPlanResponse.Person> read = new ArrayList<>();
            List<ReadingPlanResponse.Person> unread = new ArrayList<>();
            for (Reader reader : access.readers()) {
                User user = users.get(reader.userId());
                ReadingPlanResponse.Person person = ReadingPlanResponse.Person.builder()
                        .userId(reader.userId())
                        .displayName(reader.displayName())
                        .profileImage(user == null ? null : user.getProfileImage())
                        .build();
                (todayCounts.getOrDefault(reader.userId(), 0L) >= need ? read : unread).add(person);
            }
            todayBlock = ReadingPlanResponse.Today.builder()
                    .read(read)
                    .unread(unread)
                    .build();
        }

        long memberCount = access.readers().size();
        return ReadingPlanResponse.PlanDetail.builder()
                .id(plan.getId())
                .title(plan.getTitle())
                .template(plan.getTemplate())
                .status(plan.getStatus())
                .groupId(plan.getGroupId())
                .groupName(access.groupName())
                .ownerUserId(plan.getOwnerUserId())
                .startDate(plan.getStartDate())
                .endDate(plan.getEndDate())
                .totalDays(days.size())
                .todayDayNo(todayDay == null ? null : todayDay.getDayNo())
                .canManage(access.canManage())
                .days(outDays)
                .memberCount(memberCount)
                .teamDone(teamDone)
                .teamTotal(memberCount * totalChapters)
                .today(todayBlock)
                .build();
    }

    /** plan_id → day_no → 찍은 장 */
    private static Map<String, Map<Integer, Set<String>>> byPlanAndDay(List<ReadingCheck> checks) {
        Map<String, Map<Integer, Set<String>>> out = new HashMap<>();
        for (ReadingCheck c : checks) {
            out.computeIfAbsent(c.getPlanId(), k -> new HashMap<>())
                    .computeIfAbsent(c.getDayNo(), k -> new HashSet<>())
                    .add(c.getChapter());
        }
        return out;
    }

    // ───────────────── 입력 검증 ─────────────────

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.READING_PLAN_INVALID_INPUT);
    }

    private static LocalDate utcToday() {
        return LocalDate.now(ZoneOffset.UTC);
    }

    /** 클라이언트 현지 날짜. 비면 서버 UTC 날짜, 형식이 틀리거나 UTC 날짜와 하루 넘게 다르면 RP001 */
    static LocalDate resolveToday(String raw) {
        LocalDate utc = utcToday();
        if (raw == null || raw.isBlank()) return utc;
        LocalDate today;
        try {
            today = LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.READING_PLAN_BAD_TODAY);
        }
        if (Math.abs(ChronoUnit.DAYS.between(utc, today)) > 1) {
            throw new BusinessException(ErrorCode.READING_PLAN_BAD_TODAY);
        }
        return today;
    }

    private static String validateTitle(String title) {
        String trimmed = title == null ? "" : title.trim();
        if (trimmed.isEmpty() || trimmed.length() > TITLE_MAX) throw invalid();
        return trimmed;
    }

    private static String validateTemplate(String template) {
        String trimmed = template == null ? "" : template.trim();
        if (trimmed.isEmpty()) return DEFAULT_TEMPLATE;
        if (trimmed.length() > TEMPLATE_MAX) throw invalid();
        return trimmed;
    }

    /** 장 키 "b:c" — 0 ≤ b ≤ 65, 1 ≤ c ≤ 150 */
    static String validateChapter(String chapter) {
        if (chapter == null) throw invalid();
        Matcher m = CHAPTER.matcher(chapter);
        if (!m.matches() || Integer.parseInt(m.group(1)) > LAST_BOOK || Integer.parseInt(m.group(2)) > LAST_CHAPTER) {
            throw invalid();
        }
        return chapter;
    }

    /** 날 1~400개, 날짜 엄격히 오름차순, 첫 날 ≥ today-1, 날마다 장 1~10개(중복 X), 전체 장 ≤ 1300 */
    private static void validateDays(
            List<ReadingPlanRequest.Day> days, LocalDate today, List<LocalDate> dates, List<List<String>> chapters) {
        if (days == null || days.isEmpty() || days.size() > MAX_DAYS) throw invalid();
        int total = 0;
        LocalDate prev = null;
        for (ReadingPlanRequest.Day day : days) {
            if (day == null || day.getDate() == null) throw invalid();
            LocalDate date;
            try {
                date = LocalDate.parse(day.getDate());
            } catch (DateTimeParseException e) {
                throw invalid();
            }
            if (prev == null ? date.isBefore(today.minusDays(1)) : !date.isAfter(prev)) throw invalid();
            prev = date;
            List<String> raw = day.getChapters();
            if (raw == null || raw.isEmpty() || raw.size() > MAX_CHAPTERS_PER_DAY) throw invalid();
            List<String> clean = new ArrayList<>();
            for (String c : raw) {
                if (clean.contains(validateChapter(c))) throw invalid();
                clean.add(c);
            }
            total += clean.size();
            if (total > MAX_TOTAL_CHAPTERS) throw invalid();
            dates.add(date);
            chapters.add(clean);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
