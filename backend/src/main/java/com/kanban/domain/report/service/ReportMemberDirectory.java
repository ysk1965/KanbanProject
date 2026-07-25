package com.kanban.domain.report.service;

import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.integration.slack.SlackUserLink;
import com.kanban.domain.integration.slack.SlackUserLinkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 한 사람의 여러 정체성(이름 · GitHub 로그인 · 슬랙 사용자)을 하나로 잇는다.
 *
 * <p>AI에게 {@code dhyoo}(GitHub) · {@code U0231}(Slack)이 <b>같은 사람</b>임을 알려줘야
 * "유동현이 커밋도 하고 슬랙에서 이슈도 제기했다"처럼 소스를 가로지른 서술이 가능하다.
 * 세 정체성은 {@code BoardMember.githubLogin} ↔ 멤버 ↔ {@code SlackUserLink.slackUserId}로 이미 이어져 있다.
 */
@Component
@RequiredArgsConstructor
public class ReportMemberDirectory {

    private final BoardMemberRepository boardMemberRepository;
    private final SlackUserLinkRepository slackUserLinkRepository;

    /** payload.members — 이름·github·slack 을 묶은 명단. 비어 있으면 빈 리스트. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> roster(String boardId) {
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        if (members.isEmpty()) {
            return List.of();
        }

        List<String> userIds = members.stream().map(m -> m.getUser().getId()).toList();
        Map<String, String> slackByUser = new HashMap<>();
        for (SlackUserLink link : slackUserLinkRepository.findByUserIdIn(userIds)) {
            slackByUser.put(link.getUser().getId(), link.getSlackUserId());
        }

        List<Map<String, Object>> roster = new ArrayList<>();
        for (BoardMember member : members) {
            String github = member.getGithubLogin();
            String slack = slackByUser.get(member.getUser().getId());
            // 이름 말고 이을 게 하나도 없으면 굳이 넣지 않는다 — AI에게 잡음만 된다.
            if ((github == null || github.isBlank()) && (slack == null || slack.isBlank())) {
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("name", member.getUser().getName());
            if (github != null && !github.isBlank()) {
                entry.put("github", github);
            }
            if (slack != null && !slack.isBlank()) {
                entry.put("slack", slack);
            }
            roster.add(entry);
        }
        return roster;
    }

    /** 한 사람의 정체성 묶음 — 구성원별 활동 집계가 소스를 가로질러 같은 사람을 잇는 데 쓴다. */
    public record MemberIdentity(String userId, String name, String githubLogin, String slackUserId) {
    }

    /**
     * 보드 구성원의 정체성 목록(userId·이름·github·slack). 구성원별 활동 집계용.
     * roster()와 달리 github/slack이 없어도 포함한다 — 이름만 있어도 칸반 체크리스트 활동은 잇힌다.
     */
    @Transactional(readOnly = true)
    public List<MemberIdentity> identities(String boardId) {
        List<BoardMember> members = boardMemberRepository.findByBoardId(boardId);
        if (members.isEmpty()) {
            return List.of();
        }
        List<String> userIds = members.stream().map(m -> m.getUser().getId()).toList();
        Map<String, String> slackByUser = new HashMap<>();
        for (SlackUserLink link : slackUserLinkRepository.findByUserIdIn(userIds)) {
            slackByUser.put(link.getUser().getId(), link.getSlackUserId());
        }
        List<MemberIdentity> result = new ArrayList<>();
        for (BoardMember member : members) {
            String userId = member.getUser().getId();
            String github = member.getGithubLogin();
            result.add(new MemberIdentity(
                    userId,
                    member.getUser().getName(),
                    github != null && !github.isBlank() ? github : null,
                    slackByUser.get(userId)));
        }
        return result;
    }

    /**
     * 슬랙 사용자 ID → 표시 이름. BRIDGE에 슬랙 계정을 연동한 사람만 해석된다
     * (채널의 외부 참여자는 ID 그대로 남는다). {@code users:read} 스코프 없이 동작한다.
     */
    @Transactional(readOnly = true)
    public Map<String, String> slackNameMap(Collection<String> slackUserIds) {
        List<String> distinct = slackUserIds.stream().filter(Objects::nonNull).distinct().toList();
        if (distinct.isEmpty()) {
            return Map.of();
        }
        Map<String, String> names = new HashMap<>();
        for (SlackUserLink link : slackUserLinkRepository.findBySlackUserIdIn(distinct)) {
            String name = link.getUser() != null && link.getUser().getName() != null
                    ? link.getUser().getName()
                    : link.getSlackUsername();
            if (name != null && !name.isBlank()) {
                names.put(link.getSlackUserId(), name);
            }
        }
        return names;
    }
}
