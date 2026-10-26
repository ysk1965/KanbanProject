package com.kanban.domain.sermonnote;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocRequest;
import com.kanban.domain.personal.feature.dto.PersonalFeatureDocResponse;
import com.kanban.domain.personal.feature.service.PersonalFeatureDocService;
import com.kanban.domain.sermongroup.SermonReactionRepository;
import com.kanban.domain.sermongroup.dto.SermonGroupRequest;
import com.kanban.domain.sermongroup.dto.SermonGroupResponse;
import com.kanban.domain.sermongroup.service.SermonGroupService;
import com.kanban.domain.sermongroup.service.SermonSessionService;
import com.kanban.domain.sermonnote.dto.SermonNoteVersionDto;
import com.kanban.domain.sermonnote.service.SermonNoteVersionService;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 설교 노트 버전 기록 + 노트 삭제 정리 + 노트 개수 상한 — test 프로파일(H2) */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("설교 노트 버전 기록")
class SermonNoteVersionFlowTest {

    private static final long T0 = 1_761_400_000_000L; // 2025-10-25 근처, 값 자체는 의미 없음

    @Autowired
    SermonNoteVersionService versionService;

    @Autowired
    PersonalFeatureDocService docService;

    @Autowired
    SermonGroupService groupService;

    @Autowired
    SermonSessionService sessionService;

    @Autowired
    SermonReactionRepository reactionRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    @DisplayName("PUT 은 같은 id 로 다시 와도 처음 것 그대로, 목록은 최신 순·본문 없음, 한 장 조회엔 본문")
    @SuppressWarnings("unchecked")
    void upsertListGet() {
        String me = newUser("기록");
        String note = createNote(me, "sermon");

        SermonNoteVersionDto.Item first = versionService.put(me, note, "ver-0001", put("open", "첫 본문", T0));
        assertThat(first.getBody()).isNull();
        assertThat(first.getAt()).isEqualTo(T0);
        assertThat(first.getChars()).isEqualTo(4);
        assertThat(first.getNoteId()).isEqualTo(note);

        // 같은 id 재전송 → 처음 것 (본문이 달라도 덮지 않는다)
        SermonNoteVersionDto.Item again = versionService.put(me, note, "ver-0001", put("auto", "바뀐 본문", T0 + 5));
        assertThat(again.getReason()).isEqualTo("open");
        assertThat(again.getAt()).isEqualTo(T0);

        versionService.put(me, note, "ver-0003", put("close", "세번째", T0 + 2000));
        versionService.put(me, note, "ver-0002", put("auto", "두번째", T0 + 1000));

        List<SermonNoteVersionDto.Item> items = versionService.list(me, note).getItems();
        assertThat(items)
                .extracting(SermonNoteVersionDto.Item::getId)
                .containsExactly("ver-0003", "ver-0002", "ver-0001");
        assertThat(items).allSatisfy(i -> assertThat(i.getBody()).isNull());

        SermonNoteVersionDto.Item full = versionService.get(me, note, "ver-0002");
        assertThat(full.getBody()).isEqualTo("두번째");
        assertThat(full.getTitle()).isEqualTo("제목");

        // JSON 모양: snake_case, at = 숫자, 목록엔 body 키 없음
        Map<?, ?> json = objectMapper.convertValue(versionService.list(me, note), Map.class);
        Map<String, Object> row = (Map<String, Object>) ((List<?>) json.get("items")).get(0);
        assertThat(row.keySet()).containsExactlyInAnyOrder("id", "note_id", "reason", "title", "chars", "at");
        assertThat(row.get("at")).isInstanceOf(Number.class);

        assertCode(() -> versionService.get(me, note, "ver-nope"), ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);
    }

    @Test
    @DisplayName("노트마다 최근 30장만 남는다 (at 이 오래된 것부터 지운다)")
    void capThirty() {
        String me = newUser("상한");
        String note = createNote(me, "sermon");
        for (int i = 0; i < 35; i++) {
            versionService.put(me, note, String.format("cap-%04d", i), put("auto", "본문 " + i, T0 + i * 1000L));
        }
        List<SermonNoteVersionDto.Item> items = versionService.list(me, note).getItems();
        assertThat(items).hasSize(30);
        assertThat(items.get(0).getId()).isEqualTo("cap-0034");
        assertThat(items.get(29).getId()).isEqualTo("cap-0005");
    }

