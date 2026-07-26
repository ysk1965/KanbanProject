package com.kanban.domain.report.service;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.report.ReportRepository;
import com.kanban.domain.report.ReportType;
import com.kanban.domain.report.WeeklyReport;
import com.kanban.domain.storage.service.ReportFileFiler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 폴더화 이전에 자료실 루트에 쌓인 보고서 수집 파일을 뒤늦게 제자리로 보내는 <b>1회성 정리</b>.
 *
 * <p>어느 보고서에서 온 파일인지는 보고서에 저장된 본문/원본 JSON에 그 파일의 S3 키가
 * 들어 있는지로 판단한다. CDN 도메인이 바뀌어도 키 문자열은 그대로라 매칭이 깨지지 않는다.
 * 여러 보고서에 등장하면 <b>가장 오래된 보고서</b>가 갖는다 — 실시간 규칙("먼저 수집한 쪽이 소유")과
 * 같은 결과가 되도록.
 *
 * <p>매칭에 실패한 파일은 "보고서 자료/미분류"로 모은다. 대부분 미리보기 실행으로 흘러든 파일이다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportFileBackfillService {

    private final ReportRepository reportRepository;
    private final ReportFileFiler reportFileFiler;
    private final BoardService boardService;

    /**
     * @param scanned   루트에 있던 자동 수집 파일 수
     * @param matched   보고서를 찾아낸 파일 수
     * @param unmatched 못 찾아 미분류로 갈(간) 파일 수
     * @param folders   손댈(댄) 보고서 폴더 수
     * @param moved     실제로 옮긴 파일 수 (dryRun 이면 0)
     */
    public record Result(int scanned, int matched, int unmatched, int folders, int moved, boolean dryRun) {
    }

    @Transactional(readOnly = true)
    public Result organize(String boardId, String userId, boolean dryRun) {
        boardService.checkAdminOrAbove(boardId, userId);

        List<String> keys = reportFileFiler.unfiledReportFileKeys(boardId);
        if (keys.isEmpty()) {
            return new Result(0, 0, 0, 0, 0, dryRun);
        }

        // 오래된 보고서부터 살펴 첫 소유자를 확정한다.
        List<WeeklyReport> reports = reportRepository.findByBoardIdOrderByCreatedAtDesc(boardId).stream()
                .filter(r -> r.getReportType() == ReportType.DAILY_DEV
                        || r.getReportType() == ReportType.WEEKLY_INTEGRATED)
                .sorted(Comparator.comparing(WeeklyReport::getCreatedAt))
                .toList();

        Map<String, List<String>> keysByReport = new LinkedHashMap<>();
        Set<String> matched = new LinkedHashSet<>();
        for (WeeklyReport report : reports) {
            String haystack = haystack(report);
            if (haystack.isEmpty()) {
                continue;
            }
            for (String key : keys) {
                if (!matched.contains(key) && haystack.contains(key)) {
                    keysByReport.computeIfAbsent(report.getId(), id -> new ArrayList<>()).add(key);
                    matched.add(key);
                }
            }
        }
        List<String> unmatched = keys.stream().filter(key -> !matched.contains(key)).toList();

        if (dryRun) {
            return new Result(keys.size(), matched.size(), unmatched.size(), keysByReport.size(), 0, true);
        }

        int moved = 0;
        for (WeeklyReport report : reports) {
            List<String> reportKeys = keysByReport.get(report.getId());
            if (reportKeys == null) {
                continue;
            }
            reportFileFiler.fileReportFiles(boardId, report.getId(),
                    ReportFolderNaming.monthKey(report.getPeriodEnd()),
                    ReportFolderNaming.folderName(report.getReportType(),
                            report.getPeriodStart(), report.getPeriodEnd()),
                    reportKeys);
            moved += reportKeys.size();
        }
        moved += reportFileFiler.fileUnsorted(boardId, unmatched);

        log.info("Report file backfill done: board={}, scanned={}, matched={}, unmatched={}, moved={}",
                boardId, keys.size(), matched.size(), unmatched.size(), moved);
        return new Result(keys.size(), matched.size(), unmatched.size(), keysByReport.size(), moved, false);
    }

    /** 그 보고서가 실은 파일 URL이 들어 있을 만한 저장 필드를 모두 이어 붙인다. */
    private String haystack(WeeklyReport report) {
        StringBuilder sb = new StringBuilder();
        if (report.getContentJson() != null) {
            sb.append(report.getContentJson());
        }
        if (report.getDataSnapshot() != null) {
            sb.append(report.getDataSnapshot());
        }
        if (report.getContent() != null) {
            sb.append(report.getContent());
        }
        return sb.toString();
    }
}
