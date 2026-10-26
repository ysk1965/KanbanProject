package com.kanban.domain.sermonprofile.service;

import com.kanban.domain.church.ChurchRepository;
import com.kanban.domain.church.UserChurch;
import com.kanban.domain.church.UserChurchRepository;
import com.kanban.domain.sermongroup.SermonGroupMember;
import com.kanban.domain.sermongroup.SermonGroupMemberRepository;
import com.kanban.domain.sermongroup.SermonGroupRepository;
import com.kanban.domain.sermonprofile.SermonProfile;
import com.kanban.domain.sermonprofile.SermonProfileRepository;
import com.kanban.domain.sermonprofile.SermonProfileVerse;
import com.kanban.domain.sermonprofile.SermonProfileVerseRepository;
import com.kanban.domain.sermonprofile.dto.SermonProfileDto;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
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
 * 「나의 갈피」 이름표.
 *
 * <p>소속 교회는 챌린지의 user_churches 를 읽기만 한다(고르기·바꾸기는 /challenge/church).
 *
 * <p>공개 규칙: private = 나만, groups = 같은 모임(둘 다 active, 삭제 안 된 모임) 사람, link = 로그인한 누구나. 다른 사람에게는
 * 고정한 노트(pins)와 말씀 연대기를 주지 않는다 — 노트 본문은 그 사람만 열 수 있어서.
 */
@Service
@RequiredArgsConstructor
public class SermonProfileService {

    public static final Set<String> MASCOTS = Set.of("galpi", "dong", "bang", "banjjak");
    public static final Set<String> MASCOT_STATES = Set.of("idle", "listen", "done", "think", "sleep");
    public static final Set<String> INKS =
            Set.of("cotton", "strawberry", "mint", "peach", "lilac", "lemon", "blueberry", "mono", "monopink");
    public static final Set<String> VERSE_STYLES = Set.of("serif", "hand");
    public static final Set<String> VISIBILITIES = Set.of("private", "groups", "link");
    public static final Set<String> PATTERNS = Set.of("dots", "lines", "stars", "plain");
    public static final Set<String> STICKERS = Set.of("mascot", "none");
    public static final int MAX_PINS = 3;
    public static final int MAX_VERSES = 3;
    public static final int PIN_LINE_MAX = 40;
    public static final int NOTE_ID_MAX = 64;
    public static final int GALPI_SERVICE_MAX = 60;
    public static final int MAX_WORSHIP_SERVICES = 12;
    public static final int WORSHIP_ID_MAX = 20;
    public static final int WORSHIP_NAME_MAX = 30;
    public static final int MAX_WORSHIP_SLOTS = 14;
    public static final int WORSHIP_PART_MAX = 10;
    public static final int MAX_WORSHIP_GROUPS = 20;
    public static final int GROUP_ID_MAX = 36;

    /** encRef: 권(0~65):장:절-절, 끝에 w 면 장 전체 */
    private static final Pattern VERSE_REF = Pattern.compile("^(\\d{1,2}):(\\d{1,3}):(\\d{1,3})-(\\d{1,3})(w?)$");

    private static final Pattern NOTE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private static final Pattern HH_MM = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    private final SermonProfileRepository profileRepository;
    private final SermonProfileVerseRepository verseRepository;
    private final SermonGroupMemberRepository memberRepository;
    private final SermonGroupRepository groupRepository;
    private final UserRepository userRepository;
    private final UserChurchRepository userChurchRepository;
    private final ChurchRepository churchRepository;

    @Transactional(readOnly = true)
    public SermonProfileDto.Profile getMe(String userId) {
        SermonProfile p = profileRepository.findById(userId).orElse(null);
        return toMine(userId, p);
    }

