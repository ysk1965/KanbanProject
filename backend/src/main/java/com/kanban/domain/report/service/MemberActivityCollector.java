package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.service.BoardProgressCollector.CommitInfo;
import com.kanban.domain.report.service.ReportMemberDirectory.MemberIdentity;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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
 * <p>Confluence 문서도 사람에 붙는다. 작성자는 수집 단계에서 Atlassian accountId를 멤버로 해석해
 * 오므로({@code author_user_id}), 커밋·슬랙과 같은 카드에 합쳐진다. 멤버로 이어지지 않은 외부
 * 편집자는 표시 이름으로 자기 카드를 갖는다 — 커밋·슬랙의 외부 기여자와 같은 취급이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MemberActivityCollector {

    private static final int MAX_MEMBERS = 20;
    /**
     * 커밋 표시 상한. 목록을 5건씩 페이징하므로 한 화면에 쏟아질 걱정이 없어, 사실상 그 기간 전부를 담는다.
     * 이 값은 표시를 자르려는 게 아니라 비정상 입력(대량 머지·자동 커밋)이 본문 JSON을 부풀리는 것을 막는
     * 안전장치다. AI 프롬프트에 들어가는 커밋 수는 이것과 무관하게 {@code ReportComposer}가 따로 제한한다.
     */
    private static final int MAX_COMMITS_PER_MEMBER = 500;
    private static final int MAX_SLACK_PER_MEMBER = 20;
    private static final int MAX_CHECKLIST_PER_MEMBER = 20;
    private static final int MAX_DOCS_PER_MEMBER = 20;
    private static final int MAX_FOCUS_PER_MEMBER = 3;

    // 활동량 가중치 — 단순 합이면 메시지 수가 순위를 흔든다. 산출물(커밋)과 약속(체크리스트)을 위에 둔다.
    private static final int W_COMMIT = 3;
    private static final int W_DOC = 2;
    private static final int W_CHECKLIST = 2;
    private static final int W_SLACK = 1;

    private final ReportMemberDirectory memberDirectory;
    private final ChecklistItemRepository checklistItemRepository;

    /** sha → 소속 클러스터 식별. 커밋에 기능 태그를 달아 사람↔기능을 잇는다. */
    public record ClusterTag(String key, String title) {
    }

    public record MemberResult(List<ReportContent.Member> members) {
    }

    /**
     * 집계용 누적기 — 안정적 memberKey로 소스별 활동을 모은다.
     *
     * <p>리스트는 표시용이라 상한에서 잘리지만 {@code *Total}은 <b>자르기 전 실제 건수</b>다.
     * 카운트를 리스트 길이로 계산하면 상한을 넘긴 사람이 전원 같은 숫자("커밋 30")로 표시되고
     * 정렬 기준까지 포화된다.
     */
    private static class Acc {
        String name;
        String login;
        final List<ReportContent.MemberCommit> commits = new ArrayList<>();
        final List<ReportContent.MemberSlackMessage> slack = new ArrayList<>();
        final List<ReportContent.ConfluenceDoc> docs = new ArrayList<>();
        // 체크리스트 — 지연 / 진행중 / 완료 3버킷. 노출 범위 밖 완료분은 개수만(숨김).
        final List<ReportContent.MemberChecklistChange> checklistLate = new ArrayList<>();
        final List<ReportContent.MemberChecklistChange> checklistProgress = new ArrayList<>();
        final List<ReportContent.MemberChecklistChange> checklistDoneToday = new ArrayList<>();
        /** 클러스터별 커밋 수 — "주력" 산출용. 표시 상한과 무관하게 전체 커밋을 센다. */
        final Map<ClusterTag, Integer> focus = new LinkedHashMap<>();
        int commitTotal = 0;
        int slackTotal = 0;
        int docTotal = 0;
        int lateTotal = 0;
        int progressTotal = 0;
        int doneTotal = 0;
        int hiddenCompleted = 0;

        Acc(String name, String login) {
            this.name = name;
            this.login = login;
        }
    }

    /**
     * @param period        보고 기간 — 칸반 체크리스트를 그 기간 완료분으로 스코프하는 데 쓴다.
     * @param clusterBySha 각 커밋 sha → 소속 클러스터. 미분류·미매칭이면 값이 없거나 kind=infra일 수 있다.
     * @param slackMessages 슬랙 수집 결과의 messages 배열(JsonNode). 없으면 null.
     * @param confluenceDocs Confluence 수집 결과의 문서들. 작성자는 이미 사람으로 해석돼 있다. 없으면 null.
     */
    @Transactional(readOnly = true)
    public MemberResult compute(String boardId, ReportPeriod period, List<CommitInfo> commits,
                                Map<String, ClusterTag> clusterBySha, JsonNode slackMessages,
                                List<BoardProgressCollector.ConfluenceDocInfo> confluenceDocs) {
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
            acc.commitTotal++;
            ClusterTag tag = c.sha() != null ? tags.get(c.sha()) : null;
            if (tag != null) {
                acc.focus.merge(tag, 1, Integer::sum);
            }
            if (acc.commits.size() >= MAX_COMMITS_PER_MEMBER) {
                continue; // 표시 목록만 자른다 — 카운트·주력은 위에서 이미 셌다.
            }
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

        // 2-b) Confluence 문서 — 수집 단계가 붙여 준 author_user_id로 사람에 귀속한다.
        //      멤버로 못 이은 문서는 표시 이름으로 자기 카드를 갖는다(외부 편집자). 이름조차 없으면 버린다 —
        //      주인 없는 문서를 아무 카드에나 붙일 수는 없다.
        for (BoardProgressCollector.ConfluenceDocInfo doc :
                confluenceDocs != null ? confluenceDocs : List.<BoardProgressCollector.ConfluenceDocInfo>of()) {
            String userId = doc.authorUserId();
            String authorName = doc.author();
            if (userId == null && (authorName == null || authorName.isBlank())) {
                continue;
            }
            String key = userId != null ? userId : "cf:" + authorName;
            String name = userId != null && byUserId.containsKey(userId)
                    ? byUserId.get(userId).name()
                    : authorName;
            Acc acc = accs.computeIfAbsent(key, k -> new Acc(name, null));
            acc.docTotal++;
            if (acc.docs.size() >= MAX_DOCS_PER_MEMBER) {
                continue;
            }
            acc.docs.add(ReportContent.ConfluenceDoc.builder()
                    .title(doc.title())
                    .url(doc.url())
                    .changeType(doc.changeType())
                    .author(authorName)
                    .updatedAt(doc.updatedAt())
                    .build());
        }

        // 3) 칸반 체크리스트 — "지금 챙겨야 할 일" 중심으로 담당자별 재구성(보드 전체를 한 번에 로드, N+1 제거).
        //    · 지연:   미완료 & 마감 지남(dueDate < 오늘)              — 전부 노출
        //    · 진행중: 미완료 & 곧 마감(오늘 ≤ dueDate ≤ 오늘+기간길이) — 전부 노출
        //    · 완료:   노출 범위 안에 완료된 것                        — 노출
        //    · 그보다 이전 완료분: 지난 소식이라 숨기고 개수만 집계.
        // 기준일(오늘)·기간 길이는 발송 시각(endExclusive) 기준. 일일이면 기간=1일, 주간이면 7일.
        LocalDate today = period.endExclusive().toLocalDate();
        long periodDays = Math.max(1, ChronoUnit.DAYS.between(period.startInclusive(), period.endExclusive()));
        LocalDate lookaheadEnd = today.plusDays(periodDays);
        LocalDateTime startUtc = period.startInclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime endUtc = period.endExclusive().withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        // 완료분 노출 범위는 <b>보고 주기를 따른다</b>. 일간(기간 1일)은 직전 24시간이 곧 그 기간이고,
        // 주간은 그 주 전체다. 주기와 무관하게 24시간으로 고정하면 주간 보고서가 6일치 완료분을
        // "이전에 완료"로 접어 한 주의 성과를 구조적으로 과소 표시한다.
        LocalDateTime doneVisibleFromUtc = periodDays <= 1
                ? period.endExclusive().minusDays(1).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime()
                : startUtc;

        // 3-a) 미완료(마감 지정) → 지연/진행중
        List<ChecklistItem> incomplete;
        try {
            incomplete = checklistItemRepository.findIncompleteWithDueByBoardId(boardId);
        } catch (Exception e) {
            incomplete = List.of();
        }
        for (ChecklistItem item : incomplete) {
            User assignee = item.getAssignee();
            LocalDate due = item.getDueDate();
            if (assignee == null || due == null) {
                continue;
            }
            boolean late = due.isBefore(today);
            boolean progress = !late && !due.isAfter(lookaheadEnd);
            if (!late && !progress) {
                continue; // 마감이 아직 먼 항목은 이번 보고 대상 아님
            }
            Acc acc = accForUser(assignee, accs, byUserId);
            if (late) {
                acc.lateTotal++;
                if (acc.checklistLate.size() < MAX_CHECKLIST_PER_MEMBER) {
                    acc.checklistLate.add(change(item, "late", due,
                            (int) ChronoUnit.DAYS.between(due, today)));
                }
            } else {
                acc.progressTotal++;
                if (acc.checklistProgress.size() < MAX_CHECKLIST_PER_MEMBER) {
                    acc.checklistProgress.add(change(item, "progress", due, 0));
                }
            }
        }

        // 3-b) 기간 내 완료분 → 노출 범위(일간=직전 24h, 주간=기간 전체) 안이면 노출, 밖이면 숨김 카운트
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
            Acc acc = accForUser(item.getAssignee(), accs, byUserId);
            boolean visible = item.getCompletedAt() != null
                    && !item.getCompletedAt().isBefore(doneVisibleFromUtc);
            if (visible) {
                acc.doneTotal++;
                if (acc.checklistDoneToday.size() < MAX_CHECKLIST_PER_MEMBER) {
                    acc.checklistDoneToday.add(change(item, "done", item.getDueDate(), 0));
                }
            } else {
                acc.hiddenCompleted++;
            }
        }

        // 4) DTO 변환 + 활동량 내림차순 정렬 + 상한.
        //    카운트는 자르기 전 총계(*Total)를, 리스트는 상한까지만 담는다. 프론트는 둘을 비교해
        //    "47건 중 최근 30건 표시"처럼 잘렸음을 드러낸다.
        List<ReportContent.Member> members = new ArrayList<>();
        for (Acc acc : accs.values()) {
            int checklistTotal = acc.lateTotal + acc.progressTotal + acc.doneTotal;
            int activity = acc.commitTotal * W_COMMIT
                    + acc.docTotal * W_DOC
                    + checklistTotal * W_CHECKLIST
                    + acc.slackTotal * W_SLACK;
            // 숨긴 완료분만 있는 사람(새 소식 없음)은 제외.
            if (activity == 0) {
                continue;
            }
            // 지연 → 진행중 → 완료 순으로 이어붙인다.
            List<ReportContent.MemberChecklistChange> changes = new ArrayList<>(
                    acc.checklistLate.size() + acc.checklistProgress.size() + acc.checklistDoneToday.size());
            changes.addAll(acc.checklistLate);
            changes.addAll(acc.checklistProgress);
            changes.addAll(acc.checklistDoneToday);
            members.add(ReportContent.Member.builder()
                    .name(acc.name)
                    .login(acc.login)
                    .commitCount(acc.commitTotal)
                    .slackCount(acc.slackTotal)
                    .docCount(acc.docTotal)
                    .checklistCount(checklistTotal)
                    .lateCount(acc.lateTotal)
                    .progressCount(acc.progressTotal)
                    .doneTodayCount(acc.doneTotal)
                    .focus(topFocus(acc))
                    .hiddenCompletedCount(acc.hiddenCompleted)
                    .activity(activity)
                    .commits(acc.commits)
                    .slackMessages(acc.slack)
                    .confluenceDocs(acc.docs)
                    .checklistChanges(changes)
                    .build());
        }
        // 정렬은 보고 주기가 던지는 질문을 따른다. 일간의 질문은 "오늘 누가 막혔나"라 지연 보유자를
        // 먼저 올리고, 주간의 질문은 "이번 주 무엇이 진전됐나"라 활동량 순으로 둔다.
        Comparator<ReportContent.Member> byActivity =
                Comparator.comparingInt(ReportContent.Member::getActivity).reversed();
        members.sort(periodDays <= 1
                ? Comparator.comparing((ReportContent.Member m) -> m.getLateCount() > 0).reversed()
                        .thenComparing(Comparator.comparingInt(ReportContent.Member::getLateCount).reversed())
                        .thenComparing(byActivity)
                : byActivity);
        if (members.size() > MAX_MEMBERS) {
            members = new ArrayList<>(members.subList(0, MAX_MEMBERS));
        }
        return new MemberResult(members);
    }

    /** 커밋 수가 많은 순으로 주력 클러스터 상위 {@value #MAX_FOCUS_PER_MEMBER}개. 태그 없는 커밋만 있으면 빈 목록. */
    private List<ReportContent.MemberFocus> topFocus(Acc acc) {
        return acc.focus.entrySet().stream()
                .sorted(Map.Entry.<ClusterTag, Integer>comparingByValue().reversed())
                .limit(MAX_FOCUS_PER_MEMBER)
                .map(e -> ReportContent.MemberFocus.builder()
                        .clusterKey(e.getKey().key())
                        .title(e.getKey().title())
                        .commitCount(e.getValue())
                        .build())
                .toList();
    }

    /** 담당자(User) 기준 누적기를 가져오거나 없으면 만든다 — 커밋·슬랙에 안 잡힌 담당자도 새로 등록. */
    private Acc accForUser(User user, Map<String, Acc> accs, Map<String, MemberIdentity> byUserId) {
        String userId = user.getId();
        Acc acc = accs.get(userId);
        if (acc == null) {
            MemberIdentity id = byUserId.get(userId);
            String name = id != null ? id.name() : user.getName();
            acc = new Acc(name, id != null ? id.githubLogin() : null);
            accs.put(userId, acc);
        }
        return acc;
    }

    /** 체크리스트 항목 하나를 표시용 DTO로. status="late|progress|done", overdueDays는 지연에만 유효. */
    private ReportContent.MemberChecklistChange change(ChecklistItem item, String status,
                                                       LocalDate due, int overdueDays) {
        return ReportContent.MemberChecklistChange.builder()
                .title(item.getTitle())
                .done("done".equals(status))
                .status(status)
                .context(item.getTask() != null ? item.getTask().getTitle() : null)
                .dueDate(due != null ? due.toString() : null)
                .overdueDays(overdueDays)
                .build();
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
        acc.slackTotal++;
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
