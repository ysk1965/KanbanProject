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
 * 커밋 클러스터링의 <b>결정론</b>을 검증한다 — 소속 결정은 규칙(커밋 제목→본문→변경 파일명)만으로 이뤄지고
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
    void 제목_키워드가_같은_커밋은_한_군집으로_묶인다() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        // 실제 보고서에서 잘못 뭉쳤던 사례: 경로는 모두 _project 아래라 무의미하고, 제목만이 기능을 가른다.
        // "택틱스" 관련 3건은 한 군집(텍틱스 모드)으로, 튜토리얼·광고·몬스터는 각각 분리돼야 한다.
        List<CommitInfo> commits = List.of(
                commit("s1", "fix: 튜토리얼 때 방치 보상 안 뜨도록", null),
                commit("s2", "fix: 광고 버튼 추가 - 가챠에 선 적용", null),
                commit("s3", "택틱스 이어하기 팝업에서 결과내기 버튼 이슈 수정", null),
                commit("s4", "refator: 택틱스 상점 슬롯 오브젝트와 캐릭터 분리", null),
                commit("s5", "몬스터 스킬 살리기", null),
                commit("s6", "feat: 택틱스 모드 상점 오브젝트 슬롯 카테고리 정리", null));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        // 택틱스 3건이 한 군집으로 — 오타 타입 "refator:" 접두어도 벗겨져 제목 키워드가 "택틱스"로 잡힌다.
        ReportContent.Cluster tactics = find(clusters, "kw:택틱스");
        assertNotNull(tactics, "택틱스 군집이 있어야 한다");
        assertEquals(3, tactics.getCommits().size(), "이어하기·상점 슬롯·모드 상점 3건");
        assertEquals("HIGH", tactics.getConfidence(), "2건 이상 공유 → HIGH");

        // 나머지는 서로 다른 기능이므로 택틱스에 딸려오지 않는다.
        assertNotNull(find(clusters, "kw:튜토리얼"));
        assertNotNull(find(clusters, "kw:광고"), "한글 2음절 키워드도 잡힌다");
        assertNotNull(find(clusters, "kw:몬스터"));
    }

    @Test
    void scope군집은_같은_이름의_파일명군집을_2차_병합으로_흡수한다() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        List<CommitInfo> commits = List.of(
                // scope 있는 커밋 → scope:battle
                commit("s1", "fix(battle): 카메라 클리핑 수정", null),
                // 제목이 전부 불용어라 파일명으로 떨어진다 → file:battle, 병합되어야 함
                commit("s2", "버그 수정",
                        List.of("Assets/_Project/Battle/BattleCameraRig.cs")));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        // 두 군집으로 쪼개지지 않고 scope:battle 하나로 합쳐진다(파편화 해소).
        assertNull(find(clusters, "file:battle"), "파일명 군집이 scope로 흡수돼야 한다");
        ReportContent.Cluster battle = find(clusters, "scope:battle");
        assertNotNull(battle);
        assertEquals(2, battle.getCommits().size());
    }

    @Test
    void 제목_키워드가_없으면_파일명으로_묶고_경로는_무시한다() {
        lenient().when(taskRepository.findByBoardIdOrderByPositionAsc("b")).thenReturn(List.of());

        // 제목이 전부 불용어("버그/이슈 수정")라 변경 파일명이 유일한 신호. 경로(_project)는 완전히 무시된다.
        List<CommitInfo> commits = List.of(
                commit("s1", "버그 수정",
                        List.of("Assets/_Project/A/TacticsShopSlot.cs")),
                commit("s2", "이슈 수정",
                        List.of("Assets/_Project/B/TacticsShopManager.cs")));

        List<ReportContent.Cluster> clusters = collector.compute("b", commits, List.of()).clusters();

        // 파일명 PascalCase가 tactics/shop/slot로 쪼개져 최빈 토큰 tactics로 묶인다("manager"는 구조 접미어라 제외).
        ReportContent.Cluster tactics = find(clusters, "file:tactics");
        assertNotNull(tactics, "file:tactics 군집이 있어야 한다");
        assertEquals(2, tactics.getCommits().size());
        assertEquals("HIGH", tactics.getConfidence());
        assertTrue(tactics.getSignals().stream()
                .anyMatch(s -> "file".equals(s.getKind()) && "tactics".equals(s.getValue())));
    }
}