    @Test
    @DisplayName("남의 노트·지운 노트·설교 아닌 문서·없는 노트는 404, 잘못된 입력은 SNV002")
    void accessAndValidation() {
        String me = newUser("나");
        String other = newUser("남");
        String note = createNote(me, "sermon");
        String timetable = createNote(me, "timetable");

        assertCode(() -> versionService.list(other, note), ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);
        assertCode(
                () -> versionService.put(other, note, "ver-other", put("open", "x", T0)),
                ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);
        assertCode(() -> versionService.list(me, timetable), ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);
        assertCode(() -> versionService.list(me, "no-such-note"), ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);

        assertCode(
                () -> versionService.put(me, note, "short", put("open", "x", T0)),
                ErrorCode.SERMON_NOTE_VERSION_INVALID);
        assertCode(
                () -> versionService.put(me, note, "bad/id-123", put("open", "x", T0)),
                ErrorCode.SERMON_NOTE_VERSION_INVALID);
        assertCode(
                () -> versionService.put(me, note, "ver-reason", put("manual", "x", T0)),
                ErrorCode.SERMON_NOTE_VERSION_INVALID);
        SermonNoteVersionDto.Put noAt = put("open", "x", T0);
        noAt.setAt(null);
        assertCode(() -> versionService.put(me, note, "ver-noat1", noAt), ErrorCode.SERMON_NOTE_VERSION_INVALID);

        // 본문 256KB: 딱 맞으면 통과, 1바이트 넘으면 SNV002 (한글 3바이트)
        String exact = "a".repeat(SermonNoteVersionService.MAX_BODY_BYTES);
        versionService.put(me, note, "ver-exact", put("auto", exact, T0));
        String over = "가".repeat(SermonNoteVersionService.MAX_BODY_BYTES / 3 + 1);
        assertCode(
                () -> versionService.put(me, note, "ver-over1", put("auto", over, T0)),
                ErrorCode.SERMON_NOTE_VERSION_INVALID);

        docService.delete(me, "sermon", note);
        assertCode(() -> versionService.list(me, note), ErrorCode.SERMON_NOTE_VERSION_NOT_FOUND);
    }

