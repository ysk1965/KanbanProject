package com.kanban.domain.report.service;

import com.kanban.domain.checklist.ChecklistItemRepository;
import com.kanban.domain.report.dto.ReportContent;
import com.kanban.domain.report.service.BoardProgressCollector.CommitInfo;
import com.kanban.domain.task.TaskRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.lenient;

/**
 * 커밋 클러스터링의 <b>결정론</b>을 검증한다 — 소속 결정은 규칙(scope→경로→키워드)만으로 이뤄지고
 * AI가 관여하지 않는다. 태스크·문서 부착은 이 테스트 범위 밖(빈 보드)이라 커밋 군집화에 집중한다.
 */
@ExtendWith(MockitoExtension.class)
class CommitClusterCollectorTest {

    @Mock
    TaskRepository taskRepository;
    @Mock
    ChecklistItemRepository checklistItemRepository;
    @InjectMocks
    CommitClusterCollector collector;

    private CommitInfo commit(String sha, String subject, List<String> files) {
        return new CommitInfo("repo", sha, subject, null, "alice", "2026-07-25T00:00:00", null, null, files);
    }

    private ReportContent.Cluster find(List<ReportContent.Cluster> clusters, String key) {
        return clusters.stream().filter(c -> key.equals(c.getKey())).findFirst().orElse(null);
    }

    @Test
    void scope가_같은_커밋은_한_군집으로_HIGH_신뢰도() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                commit("s1", "fix(tda): 크래시 로그 스로틀", null),
                commit("s2", "refactor(tda): 이벤트 큐 배치 전송", null));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        ReportContent.Cluster tda = find(clusters, "scope:tda");
        assertNotNull(tda, "scope:tda 군집이 있어야 한다");
        assertEquals(2, tda.getCommits().size());
        assertEquals("HIGH", tda.getConfidence());
        assertTrue(tda.getSignals().stream()
                .anyMatch(s -> "scope".equals(s.getKind()) && "tda".equals(s.getValue())));
    }

    @Test
    void 서로_다른_scope는_다른_군집() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                commit("s1", "feat(pvp): 매치메이킹 큐", null),
                commit("s2", "feat(lobby): 방치 보상 팝업", null));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        assertNotNull(find(clusters, "scope:pvp"));
        assertNotNull(find(clusters, "scope:lobby"));
    }

    @Test
    void 인프라_커밋은_기능군집이_아닌_infra로_분리() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                commit("s1", "feat(battle): 카메라 종횡비 보정", null),
                commit("s2", "chore: CI 빌드 캐시 경로 조정", null),
                commit("s3", "build: 번들 버전 범프", null));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        ReportContent.Cluster infra = find(clusters, "infra");
        assertNotNull(infra, "infra 군집이 있어야 한다");
        assertEquals("infra", infra.getKind());
        assertEquals(2, infra.getCommits().size(), "chore·build 2건이 infra로");

        // 기능 군집(battle)에는 인프라 커밋이 섞이지 않는다.
        ReportContent.Cluster battle = find(clusters, "scope:battle");
        assertNotNull(battle);
        assertEquals(1, battle.getCommits().size());
        assertNull(battle.getKind());
    }

    @Test
    void scope군집과_같은_이름의_경로군집은_2차_병합으로_합쳐진다() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                // scope 있는 커밋 → scope:battle
                commit("s1", "fix(battle): 카메라 클리핑 수정", null),
                // scope 없이 Battle/ 경로만 → path:battle/camera, 병합되어야 함
                commit("s2", "시야 유지 로직 추가",
                        List.of("Assets/Scripts/Battle/Camera/Rig.cs")));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        // 두 군집으로 쪼개지지 않고 scope:battle 하나로 합쳐진다(파편화 해소).
        assertNull(find(clusters, "path:battle/camera"), "경로 군집이 scope로 흡수돼야 한다");
        ReportContent.Cluster battle = find(clusters, "scope:battle");
        assertNotNull(battle);
        assertEquals(2, battle.getCommits().size());
    }

    @Test
    void scope가_없으면_파일경로로_묶고_일반루트는_건너뛴다() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                commit("s1", "시야 유지 로직 추가",
                        List.of("Assets/Scripts/Battle/Camera/Rig.cs")),
                commit("s2", "클리핑 수정",
                        List.of("Assets/Scripts/Battle/Camera/View.cs")));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        // Assets/Scripts는 일반 루트라 건너뛰고 battle/camera로 묶인다.
        ReportContent.Cluster path = find(clusters, "path:battle/camera");
        assertNotNull(path, "path:battle/camera 군집이 있어야 한다");
        assertEquals(2, path.getCommits().size());
        assertEquals("HIGH", path.getConfidence());
    }
}
