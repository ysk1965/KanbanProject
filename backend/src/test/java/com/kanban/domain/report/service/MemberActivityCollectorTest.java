package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.checklist.ChecklistItem;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.service.BoardProgressCollector.CommitInfo;
import com.kanban.domain.report.service.MemberActivityCollector.ClusterTag;
import com.kanban.domain.report.service.ReportMemberDirectory.MemberIdentity;
import com.kanban.domain.report.source.ReportPeriod;
import com.kanban.domain.user.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * 구성원별 활동 집계 검증: 정체성 병합(github↔멤버), 봇 계정 제외, 커밋의 클러스터 태그, 활동량 정렬.
 * 체크리스트는 기간 스코프 쿼리를 빈 결과로 목킹해 커밋·귀속 로직에 집중한다.
 */
@ExtendWith(MockitoExtension.class)
class MemberActivityCollectorTest {

    @Mock
    ReportMemberDirectory memberDirectory;
    @Mock
    ChecklistItemRepository checklistItemRepository;
    @InjectMocks
    MemberActivityCollector collector;

    private final ObjectMapper mapper = new ObjectMapper();

    private CommitInfo commit(String sha, String subject, String author) {
        return new CommitInfo("repo", sha, subject, null, author, "2026-07-25T00:00:00", "url", null, null);
    }

    private ReportPeriod period() {
        ZonedDateTime base = ZonedDateTime.of(2026, 7, 25, 0, 0, 0, 0, ZoneOffset.UTC);
        return new ReportPeriod(base.minusDays(1), base, ZoneOffset.UTC);
    }

    @Test
    void 연동된_커밋은_멤버로_병합되고_봇은_제외되며_클러스터_태그가_붙는다() {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", "U01")));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                commit("s1", "fix(tda): 로그 스로틀", "sgyoo1"),      // 연동 멤버 → 유상근
                commit("s2", "chore: deps bump", "dependabot[bot]")); // 봇 → 제외

        Map<String, ClusterTag> tags = Map.of("s1", new ClusterTag("scope:tda", "텔레메트리"));

        List<ReportContent.Member> members =
                collector.compute("b", period(), commits, tags, null, null).members();

