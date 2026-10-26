package com.kanban.domain.ranking.service;

import com.kanban.domain.church.UserChurch;
import com.kanban.domain.church.UserChurchRepository;
import com.kanban.domain.ranking.LeagueMember;
import com.kanban.domain.ranking.LeagueMemberRepository;
import com.kanban.domain.ranking.RankingProfile;
import com.kanban.domain.ranking.WeeklyScore;
import com.kanban.domain.ranking.WeeklyScoreRepository;
import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.sermongroup.SermonGroupMember;
import com.kanban.domain.sermongroup.SermonGroupMemberRepository;
import com.kanban.domain.sermongroup.SermonGroupRepository;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주간 랭킹. board: talent(랭킹 달란트) · rain(산성비 최고점) · books(66권 all 최단 ms, 작을수록 위).
 *
 * <p>순위는 동점 같은 순위(1, 2, 2, 4). 전체는 상위 100 + 나, 교회는 등록자 5명 이상일 때만, 모임은 active 멤버 전원.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingService {

    public static final String BOARD_TALENT = "talent";
    public static final String BOARD_RAIN = "rain";
    public static final String BOARD_BOOKS = "books";
    public static final Set<String> BOARDS = Set.of(BOARD_TALENT, BOARD_RAIN, BOARD_BOOKS);

    public static final String SCOPE_GLOBAL = "global";
    public static final String SCOPE_CHURCH = "church";
    public static final String SCOPE_GROUP = "group";

    public static final int TOP = 100;
    public static final int CHURCH_MIN_MEMBERS = 5;

    private final WeeklyScoreRepository scoreRepository;
    private final UserChurchRepository userChurchRepository;
    private final SermonGroupRepository groupRepository;
    private final SermonGroupMemberRepository groupMemberRepository;
    private final LeagueMemberRepository leagueMemberRepository;
    private final RankingProfileSupport profileSupport;
    private final ChallengeClock clock;

    /** 한 사람의 점수 */
    public record Candidate(String userId, Integer value) {}

    public RankingDto.Board rankings(String userId, String scope, String groupId, String board, LocalDate week) {
        if (board == null || board.isBlank()) board = BOARD_TALENT;
        if (!BOARDS.contains(board)) throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        if (week == null) week = clock.currentWeek();
        if (!ChallengeClock.isWeekKey(week)) throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        if (scope == null || scope.isBlank()) scope = SCOPE_GLOBAL;

        RankingDto.Board.BoardBuilder out = RankingDto.Board.builder()
                .week(week)
                .endsAt(ChallengeClock.weekEnd(week))
                .board(board)
                .scope(scope);

        switch (scope) {
            case SCOPE_GLOBAL -> fillGlobal(out, userId, board, week);
            case SCOPE_CHURCH -> {
                UserChurch mine = userChurchRepository.findById(userId).orElse(null);
                if (mine == null || mine.getChurchId() == null) {
                    return out.entries(List.of()).locked("no_church").build();
                }
                List<UserChurch> members = userChurchRepository.findByChurchId(mine.getChurchId());
                if (members.size() < CHURCH_MIN_MEMBERS) {
                    return out.entries(List.of())
                            .locked("too_few")
                            .members(members.size())
                            .build();
                }
                Map<String, String> depts = members.stream()
                        .filter(m -> m.getDept() != null)
                        .collect(Collectors.toMap(UserChurch::getUserId, UserChurch::getDept));
                List<Candidate> list =
                        candidates(members.stream().map(UserChurch::getUserId).toList(), board, week).stream()
                                .filter(c -> c.value() != null)
                                .toList();
                fillFromList(out, userId, board, list, depts, TOP);
            }
            case SCOPE_GROUP -> {
                if (groupId == null || groupId.isBlank())
                    throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
                groupRepository
                        .findByIdAndDeletedAtIsNull(groupId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_FOUND));
                SermonGroupMember me = groupMemberRepository
                        .findByGroupIdAndUserId(groupId, userId)
                        .filter(SermonGroupMember::isActive)
                        .orElseThrow(() -> new BusinessException(ErrorCode.SERMON_GROUP_NOT_MEMBER));
                List<String> ids = groupMemberRepository.findByGroupIdOrderByJoinedAtAsc(me.getGroupId()).stream()
                        .filter(SermonGroupMember::isActive)
                        .map(SermonGroupMember::getUserId)
                        .toList();
                fillFromList(out, userId, board, candidates(ids, board, week), Map.of(), Integer.MAX_VALUE);
            }
            default -> throw new BusinessException(ErrorCode.CHALLENGE_INVALID_INPUT);
        }
        return out.build();
    }

    /** 게임 결과 화면의 순위: 그 게임 보드의 전체·교회 순위, 리그(달란트) 순위. 해당 없으면 null */
    public RankingDto.Ranks ranksFor(String userId, String board, LocalDate week) {
        Integer global = null;
        Integer church = null;
        WeeklyScore mine = scoreRepository.findByWeekAndUserId(week, userId).orElse(null);
        Integer myValue = mine != null ? value(mine, board) : null;
        if (myValue != null && (!BOARD_TALENT.equals(board) || myValue > 0)) {
            global = (int) countBetter(week, board, myValue) + 1;
            UserChurch uc = userChurchRepository.findById(userId).orElse(null);
            if (uc != null && uc.getChurchId() != null) {
                List<String> ids = userChurchRepository.findByChurchId(uc.getChurchId()).stream()
                        .map(UserChurch::getUserId)
                        .toList();
                if (ids.size() >= CHURCH_MIN_MEMBERS) {
                    Comparator<Integer> better = better(board);
                    church = 1
                            + (int) candidates(ids, board, week).stream()
                                    .filter(c -> c.value() != null && better.compare(c.value(), myValue) < 0)
                                    .count();
                }
            }
        }
        return RankingDto.Ranks.builder()
                .global(global)
                .church(church)
                .league(leagueRank(userId, week))
                .build();
    }

    /** 리그 반 안에서 달란트 순위(동점은 먼저 들어온 순) */
    public Integer leagueRank(String userId, LocalDate week) {
        LeagueMember m =
                leagueMemberRepository.findByWeekAndUserId(week, userId).orElse(null);
        if (m == null) return null;
        List<LeagueMember> cohort =
                leagueMemberRepository.findByWeekAndTierAndCohortOrderByCreatedAtAsc(week, m.getTier(), m.getCohort());
        List<String> ordered =
                orderLeague(cohort, week).stream().map(Candidate::userId).toList();
        return ordered.indexOf(userId) + 1;
    }

    /** 반 멤버를 달란트 내림차순(동점은 들어온 순)으로 */
    public List<Candidate> orderLeague(List<LeagueMember> cohort, LocalDate week) {
        List<String> ids = cohort.stream().map(LeagueMember::getUserId).toList();
        List<Candidate> list = new ArrayList<>(candidates(ids, BOARD_TALENT, week));
        // candidates 는 ids 순서를 지키므로 안정 정렬이면 동점은 들어온 순
        list.sort(Comparator.comparing(Candidate::value, better(BOARD_TALENT)));
        return list;
    }

    // ───────────────── internal ─────────────────

    private void fillGlobal(RankingDto.Board.BoardBuilder out, String userId, String board, LocalDate week) {
        PageRequest top = PageRequest.of(0, TOP);
        List<WeeklyScore> rows = switch (board) {
            case BOARD_RAIN -> scoreRepository.topRain(week, top);
            case BOARD_BOOKS -> scoreRepository.topBooks(week, top);
            default -> scoreRepository.topTalents(week, top);
        };
        List<Candidate> list = rows.stream()
                .map(s -> new Candidate(s.getUserId(), value(s, board)))
                .toList();
        Map<String, RankingProfile> profiles =
                profileSupport.byUserIds(list.stream().map(Candidate::userId).toList());
        out.entries(toEntries(list, userId, board, profiles, Map.of(), list.size()));

        WeeklyScore mine = scoreRepository.findByWeekAndUserId(week, userId).orElse(null);
        Integer myValue = mine != null ? value(mine, board) : null;
        if (myValue != null && (!BOARD_TALENT.equals(board) || myValue > 0)) {
            int rank = (int) countBetter(week, board, myValue) + 1;
            out.me(RankingDto.Me.builder().rank(rank).value(myValue).build());
            if (rank > 1) out.gapToNext(gap(week, board, myValue));
        }
    }

    private void fillFromList(
            RankingDto.Board.BoardBuilder out,
            String userId,
            String board,
            List<Candidate> list,
            Map<String, String> depts,
            int limit) {
        List<Candidate> sorted = new ArrayList<>(list);
        sorted.sort(Comparator.comparing(Candidate::value, Comparator.nullsLast(better(board))));
        Map<String, RankingProfile> profiles =
                profileSupport.byUserIds(sorted.stream().map(Candidate::userId).toList());
        List<RankingDto.Entry> all = toEntries(sorted, userId, board, profiles, depts, sorted.size());
        out.entries(all.size() > limit ? all.subList(0, limit) : all);

        for (int i = 0; i < sorted.size(); i++) {
            Candidate c = sorted.get(i);
            if (!c.userId().equals(userId) || c.value() == null) continue;
            int rank = all.get(i).getRank();
            out.me(RankingDto.Me.builder().rank(rank).value(c.value()).build());
            // 바로 위 순위(나보다 나은 값 중 가장 가까운 값)와의 차이
            Comparator<Integer> better = better(board);
            sorted.stream()
                    .map(Candidate::value)
                    .filter(v -> v != null && better.compare(v, c.value()) < 0)
                    .reduce((a, b) -> b)
                    .ifPresent(v -> out.gapToNext(Math.abs(v - c.value())));
        }
    }

    private List<RankingDto.Entry> toEntries(
            List<Candidate> sorted,
            String userId,
            String board,
            Map<String, RankingProfile> profiles,
            Map<String, String> depts,
            int limit) {
        List<RankingDto.Entry> out = new ArrayList<>();
        Integer prevValue = null;
        int prevRank = 0;
        for (int i = 0; i < Math.min(limit, sorted.size()); i++) {
            Candidate c = sorted.get(i);
            int rank = i > 0 && java.util.Objects.equals(c.value(), prevValue) ? prevRank : i + 1;
            prevValue = c.value();
            prevRank = rank;
            RankingProfile p = profiles.get(c.userId());
            out.add(RankingDto.Entry.builder()
                    .rank(rank)
                    .name(RankingProfileSupport.displayName(p, c.userId()))
                    .anonymous(RankingProfileSupport.isAnonymous(p))
                    .dept(depts.get(c.userId()))
                    .value(c.value())
                    .me(c.userId().equals(userId))
                    .build());
        }
        return out;
    }

    /** ids 순서대로 점수. talent 는 기록이 없으면 0, 게임은 null */
    private List<Candidate> candidates(List<String> ids, String board, LocalDate week) {
        if (ids.isEmpty()) return List.of();
        Map<String, WeeklyScore> scores = scoreRepository.findByWeekAndUserIdIn(week, ids).stream()
                .collect(Collectors.toMap(WeeklyScore::getUserId, Function.identity()));
        return ids.stream()
                .map(id -> {
                    WeeklyScore s = scores.get(id);
                    Integer v = s != null ? value(s, board) : null;
                    if (v == null && BOARD_TALENT.equals(board)) v = 0;
                    return new Candidate(id, v);
                })
                .toList();
    }

    private static Integer value(WeeklyScore s, String board) {
        return switch (board) {
            case BOARD_RAIN -> s.getRainBest();
            case BOARD_BOOKS -> s.getBooksBestMs();
            default -> s.getTalents();
        };
    }

    /** 앞에 올 값이 작게 비교되는 비교자 */
    private static Comparator<Integer> better(String board) {
        return BOARD_BOOKS.equals(board) ? Comparator.naturalOrder() : Comparator.reverseOrder();
    }

    private long countBetter(LocalDate week, String board, int value) {
        return switch (board) {
            case BOARD_RAIN -> scoreRepository.countRainAbove(week, value);
            case BOARD_BOOKS -> scoreRepository.countBooksBelow(week, value);
            default -> scoreRepository.countTalentsAbove(week, value);
        };
    }

    private Integer gap(LocalDate week, String board, int value) {
        Integer next = switch (board) {
            case BOARD_RAIN -> scoreRepository.minRainAbove(week, value);
            case BOARD_BOOKS -> scoreRepository.maxBooksBelow(week, value);
            default -> scoreRepository.minTalentsAbove(week, value);
        };
        return next == null ? null : Math.abs(next - value);
    }
}
