package com.kanban.domain.readingplan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kanban.domain.readingplan.dto.ReadingPlanRequest;
import com.kanban.domain.readingplan.dto.ReadingPlanResponse;
import com.kanban.domain.readingplan.service.ReadingPlanService;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonGroupService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 함께 읽는 길 — test 프로파일(H2)에서 서비스를 실제 저장소로 돌린다. 테스트마다 새 사용자·모임을 만든다.
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("함께 읽는 길 흐름")
class ReadingPlanFlowTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    @Autowired
    ReadingPlanService planService;

    @Autowired
    SermonGroupService groupService;

    @Autowired
    UserRepository userRepository;

    @Test
    @DisplayName("모임 길 — 리더·함께 리더만 만들고, active 길은 모임당 하나")
    void groupPlanCreate() {
        String leader = newUser("리더");
        String member = newUser("멤버");
        String groupId = newGroup(leader, member);

        assertCode(
                () -> planService.create(member, plan(groupId, day(TODAY, "40:1"))),
                ErrorCode.SERMON_GROUP_LEADER_REQUIRED);

        ReadingPlanResponse.PlanDetail created =
                planService.create(leader, plan(groupId, day(TODAY, "40:1"), day(TODAY.plusDays(1), "40:2")));
        assertThat(created.getGroupName()).isEqualTo("6팀");
        assertThat(created.getOwnerUserId()).isNull();
        assertThat(created.getTotalDays()).isEqualTo(2);
        assertThat(created.getEndDate()).isEqualTo(TODAY.plusDays(1));
        assertThat(created.getDays())
                .extracting(ReadingPlanResponse.Day::getDayNo)
                .containsExactly(1, 2);
        assertThat(created.isCanManage()).isTrue();
        assertThat(created.getMemberCount()).isEqualTo(2);

        assertCode(
                () -> planService.create(leader, plan(groupId, day(TODAY, "40:1"))),
                ErrorCode.READING_PLAN_GROUP_ACTIVE_EXISTS);

        // 멤버는 보지만 관리 못 함, 밖 사람은 길이 없는 것처럼
        assertThat(planService.get(member, created.getId(), null).isCanManage()).isFalse();
        String outsider = newUser("밖");
        assertCode(() -> planService.get(outsider, created.getId(), null), ErrorCode.READING_PLAN_NOT_FOUND);
        assertCode(() -> planService.end(member, created.getId()), ErrorCode.SERMON_GROUP_LEADER_REQUIRED);

        // 끝내면 다시 만들 수 있다
        planService.end(leader, created.getId());
        assertThat(planService.groupPlan(member, groupId, null).getPlan()).isNull();
        assertThat(planService.create(leader, plan(groupId, day(TODAY, "40:1"))).getStatus())
                .isEqualTo("active");
    }

    @Test
    @DisplayName("입력 검증 — 날짜 순서·장 키·today")
    void validation() {
        String me = newUser("나");
        assertCode(
                () -> planService.create(me, plan(null, day(TODAY, "40:1"), day(TODAY, "40:2"))),
                ErrorCode.READING_PLAN_INVALID_INPUT);
        assertCode(() -> planService.create(me, plan(null, day(TODAY, "66:1"))), ErrorCode.READING_PLAN_INVALID_INPUT);
        assertCode(
                () -> planService.create(me, plan(null, day(TODAY, "40:1", "40:1"))),
                ErrorCode.READING_PLAN_INVALID_INPUT);
        assertCode(
                () -> planService.create(me, plan(null, day(TODAY.minusDays(2), "40:1"))),
                ErrorCode.READING_PLAN_INVALID_INPUT);
        assertCode(() -> planService.mine(me, TODAY.plusDays(2).toString()), ErrorCode.READING_PLAN_BAD_TODAY);
        assertCode(() -> planService.mine(me, "2026/10/26"), ErrorCode.READING_PLAN_BAD_TODAY);
    }

    @Test
    @DisplayName("나의 길은 active 3개까지")
    void soloLimit() {
        String me = newUser("나");
        for (int i = 0; i < 3; i++) {
            ReadingPlanResponse.PlanDetail p = planService.create(me, plan(null, day(TODAY, "40:1")));
            assertThat(p.getOwnerUserId()).isEqualTo(me);
            assertThat(p.getGroupName()).isNull();
        }
        assertCode(() -> planService.create(me, plan(null, day(TODAY, "40:1"))), ErrorCode.READING_PLAN_SOLO_LIMIT);
        assertThat(planService.mine(me, TODAY.toString()).getPlans()).hasSize(3);
    }

    @Test
    @DisplayName("장 도장 — 길마다 date ≤ today 인 가장 이른 안 찍은 날 하나, 미래 날은 안 찍는다")
    void chapterStamp() {
        String leader = newUser("리더");
        String member = newUser("멤버");
        String groupId = newGroup(leader, member);
        ReadingPlanResponse.PlanDetail solo = planService.create(
                leader,
                plan(
                        null,
                        day(TODAY.minusDays(1), "40:1"),
                        day(TODAY, "40:1", "40:2"),
                        day(TODAY.plusDays(1), "40:1")));
        ReadingPlanResponse.PlanDetail group = planService.create(leader, plan(groupId, day(TODAY, "40:1")));

        List<ReadingPlanResponse.Stamp> first =
                planService.stampChapter(leader, stamp("40:1")).getStamped();
        assertThat(first).hasSize(2);
        assertThat(first.get(0).getPlanId()).isEqualTo(group.getId()); // 모임 길 먼저
        assertThat(first.get(0).getGroupName()).isEqualTo("6팀");
        assertThat(first.get(0).isDayDone()).isTrue();
        assertThat(first.get(1).getPlanId()).isEqualTo(solo.getId());
        assertThat(first.get(1).getDayNo()).isEqualTo(1);
        assertThat(first.get(1).isDayDone()).isTrue();

        List<ReadingPlanResponse.Stamp> second =
                planService.stampChapter(leader, stamp("40:1")).getStamped();
        assertThat(second).singleElement().satisfies(s -> {
            assertThat(s.getPlanId()).isEqualTo(solo.getId());
            assertThat(s.getDayNo()).isEqualTo(2);
            assertThat(s.isDayDone()).isFalse();
        });

        // 남은 40:1 은 내일 날뿐 — 찍을 곳 없음
        assertThat(planService.stampChapter(leader, stamp("40:1")).getStamped()).isEmpty();

        ReadingPlanResponse.PlanSummary summary = planService.mine(leader, TODAY.toString()).getPlans().stream()
                .filter(p -> p.getId().equals(solo.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(summary.getTodayDayNo()).isEqualTo(2);
        assertThat(summary.getMyDoneDays()).isEqualTo(1);
        assertThat(summary.getBehindDays()).isEqualTo(1);
        assertThat(summary.getDue()).singleElement().satisfies(d -> {
            assertThat(d.getDayNo()).isEqualTo(2);
            assertThat(d.getChapter()).isEqualTo("40:2");
        });
    }

    @Test
    @DisplayName("따로 읽었어요 — 그날 장 전부 찍기·지우기, 미래 날은 RPL005")
    void manualCheck() {
        String me = newUser("나");
        ReadingPlanResponse.PlanDetail p =
                planService.create(me, plan(null, day(TODAY, "40:1", "40:2"), day(TODAY.plusDays(1), "40:3")));

        assertCode(() -> planService.manualCheck(me, p.getId(), 2, manual(true)), ErrorCode.READING_PLAN_DAY_NOT_YET);

        planService.stampChapter(me, stamp("40:1"));
        ReadingPlanResponse.PlanDetail checked = planService.manualCheck(me, p.getId(), 1, manual(true));
        assertThat(checked.getDays().get(0).getMyChapters()).containsExactly("40:1", "40:2");
        assertThat(checked.getDays().get(0).getDoneCount()).isEqualTo(1);
        assertThat(checked.getTeamDone()).isEqualTo(2);
        assertThat(checked.getToday().getRead())
                .extracting(ReadingPlanResponse.Person::getUserId)
                .containsExactly(me);

        ReadingPlanResponse.PlanDetail cleared = planService.manualCheck(me, p.getId(), 1, manual(false));
        assertThat(cleared.getDays().get(0).getMyChapters()).isEmpty();
        assertThat(cleared.getTeamDone()).isZero();
        assertThat(cleared.getToday().getUnread()).hasSize(1);
    }

    @Test
    @DisplayName("모임 길 상세 — 오늘 읽음/안 읽음, team_done/team_total")
    void groupToday() {
        String leader = newUser("리더");
        String member = newUser("멤버");
        String groupId = newGroup(leader, member);
        ReadingPlanResponse.PlanDetail p =
                planService.create(leader, plan(groupId, day(TODAY, "40:1", "40:2"), day(TODAY.plusDays(1), "40:3")));
        assertThat(p.getTeamTotal()).isEqualTo(6); // 2명 × 3장

        planService.manualCheck(leader, p.getId(), 1, manual(true));
        planService.stampChapter(member, stamp("40:1"));

        ReadingPlanResponse.PlanDetail detail =
                planService.groupPlan(member, groupId, TODAY.toString()).getPlan();
        assertThat(detail.getId()).isEqualTo(p.getId());
        assertThat(detail.getTodayDayNo()).isEqualTo(1);
        assertThat(detail.getTeamDone()).isEqualTo(3);
        assertThat(detail.getTeamTotal()).isEqualTo(6);
        assertThat(detail.getDays().get(0).getDoneCount()).isEqualTo(1);
        assertThat(detail.getDays().get(0).getMyChapters()).containsExactly("40:1");
        assertThat(detail.getToday().getRead())
                .extracting(ReadingPlanResponse.Person::getDisplayName)
                .containsExactly("상건");
        assertThat(detail.getToday().getUnread())
                .extracting(ReadingPlanResponse.Person::getUserId)
                .containsExactly(member);
    }

    // ───────────────── 픽스처 ─────────────────

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("rp-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }

    /** 리더(표시 이름 「상건」) + 승인 없이 바로 들어온 멤버 */
    private String newGroup(String leader, String member) {
        SermonGroupRequest.Create req = new SermonGroupRequest.Create();
        req.setName("6팀");
        req.setKind("church");
        req.setJoinApproval(false);
        req.setDisplayName("상건");
        req.setServices(new ArrayList<>());
        SermonGroupResponse.Detail group = groupService.create(leader, req);
        SermonGroupRequest.Join join = new SermonGroupRequest.Join();
        join.setDisplayName("멤버");
        join.setMutedServiceIds(List.of());
        groupService.join(member, group.getInviteCode(), join);
        return group.getId();
    }

    private static ReadingPlanRequest.Create plan(String groupId, ReadingPlanRequest.Day... days) {
        ReadingPlanRequest.Create req = new ReadingPlanRequest.Create();
        req.setGroupId(groupId);
        req.setTitle("마가복음 16일");
        req.setTemplate("mark16");
        req.setDays(List.of(days));
        return req;
    }

    private static ReadingPlanRequest.Day day(LocalDate date, String... chapters) {
        ReadingPlanRequest.Day day = new ReadingPlanRequest.Day();
        day.setDate(date.toString());
        day.setChapters(List.of(chapters));
        return day;
    }

    private static ReadingPlanRequest.StampChapter stamp(String chapter) {
        ReadingPlanRequest.StampChapter req = new ReadingPlanRequest.StampChapter();
        req.setChapter(chapter);
        req.setToday(TODAY.toString());
        return req;
    }

    private static ReadingPlanRequest.ManualCheck manual(boolean checked) {
        ReadingPlanRequest.ManualCheck req = new ReadingPlanRequest.ManualCheck();
        req.setChecked(checked);
        req.setToday(TODAY.toString());
        return req;
    }

    private static void assertCode(Runnable call, ErrorCode expected) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(expected);
    }
}