    @Test
    @DisplayName("노트를 지우면 버전 기록·그 노트로 올린 내 공개 사본·거기 달린 반응이 함께 지워진다")
    void deleteCleansUp() {
        String me = newUser("민지");
        String friend = newUser("준");
        String note = createNote(me, "sermon");
        String keep = createNote(me, "sermon");
        versionService.put(me, note, "del-0001", put("open", "본문", T0));
        versionService.put(me, keep, "keep-0001", put("open", "본문", T0));

        SermonGroupResponse.Detail g = groupService.create(me, groupRequest());
        groupService.join(friend, g.getInviteCode(), join("준"));
        String sessionId = sessionService
                .resolve(me, resolve(g.getId(), LocalDate.of(2026, 10, 25)))
                .getId();
        String other = sessionService
                .resolve(me, resolve(g.getId(), LocalDate.of(2026, 10, 18)))
                .getId();
        String shareId = sessionService.putShare(me, sessionId, share(note)).getId();
        String keptShare = sessionService.putShare(me, other, share(keep)).getId();
        sessionService.putShare(friend, sessionId, share(note)); // 같은 note_id 라도 남의 사본은 그대로
        sessionService.toggleReaction(friend, shareId, reaction());
        sessionService.toggleReaction(friend, keptShare, reaction());

        docService.delete(me, "sermon", note);

        assertThat(count("SELECT COUNT(*) FROM sermon_note_versions WHERE note_id = ?", note))
                .isZero();
        assertThat(count("SELECT COUNT(*) FROM sermon_note_versions WHERE note_id = ?", keep))
                .isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM sermon_note_shares WHERE id = ?", shareId))
                .isZero();
        assertThat(count("SELECT COUNT(*) FROM sermon_reactions WHERE share_id = ?", shareId))
                .isZero();
        assertThat(count("SELECT COUNT(*) FROM sermon_note_shares WHERE id = ?", keptShare))
                .isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM sermon_reactions WHERE share_id = ?", keptShare))
                .isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM sermon_note_shares WHERE user_id = ? AND note_id = ?", friend, note))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("노트 개수 상한: 설교는 5000, 다른 기능은 200 — 201번째 설교 노트도 만들어진다")
    void docLimit() {
        assertThat(PersonalFeatureDocService.docLimit("sermon")).isEqualTo(5000);
        assertThat(PersonalFeatureDocService.docLimit("timetable")).isEqualTo(200);

        String me = newUser("많이");
        String userFk = me;
        // 200개를 직접 넣고 (서비스로 200번 만들면 느리다) 201번째를 서비스로 만든다
        for (int i = 0; i < PersonalFeatureDocService.MAX_DOCS_PER_FEATURE; i++) {
            jdbc.update(
                    "INSERT INTO personal_feature_docs (id, user_id, feature_key, title, content, schema_ver, created_at,"
                            + " updated_at) VALUES (?, ?, ?, ?, '{}', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    UUID.randomUUID().toString(),
                    userFk,
                    "sermon",
                    "노트 " + i);
        }
        assertThat(createNote(me, "sermon")).isNotNull();

        for (int i = 0; i < PersonalFeatureDocService.MAX_DOCS_PER_FEATURE; i++) {
            jdbc.update(
                    "INSERT INTO personal_feature_docs (id, user_id, feature_key, title, content, schema_ver, created_at,"
                            + " updated_at) VALUES (?, ?, ?, ?, '{}', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    UUID.randomUUID().toString(),
                    userFk,
                    "timetable",
                    "표 " + i);
        }
        assertCode(() -> createNote(me, "timetable"), ErrorCode.PERSONAL_FEATURE_DOC_LIMIT_EXCEEDED);
    }

    // ───────────────── helpers ─────────────────

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static SermonNoteVersionDto.Put put(String reason, String body, long at) {
        SermonNoteVersionDto.Put p = new SermonNoteVersionDto.Put();
        p.setReason(reason);
        p.setTitle("  제목  ");
        p.setBody(body);
        p.setChars(body.codePointCount(0, body.length()));
        p.setAt(at);
        return p;
    }

    private String createNote(String userId, String featureKey) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("title", "포도나무와 가지");
        content.put("body", "<p>말씀</p>");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "포도나무와 가지");
        body.put("content", content);
        body.put("schema_ver", 1);
        PersonalFeatureDocResponse.Detail d = docService.create(
                userId, featureKey, objectMapper.convertValue(body, PersonalFeatureDocRequest.Create.class));
        return d.getId();
    }

    private String newUser(String name) {
        return userRepository
                .save(User.builder()
                        .email("snv-" + UUID.randomUUID() + "@example.com")
                        .name(name)
                        .build())
                .getId();
    }

    private static void assertCode(Runnable r, ErrorCode code) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(code);
    }

    private static SermonGroupRequest.Create groupRequest() {
        SermonGroupRequest.Create req = new SermonGroupRequest.Create();
        req.setName("청년부 2셀");
        req.setKind("church");
        req.setJoinApproval(false);
        req.setDisplayName("리더");
        List<Map<String, Object>> services = new ArrayList<>();
        services.add(Map.of(
                "id",
                "sun",
                "name",
                "주일 설교",
                "active",
                true,
                "slots",
                List.of(Map.of("dow", 0, "start", "11:00", "end", "12:20"))));
        req.setServices(services);
        return req;
    }

    private static SermonGroupRequest.Join join(String name) {
        SermonGroupRequest.Join req = new SermonGroupRequest.Join();
        req.setDisplayName(name);
        req.setMutedServiceIds(List.of());
        return req;
    }

    private static SermonGroupRequest.ResolveSession resolve(String groupId, LocalDate date) {
        SermonGroupRequest.ResolveSession req = new SermonGroupRequest.ResolveSession();
        req.setGroupId(groupId);
        req.setServiceId("sun");
        req.setDate(date);
        return req;
    }

    private static SermonGroupRequest.Share share(String noteId) {
        SermonGroupRequest.Share req = new SermonGroupRequest.Share();
        req.setNoteId(noteId);
        req.setMyTitle("로마서 5장");
        req.setHeard("live");
        req.setIsPrivate(false);
        req.setFields(Map.of("thoughts", List.of(Map.of("id", "t1", "tag", "생각", "text", "은혜"))));
        return req;
    }

    private static SermonGroupRequest.Reaction reaction() {
        SermonGroupRequest.Reaction req = new SermonGroupRequest.Reaction();
        req.setItemKey("t1");
        req.setKind("amen");
        return req;
    }
}
