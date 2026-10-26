package com.kanban.domain.ranking;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 랭킹에 보이는 이름. 닉네임이 없으면 "이름 없는 양 #tag", 익명이면 "익명의 양 #anon_no". */
@Entity
@Table(name = "ranking_profiles", indexes = @Index(name = "idx_rp_nickname", columnList = "nickname"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class RankingProfile extends BaseTimeEntity {

    public static final int TIER_MIN = 0;
    public static final int TIER_MAX = 4;

    @Id
    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "nickname", length = 12)
    private String nickname;

    /** 같은 닉네임끼리 구분하는 4자리 */
    @Column(name = "tag", length = 4)
    private String tag;

    @Column(name = "anonymous", nullable = false)
    private boolean anonymous;

    @Column(name = "anon_no", nullable = false)
    private int anonNo;

    /** 0 겨자씨 · 1 새싹 · 2 가지 · 3 열매 · 4 포도나무 */
    @Column(name = "league_tier", nullable = false)
    private int leagueTier;

    public void updateNickname(String nickname, String tag) {
        this.nickname = nickname;
        this.tag = tag;
    }

    public void updateAnonymous(boolean anonymous) {
        this.anonymous = anonymous;
    }

    public void updateLeagueTier(int tier) {
        this.leagueTier = Math.max(TIER_MIN, Math.min(TIER_MAX, tier));
    }

    public String anonName() {
        return "익명의 양 #" + anonNo;
    }
}
