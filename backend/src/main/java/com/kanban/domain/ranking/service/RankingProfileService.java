package com.kanban.domain.ranking.service;

import com.kanban.domain.church.Church;
import com.kanban.domain.church.ChurchRepository;
import com.kanban.domain.church.UserChurch;
import com.kanban.domain.church.UserChurchRepository;
import com.kanban.domain.church.service.ChurchService;
import com.kanban.domain.ranking.RankingProfile;
import com.kanban.domain.ranking.RankingProfileRepository;
import com.kanban.domain.ranking.dto.RankingDto;
import com.kanban.domain.talent.ChallengeClock;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import java.security.SecureRandom;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 랭킹 프로필(닉네임·태그·익명) 조회·수정. 계약서 §2 */
@Service
@RequiredArgsConstructor
@Transactional
public class RankingProfileService {

    private static final Pattern NICKNAME = Pattern.compile("^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _]+$");
    private static final int NICKNAME_MIN = 2;
    private static final int NICKNAME_MAX = 12;
    private static final int TAG_RETRIES = 30;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 간단 금칙어 — 공백·_ 를 지우고 소문자로 바꾼 닉네임에 들어 있으면 거절 */
    private static final List<String> BANNED = List.of(
            "관리자", "운영자", "운영진", "admin", "bridge", "갈피팀", "씨발", "시발", "ㅅㅂ", "병신", "ㅂㅅ", "개새", "좆", "섹스", "fuck",
            "shit", "sex");

    private final RankingProfileRepository profileRepository;
    private final RankingProfileSupport profileSupport;
    private final UserChurchRepository userChurchRepository;
    private final ChurchRepository churchRepository;

    public RankingDto.Profile get(String userId) {
        return toDto(profileSupport.getOrCreate(userId));
    }

    public RankingDto.Profile update(String userId, RankingDto.UpdateProfile request) {
        RankingProfile profile = profileSupport.getOrCreate(userId);
        if (request.getNickname() != null) {
            String nickname = request.getNickname().strip();
            if (nickname.isEmpty()) {
                profile.updateNickname(null, profile.getTag());
            } else {
                validateNickname(nickname);
                if (!nickname.equals(profile.getNickname())) {
                    String tag = profile.getTag() != null
                                    && !profileRepository.existsByNicknameAndTag(nickname, profile.getTag())
                            ? profile.getTag()
                            : newTag(nickname);
                    profile.updateNickname(nickname, tag);
                }
            }
        }
        if (request.getAnonymous() != null) profile.updateAnonymous(request.getAnonymous());
        return toDto(profile);
    }

    // ───────────────── internal ─────────────────

    static void validateNickname(String nickname) {
        int len = nickname.codePointCount(0, nickname.length());
        if (len < NICKNAME_MIN
                || len > NICKNAME_MAX
                || !NICKNAME.matcher(nickname).matches()) {
            throw new BusinessException(ErrorCode.CHALLENGE_NICKNAME_INVALID);
        }
        String key = nickname.replaceAll("[\\s_]+", "").toLowerCase(Locale.ROOT);
        for (String b : BANNED) {
            if (key.contains(b)) throw new BusinessException(ErrorCode.CHALLENGE_NICKNAME_INVALID, "쓸 수 없는 닉네임입니다");
        }
    }

    /** 같은 닉네임 안에서 겹치지 않는 4자리 */
    private String newTag(String nickname) {
        for (int i = 0; i < TAG_RETRIES; i++) {
            String tag = String.format("%04d", RANDOM.nextInt(10000));
            if (!profileRepository.existsByNicknameAndTag(nickname, tag)) return tag;
        }
        throw new BusinessException(ErrorCode.CHALLENGE_NICKNAME_INVALID, "이 닉네임은 사용하는 사람이 너무 많습니다");
    }

    private RankingDto.Profile toDto(RankingProfile p) {
        return RankingDto.Profile.builder()
                .nickname(p.getNickname())
                .tag(p.getTag())
                .anonymous(p.isAnonymous())
                .anonName(p.anonName())
                .leagueTier(p.getLeagueTier())
                .church(churchInfo(p.getUserId()))
                .build();
    }

    private RankingDto.ChurchInfo churchInfo(String userId) {
        UserChurch mine = userChurchRepository.findById(userId).orElse(null);
        if (mine == null || mine.getChurchId() == null) return null;
        Church church = churchRepository.findById(mine.getChurchId()).orElse(null);
        if (church == null) return null;
        return RankingDto.ChurchInfo.builder()
                .id(church.getId())
                .name(church.getName())
                .region(church.getRegion())
                .dept(mine.getDept())
                .changedAt(mine.getChangedAt() != null ? ChallengeClock.fromUtc(mine.getChangedAt()) : null)
                .canChangeAt(ChurchService.canChangeAt(mine))
                .build();
    }
}
