package com.kanban.domain.sermongroup.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.sermongroup.SermonGroup;
import com.kanban.domain.sermongroup.SermonGroupMember;
import com.kanban.domain.sermongroup.SermonGroupMemberRepository;
import com.kanban.domain.sermongroup.SermonGroupRepository;
import com.kanban.domain.sermongroup.SermonNoteShare;
import com.kanban.domain.sermongroup.SermonSession;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 모임 서비스들이 함께 쓰는 조회·권한·입력 검증·응답 조립.
 *
 * <p>권한 규칙: 조회는 active 멤버만(SG002), 관리(초대·승인·내보내기·수정)는 리더·함께 리더(SG003).
 */
@Component
@RequiredArgsConstructor
public class SermonGroupSupport {

    public static final Set<String> KINDS = Set.of("church", "study", "family", "friend", "team");
    public static final int MAX_MEMBERS_PER_GROUP = 50;
    public static final int MAX_GROUPS_PER_USER = 20;
    public static final int MAX_SERVICES = 12;
    public static final int MAX_SLOTS = 10;
    public static final int MAX_FIELDS_BYTES = 64 * 1024;

    private static final Pattern SERVICE_ID = Pattern.compile("[a-z0-9_-]{1,20}");
    private static final Pattern HH_MM = Pattern.compile("([01]\\d|2[0-3]):[0-5]\\d");
    private static final int GROUP_NAME_MAX = 60;
    private static final int SERVICE_NAME_MAX = 60;
    private static final int DISPLAY_NAME_MAX = 20;
    private static final int PART_MAX = 10;

    private final SermonGroupRepository groupRepository;
    private final SermonGroupMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    // ───────────────── 조회·권한 ─────────────────

