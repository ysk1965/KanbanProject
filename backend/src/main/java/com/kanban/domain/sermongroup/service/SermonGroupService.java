package com.kanban.domain.sermongroup.service;

import static com.kanban.domain.sermongroup.service.SermonGroupSupport.invalid;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.sermongroup.SermonGroup;
import com.kanban.domain.sermongroup.SermonGroupMember;
import com.kanban.domain.sermongroup.SermonGroupMemberRepository;
import com.kanban.domain.sermongroup.SermonGroupRepository;
import com.kanban.domain.sermongroup.SermonNoteShare;
import com.kanban.domain.sermongroup.SermonNoteShareRepository;
import com.kanban.domain.sermongroup.SermonPoke;
import com.kanban.domain.sermongroup.SermonPokeRepository;
import com.kanban.domain.sermongroup.SermonReactionRepository;
import com.kanban.domain.sermongroup.SermonSession;
import com.kanban.domain.sermongroup.SermonSessionRepository;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.user.User;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 설교 노트 「모임」 — 모임·초대·멤버·이번 주·같이 써요.
 *
 * <p>알림(FCM)·activity_log 는 쓰지 않는다. 참여 요청은 상세의 pending 멤버로, 같이 써요는 week 응답으로 보인다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SermonGroupService {

    private static final Set<Integer> INVITE_DAYS = Set.of(7, 30);
    private static final String INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final int INVITE_LENGTH = 8;
    private static final int INVITE_RETRIES = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SermonGroupRepository groupRepository;
    private final SermonGroupMemberRepository memberRepository;
    private final SermonSessionRepository sessionRepository;
    private final SermonNoteShareRepository shareRepository;
    private final SermonReactionRepository reactionRepository;
    private final SermonPokeRepository pokeRepository;
    private final SermonGroupSupport support;
    private final ObjectMapper objectMapper;

    // ───────────────── 모임 ─────────────────

    /** 내가 active 또는 pending 인 모임 */
    public List<SermonGroupResponse.Detail> list(String userId) {
        List<String> groupIds = memberRepository.findByUserId(userId).stream()
                .map(SermonGroupMember::getGroupId)
                .toList();
        if (groupIds.isEmpty()) return List.of();
        List<SermonGroup> groups = groupRepository.findByIdInAndDeletedAtIsNullOrderByCreatedAtAsc(groupIds);
        Map<String, List<SermonGroupMember>> membersByGroup =
                memberRepository
                        .findByGroupIdIn(groups.stream().map(SermonGroup::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(SermonGroupMember::getGroupId));
        Map<String, User> users = support.usersById(membersByGroup.values().stream()
                .flatMap(List::stream)
                .map(SermonGroupMember::getUserId)
                .toList());
        return groups.stream()
                .map(g -> support.toDetail(
                        g,
                        userId,
                        membersByGroup.getOrDefault(g.getId(), List.of()).stream()
                                .sorted((a, b) -> a.getJoinedAt().compareTo(b.getJoinedAt()))
                                .toList(),
                        users))
                .toList();
    }

    @Transactional
    public SermonGroupResponse.Detail create(String userId, SermonGroupRequest.Create request) {
        User user = support.requireUser(userId);
        if (memberRepository.countLiveMemberships(userId) >= SermonGroupSupport.MAX_GROUPS_PER_USER) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_USER_LIMIT);
        }
        Integer expiresDays = validateInviteDays(request.getInviteExpiresDays());

        SermonGroup group = groupRepository.save(SermonGroup.builder()
                .name(support.validateGroupName(request.getName()))
                .kind(support.validateKind(request.getKind()))
                .meetDow(support.validateDow(request.getMeetDow()))
                .meetTime(support.validateTime(request.getMeetTime()))
                .services(support.validateServices(request.getServices()))
                .joinApproval(Boolean.TRUE.equals(request.getJoinApproval()))
                .inviteCode(newInviteCode())
                .inviteExpiresAt(expiresAt(expiresDays))
                .createdBy(userId)
                .build());
        memberRepository.save(SermonGroupMember.builder()
                .groupId(group.getId())
                .userId(userId)
                .role(SermonGroupMember.ROLE_LEADER)
                .status(SermonGroupMember.STATUS_ACTIVE)
                .displayName(support.resolveDisplayName(request.getDisplayName(), user))
                .build());
        return support.toDetail(group, userId);
    }

    public SermonGroupResponse.Detail get(String userId, String groupId) {
        SermonGroup group = support.requireGroup(groupId);
        support.requireActiveMember(groupId, userId);
        return support.toDetail(group, userId);
    }

    /**
     * 부분 수정 — 본문에 있는 키만 바꾼다. meet_dow · meet_time 은 null 을 보내면 지운다(그래서 JsonNode 로 받는다).
     */
    @Transactional
    public SermonGroupResponse.Detail patch(String userId, String groupId, JsonNode body) {
        SermonGroup group = support.requireGroup(groupId);
        support.requireManager(groupId, userId);
        if (body == null || !body.isObject()) throw invalid();

        if (body.has("name")) group.updateName(support.validateGroupName(textOrNull(body.get("name"))));
        if (body.has("kind")) group.updateKind(support.validateKind(textOrNull(body.get("kind"))));
        if (body.has("meet_dow")) {
            JsonNode dow = body.get("meet_dow");
            if (!dow.isNull() && !dow.canConvertToInt()) throw invalid();
            group.updateMeetDow(support.validateDow(dow.isNull() ? null : dow.intValue()));
        }
        if (body.has("meet_time")) group.updateMeetTime(support.validateTime(textOrNull(body.get("meet_time"))));
        if (body.has("services")) {
            JsonNode services = body.get("services");
            if (!services.isArray()) throw invalid();
            List<Map<String, Object>> raw;
            try {
                raw = objectMapper.convertValue(services, new TypeReference<List<Map<String, Object>>>() {});
            } catch (IllegalArgumentException e) {
                throw invalid();
            }
            group.updateServices(support.validateServices(raw));
        }
        if (body.has("join_approval")) {
            JsonNode approval = body.get("join_approval");
            if (!approval.isBoolean()) throw invalid();
            group.updateJoinApproval(approval.booleanValue());
        }
        return support.toDetail(group, userId);
    }

    @Transactional
    public void delete(String userId, String groupId) {
        SermonGroup group = support.requireGroup(groupId);
        support.requireLeader(groupId, userId);
        group.softDelete();
    }

    @Transactional
    public SermonGroupResponse.Detail regenerateInvite(
            String userId, String groupId, SermonGroupRequest.Invite request) {
        SermonGroup group = support.requireGroup(groupId);
        support.requireManager(groupId, userId);
        Integer days = validateInviteDays(request == null ? null : request.getExpiresDays());
        group.updateInvite(newInviteCode(), expiresAt(days));
        return support.toDetail(group, userId);
    }

    @Transactional
    public SermonGroupResponse.Detail disableInvite(String userId, String groupId) {
        SermonGroup group = support.requireGroup(groupId);
        support.requireManager(groupId, userId);
        group.updateInvite(null, null);
        return support.toDetail(group, userId);
    }

    // ───────────────── 초대·참여 ─────────────────

    /**
     * 공개 미리보기 — 비로그인(userId null)도 부른다. 멤버 노트·이름 목록은 넣지 않는다.
     *
     * @param weekStart 이번 주 시작일(클라이언트 현지). null 이면 UTC 오늘 기준 최근 6일 ~ 내일.
     */
    public SermonGroupResponse.InvitePreview invitePreview(String userId, String code, LocalDate weekStart) {
        SermonGroup group = requireInvite(code);
        List<SermonGroupMember> members = memberRepository.findByGroupIdOrderByJoinedAtAsc(group.getId());

        LocalDate from =
                weekStart != null ? weekStart : LocalDate.now(ZoneOffset.UTC).minusDays(6);
        LocalDate to = weekStart != null
                ? weekStart.plusDays(6)
                : LocalDate.now(ZoneOffset.UTC).plusDays(1);
        List<SermonSession> sessions =
                sessionRepository.findByGroupIdAndDateBetweenOrderByDateAscCreatedAtAsc(group.getId(), from, to);
        Map<String, Long> recorded = sessions.isEmpty()
                ? Map.of()
                : shareRepository
                        .findBySessionIdIn(
                                sessions.stream().map(SermonSession::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(SermonNoteShare::getSessionId, Collectors.counting()));

        String leaderName = members.stream()
                .filter(SermonGroupMember::isLeader)
                .map(SermonGroupMember::getDisplayName)
                .findFirst()
                .orElse(null);
        String myStatus = userId == null
                ? null
                : members.stream()
                        .filter(m -> m.getUserId().equals(userId))
                        .map(SermonGroupMember::getStatus)
                        .findFirst()
                        .orElse(null);

        return SermonGroupResponse.InvitePreview.builder()
                .groupId(group.getId())
                .name(group.getName())
                .kind(group.getKind())
                .meetDow(group.getMeetDow())
                .meetTime(group.getMeetTime())
                .services(group.getServices())
                .leaderName(leaderName)
                .memberCount(
                        members.stream().filter(SermonGroupMember::isActive).count())
                .joinApproval(group.isJoinApproval())
                .thisWeek(sessions.stream()
                        .map(s -> SermonGroupResponse.PreviewSession.builder()
                                .serviceId(s.getServiceId())
                                .date(s.getDate())
                                .name(s.getName())
                                .title(s.getTitle())
                                .refs(s.getRefs() == null ? List.of() : s.getRefs())
                                .recordedCount(recorded.getOrDefault(s.getId(), 0L))
                                .build())
                        .toList())
                .myStatus(myStatus)
                .build();
    }

    @Transactional
    public SermonGroupResponse.Detail join(String userId, String code, SermonGroupRequest.Join request) {
        SermonGroup group = requireInvite(code);
        User user = support.requireUser(userId);
        if (memberRepository.findByGroupIdAndUserId(group.getId(), userId).isPresent()) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_ALREADY_MEMBER);
        }
        if (memberRepository.countByGroupId(group.getId()) >= SermonGroupSupport.MAX_MEMBERS_PER_GROUP) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_MEMBER_LIMIT);
        }
        if (memberRepository.countLiveMemberships(userId) >= SermonGroupSupport.MAX_GROUPS_PER_USER) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_USER_LIMIT);
        }
        SermonGroupRequest.Join body = request != null ? request : new SermonGroupRequest.Join();
        try {
            memberRepository.saveAndFlush(SermonGroupMember.builder()
                    .groupId(group.getId())
                    .userId(userId)
                    .role(SermonGroupMember.ROLE_MEMBER)
                    .status(group.isJoinApproval() ? SermonGroupMember.STATUS_PENDING : SermonGroupMember.STATUS_ACTIVE)
                    .displayName(support.resolveDisplayName(body.getDisplayName(), user))
                    .mutedServiceIds(support.validateMutedServiceIds(body.getMutedServiceIds()))
                    .build());
        } catch (DataIntegrityViolationException e) {
            // 같은 사람이 참여 버튼을 두 번 눌러 동시에 들어온 경우
            throw new BusinessException(ErrorCode.SERMON_GROUP_ALREADY_MEMBER);
        }
        return support.toDetail(group, userId);
    }

    // ───────────────── 멤버 ─────────────────

    /** 승인 대기 중에도 내 표시 이름·안 드리는 예배는 바꿀 수 있다 */
    @Transactional
    public SermonGroupResponse.Detail updateMe(String userId, String groupId, SermonGroupRequest.UpdateMe request) {
        SermonGroup group = support.requireGroup(groupId);
        SermonGroupMember me = memberRepository
                .findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER));
        if (request != null && request.getDisplayName() != null) {
            String name = request.getDisplayName().trim();
            if (name.isEmpty()) throw invalid();
            me.updateDisplayName(support.resolveDisplayName(name, null));
        }
        if (request != null && request.getMutedServiceIds() != null) {
            me.updateMutedServiceIds(support.validateMutedServiceIds(request.getMutedServiceIds()));
        }
        return support.toDetail(group, userId);
    }

    /**
     * 나가기 — 내 공개 사본(+거기 달린 반응)과 내가 남긴 반응을 지운다. 리더는 다른 active 멤버가 있으면 먼저 넘겨야 한다.
     * 리더가 마지막 한 사람이면 모임을 소프트 삭제한다.
     */
    @Transactional
    public void leave(String userId, String groupId) {
        SermonGroup group = support.requireGroup(groupId);
        SermonGroupMember me = memberRepository
                .findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER));
        if (me.isLeader()) {
            long othersActive = memberRepository.countByGroupIdAndStatus(groupId, SermonGroupMember.STATUS_ACTIVE) - 1;
            if (othersActive > 0) {
                throw new BusinessException(ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
            }
            group.softDelete();
        }
        removeMemberData(groupId, userId);
        memberRepository.delete(me);
    }

    @Transactional
    public SermonGroupResponse.Detail approve(String userId, String groupId, String targetUserId) {
        SermonGroup group = support.requireGroup(groupId);
        support.requireManager(groupId, userId);
        SermonGroupMember target = requireTarget(groupId, targetUserId);
        if (!target.isActive()) target.approve();
        return support.toDetail(group, userId);
    }

    /** 내보내기(또는 참여 요청 거절). 리더는 못 내보낸다. 그 사람의 공개 사본·반응을 지운다. */
    @Transactional
    public void kick(String userId, String groupId, String targetUserId) {
        support.requireGroup(groupId);
        support.requireManager(groupId, userId);
        if (userId.equals(targetUserId)) throw invalid();
        SermonGroupMember target = requireTarget(groupId, targetUserId);
        if (target.isLeader()) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
        }
        removeMemberData(groupId, targetUserId);
        memberRepository.delete(target);
    }

    /** 역할 바꾸기(리더만). leader 지정 = 넘기기 — 나는 co_leader 가 된다. */
    @Transactional
    public SermonGroupResponse.Detail changeRole(
            String userId, String groupId, String targetUserId, SermonGroupRequest.ChangeRole request) {
        SermonGroup group = support.requireGroup(groupId);
        SermonGroupMember me = support.requireLeader(groupId, userId);
        if (userId.equals(targetUserId)) throw invalid();
        String role = request == null ? null : request.getRole();
        if (!SermonGroupMember.ROLE_LEADER.equals(role)
                && !SermonGroupMember.ROLE_CO_LEADER.equals(role)
                && !SermonGroupMember.ROLE_MEMBER.equals(role)) {
            throw invalid();
        }
        SermonGroupMember target = requireTarget(groupId, targetUserId);
        if (!target.isActive()) throw new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER);
        target.changeRole(role);
        if (SermonGroupMember.ROLE_LEADER.equals(role)) {
            me.changeRole(SermonGroupMember.ROLE_CO_LEADER);
        }
        return support.toDetail(group, userId);
    }

    // ───────────────── 이번 주 ─────────────────

    /** start ~ start+6 의 설교 자리 + 그 주에 내게 온 같이 써요(조회 시 seen 처리) */
    @Transactional
    public SermonGroupResponse.Week week(String userId, String groupId, LocalDate start) {
        support.requireGroup(groupId);
        support.requireActiveMember(groupId, userId);
        if (start == null) throw invalid();
        LocalDate end = start.plusDays(6);

        List<SermonSession> sessions =
                sessionRepository.findByGroupIdAndDateBetweenOrderByDateAscCreatedAtAsc(groupId, start, end);
        Map<String, List<SermonNoteShare>> sharesBySession = sessions.isEmpty()
                ? Map.of()
                : shareRepository
                        .findBySessionIdIn(
                                sessions.stream().map(SermonSession::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(SermonNoteShare::getSessionId));
        Map<String, String> names = support.displayNames(groupId);

        List<SermonPoke> pokes = pokeRepository.findByGroupIdAndToUserAndWeekStartBetweenOrderByCreatedAtAsc(
                groupId, userId, start, end);
        pokes.forEach(SermonPoke::markSeen);

        return SermonGroupResponse.Week.builder()
                .sessions(sessions.stream()
                        .map(s -> support.toSessionSummary(
                                s, sharesBySession.getOrDefault(s.getId(), List.of()), names, userId))
                        .toList())
                .pokesForMe(pokes.stream()
                        .map(p -> SermonGroupResponse.PokeForMe.builder()
                                .fromName(names.get(p.getFromUser()))
                                .createdAt(p.getCreatedAt())
                                .build())
                        .toList())
                .build();
    }

    // ───────────────── 같이 써요 ─────────────────

    @Transactional
    public void poke(String userId, String groupId, SermonGroupRequest.Poke request) {
        support.requireGroup(groupId);
        support.requireActiveMember(groupId, userId);
        if (request == null || request.getToUserId() == null || request.getWeekStart() == null) throw invalid();
        if (userId.equals(request.getToUserId())) throw invalid();
        support.requireActiveMember(groupId, request.getToUserId());
        if (request.getSessionId() != null) {
            SermonSession session =
                    sessionRepository.findById(request.getSessionId()).orElseThrow(SermonGroupSupport::invalid);
            if (!session.getGroupId().equals(groupId)) throw invalid();
        }
        if (pokeRepository.existsByGroupIdAndFromUserAndToUserAndWeekStart(
                groupId, userId, request.getToUserId(), request.getWeekStart())) {
            throw new BusinessException(ErrorCode.SERMON_POKE_LIMIT);
        }
        try {
            pokeRepository.saveAndFlush(SermonPoke.builder()
                    .groupId(groupId)
                    .fromUser(userId)
                    .toUser(request.getToUserId())
                    .weekStart(request.getWeekStart())
                    .sessionId(request.getSessionId())
                    .build());
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException(ErrorCode.SERMON_POKE_LIMIT);
        }
    }

    // ───────────────── internal ─────────────────

    private SermonGroup requireInvite(String code) {
        if (code == null || code.isBlank()) throw new BusinessException(ErrorCode.SERMON_GROUP_INVITE_INVALID);
        SermonGroup group = groupRepository
                .findByInviteCodeAndDeletedAtIsNull(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_INVITE_INVALID));
        if (!group.isInviteUsable()) throw new BusinessException(ErrorCode.SERMON_GROUP_INVITE_INVALID);
        return group;
    }

    private SermonGroupMember requireTarget(String groupId, String targetUserId) {
        return memberRepository
                .findByGroupIdAndUserId(groupId, targetUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER));
    }

    /** 그 사람의 공개 사본(+거기 달린 반응)과 그 사람이 이 모임에 남긴 반응 */
    private void removeMemberData(String groupId, String userId) {
        reactionRepository.deleteOnSharesOf(groupId, userId);
        reactionRepository.deleteByUserInGroup(groupId, userId);
        shareRepository.deleteByGroupAndUser(groupId, userId);
    }

    private static Integer validateInviteDays(Integer days) {
        if (days != null && !INVITE_DAYS.contains(days)) throw invalid();
        return days;
    }

    private static LocalDateTime expiresAt(Integer days) {
        return days == null ? null : LocalDateTime.now(ZoneOffset.UTC).plusDays(days);
    }

    private String newInviteCode() {
        for (int i = 0; i < INVITE_RETRIES; i++) {
            StringBuilder sb = new StringBuilder(INVITE_LENGTH);
            for (int j = 0; j < INVITE_LENGTH; j++) {
                sb.append(INVITE_ALPHABET.charAt(RANDOM.nextInt(INVITE_ALPHABET.length())));
            }
            String code = sb.toString();
            if (!groupRepository.existsByInviteCode(code)) return code;
        }
        throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (!node.isTextual()) throw invalid();
        return node.textValue();
    }
}