    @Transactional
    public SermonProfileDto.Profile putMe(String userId, SermonProfileDto.Update req) {
        if (req == null) throw invalid();
        String mascot = pick(req.getMascot(), MASCOTS, "galpi");
        String state = pick(req.getMascotState(), MASCOT_STATES, "idle");
        String ink = pick(req.getInk(), INKS, "cotton");
        String verseStyle = pick(req.getVerseStyle(), VERSE_STYLES, "serif");
        String visibility = pick(req.getVisibility(), VISIBILITIES, "groups");
        String verseRef = verseRef(req.getVerseRef());
        List<Map<String, Object>> pins = pins(req.getPins());
        Boolean galpiAuto = req.getGalpiAuto();
        String galpiService = galpiAuto == null ? null : galpiService(req.getGalpiService());
        List<Map<String, Object>> worship =
                req.getWorshipServices() == null ? null : worshipServices(req.getWorshipServices());

        SermonProfile p = profileRepository.findById(userId).orElse(null);
        String before = p == null ? null : p.getVerseRef();
        if (p == null) {
            p = SermonProfile.builder()
                    .userId(userId)
                    .mascot(mascot)
                    .mascotState(state)
                    .ink(ink)
                    .verseRef(verseRef)
                    .verseStyle(verseStyle)
                    .visibility(visibility)
                    .pins(pins)
                    .galpiAuto(galpiAuto)
                    .galpiService(galpiService)
                    .worshipServices(worship)
                    .build();
            p = profileRepository.save(p);
        } else {
            p.update(mascot, state, ink, verseRef, verseStyle, visibility, pins);
            // 자동 갈피 설정은 galpi_auto 가 올 때만 바꾼다 — 모르는 클라이언트가 PUT 해도 남는다
            if (galpiAuto != null) p.updateGalpi(galpiAuto, galpiService);
            // 예배표도 같은 규칙 — 필드가 없으면 남기고, [] 면 비운다
            if (worship != null) p.updateWorshipServices(worship);
        }
        recordVerse(userId, before, verseRef);
        return toMine(userId, p);
    }

    @Transactional(readOnly = true)
    public SermonProfileDto.Profile getOther(String viewerId, String targetId) {
        if (viewerId.equals(targetId)) return getMe(viewerId);
        SermonProfile p = profileRepository.findById(targetId).orElse(null);
        String visibility = p == null ? "groups" : p.getVisibility();
        boolean visible = switch (visibility) {
            case "link" -> userRepository.existsById(targetId);
            case "groups" -> shareGroup(viewerId, targetId);
            default -> false;
        };
        if (!visible) throw new BusinessException(ErrorCode.SERMON_PROFILE_NOT_VISIBLE);
        SermonProfileDto.Profile.ProfileBuilder b = base(targetId, p);
        return b.build();
    }

    // ───────────────── 내부 ─────────────────

    private void recordVerse(String userId, String before, String after) {
        if (after == null ? before == null : after.equals(before)) return;
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        verseRepository.findFirstByUserIdAndToAtIsNull(userId).ifPresent(v -> v.close(now));
        if (after != null) {
            verseRepository.save(SermonProfileVerse.builder()
                    .userId(userId)
                    .verseRef(after)
                    .fromAt(now)
                    .build());
        }
    }

    private boolean shareGroup(String a, String b) {
        Set<String> mine = memberRepository.findByUserId(a).stream()
                .filter(SermonGroupMember::isActive)
                .map(SermonGroupMember::getGroupId)
                .collect(Collectors.toSet());
        if (mine.isEmpty()) return false;
        Set<String> both = new HashSet<>();
        for (SermonGroupMember m : memberRepository.findByUserId(b)) {
            if (m.isActive() && mine.contains(m.getGroupId())) both.add(m.getGroupId());
        }
        if (both.isEmpty()) return false;
        return groupRepository.findAllById(both).stream().anyMatch(g -> g.getDeletedAt() == null);
    }

    private SermonProfileDto.Profile toMine(String userId, SermonProfile p) {
        List<SermonProfileDto.VerseEntry> history = verseRepository.findTop12ByUserIdOrderByFromAtDesc(userId).stream()
                .map(v -> SermonProfileDto.VerseEntry.builder()
                        .verseRef(v.getVerseRef())
                        .fromAt(v.getFromAt())
                        .toAt(v.getToAt())
                        .build())
                .collect(Collectors.toList());
        List<SermonProfileDto.Pin> pins = new ArrayList<>();
        if (p != null) {
            for (Map<String, Object> m : p.getPins()) {
                pins.add(SermonProfileDto.Pin.builder()
                        .noteId(str(m.get("note_id")))
                        .ink(str(m.get("ink")))
                        .pattern(str(m.get("pattern")))
                        .sticker(str(m.get("sticker")))
                        .line(str(m.get("line")))
                        .build());
            }
        }
        return base(userId, p)
                .pins(pins)
                .verseHistory(history)
                .verseCount(p != null && p.getVerseRef() != null ? verseRepository.countByUserId(userId) : null)
                .galpiAuto(p == null || p.getGalpiAuto() == null ? Boolean.TRUE : p.getGalpiAuto())
                .galpiService(p == null ? null : p.getGalpiService())
                .worshipServices(p == null || p.getWorshipServices() == null ? List.of() : p.getWorshipServices())
                .build();
    }