    public SermonGroup requireGroup(String groupId) {
        return groupRepository
                .findByIdAndDeletedAtIsNull(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_FOUND));
    }

    public SermonGroupMember requireActiveMember(String groupId, String userId) {
        SermonGroupMember member = memberRepository
                .findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER));
        if (!member.isActive()) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER);
        }
        return member;
    }

    public SermonGroupMember requireManager(String groupId, String userId) {
        SermonGroupMember member = requireActiveMember(groupId, userId);
        if (!member.isManager()) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
        }
        return member;
    }

    public SermonGroupMember requireLeader(String groupId, String userId) {
        SermonGroupMember member = requireActiveMember(groupId, userId);
        if (!member.isLeader()) {
            throw new BusinessException(ErrorCode.SERMON_GROUP_LEADER_REQUIRED);
        }
        return member;
    }

    public User requireUser(String userId) {
        return userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    public Map<String, User> usersById(Collection<String> userIds) {
        return userRepository.findAllById(new HashSet<>(userIds)).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
    }

    // ───────────────── 입력 검증 (모두 SG010) ─────────────────

    public static BusinessException invalid() {
        return new BusinessException(ErrorCode.SERMON_GROUP_INVALID_INPUT);
    }

    public String validateGroupName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty() || trimmed.length() > GROUP_NAME_MAX) {
            throw invalid();
        }
        return trimmed;
    }

    public String validateKind(String kind) {
        if (kind == null || !KINDS.contains(kind)) {
            throw invalid();
        }
        return kind;
    }

    public Integer validateDow(Integer dow) {
        if (dow != null && (dow < 0 || dow > 6)) {
            throw invalid();
        }
        return dow;
    }

    public String validateTime(String time) {
        if (time != null && !HH_MM.matcher(time).matches()) {
            throw invalid();
        }
        return time;
    }

    /** 표시 이름 — 비어 있으면 계정 이름(20자 자름) */
    public String resolveDisplayName(String requested, User user) {
        String trimmed = requested == null ? "" : requested.trim();
        if (trimmed.isEmpty()) {
            String fallback = user.getName() == null ? "" : user.getName().trim();
            if (fallback.isEmpty()) fallback = "멤버";
            return fallback.length() > DISPLAY_NAME_MAX ? fallback.substring(0, DISPLAY_NAME_MAX) : fallback;
        }
        if (trimmed.length() > DISPLAY_NAME_MAX) {
            throw invalid();
        }
        return trimmed;
    }

    public List<String> validateMutedServiceIds(List<String> ids) {
        if (ids == null) return new ArrayList<>();
        if (ids.size() > MAX_SERVICES) throw invalid();
        List<String> out = new ArrayList<>();
        for (String id : ids) {
            if (id == null || !SERVICE_ID.matcher(id).matches()) throw invalid();
            if (!out.contains(id)) out.add(id);
        }
        return out;
    }

    /**
     * 예배표 검증 + 정규화. 알려진 키만 남겨 새 Map 으로 다시 만든다 — 클라이언트가 덧붙인 임의 키는 저장하지 않는다.
     */
    public List<Map<String, Object>> validateServices(List<Map<String, Object>> services) {
        if (services == null) return new ArrayList<>();
        if (services.size() > MAX_SERVICES) throw invalid();
        Set<String> seen = new HashSet<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> service : services) {
            if (service == null) throw invalid();
            String id = asString(service.get("id"));
            if (id == null || !SERVICE_ID.matcher(id).matches() || !seen.add(id)) throw invalid();
            String name = asString(service.get("name"));
            if (name == null || name.isBlank() || name.trim().length() > SERVICE_NAME_MAX) throw invalid();
            Object active = service.get("active");
            if (active != null && !(active instanceof Boolean)) throw invalid();
            if (!(service.get("slots") instanceof List<?> slots) || slots.isEmpty() || slots.size() > MAX_SLOTS) {
                throw invalid();
            }
            List<Map<String, Object>> cleanSlots = new ArrayList<>();
            for (Object rawSlot : slots) {
                if (!(rawSlot instanceof Map<?, ?> slot)) throw invalid();
                Integer dow = asInt(slot.get("dow"));
                if (dow == null || dow < 0 || dow > 6) throw invalid();
                String start = asString(slot.get("start"));
                String end = asString(slot.get("end"));
                if (start == null
                        || end == null
                        || !HH_MM.matcher(start).matches()
                        || !HH_MM.matcher(end).matches()) {
                    throw invalid();
                }
                Object partRaw = slot.get("part");
                if (partRaw != null && !(partRaw instanceof String)) throw invalid();
                String part = (String) partRaw;
                if (part != null && part.length() > PART_MAX) throw invalid();

                Map<String, Object> clean = new LinkedHashMap<>();
                clean.put("dow", dow);
                clean.put("start", start);
                clean.put("end", end);
                if (part != null && !part.isBlank()) clean.put("part", part);
                cleanSlots.add(clean);
            }
            Map<String, Object> clean = new LinkedHashMap<>();
            clean.put("id", id);
            clean.put("name", name.trim());
            clean.put("active", active == null || (Boolean) active);
            clean.put("slots", cleanSlots);
            out.add(clean);
        }
        return out;
    }

    public boolean hasService(SermonGroup group, String serviceId) {
        if (serviceId == null || group.getServices() == null) return false;
        return group.getServices().stream().anyMatch(s -> serviceId.equals(s.get("id")));
    }

    public void validateFieldsSize(Map<String, Object> fields) {
        if (fields == null) return;
        try {
            if (objectMapper.writeValueAsBytes(fields).length > MAX_FIELDS_BYTES) {
                throw invalid();
            }
        } catch (JsonProcessingException e) {
            throw invalid();
        }
    }

    private static String asString(Object value) {
        return value instanceof String s ? s : null;
    }

    private static Integer asInt(Object value) {
        if (value instanceof Integer i) return i;
        if (value instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue())) return n.intValue();
        return null;
    }

    // ───────────────── 응답 조립 ─────────────────

    /** 멤버 목록 정렬: 리더 → 함께 리더 → 멤버, 같은 역할은 들어온 순 */
    private static final Comparator<SermonGroupMember> MEMBER_ORDER = Comparator.comparingInt(
                    (SermonGroupMember m) -> switch (m.getRole()) {
                        case SermonGroupMember.ROLE_LEADER -> 0;
                        case SermonGroupMember.ROLE_CO_LEADER -> 1;
                        default -> 2;
                    })
            .thenComparing(SermonGroupMember::getJoinedAt);

    public SermonGroupResponse.Detail toDetail(SermonGroup group, String viewerId) {
        List<SermonGroupMember> members = memberRepository.findByGroupIdOrderByJoinedAtAsc(group.getId());
        return toDetail(group, viewerId, members, null);
    }

    /**
     * @param users 미리 읽은 사용자(목록 응답에서 한 번에 읽을 때). null 이면 여기서 읽는다.
     */
    public SermonGroupResponse.Detail toDetail(
            SermonGroup group, String viewerId, List<SermonGroupMember> members, Map<String, User> users) {
        SermonGroupMember me = members.stream()
                .filter(m -> m.getUserId().equals(viewerId))
                .findFirst()
                .orElse(null);
        boolean viewerActive = me != null && me.isActive();
        boolean viewerManager = viewerActive && me.isManager();

        List<SermonGroupMember> visible = !viewerActive
                ? List.of()
                : members.stream()
                        .filter(m -> m.isActive() || viewerManager)
                        .sorted(MEMBER_ORDER)
                        .toList();
        Map<String, User> userMap = users != null
                ? users
                : usersById(visible.stream().map(SermonGroupMember::getUserId).toList());

        return SermonGroupResponse.Detail.builder()
                .id(group.getId())
                .name(group.getName())
                .kind(group.getKind())
                .meetDow(group.getMeetDow())
                .meetTime(group.getMeetTime())
                .services(group.getServices())
                .joinApproval(group.isJoinApproval())
                .inviteCode(viewerManager ? group.getInviteCode() : null)
                .inviteExpiresAt(viewerManager ? group.getInviteExpiresAt() : null)
                .me(me == null ? null : toMe(me))
                .members(visible.stream()
                        .map(m -> toMember(m, userMap.get(m.getUserId())))
                        .toList())
                .memberCount(
                        members.stream().filter(SermonGroupMember::isActive).count())
                .createdAt(group.getCreatedAt())
                .build();
    }

    private SermonGroupResponse.Me toMe(SermonGroupMember m) {
        return SermonGroupResponse.Me.builder()
                .userId(m.getUserId())
                .role(m.getRole())
                .status(m.getStatus())
                .displayName(m.getDisplayName())
                .mutedServiceIds(m.getMutedServiceIds() == null ? List.of() : m.getMutedServiceIds())
                .build();
    }

    private SermonGroupResponse.Member toMember(SermonGroupMember m, User user) {
        return SermonGroupResponse.Member.builder()
                .userId(m.getUserId())
                .displayName(m.getDisplayName())
                .role(m.getRole())
                .status(m.getStatus())
                .profileImage(user == null ? null : user.getProfileImage())
                .build();
    }

    /**
     * 설교 자리 요약. shares 는 이 session 들의 공개 사본 전부, names 는 user_id → 모임 표시 이름.
     */
    public SermonGroupResponse.SessionSummary toSessionSummary(
            SermonSession session, List<SermonNoteShare> shares, Map<String, String> names, String viewerId) {
        List<SermonGroupResponse.SessionMember> recorded = new ArrayList<>();
        String myShareId = null;
        for (SermonNoteShare share : shares) {
            recorded.add(SermonGroupResponse.SessionMember.builder()
                    .userId(share.getUserId())
                    .state(share.isPrivate() ? "private" : "written")
                    .build());
            if (share.getUserId().equals(viewerId)) myShareId = share.getId();
        }
        return SermonGroupResponse.SessionSummary.builder()
                .id(session.getId())
                .serviceId(session.getServiceId())
                .date(session.getDate())
                .name(session.getName())
                .title(session.getTitle())
                .preacher(session.getPreacher())
                .refs(session.getRefs() == null ? List.of() : session.getRefs())
                .locked(session.isLocked())
                .updatedByName(session.getUpdatedBy() == null ? null : names.get(session.getUpdatedBy()))
                .members(recorded)
                .myShareId(myShareId)
                .build();
    }

    /** user_id → 모임 표시 이름 */
    public Map<String, String> displayNames(String groupId) {
        return memberRepository.findByGroupIdOrderByJoinedAtAsc(groupId).stream()
                .collect(
                        Collectors.toMap(SermonGroupMember::getUserId, SermonGroupMember::getDisplayName, (a, b) -> a));
    }
}
