package com.kanban.domain.integration.jira.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.task.QaState;
import com.kanban.domain.task.Task;

/**
 * "이 태스크는 이미 개발 단계를 지났는가" 하나만 판정한다.
 *
 * <p>트리아지는 판정 시점의 스냅샷이라, 판정 뒤 완료되거나 QA로 넘어간 이슈도 후보 목록에 그대로
 * 남는다. 그걸 러너에 태우면 이미 고쳐진 코드를 다시 고치려 들고, 이슈당 1회 가드레일 때문에
 * 그 후보는 영구히 타버린다. 그래서 목록 표시와 큐 투입이 <b>같은 기준</b>을 봐야 한다 —
 * 화면에서만 감추고 서버가 안 막으면 "조건 만족 전부"가 여전히 끝난 일을 담는다.
 *
 * <p><b>블록 이름을 추측하지 않는다.</b> 보드마다 컬럼 이름이 다르고("작업 완료", "Done", "배포됨"),
 * 이름 매칭은 조용히 틀린다. 확정 신호 세 가지만 본다:
 * <ul>
 *   <li>완료 체크 ({@code isCompleted})</li>
 *   <li>고정 Done 블록에 있음 ({@link FixedBlockType#DONE})</li>
 *   <li>QA가 물고 있음 — JIRA에서 pull된 {@code REVIEW}/{@code VERIFIED}</li>
 * </ul>
 *
 * <p>반려({@code REJECTED})는 <b>제외한다</b>. QA가 되돌려 보낸 이슈는 아직 고쳐지지 않았다는 뜻이라
 * 오히려 자동수정이 필요한 상태다.
 *
 * <p>이름으로만 "완료 계열"인 중간 블록(예: "작업 완료")은 여기서 잡히지 않는다. 그건 화면의
 * 블록별 필터 칩이 담당한다 — 서버가 추측으로 후보를 태워버리는 것보다 사용자가 한 번 끄는 편이 낫다.
 */
public final class AutofixTaskStage {

    private AutofixTaskStage() {}

    /** 원본 태스크가 이미 개발 단계를 지났으면 true. task가 null이면(연동 끊김) false. */
    public static boolean isAlreadyDone(Task task) {
        if (task == null) return false;

        if (Boolean.TRUE.equals(task.getIsCompleted())) return true;

        Block block = task.getBlock();
        if (block != null && block.getFixedType() == FixedBlockType.DONE) return true;

        QaState qa = task.getQaState();
        return qa == QaState.REVIEW || qa == QaState.VERIFIED;
    }
}