        assertEquals(1, members.size(), "봇은 빠지고 실멤버만 남는다");
        ReportContent.Member m = members.get(0);
        assertEquals("유상근", m.getName());
        assertEquals(1, m.getCommitCount());
        assertEquals("텔레메트리", m.getCommits().get(0).getClusterTitle(), "커밋에 클러스터 태그가 붙는다");
    }

    @Test
    void 슬랙_발화가_연동되면_같은_사람으로_합쳐진다() throws Exception {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", "U01")));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<CommitInfo> commits = List.of(commit("s1", "fix(tda): 로그", "sgyoo1"));
        String slackJson = """
                [{"user":"U01","author":"유상근","channel_name":"data","text":"집계 고쳤습니다","at":"07-25"}]
                """;

        List<ReportContent.Member> members = collector.compute(
                "b", period(), commits, Map.of(), mapper.readTree(slackJson), null).members();

        assertEquals(1, members.size(), "커밋과 슬랙이 한 사람으로 합쳐진다");
        ReportContent.Member m = members.get(0);
        assertEquals(1, m.getCommitCount());
        assertEquals(1, m.getSlackCount());
        assertEquals(4, m.getActivity(), "커밋×3 + 슬랙×1");
    }

    @Test
    void 활동량_내림차순으로_정렬된다() {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", null),
                new MemberIdentity("u2", "박민수", "mspark", null)));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                commit("s1", "feat(a): x", "mspark"),
                commit("s2", "feat(a): y", "mspark"),
                commit("s3", "fix(b): z", "sgyoo1"));

        List<ReportContent.Member> members =
                collector.compute("b", period(), commits, Map.of(), null, null).members();

        assertEquals(2, members.size());
        assertEquals("박민수", members.get(0).getName(), "커밋 2건인 박민수가 앞");
        assertEquals("유상근", members.get(1).getName());
    }

    @Test
    void 커밋_수는_표시_상한이_아니라_실제_건수다() {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", null)));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<CommitInfo> commits = new ArrayList<>();
        for (int i = 0; i < 47; i++) {
            commits.add(commit("s" + i, "feat(a): 작업 " + i, "sgyoo1"));
        }

        ReportContent.Member m =
                collector.compute("b", period(), commits, Map.of(), null, null).members().get(0);

        assertEquals(47, m.getCommitCount(), "카운트는 자르기 전 실제 건수");
        assertEquals(30, m.getCommits().size(), "표시 목록만 상한에서 잘린다");
        assertEquals(47 * 3, m.getActivity(), "정렬 기준도 포화되지 않는다");
    }

    @Test
    void 활동량은_가중치로_계산돼_슬랙만_많은_사람이_위로_오지_않는다() throws Exception {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", "U01"),
                new MemberIdentity("u2", "박민수", "mspark", "U02")));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        // 유상근: 커밋 3건(=9) / 박민수: 슬랙 5건(=5)
        List<CommitInfo> commits = List.of(
                commit("s1", "feat(a): x", "sgyoo1"),
                commit("s2", "feat(a): y", "sgyoo1"),
                commit("s3", "feat(a): z", "sgyoo1"));
        StringBuilder slack = new StringBuilder("[");
        for (int i = 0; i < 5; i++) {
            slack.append(i > 0 ? "," : "")
                    .append("{\"user\":\"U02\",\"channel_name\":\"dev\",\"text\":\"메시지 ").append(i).append("\"}");
        }
        slack.append("]");

        List<ReportContent.Member> members = collector.compute(
                "b", period(), commits, Map.of(), mapper.readTree(slack.toString()), null).members();

        assertEquals("유상근", members.get(0).getName(), "커밋 3건이 슬랙 5건보다 위");
        assertEquals(9, members.get(0).getActivity());
        assertEquals(5, members.get(1).getActivity());
    }

    private ChecklistItem completedItem(String title, User assignee, LocalDateTime completedAt) {
        return ChecklistItem.builder()
                .title(title)
                .assignee(assignee)
                .isCompleted(true)
                .completedAt(completedAt)
                .build();
    }

    @Test
    void 주간은_기간_전체_완료분을_노출하고_일간은_직전_24시간만_노출한다() {
        User user = User.builder().id("u1").name("유상근").build();
        ZonedDateTime end = ZonedDateTime.of(2026, 7, 27, 0, 0, 0, 0, ZoneOffset.UTC);
        // 발송 5일 전 완료 1건 + 발송 직전 12시간 내 완료 1건
        List<ChecklistItem> completed = List.of(
                completedItem("행성 텍스처 교체", user, end.minusDays(5).toLocalDateTime()),
                completedItem("빅마우스 개편", user, end.minusHours(12).toLocalDateTime()));

        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", null)));
        when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(completed);

        ReportPeriod weekly = new ReportPeriod(end.minusDays(7), end, ZoneOffset.UTC);
        ReportContent.Member w =
                collector.compute("b", weekly, List.of(), Map.of(), null, null).members().get(0);
        assertEquals(2, w.getDoneTodayCount(), "주간은 그 주 완료분을 모두 노출");
        assertEquals(0, w.getHiddenCompletedCount());

        ReportPeriod daily = new ReportPeriod(end.minusDays(1), end, ZoneOffset.UTC);
        ReportContent.Member d =
                collector.compute("b", daily, List.of(), Map.of(), null, null).members().get(0);
        assertEquals(1, d.getDoneTodayCount(), "일간은 직전 24시간만 노출");
        assertEquals(1, d.getHiddenCompletedCount());
    }

    private BoardProgressCollector.ConfluenceDocInfo doc(String title, String author, String authorUserId) {
        return new BoardProgressCollector.ConfluenceDocInfo(
                title, "https://wiki/" + title, "modified", author, authorUserId, "2026-07-25T00:00:00Z");
    }

    @Test
    void 문서는_이어진_멤버의_커밋과_같은_카드로_합쳐진다() {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", null)));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<ReportContent.Member> members = collector.compute(
                "b", period(), List.of(commit("s1", "fix(tda): 로그", "sgyoo1")), Map.of(), null,
                List.of(doc("주간 전략 회의", "유상근", "u1"))).members();

        assertEquals(1, members.size(), "커밋과 문서가 한 사람으로 합쳐진다");
        ReportContent.Member m = members.get(0);
        assertEquals(1, m.getCommitCount());
        assertEquals(1, m.getDocCount());
        assertEquals(5, m.getActivity(), "커밋×3 + 문서×2");
        assertEquals("주간 전략 회의", m.getConfluenceDocs().get(0).getTitle());
    }

    @Test
    void 멤버로_못_이은_문서는_표시_이름으로_자기_카드를_갖는다() {
        when(memberDirectory.identities("b")).thenReturn(List.of());
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<ReportContent.Member> members = collector.compute(
                "b", period(), List.of(), Map.of(), null,
                List.of(doc("주간 전략 회의", "박천균", null))).members();

        assertEquals(1, members.size());
        assertEquals("박천균", members.get(0).getName(), "외부 편집자도 이름으로 노출된다");
        assertEquals(1, members.get(0).getDocCount());
    }

    @Test
    void 작성자를_못_푼_문서는_아무_카드에도_붙지_않는다() {
        when(memberDirectory.identities("b")).thenReturn(List.of(
                new MemberIdentity("u1", "유상근", "sgyoo1", null)));
        lenient().when(checklistItemRepository.findCompletedByBoardIdAndDateRange(eq("b"), any(), any()))
                .thenReturn(List.of());

        List<ReportContent.Member> members = collector.compute(
                "b", period(), List.of(commit("s1", "fix(tda): 로그", "sgyoo1")), Map.of(), null,
                List.of(doc("주인 없는 문서", null, null))).members();

        assertEquals(1, members.size());
        assertEquals(0, members.get(0).getDocCount(), "주인 모를 문서를 남의 카드에 붙이지 않는다");
    }
}
