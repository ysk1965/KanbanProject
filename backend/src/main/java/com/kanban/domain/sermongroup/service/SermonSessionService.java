package com.kanban.domain.sermongroup.service;

import static com.kanban.domain.sermongroup.service.SermonGroupSupport.invalid;

import com.kanban.domain.sermongroup.SermonGroup;
import com.kanban.domain.sermongroup.SermonGroupMember;
import com.kanban.domain.sermongroup.SermonNoteShare;
import com.kanban.domain.sermongroup.SermonNoteShareRepository;
import com.kanban.domain.sermongroup.SermonReaction;
import com.kanban.domain.sermongroup.SermonReactionRepository;
import com.kanban.domain.sermongroup.SermonSession;
import com.kanban.domain.sermongroup.SermonSessionRepository;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 설교 자리 · 공개 사본 · 반응.
 *
 * <p>설교 자리는 (모임, 예배, 날짜)마다 하나 — 여러 멤버가 같은 예배 노트를 동시에 열면 resolve 가 겹친다.
 * 삽입은 별도 트랜잭션(REQUIRES_NEW)에서 하고 UNIQUE 위반이면 이미 생긴 행을 다시 읽는다.
 */
@Service
@Transactional(readOnly = true)
public class SermonSessionService {

    private static final Set<String> HEARD = Set.of("live", "video", "other");
    private static final Set<String> REACTION_KINDS = Set.of("amen", "curious", "keeping");
    private static final int TITLE_MAX = 200;
    private static final int PREACHER_MAX = 60;
    private static final int SESSION_NAME_MAX = 60;
    private static final int MAX_REFS = 20;
    private static final int REF_MAX = 40;
    private static final int NOTE_ID_MAX = 64;
    private static final int PART_MAX = 10;
    private static final int ITEM_KEY_MAX = 64;

    private final SermonSessionRepository sessionRepository;
    private final SermonNoteShareRepository shareRepository;
    private final SermonReactionRepository reactionRepository;
    private final SermonGroupSupport support;
    private final TransactionTemplate requiresNew;

