package com.kanban.domain.sermongroup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonGroupService;
import com.kanban.domain.sermongroup.service.SermonSessionService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 설교 노트 「모임」 핵심 흐름 — test 프로파일(H2)에서 서비스를 실제 저장소로 끝까지 돌린다.
 *
 * <p>테스트마다 새 사용자를 만들어 서로의 데이터와 섞이지 않게 한다(트랜잭션 롤백에 기대지 않는다 — resolve 가
 * REQUIRES_NEW 로 커밋하기 때문).
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 모임 흐름")
class SermonGroupFlowTest {

    private static final LocalDate SUNDAY = LocalDate.of(2026, 10, 25);

    @Autowired
    SermonGroupService groupService;

    @Autowired
    SermonSessionService sessionService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    SermonNoteShareRepository shareRepository;

    @Autowired
    SermonReactionRepository reactionRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    @DisplayName("생성 → 초대 미리보기 → 참여(승인) → resolve 멱등 → 공개 사본 → 반응 → 같이 써요 → 나가기")
    void fullFlow() throws Exception {
        String leader = newUser("리더");
        String minji = newUser("민지");
        String jun = newUser("준");
        String outsider = newUser("밖");

        // 생성 — 만든 사람은 leader, 초대 코드 8자
        SermonGroupResponse.Detail created = groupService.create(leader, createRequest(true));
        String groupId = created.getId();
        assertThat(created.getMe().getRole()).isEqualTo("leader");
        assertThat(created.getInviteCode()).hasSize(8).matches("[A-Za-z0-9]+");
        assertThat(created.getServices()).hasSize(1);
        String code = created.getInviteCode();

        // 초대 미리보기 — 비로그인은 my_status 없음, 리더 본인은 active
        SermonGroupResponse.InvitePreview anon = groupService.invitePreview(null, code, null);
        assertThat(anon.getMyStatus()).isNull();
        assertThat(anon.getLeaderName()).isEqualTo("상건");
        assertThat(anon.getMemberCount()).isEqualTo(1);
        assertThat(groupService.invitePreview(leader, code, null).getMyStatus()).isEqualTo("active");
        assertCode(() -> groupService.invitePreview(null, "nope1234", null), ErrorCode.SERMON_GROUP_INVITE_INVALID);

        // 참여 — 승인 필요라 pending, 상세 조회는 SG002, 리더에게는 pending 이 보인다
        SermonGroupResponse.Detail pending = groupService.join(minji, code, join("민지"));
        assertThat(pending.getMe().getStatus()).isEqualTo("pending");
        assertThat(pending.getMembers()).isEmpty();
        assertThat(pending.getInviteCode()).isNull();
        assertCode(() -> groupService.get(minji, groupId), ErrorCode.SERMON_GROUP_NOT_MEMBER);
        assertCode(() -> groupService.join(minji, code, join("민지")), ErrorCode.SERMON_GROUP_ALREADY_MEMBER);
        assertThat(groupService.get(leader, groupId).getMembers())
                .extracting(SermonGroupResponse.Member::getStatus)
                .containsExactly("active", "pending");
        assertThat(groupService.list(minji)).hasSize(1);

        // 승인
        SermonGroupResponse.Detail approved = groupService.approve(leader, groupId, minji);
        assertThat(approved.getMemberCount()).isEqualTo(2);
        assertThat(groupService.get(minji, groupId).getInviteCode()).isNull(); // 일반 멤버에게는 코드 없음

        // 승인 불필요로 바꾸면 바로 active
        JsonNode patch = objectMapper.readTree("{\"join_approval\": false}");
        SermonGroupResponse.Detail patched = groupService.patch(leader, groupId, patch);
        assertThat(patched.isJoinApproval()).isFalse();
        assertThat(groupService.join(jun, code, join("")).getMe().getStatus()).isEqualTo("active");
        assertThat(groupService.get(jun, groupId).getMe().getDisplayName()).isEqualTo("준"); // 비면 계정 이름
        assertCode(() -> groupService.patch(minji, groupId, patch), ErrorCode.SERMON_GROUP_LEADER_REQUIRED);

        // resolve — 같은 (모임, 예배, 날짜)는 한 자리
        SermonGroupResponse.SessionSummary s1 = sessionService.resolve(minji, resolve(groupId, "sun"));
        SermonGroupResponse.SessionSummary s2 = sessionService.resolve(jun, resolve(groupId, "sun"));
        assertThat(s2.getId()).isEqualTo(s1.getId());
        assertCode(() -> sessionService.resolve(minji, resolve(groupId, "nope")), ErrorCode.SERMON_GROUP_INVALID_INPUT);
        String sessionId = s1.getId();

        // 공개 사본 — 민지는 공개, 준은 비공개(fields 를 보내도 저장하지 않음)
        SermonGroupResponse.ShareView minjiShare = sessionService.putShare(minji, sessionId, share(false));
        assertThat(minjiShare.getFields()).containsKey("thoughts");
        // upsert — 두 번 보내도 한 건
        sessionService.putShare(minji, sessionId, share(false));
        sessionService.putShare(jun, sessionId, share(true));
        assertThat(shareRepository.findBySessionIdOrderByUpdatedAtDesc(sessionId))
                .hasSize(2);

        // 자리 조회 — private 면 fields 없음, members 상태
        SermonGroupResponse.SessionDetail detail = sessionService.get(leader, sessionId);
        assertThat(detail.getShares()).hasSize(2);
        SermonGroupResponse.ShareView junView = detail.getShares().stream()
                .filter(v -> v.getUserId().equals(jun))
                .findFirst()
                .orElseThrow();
        assertThat(junView.isPrivate()).isTrue();
        assertThat(junView.getFields()).isNull();
        assertThat(detail.getSession().getMembers())
                .extracting(SermonGroupResponse.SessionMember::getState)
                .containsExactlyInAnyOrder("written", "private");
        assertThat(detail.getSession().getMyShareId()).isNull();
        assertThat(sessionService.get(minji, sessionId).getSession().getMyShareId())
                .isEqualTo(minjiShare.getId());

        // JSON — "private" 키, null fields 는 생략
        String json = objectMapper.writeValueAsString(junView);
        assertThat(json)
                .contains("\"private\":true")
                .doesNotContain("is_private")
                .doesNotContain("\"fields\"");

        // 반응 토글 — 내 것에는 못 누름
        SermonGroupResponse.ReactionCount on = sessionService.toggleReaction(jun, minjiShare.getId(), reaction());
        assertThat(on.getCount()).isEqualTo(1);
        assertThat(on.isMine()).isTrue();
        sessionService.toggleReaction(leader, minjiShare.getId(), reaction());
        assertThat(sessionService.get(minji, sessionId).getShares().stream()
                        .filter(v -> v.getId().equals(minjiShare.getId()))
                        .findFirst()
                        .orElseThrow()
                        .getReactions())
                .singleElement()
                .satisfies(r -> {
                    assertThat(r.getCount()).isEqualTo(2);
                    assertThat(r.isMine()).isFalse();
                });
        SermonGroupResponse.ReactionCount off = sessionService.toggleReaction(jun, minjiShare.getId(), reaction());
        assertThat(off.getCount()).isEqualTo(1);
        assertThat(off.isMine()).isFalse();
        assertCode(
                () -> sessionService.toggleReaction(minji, minjiShare.getId(), reaction()),
                ErrorCode.SERMON_GROUP_INVALID_INPUT);

        // 같이 써요 — 같은 주 같은 상대 1회, week 응답에 보이고 seen 처리
        groupService.poke(minji, groupId, poke(jun, sessionId));
        assertCode(() -> groupService.poke(minji, groupId, poke(jun, sessionId)), ErrorCode.SERMON_POKE_LIMIT);
        SermonGroupResponse.Week week = groupService.week(jun, groupId, SUNDAY);
        assertThat(week.getSessions())
                .extracting(SermonGroupResponse.SessionSummary::getId)
                .containsExactly(sessionId);
        assertThat(week.getPokesForMe())
                .extracting(SermonGroupResponse.PokeForMe::getFromName)
                .containsExactly("민지");

        // 잠금 — 리더만 잠그고, 잠긴 자리 정보는 리더만 고친다
        assertCode(() -> sessionService.lock(minji, sessionId, lock(true)), ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
        sessionService.lock(leader, sessionId, lock(true));
        assertCode(() -> sessionService.update(minji, sessionId, title("새 제목")), ErrorCode.SERMON_SESSION_LOCKED);
        SermonGroupResponse.SessionSummary retitled = sessionService.update(leader, sessionId, title("한 사람으로 인해"));
        assertThat(retitled.getTitle()).isEqualTo("한 사람으로 인해");
        assertThat(retitled.getUpdatedByName()).isEqualTo("상건");

        // 비멤버 접근 — SG002
        assertCode(() -> groupService.get(outsider, groupId), ErrorCode.SERMON_GROUP_NOT_MEMBER);
        assertCode(() -> sessionService.get(outsider, sessionId), ErrorCode.SERMON_GROUP_NOT_MEMBER);
        assertCode(() -> groupService.week(outsider, groupId, SUNDAY), ErrorCode.SERMON_GROUP_NOT_MEMBER);

        // 리더는 다른 active 멤버가 있으면 못 나간다
        assertCode(() -> groupService.leave(leader, groupId), ErrorCode.SERMON_GROUP_LEADER_REQUIRED);

        // 나가기 — 내 공개 사본 삭제
        groupService.leave(minji, groupId);
        assertThat(shareRepository.findBySessionIdAndUserId(sessionId, minji)).isEmpty();
        assertThat(shareRepository.findBySessionIdAndUserId(sessionId, jun)).isPresent();
        assertCode(() -> groupService.get(minji, groupId), ErrorCode.SERMON_GROUP_NOT_MEMBER);

        // 내보내기 — 그 사람 share 삭제, 리더는 못 내보냄
        groupService.changeRole(leader, groupId, jun, role("co_leader"));
        assertCode(() -> groupService.kick(jun, groupId, leader), ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
        groupService.kick(leader, groupId, jun);
        assertThat(shareRepository.findBySessionIdAndUserId(sessionId, jun)).isEmpty();

        // 삭제는 소프트 — 이후 SG001
        groupService.delete(leader, groupId);
        assertCode(() -> groupService.get(leader, groupId), ErrorCode.SERMON_GROUP_NOT_FOUND);
        assertCode(() -> groupService.invitePreview(null, code, null), ErrorCode.SERMON_GROUP_INVITE_INVALID);
        assertThat(groupService.list(leader)).isEmpty();
    }

    @Test
    @DisplayName("리더 넘기기 — 대상은 leader, 나는 co_leader")
    void transferLeadership() {
        String leader = newUser("리더");
        String member = newUser("멤버");
        SermonGroupResponse.Detail group = groupService.create(leader, createRequest(false));
        groupService.join(member, group.getInviteCode(), join("멤버"));

        SermonGroupResponse.Detail after = groupService.changeRole(leader, group.getId(), member, role("leader"));
        assertThat(after.getMe().getRole()).isEqualTo("co_leader");
        assertThat(groupService.get(member, group.getId()).getMe().getRole()).isEqualTo("leader");
    }

    @Test
    @DisplayName("예배표 검증 — 잘못된 id·시각·슬롯 수, fields 64KB 초과는 SG010")
    void validation() {
        String leader = newUser("리더");
        SermonGroupRequest.Create bad = createRequest(false);
        bad.setServices(List.of(Map.of("id", "Sun!", "name", "주일", "slots", List.of(slot(0, "09:00", "10:00")))));
        assertCode(() -> groupService.create(leader, bad), ErrorCode.SERMON_GROUP_INVALID_INPUT);

        SermonGroupRequest.Create badTime = createRequest(false);
        badTime.setServices(List.of(Map.of("id", "sun", "name", "주일", "slots", List.of(slot(0, "25:00", "10:00")))));
        assertCode(() -> groupService.create(leader, badTime), ErrorCode.SERMON_GROUP_INVALID_INPUT);

        SermonGroupRequest.Create noSlots = createRequest(false);
        noSlots.setServices(List.of(Map.of("id", "sun", "name", "주일", "slots", List.of())));
        assertCode(() -> groupService.create(leader, noSlots), ErrorCode.SERMON_GROUP_INVALID_INPUT);

        SermonGroupRequest.Create badDays = createRequest(false);
        badDays.setInviteExpiresDays(3);
        assertCode(() -> groupService.create(leader, badDays), ErrorCode.SERMON_GROUP_INVALID_INPUT);

        SermonGroupResponse.Detail group = groupService.create(leader, createRequest(false));
        SermonGroupResponse.SessionSummary session = sessionService.resolve(leader, resolve(group.getId(), "sun"));
        SermonGroupRequest.Share huge = share(false);
        huge.setFields(Map.of("summary", "가".repeat(30_000))); // UTF-8 3바이트 × 30,000 = 90KB
        assertCode(() -> sessionService.putShare(leader, session.getId(), huge), ErrorCode.SERMON_GROUP_INVALID_INPUT);
    }

    @Test
    @DisplayName("예배표 밖 자리는 같은 날 여러 개 열 수 있다")
    void openAdHocSessions() {
        String leader = newUser("리더");
        SermonGroupResponse.Detail group = groupService.create(leader, createRequest(false));
        SermonGroupRequest.OpenSession open = new SermonGroupRequest.OpenSession();
        open.setName("수련회 저녁");
        open.setDate(SUNDAY);
        String a = sessionService.open(leader, group.getId(), open).getId();
        String b = sessionService.open(leader, group.getId(), open).getId();
        assertThat(a).isNotEqualTo(b);
        assertThat(groupService.week(leader, group.getId(), SUNDAY).getSessions())
                .hasSize(2);
    }

    @Test
    @DisplayName("resolve 동시 호출 — UNIQUE 위반을 잡고 재조회해 모두 같은 자리를 받는다")
    void concurrentResolve() throws Exception {
        String leader = newUser("리더");
        SermonGroupResponse.Detail group = groupService.create(leader, createRequest(false));
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<String>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            results.add(pool.submit(() -> {
                go.await();
                return sessionService
                        .resolve(leader, resolve(group.getId(), "sun"))
                        .getId();
            }));
        }
        go.countDown();
        Set<String> ids = new HashSet<>();
        for (Future<String> f : results) ids.add(f.get(30, TimeUnit.SECONDS));
        pool.shutdown();
        assertThat(ids).hasSize(1);
    }

    @Test
    @DisplayName("반응 동시 토글 — UNIQUE 위반을 삼켜 500 없이 한 건으로 끝난다")
    void concurrentReaction() throws Exception {
        String leader = newUser("리더");
        String member = newUser("멤버");
        SermonGroupResponse.Detail group = groupService.create(leader, createRequest(false));
        groupService.join(member, group.getInviteCode(), join("멤버"));
        String sessionId =
                sessionService.resolve(leader, resolve(group.getId(), "sun")).getId();
        String shareId =
                sessionService.putShare(leader, sessionId, share(false)).getId();

        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<SermonGroupResponse.ReactionCount>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            results.add(pool.submit(() -> {
                go.await();
                return sessionService.toggleReaction(member, shareId, reaction());
            }));
        }
        go.countDown();
        for (Future<SermonGroupResponse.ReactionCount> f : results) {
            assertThat(f.get(30, TimeUnit.SECONDS).getCount()).isBetween(0L, 1L);
        }
        pool.shutdown();

        // 몇 번 겹쳤든 행은 많아야 1건이고, 다음 토글은 정상 동작한다
        long count = reactionRepository.countByShareIdAndItemKeyAndKind(shareId, "t1", "amen");
        assertThat(count).isBetween(0L, 1L);
        SermonGroupResponse.ReactionCount next = sessionService.toggleReaction(member, shareId, reaction());
        assertThat(next.getCount()).isEqualTo(1 - count);
        assertThat(next.isMine()).isEqualTo(count == 0);
    }