    private SermonProfileDto.ChurchRef church(String userId) {
        UserChurch mine = userChurchRepository.findById(userId).orElse(null);
        if (mine == null || mine.getChurchId() == null) return null;
        return churchRepository
                .findById(mine.getChurchId())
                .map(c -> SermonProfileDto.ChurchRef.builder()
                        .id(c.getId())
                        .name(c.getName())
                        .region(c.getRegion())
                        .dept(mine.getDept())
                        .build())
                .orElse(null);
    }

    private SermonProfileDto.Profile.ProfileBuilder base(String userId, SermonProfile p) {
        String name = userRepository.findById(userId).map(User::getName).orElse(null);
        SermonProfileDto.Profile.ProfileBuilder b = SermonProfileDto.Profile.builder()
                .userId(userId)
                .displayName(name)
                .church(church(userId));
        if (p == null) {
            return b.saved(false)
                    .mascot("galpi")
                    .mascotState("idle")
                    .ink("cotton")
                    .verseStyle("serif")
                    .visibility("groups");
        }
        return b.saved(true)
                .mascot(p.getMascot())
                .mascotState(p.getMascotState())
                .ink(p.getInk())
                .verseRef(p.getVerseRef())
                .verseStyle(p.getVerseStyle())
                .visibility(p.getVisibility())
                .updatedAt(p.getUpdatedAt());
    }