    public SermonSessionService(
            SermonSessionRepository sessionRepository,
            SermonNoteShareRepository shareRepository,
            SermonReactionRepository reactionRepository,
            SermonGroupSupport support,
            PlatformTransactionManager transactionManager) {
        this.sessionRepository = sessionRepository;
        this.shareRepository = shareRepository;
        this.reactionRepository = reactionRepository;
        this.support = support;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ───────────────── 설교 자리 ─────────────────

    /** get-or-create, 멱등. service_id 는 모임 예배표에 있어야 한다. */
    public SermonGroupResponse.SessionSummary resolve(String userId, SermonGroupRequest.ResolveSession request) {
        if (request == null || request.getGroupId() == null || request.getDate() == null) throw invalid();
        SermonGroup group = support.requireGroup(request.getGroupId());
        support.requireActiveMember(group.getId(), userId);
        String serviceId = request.getServiceId();
        if (!support.hasService(group, serviceId)) throw invalid();
        LocalDate date = request.getDate();

        SermonSession session = sessionRepository
                .findByGroupIdAndServiceIdAndDate(group.getId(), serviceId, date)
                .orElseGet(() -> createOrReread(group.getId(), serviceId, date, userId));
        return summarize(session, userId);
    }

    private SermonSession createOrReread(String groupId, String serviceId, LocalDate date, String userId) {
        try {
            return requiresNew.execute(status -> sessionRepository.saveAndFlush(SermonSession.builder()
                    .groupId(groupId)
                    .serviceId(serviceId)
                    .date(date)
                    .openedBy(userId)
                    .build()));
        } catch (DataIntegrityViolationException e) {
            // 다른 멤버가 같은 자리를 먼저 만들었다
            return sessionRepository
                    .findByGroupIdAndServiceIdAndDate(groupId, serviceId, date)
                    .orElseThrow(() -> e);
        }
    }

    /** 예배표 밖 자리 열기 */
    @Transactional
    public SermonGroupResponse.SessionSummary open(
            String userId, String groupId, SermonGroupRequest.OpenSession request) {
        support.requireGroup(groupId);
        support.requireActiveMember(groupId, userId);
        if (request == null || request.getDate() == null) throw invalid();
        String name = trimToNull(request.getName());
        if (name == null || name.length() > SESSION_NAME_MAX) throw invalid();
        SermonSession session = sessionRepository.save(SermonSession.builder()
                .groupId(groupId)
                .date(request.getDate())
                .name(name)
                .openedBy(userId)
                .build());
        return summarize(session, userId);
    }

    /** 제목·설교자·본문 — active 멤버 누구나, 잠긴 자리는 리더만. 온 필드만 바꾼다(빈 문자열 = 지우기). */
    @Transactional
    public SermonGroupResponse.SessionSummary update(
            String userId, String sessionId, SermonGroupRequest.UpdateSession request) {
        SermonSession session = requireSession(sessionId);
        SermonGroupMember me = support.requireActiveMember(session.getGroupId(), userId);
        if (session.isLocked() && !me.isLeader()) throw new BusinessException(ErrorCode.SERMON_SESSION_LOCKED);
        if (request == null) throw invalid();

        if (request.getTitle() != null) {
            String title = trimToNull(request.getTitle());
            if (title != null && title.length() > TITLE_MAX) throw invalid();
            session.updateTitle(title);
        }
        if (request.getPreacher() != null) {
            String preacher = trimToNull(request.getPreacher());
            if (preacher != null && preacher.length() > PREACHER_MAX) throw invalid();
            session.updatePreacher(preacher);
        }
        if (request.getRefs() != null) {
            session.updateRefs(validateRefs(request.getRefs()));
        }
        session.markUpdatedBy(userId);
        sessionRepository.flush();
        return summarize(session, userId);
    }

    @Transactional
    public SermonGroupResponse.SessionSummary lock(String userId, String sessionId, SermonGroupRequest.Lock request) {
        SermonSession session = requireSession(sessionId);
        support.requireLeader(session.getGroupId(), userId);
        if (request == null || request.getLocked() == null) throw invalid();
        session.updateLocked(request.getLocked());
        return summarize(session, userId);
    }

    public SermonGroupResponse.SessionDetail get(String userId, String sessionId) {
        SermonSession session = requireSession(sessionId);
        support.requireActiveMember(session.getGroupId(), userId);
        List<SermonNoteShare> shares = shareRepository.findBySessionIdOrderByUpdatedAtDesc(sessionId);
        Map<String, String> names = support.displayNames(session.getGroupId());

        Map<String, List<SermonReaction>> reactionsByShare = shares.isEmpty()
                ? Map.of()
                : reactionRepository
                        .findByShareIdIn(
                                shares.stream().map(SermonNoteShare::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(SermonReaction::getShareId));

        return SermonGroupResponse.SessionDetail.builder()
                .session(support.toSessionSummary(session, shares, names, userId))
                .shares(shares.stream()
                        .map(s -> toShareView(s, names, reactionsByShare.getOrDefault(s.getId(), List.of()), userId))
                        .toList())
                .build();
    }

    // ───────────────── 공개 사본 ─────────────────

    /** 내 공개 사본 upsert. private 면 fields 는 저장하지 않는다. 잠긴 자리에도 쓸 수 있다(잠금은 자리 정보만). */
    @Transactional
    public SermonGroupResponse.ShareView putShare(String userId, String sessionId, SermonGroupRequest.Share request) {
        SermonSession session = requireSession(sessionId);
        support.requireActiveMember(session.getGroupId(), userId);
        if (request == null) throw invalid();

        String noteId = trimToNull(request.getNoteId());
        if (noteId != null && noteId.length() > NOTE_ID_MAX) throw invalid();
        String myTitle = trimToNull(request.getMyTitle());
        if (myTitle != null && myTitle.length() > TITLE_MAX) throw invalid();
        String heard = request.getHeard() == null ? SermonNoteShare.HEARD_LIVE : request.getHeard();
        if (!HEARD.contains(heard)) throw invalid();
        String part = trimToNull(request.getPart());
        if (part != null && part.length() > PART_MAX) throw invalid();
        boolean isPrivate = Boolean.TRUE.equals(request.getIsPrivate());
        boolean galpi = Boolean.TRUE.equals(request.getGalpi());
        Map<String, Object> fields = isPrivate ? null : request.getFields();
        support.validateFieldsSize(fields);

        Optional<SermonNoteShare> existing = shareRepository.findBySessionIdAndUserId(sessionId, userId);
        SermonNoteShare share;
        if (existing.isPresent()) {
            share = existing.get();
            share.update(noteId, myTitle, heard, part, isPrivate, galpi, fields);
        } else {
            share = SermonNoteShare.builder()
                    .sessionId(sessionId)
                    .groupId(session.getGroupId())
                    .userId(userId)
                    .noteId(noteId)
                    .myTitle(myTitle)
                    .heard(heard)
                    .part(part)
                    .isPrivate(isPrivate)
                    .galpi(galpi)
                    .fields(fields)
                    .build();
        }
        share = shareRepository.saveAndFlush(share);
        return toShareView(
                share,
                support.displayNames(session.getGroupId()),
                reactionRepository.findByShareIdIn(List.of(share.getId())),
                userId);
    }

    @Transactional
    public void deleteShare(String userId, String sessionId) {
        SermonSession session = requireSession(sessionId);
        support.requireActiveMember(session.getGroupId(), userId);
        shareRepository.findBySessionIdAndUserId(sessionId, userId).ifPresent(share -> {
            reactionRepository.deleteByShare(share.getId());
            shareRepository.delete(share);
        });
    }

    // ───────────────── 반응 ─────────────────

    /** 토글. 내 공개 사본에는 못 누른다(SG010). */
    @Transactional
    public SermonGroupResponse.ReactionCount toggleReaction(
            String userId, String shareId, SermonGroupRequest.Reaction request) {
        SermonNoteShare share = shareRepository
                .findById(shareId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_FOUND));
        support.requireGroup(share.getGroupId());
        support.requireActiveMember(share.getGroupId(), userId);
        if (share.getUserId().equals(userId)) throw invalid();
        if (request == null) throw invalid();
        String itemKey = trimToNull(request.getItemKey());
        if (itemKey == null || itemKey.length() > ITEM_KEY_MAX) throw invalid();
        String kind = request.getKind();
        if (kind == null || !REACTION_KINDS.contains(kind)) throw invalid();

        // 연타로 두 요청이 겹쳐도 500 이 나지 않게 — 끄기는 영향 행 수만 보는 벌크 삭제, 켜기는 별도 트랜잭션에서
        // 넣고 UNIQUE 위반이면 이미 켜진 것으로 본다 (resolve 와 같은 방식)
        boolean nowMine;
        if (reactionRepository
                .findByShareIdAndItemKeyAndUserIdAndKind(shareId, itemKey, userId, kind)
                .isPresent()) {
            reactionRepository.deleteMine(shareId, itemKey, userId, kind);
            nowMine = false;
        } else {
            try {
                requiresNew.executeWithoutResult(status -> reactionRepository.saveAndFlush(SermonReaction.builder()
                        .shareId(shareId)
                        .itemKey(itemKey)
                        .userId(userId)
                        .kind(kind)
                        .build()));
            } catch (DataIntegrityViolationException e) {
                // 같은 사람의 겹친 요청이 먼저 넣었다
            }
            nowMine = true;
        }
        return SermonGroupResponse.ReactionCount.builder()
                .itemKey(itemKey)
                .kind(kind)
                .count(reactionRepository.countByShareIdAndItemKeyAndKind(shareId, itemKey, kind))
                .mine(nowMine)
                .build();
    }

    // ───────────────── internal ─────────────────

    /** 자리가 없거나 모임이 지워졌으면 SG001 */
    private SermonSession requireSession(String sessionId) {
        SermonSession session = sessionRepository
                .findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_FOUND));
        support.requireGroup(session.getGroupId());
        return session;
    }

    private SermonGroupResponse.SessionSummary summarize(SermonSession session, String userId) {
        return support.toSessionSummary(
                session,
                shareRepository.findBySessionIdOrderByUpdatedAtDesc(session.getId()),
                support.displayNames(session.getGroupId()),
                userId);
    }

    private SermonGroupResponse.ShareView toShareView(
            SermonNoteShare share, Map<String, String> names, List<SermonReaction> reactions, String viewerId) {
        // (item_key, kind) 별 [개수, 내가 눌렀는지] — 처음 나온 순서를 지킨다
        Map<ReactionKey, long[]> tally = new LinkedHashMap<>();
        for (SermonReaction r : reactions) {
            long[] t = tally.computeIfAbsent(new ReactionKey(r.getItemKey(), r.getKind()), k -> new long[2]);
            t[0]++;
            if (r.getUserId().equals(viewerId)) t[1] = 1;
        }
        List<SermonGroupResponse.ReactionCount> list = new ArrayList<>();
        tally.forEach((key, t) -> list.add(SermonGroupResponse.ReactionCount.builder()
                .itemKey(key.itemKey())
                .kind(key.kind())
                .count(t[0])
                .mine(t[1] == 1)
                .build()));
        return SermonGroupResponse.ShareView.builder()
                .id(share.getId())
                .userId(share.getUserId())
                .displayName(names.get(share.getUserId()))
                .myTitle(share.getMyTitle())
                .heard(share.getHeard())
                .part(share.getPart())
                .isPrivate(share.isPrivate())
                .galpi(share.isGalpi())
                .fields(share.isPrivate() ? null : share.getFields())
                .updatedAt(share.getUpdatedAt())
                .reactions(list)
                .build();
    }

    private record ReactionKey(String itemKey, String kind) {}

    private List<String> validateRefs(List<String> refs) {
        if (refs.size() > MAX_REFS) throw invalid();
        List<String> out = new ArrayList<>();
        for (String ref : refs) {
            String r = trimToNull(ref);
            if (r == null || r.length() > REF_MAX) throw invalid();
            out.add(r);
        }
        return out;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
