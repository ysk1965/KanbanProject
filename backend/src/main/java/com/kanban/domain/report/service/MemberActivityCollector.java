package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.service.BoardProgressCollector.CommitInfo;
import com.kanban.domain.report.service.ReportMemberDirectory.MemberIdentity;
import com.kanban.domain.report.source.ReportPeriod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 커밋·슬랙·칸반 체크리스트 활동을 <b>사람 기준으로 재묶는다</b>. AI 없이 시스템이 결정론적으로 집계한다.
 *
 * <p>한 사람의 여러 정체성(GitHub 로그인 · 슬랙 사용자 ID · 보드 멤버)을 {@link ReportMemberDirectory}로
 * 이어, GitHub author·슬랙 발화자·체크리스트 담당자가 같은 사람이면 한 카드로 합친다. 각 커밋에는 소속
 * 클러스터 태그를 달아 "이 사람이 어느 기능에 기여했는지"를 사람↔기능으로 잇는다.
 *
 * <p>연동 정보가 없는 외부 기여자(로그인만 있는 커밋 author, 채널의 외부 슬랙 참여자)도 그대로 노출한다 —
 * 그들도 그 기간에 실제로 활동했기 때문이다. 활동량 내림차순으로 정렬한다.
 *
 * <p>Confluence 작성 내역은 문서 author_id를 보드 멤버로 신뢰성 있게 잇는 매핑이 아직 없어, 이 버전에서는
 * 구성원 카드에 붙이지 않는다(클러스터 단위에는 그대로 붙는다). 매핑이 생기면 확장한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MemberActivityCollector {

    private static final int MAX_MEMBERS = 20;
    private static final int MAX_COMMITS_PER_MEMBER = 30;
    private static final int MAX_SLACK_PER_MEMBER = 20;
    private static final int MAX_CHECKLIST_PER_MEMBER = 20;

    private final ReportMemberDirectory memberDirectory;
    private final ChecklistItemRepository checklistItemRepository;

    /** sha → 소속 클러스터 식별. 커밋에 기능 태그를 달아 사람↔기능을 잇는다. */
    public record ClusterTag(String key, String title) {
    }

    public record MemberResult(List<ReportContent.Member> members) {
    }

    /** 집계용 누적기 — 안정적 memberKey로 소스별 활동을 모은다. */
    private static class Acc {
        String name;
        String login;
        final List<ReportContent.MemberCommit> commits = new ArrayList<>();
        final List<ReportContent.MemberSlackMessage> slack = new ArrayList<>();
        final List<ReportContent.MemberChecklistChange> checklist = new ArrayList<>();

        Acc(String name, String login) {
            this.name = name;
            this.login = login;
        }
    }

    /**
     * @param period        보고 기간 — 칸반 체크리스트를 그 기간 완료분으로 스코프하는 데 쓴다.
     * @param clusterBySha 각 커밋 sha → 소속 클러스터. 미분류·미매칭이면 값이 없거나 kind=infra일 수 있다.
     * @param slackMessages 슬랙 수집 결과의 messages 배열(JsonNode). 없으면 null.
     */
    @Transactional(readOnly = true)
    public MemberResult compute(String boardId, ReportPeriod period, List<CommitInfo> commits,
                                Map<String, ClusterTag> clusterBySha, JsonNode slackMessages) {
        List<MemberIdentity> identities = memberDirectory.identities(boardId);

        // 정체성 매핑: github 로그인 / 슬랙 ID → memberKey(userId). 대소문자 무시.
        Map<String, String> keyByGithub = new HashMap<>();
        Map<String, String> keyBySlack = new HashMap<>();
        Map<String, MemberIdentity> byUserId = new HashMap<>();
        for (MemberIdentity id : identities) {
            byUserId.put(id.userId(), id);
            if (id.githubLogin() != null) {
                keyByGithub.put(id.githubLogin().toLowerCase(Locale.ROOT), id.userId());
            }
            if (id.slackUserId() != null) {
                keyBySlack.put(id.slackUserId(), id.userId());
            }
        }

        Map<String, Acc> accs = new LinkedHashMap<>();
        Map<String, ClusterTag> tags = clusterBySha != null ? clusterBySha : Map.of();

        // 1) 커밋 — author(github 로그인)로 사람에 귀속. 미연동이면 로그인 자체를 키로.
        for (CommitInfo c : commits != null ? commits : List.<CommitInfo>of()) {
            String author = c.author();
            if (author == null || author.isBlank()) {
                continue;
            }
            String userId = keyByGithub.get(author.toLowerCase(Locale.ROOT));
            // 멤버에 연동 안 된 봇·서비스 계정(CI, dependabot 등)은 구성원 뷰에서 뺀다 — 사람이 아니다.
            // 연동된 계정이면(실멤버) 남긴다.
            if (userId == null && isBotLogin(author)) {
                continue;
            }
            String key = userId != null ? userId : "gh:" + author.toLowerCase(Locale.ROOT);
            String name = userId != null ? byUserId.get(userId).name() : author;
            Acc acc = accs.computeIfAbsent(key, k -> new Acc(name, author));
            if (acc.commits.size() >= MAX_COMMITS_PER_MEMBER) {
                continue;
            }
            ClusterTag tag = c.sha() != null ? tags.get(c.sha()) : null;
            acc.commits.add(ReportContent.MemberCommit.builder()
                    .subject(c.subject())
                    .sha(c.sha())
                    .at(c.at())
                    .url(c.url())
                    .type(commitType(c.subject()))
                    .clusterKey(tag != null ? tag.key() : null)
                    .clusterTitle(tag != null ? tag.title() : null)
                    .build());
        }

        // 2) 슬랙 — user(슬랙 ID)로 귀속. 상위 메시지와 스레드 답글 발화자를 모두 사람에 잇는다.
        if (slackMessages != null && slackMessages.isArray()) {
            for (JsonNode msg : slackMessages) {
                String channel = text(msg, "channel_name");
                addSlackMessage(msg, channel, accs, keyBySlack, byUserId);
                JsonNode replies = msg.get("replies");
                if (replies != null && replies.isArray()) {
                    for (JsonNode reply : replies) {
                        addSlackMessage(reply, channel, accs, keyBySlack, byUserId);
                    }
                }
            }
        }

        // 3) 칸반 체크리스트 — 그 기간에 완료된 항목만 담당자 기준으로. 보드 전체를 한 번에 로드(N+1 제거).
        LocalDateTime startUtc = period.startInclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime endUtc = period.endExclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        List<ChecklistItem> completed;
        try {
            completed = checklistItemRepository.findCompletedByBoardIdAndDateRange(boardId, startUtc, endUtc);
        } catch (Exception e) {
            completed = List.of();
        }
        for (ChecklistItem item : completed) {
            if (item.getAssignee() == null) {
                continue;
            }
            String userId = item.getAssignee().getId();
            Acc acc = accs.get(userId);
            if (acc == null) {
                MemberIdentity id = byUserId.get(userId);
                String name = id != null ? id.name() : item.getAssignee().getName();
                acc = new Acc(name, id != null ? id.githubLogin() : null);
                accs.put(userId, acc);
            }
            if (acc.checklist.size() >= MAX_CHECKLIST_PER_MEMBER) {
                continue;
            }
            acc.checklist.add(ReportContent.MemberChecklistChange.builder()
                    .title(item.getTitle())
                    .done(true)
                    .context(item.getTask() != null ? item.getTask().getTitle() : null)
                    .build());
        }

        // 4) DTO 변환 + 활동량 내림차순 정렬 + 상한.
        List<ReportContent.Member> members = new ArrayList<>();
        for (Acc acc : accs.values()) {
            int activity = acc.commits.size() + acc.slack.size() + acc.checklist.size();
            if (activity == 0) {
                continue;
            }
            members.add(ReportContent.Member.builder()
                    .name(acc.name)
                    .login(acc.login)
                    .commitCount(acc.commits.size())
                    .slackCount(acc.slack.size())
                    .docCount(0)
                    .checklistCount(acc.checklist.size())
                    .activity(activity)
                    .commits(acc.commits)
                    .slackMessages(acc.slack)
                    .confluenceDocs(List.of())
                    .checklistChanges(acc.checklist)
                    .build());
        }
        members.sort(Comparator.comparingInt(ReportContent.Member::getActivity).reversed());
        if (members.size() > MAX_MEMBERS) {
            members = new ArrayList<>(members.subList(0, MAX_MEMBERS));
        }
        return new MemberResult(members);
    }

    /** 슬랙 발화(상위 메시지 또는 답글) 하나를 발화자 기준으로 귀속한다. 빈 발화(텍스트·미디어 모두 없음)는 건너뛴다. */
    private void addSlackMessage(JsonNode node, String channel, Map<String, Acc> accs,
                                 Map<String, String> keyBySlack, Map<String, MemberIdentity> byUserId) {
        String slackId = text(node, "user");
        if (slackId == null) {
            return;
        }
        String body = text(node, "text");
        JsonNode files = node.get("files");
        boolean hasMedia = files != null && files.isArray() && files.size() > 0;
        if ((body == null || body.isBlank()) && !hasMedia) {
            return;
        }
        String userId = keyBySlack.get(slackId);
        String authorName = text(node, "author");
        String key = userId != null ? userId : "sl:" + slackId;
        String name = userId != null ? byUserId.get(userId).name()
                : (authorName != null ? authorName : slackId);
        Acc acc = accs.computeIfAbsent(key, k -> new Acc(name, null));
        if (acc.slack.size() >= MAX_SLACK_PER_MEMBER) {
            return;
        }
        acc.slack.add(ReportContent.MemberSlackMessage.builder()
                .channel(channel)
                .text(body)
                .at(text(node, "at"))
                .media(harvestMedia(files))
                .build());
    }

    /** 슬랙 메시지의 files에서 이미지/영상 첨부만 추린다. 없으면 빈 목록. */
    private List<ReportContent.Attachment> harvestMedia(JsonNode files) {
        if (files == null || !files.isArray()) {
            return List.of();
        }
        List<ReportContent.Attachment> media = new ArrayList<>();
        for (JsonNode file : files) {
            String type = text(file, "type");
            if (!"image".equals(type) && !"video".equals(type)) {
                continue;
            }
            media.add(ReportContent.Attachment.builder()
                    .title(text(file, "title"))
                    .type(type)
                    .url(text(file, "url"))
                    .link(text(file, "link"))
                    .build());
        }
        return media;
    }

    /** 봇·서비스 계정 로그인 판별 — 미연동 기여자 중 사람이 아닌 것을 구성원 뷰에서 제외한다. */
    private boolean isBotLogin(String login) {
        String l = login.toLowerCase(Locale.ROOT);
        return l.contains("[bot]")
                || l.endsWith("-bot")
                || l.endsWith("-ci")
                || l.endsWith("-devops")
                || l.contains("dependabot")
                || l.contains("renovate")
                || l.contains("github-actions")
                || l.contains("actions-user");
    }

    private String commitType(String subject) {
        if (subject == null) return "other";
        java.util.regex.Matcher m =
                java.util.regex.Pattern.compile("^\\s*([a-zA-Z]+)(?:\\([^)]*\\))?!?:").matcher(subject);
        if (m.find()) return m.group(1).toLowerCase(Locale.ROOT);
        return "other";
    }

    private String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : null;
    }
}
