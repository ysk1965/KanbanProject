package com.kanban.domain.report.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.service.BoardProgressCollector.CommitInfo;
import com.kanban.domain.report.service.MemberActivityCollector.ClusterTag;
import com.kanban.domain.report.service.ReportMemberDirectory.MemberIdentity;
import com.kanban.domain.report.source.ReportPeriod;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
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
                collector.compute("b", period(), commits, tags, null).members();

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
                "b", period(), commits, Map.of(), mapper.readTree(slackJson)).members();

        assertEquals(1, members.size(), "커밋과 슬랙이 한 사람으로 합쳐진다");
        ReportContent.Member m = members.get(0);
        assertEquals(1, m.getCommitCount());
        assertEquals(1, m.getSlackCount());
        assertEquals(2, m.getActivity());
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
                collector.compute("b", period(), commits, Map.of(), null).members();

        assertEquals(2, members.size());
        assertEquals("박민수", members.get(0).getName(), "커밋 2건인 박민수가 앞");
        assertEquals("유상근", members.get(1).getName());
    }
}