    private List<Map<String, Object>> pins(List<SermonProfileDto.Pin> in) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (in == null) return out;
        if (in.size() > MAX_PINS) throw invalid();
        Set<String> seen = new HashSet<>();
        for (SermonProfileDto.Pin pin : in) {
            if (pin == null
                    || pin.getNoteId() == null
                    || !NOTE_ID.matcher(pin.getNoteId()).matches()) throw invalid();
            if (!seen.add(pin.getNoteId())) throw invalid();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("note_id", pin.getNoteId());
            String ink = pin.getInk();
            if (ink != null && !INKS.contains(ink)) throw invalid();
            if (ink != null) m.put("ink", ink);
            m.put("pattern", pick(pin.getPattern(), PATTERNS, "dots"));
            m.put("sticker", pick(pin.getSticker(), STICKERS, "mascot"));
            String line = text(pin.getLine(), PIN_LINE_MAX);
            if (line != null) m.put("line", line);
            out.add(m);
        }
        return out;
    }

    private static String verseRef(String s) {
        if (s == null || s.isBlank()) return null;
        Matcher m = VERSE_REF.matcher(s.trim());
        if (!m.matches()) throw invalid();
        int book = Integer.parseInt(m.group(1));
        int v1 = Integer.parseInt(m.group(3));
        int v2 = Integer.parseInt(m.group(4));
        // 대표 말씀은 1~3절 — 장 전체(w)는 받지 않는다
        if (book > 65
                || v1 < 1
                || v2 < v1
                || v2 - v1 + 1 > MAX_VERSES
                || !m.group(5).isEmpty()) throw invalid();
        return s.trim();
    }

    /** 앞뒤 공백 제거, 빈 값 = null, 60자(코드포인트) 넘으면 SPF001 */
    private static String galpiService(String v) {
        if (v == null) return null;
        String t = v.strip();
        if (t.isEmpty()) return null;
        if (t.codePointCount(0, t.length()) > GALPI_SERVICE_MAX) throw invalid();
        return t;
    }

    /**
     * 「내 예배표」 검증·정리 — 모르는 키는 버리고, galpi=true 는 처음 하나만 남긴다. 어긋나면 SPF001.
     *
     * <p>[{id, name, slots[{dow, start, end, part}], my_part, auto, galpi, groups[{group_id, service_id}]}]
     */
    private static List<Map<String, Object>> worshipServices(List<Map<String, Object>> in) {
        if (in.size() > MAX_WORSHIP_SERVICES) throw invalid();
        List<Map<String, Object>> out = new ArrayList<>();
        boolean galpiTaken = false;
        for (Map<String, Object> svc : in) {
            if (svc == null) throw invalid();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", requiredString(svc.get("id"), WORSHIP_ID_MAX));
            m.put("name", requiredString(svc.get("name"), WORSHIP_NAME_MAX));

            Object slotsRaw = svc.get("slots");
            List<Map<String, Object>> slots = new ArrayList<>();
            if (slotsRaw != null) {
                if (!(slotsRaw instanceof List<?> list) || list.size() > MAX_WORSHIP_SLOTS) throw invalid();
                for (Object o : list) {
                    if (!(o instanceof Map<?, ?> slot)) throw invalid();
                    Map<String, Object> sm = new LinkedHashMap<>();
                    if (!(slot.get("dow") instanceof Integer dow) || dow < 0 || dow > 6) throw invalid();
                    sm.put("dow", dow);
                    sm.put("start", hhmm(slot.get("start")));
                    sm.put("end", hhmm(slot.get("end")));
                    sm.put("part", optionalString(slot.get("part"), WORSHIP_PART_MAX));
                    slots.add(sm);
                }
            }
            m.put("slots", slots);
            m.put("my_part", optionalString(svc.get("my_part"), WORSHIP_PART_MAX));
            m.put("auto", bool(svc.get("auto"), true));
            boolean galpi = bool(svc.get("galpi"), false) && !galpiTaken;
            if (galpi) galpiTaken = true;
            m.put("galpi", galpi);

            Object groupsRaw = svc.get("groups");
            List<Map<String, Object>> groups = new ArrayList<>();
            if (groupsRaw != null) {
                if (!(groupsRaw instanceof List<?> list) || list.size() > MAX_WORSHIP_GROUPS) throw invalid();
                for (Object o : list) {
                    if (!(o instanceof Map<?, ?> g)) throw invalid();
                    Map<String, Object> gm = new LinkedHashMap<>();
                    gm.put("group_id", requiredString(g.get("group_id"), GROUP_ID_MAX));
                    gm.put("service_id", requiredString(g.get("service_id"), WORSHIP_ID_MAX));
                    groups.add(gm);
                }
            }
            m.put("groups", groups);
            out.add(m);
        }
        return out;
    }

    /** 문자열, 앞뒤 공백 제거 후 1..max 자(코드포인트) */
    private static String requiredString(Object o, int max) {
        if (!(o instanceof String s)) throw invalid();
        String t = s.strip();
        if (t.isEmpty() || t.codePointCount(0, t.length()) > max) throw invalid();
        return t;
    }

    /** null/빈 값 = null, 문자열 아니거나 max 초과 = SPF001 */
    private static String optionalString(Object o, int max) {
        if (o == null) return null;
        if (!(o instanceof String s)) throw invalid();
        String t = s.strip();
        if (t.isEmpty()) return null;
        if (t.codePointCount(0, t.length()) > max) throw invalid();
        return t;
    }

    private static String hhmm(Object o) {
        if (!(o instanceof String s) || !HH_MM.matcher(s).matches()) throw invalid();
        return s;
    }

    private static boolean bool(Object o, boolean fallback) {
        if (o == null) return fallback;
        if (!(o instanceof Boolean b)) throw invalid();
        return b;
    }

    private static String pick(String v, Set<String> allowed, String fallback) {
        if (v == null) return fallback;
        if (!allowed.contains(v)) throw invalid();
        return v;
    }

    /** 앞뒤 공백 제거, 비면 null, 길이(코드포인트) 넘으면 SP001 */
    private static String text(String v, int max) {
        if (v == null) return null;
        String t = v.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        if (t.codePointCount(0, t.length()) > max) throw invalid();
        return t;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.SERMON_PROFILE_INVALID_INPUT);
    }
}
