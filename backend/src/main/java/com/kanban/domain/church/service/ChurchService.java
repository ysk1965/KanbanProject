package com.kanban.domain.church.service;

import com.kanban.domain.church.Church;
import com.kanban.domain.church.ChurchRepository;
import com.kanban.domain.church.UserChurch;
import com.kanban.domain.church.UserChurchRepository;
import com.kanban.domain.church.dto.ChurchDto;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** 교회 검색·등록(정규화 중복 제거)과 내 소속 교회(30일에 한 번 변경). 계약서 §3 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChurchService {

    public static final Duration CHANGE_INTERVAL = Duration.ofDays(30);
    private static final int NAME_MIN = 2;
    private static final int NAME_MAX = 40;
    private static final int ADDRESS_MAX = 200;
    private static final int DEPT_MAX = 20;
    private static final int SEARCH_LIMIT_MAX = 50;

    private final ChurchRepository churchRepository;
    private final UserChurchRepository userChurchRepository;
    private final PlatformTransactionManager transactionManager;
    private final ChallengeClock clock;

    public ChurchDto.Items search(String q, Integer limit) {
        String key = nameKey(q);
        if (key.isEmpty()) return new ChurchDto.Items(List.of());
        int size = limit == null ? 20 : Math.max(1, Math.min(SEARCH_LIMIT_MAX, limit));
        return new ChurchDto.Items(toItems(churchRepository.searchByNameKey(key, PageRequest.of(0, size))));
    }

    /** 이름(공백 제거·소문자) + region 이 같으면 있는 교회를 돌려준다 */
    public ChurchDto.Registered register(String userId, ChurchDto.Register request) {
        String name = collapse(request.getName());
        String region = collapse(request.getRegion());
        String address = request.getAddress() == null ? null : collapse(request.getAddress());
        if (!lengthIn(name, NAME_MIN, NAME_MAX) || !lengthIn(region, NAME_MIN, NAME_MAX)) {
            throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        }
        if (address != null && address.isEmpty()) address = null;
        if (address != null && address.length() > ADDRESS_MAX) {
            throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        }
        String key = nameKey(name);

        Church existing = churchRepository.findByNameKeyAndRegion(key, region).orElse(null);
        if (existing != null) return new ChurchDto.Registered(toItem(existing), false);

        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        String finalAddress = address;
        try {
            Church created = tx.execute(s -> churchRepository.saveAndFlush(Church.builder()
                    .name(name)
                    .nameKey(key)
                    .region(region)
                    .address(finalAddress)
                    .createdBy(userId)
                    .build()));
            return new ChurchDto.Registered(toItem(created), true);
        } catch (DataIntegrityViolationException e) {
            // 동시에 같은 교회가 등록됐다
            Church raced = churchRepository
                    .findByNameKeyAndRegion(key, region)
                    .orElseThrow(() -> new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT));
            return new ChurchDto.Registered(toItem(raced), false);
        }
    }

    /** 내 교회 정하기·바꾸기. 같은 교회면 부서만 고친다(제한 없음). */
    @Transactional
    public void setMine(String userId, String churchId, String dept) {
        if (churchId == null || churchId.isBlank()) throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        churchRepository.findById(churchId).orElseThrow(() -> new BusinessException(ErrorCode.CHURCH_NOT_FOUND));
        String cleanDept = cleanDept(dept);
        LocalDateTime now = clock.nowUtc();

        UserChurch mine = userChurchRepository.findById(userId).orElse(null);
        if (mine == null) {
            userChurchRepository.save(UserChurch.builder()
                    .userId(userId)
                    .churchId(churchId)
                    .dept(cleanDept)
                    .changedAt(now)
                    .build());
            return;
        }
        if (churchId.equals(mine.getChurchId())) {
            mine.updateDept(cleanDept);
            return;
        }
        ensureCanChange(mine);
        mine.change(churchId, cleanDept, now);
    }

    @Transactional
    public void removeMine(String userId) {
        UserChurch mine = userChurchRepository.findById(userId).orElse(null);
        if (mine == null || mine.getChurchId() == null) return;
        ensureCanChange(mine);
        mine.change(null, null, clock.nowUtc());
    }

    /** 다음에 바꿀 수 있는 시각 (changed_at + 30일) */
    public static Instant canChangeAt(UserChurch mine) {
        return mine.getChangedAt() == null
                ? null
                : ChallengeClock.fromUtc(mine.getChangedAt()).plus(CHANGE_INTERVAL);
    }

    // ───────────────── internal ─────────────────

    private void ensureCanChange(UserChurch mine) {
        Instant at = canChangeAt(mine);
        if (at != null && clock.now().isBefore(at)) {
            throw new BusinessException(
                    ErrorCode.CHURCH_CHANGE_TOO_SOON,
                    ErrorCode.CHURCH_CHANGE_TOO_SOON.getMessage() + " (can_change_at: " + at + ")");
        }
    }

    private List<ChurchDto.Item> toItems(List<Church> churches) {
        if (churches.isEmpty()) return List.of();
        Map<String, Long> counts =
                userChurchRepository
                        .countByChurchIds(churches.stream().map(Church::getId).toList())
                        .stream()
                        .collect(Collectors.toMap(r -> (String) r[0], r -> ((Number) r[1]).longValue()));
        return churches.stream()
                .map(c -> toItem(c, counts.getOrDefault(c.getId(), 0L)))
                .toList();
    }

    private ChurchDto.Item toItem(Church c) {
        return toItem(c, userChurchRepository.countByChurchId(c.getId()));
    }

    private static ChurchDto.Item toItem(Church c, long members) {
        return ChurchDto.Item.builder()
                .id(c.getId())
                .name(c.getName())
                .region(c.getRegion())
                .address(c.getAddress())
                .memberCount(members)
                .build();
    }

    private static String cleanDept(String dept) {
        if (dept == null) return null;
        String d = collapse(dept);
        if (d.isEmpty()) return null;
        if (d.length() > DEPT_MAX) throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        return d;
    }

    /** 공백 제거 · 소문자 */
    public static String nameKey(String name) {
        if (name == null) return "";
        return name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private static String collapse(String s) {
        return s == null ? "" : s.strip().replaceAll("\\s+", " ");
    }

    private static boolean lengthIn(String s, int min, int max) {
        int n = s.codePointCount(0, s.length());
        return n >= min && n <= max;
    }
}
