package com.kanban.domain.user.service;

import com.kanban.domain.sermongroup.service.SermonGroupService;
import jakarta.persistence.EntityManager;
import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회원 탈퇴 때 설교 노트(갈피) 데이터를 지운다. {@link UserService#deleteAccount} 가 users 행을 지우기 전에 부른다.
 *
 * <p>갈피 테이블은 users 로 FK 를 걸지 않는다(personal_feature_docs 만 예외) — 그래서 여기서 지우지 않으면 탈퇴 뒤에도
 * 공개 사본·닉네임·리그 기록이 다른 사람에게 남는다. <b>user_id 를 가진 갈피 테이블을 새로 만들면 여기에 추가한다.</b>
 *
 * <p>교회 디렉터리(churches)와 모임 설교 자리(sermon_sessions)는 다른 사람과 함께 쓰는 데이터라 남긴다.
 * 내 스토리지(녹음·사진)는 갈피 전용이 아니라 여기서 다루지 않는다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SermonAccountCleaner {

    /** 지우는 순서 = 자식 → 부모. 각 문장의 ? 는 모두 user_id */
    static final List<String> DELETES = List.of(
            // 모임 — 나가기 처리 뒤 남은 것(이미 지워진 모임의 행, 다른 모임에 남긴 반응·콕)
            "DELETE FROM sermon_reactions WHERE share_id IN (SELECT id FROM sermon_note_shares WHERE user_id = ?)",
            "DELETE FROM sermon_reactions WHERE user_id = ?",
            "DELETE FROM sermon_note_shares WHERE user_id = ?",
            "DELETE FROM sermon_pokes WHERE from_user = ? OR to_user = ?",
            "DELETE FROM sermon_group_members WHERE user_id = ?",
            // 이름표 · 형광펜
            "DELETE FROM sermon_profile_verses WHERE user_id = ?",
            "DELETE FROM sermon_profiles WHERE user_id = ?",
            "DELETE FROM sermon_highlights WHERE user_id = ?",
            // 필사 · 읽기 계획 (모임 계획은 남기고 내 체크만, 혼자 계획은 통째로)
            "DELETE FROM pilsa_verses WHERE user_id = ?",
            "DELETE FROM pilsa_plans WHERE user_id = ?",
            "DELETE FROM reading_checks WHERE user_id = ?",
            "DELETE FROM reading_checks WHERE plan_id IN (SELECT id FROM reading_plans WHERE owner_user_id = ?)",
            "DELETE FROM reading_plan_days WHERE plan_id IN (SELECT id FROM reading_plans WHERE owner_user_id = ?)",
            "DELETE FROM reading_plans WHERE owner_user_id = ?",
            // 챌린지 · 달란트 · 랭킹 · 교회 소속
            "DELETE FROM game_runs WHERE user_id = ?",
            "DELETE FROM league_members WHERE user_id = ?",
            "DELETE FROM league_results WHERE user_id = ?",
            "DELETE FROM weekly_scores WHERE user_id = ?",
            "DELETE FROM ranking_profiles WHERE user_id = ?",
            "DELETE FROM user_churches WHERE user_id = ?",
            "DELETE FROM talent_ledger WHERE user_id = ?",
            "DELETE FROM talent_wallets WHERE user_id = ?",
            // 노트 버전 기록 · 노트 본체 — personal_feature_docs 는 users FK 가 있어 이걸 안 지우면 탈퇴가 FK 위반으로 실패한다
            "DELETE FROM sermon_note_versions WHERE user_id = ?",
            "DELETE FROM personal_feature_terms WHERE user_id = ?",
            "DELETE FROM personal_feature_docs WHERE user_id = ?");

    private final SermonGroupService groupService;
    private final JdbcTemplate jdbc;
    private final EntityManager em;

    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteAll(String userId) {
        groupService.leaveAllForAccountDeletion(userId);
        em.flush(); // JPA 로 지운 멤버·사본을 먼저 내보내야 아래 JDBC 삭제와 겹치지 않는다
        int rows = 0;
        for (String sql : DELETES) {
            Object[] args = new Object[(int) sql.chars().filter(c -> c == '?').count()];
            Arrays.fill(args, userId);
            rows += jdbc.update(sql, args);
        }
        log.info("Sermon data deleted for account: userId={}, rows={}", userId, rows);
    }
}