    // ───────────────── fixtures ─────────────────

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("sg-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }

    private static SermonGroupRequest.Create createRequest(boolean approval) {
        SermonGroupRequest.Create req = new SermonGroupRequest.Create();
        req.setName("청년부 2모임");
        req.setKind("church");
        req.setJoinApproval(approval);
        req.setDisplayName("상건");
        req.setInviteExpiresDays(7);
        List<Map<String, Object>> services = new ArrayList<>();
        services.add(Map.of(
                "id",
                "sun",
                "name",
                "주일 설교",
                "active",
                true,
                "slots",
                List.of(slot(0, "09:00", "10:20"), slot(0, "11:00", "12:20"))));
        req.setServices(services);
        return req;
    }

    private static Map<String, Object> slot(int dow, String start, String end) {
        return Map.of("dow", dow, "start", start, "end", end, "part", "1부");
    }

    private static SermonGroupRequest.Join join(String name) {
        SermonGroupRequest.Join req = new SermonGroupRequest.Join();
        req.setDisplayName(name);
        req.setMutedServiceIds(List.of());
        return req;
    }

    private static SermonGroupRequest.ResolveSession resolve(String groupId, String serviceId) {
        SermonGroupRequest.ResolveSession req = new SermonGroupRequest.ResolveSession();
        req.setGroupId(groupId);
        req.setServiceId(serviceId);
        req.setDate(SUNDAY);
        return req;
    }

    private static SermonGroupRequest.Share share(boolean isPrivate) {
        SermonGroupRequest.Share req = new SermonGroupRequest.Share();
        req.setNoteId("note-1");
        req.setMyTitle("로마서 5장");
        req.setHeard("live");
        req.setPart("1부");
        req.setIsPrivate(isPrivate);
        req.setFields(Map.of("thoughts", List.of(Map.of("id", "t1", "tag", "생각", "text", "은혜"))));
        return req;
    }

    private static SermonGroupRequest.Reaction reaction() {
        SermonGroupRequest.Reaction req = new SermonGroupRequest.Reaction();
        req.setItemKey("t1");
        req.setKind("amen");
        return req;
    }

    private static SermonGroupRequest.Poke poke(String to, String sessionId) {
        SermonGroupRequest.Poke req = new SermonGroupRequest.Poke();
        req.setToUserId(to);
        req.setSessionId(sessionId);
        req.setWeekStart(SUNDAY);
        return req;
    }

    private static SermonGroupRequest.Lock lock(boolean locked) {
        SermonGroupRequest.Lock req = new SermonGroupRequest.Lock();
        req.setLocked(locked);
        return req;
    }

    private static SermonGroupRequest.UpdateSession title(String title) {
        SermonGroupRequest.UpdateSession req = new SermonGroupRequest.UpdateSession();
        req.setTitle(title);
        return req;
    }

    private static SermonGroupRequest.ChangeRole role(String role) {
        SermonGroupRequest.ChangeRole req = new SermonGroupRequest.ChangeRole();
        req.setRole(role);
        return req;
    }

    private static void assertCode(Runnable call, ErrorCode expected) {
        assertThatThrownBy(call::run)
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(expected);
    }
}
