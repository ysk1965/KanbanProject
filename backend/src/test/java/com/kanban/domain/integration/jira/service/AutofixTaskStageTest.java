package com.kanban.domain.integration.jira.service;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockType;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.task.QaState;
import com.kanban.domain.task.Task;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * "이미 끝난 태스크인가" 판정 검증.
 *
 * <p>이 규칙 하나가 목록 표시와 큐 투입을 동시에 가른다. 틀리면 두 방향 모두로 아프다 —
 * 느슨하면 이미 고쳐진 이슈를 러너에 태워 일일 한도를 태우고, 빡빡하면 아직 안 고쳐진 이슈를
 * 후보에서 지워버린다. 이슈당 1회 가드레일 때문에 후자는 되돌릴 수 없다.
 *
 * <p>가장 중요한 건 마지막 테스트다 — QA 반려(REJECTED)는 <b>끝난 게 아니다</b>.
 * QA가 되돌려 보냈다는 건 아직 고쳐지지 않았다는 뜻이라 오히려 자동수정 대상이다.
 */
class AutofixTaskStageTest {

    private Block block(FixedBlockType fixedType) {
        return Block.builder()
                .id("b1")
                .name("아무 이름")
                .type(fixedType != null ? BlockType.FIXED : BlockType.CUSTOM)
                .fixedType(fixedType)
                .position(0)
                .build();
    }

    private Task task(Block block, Boolean completed, QaState qaState) {
        Task t = Task.builder()
                .id("t1")
                .title("텍스트 오탈자")
                .block(block)
                .isCompleted(completed)
                .build();
        t.applyQaState(qaState);
        return t;
    }

    @Test
    void 태스크가_null이면_끝난_것으로_보지_않는다() {
        // 연동이 끊긴 건까지 담기에서 막으면 조용히 후보가 사라진다
        assertThat(AutofixTaskStage.isAlreadyDone(null)).isFalse();
    }

    @Test
    void 개발_중인_태스크는_끝나지_않았다() {
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(null), false, null))).isFalse();
    }

    @Test
    void 완료_체크된_태스크는_끝났다() {
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(null), true, null))).isTrue();
    }

    @Test
    void 고정_Done_블록에_있으면_끝났다() {
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(FixedBlockType.DONE), false, null)))
                .isTrue();
    }

    @Test
    void 다른_고정_블록은_끝난_것이_아니다() {
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(FixedBlockType.TASK), false, null)))
                .isFalse();
    }

    @Test
    void QA가_물고_있으면_끝났다() {
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(null), false, QaState.REVIEW)))
                .isTrue();
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(null), false, QaState.VERIFIED)))
                .isTrue();
    }

    @Test
    void QA_반려는_끝난_것이_아니다() {
        // 되돌려 보냈다 = 아직 안 고쳐졌다. 자동수정이 필요한 바로 그 상태다
        assertThat(AutofixTaskStage.isAlreadyDone(task(block(null), false, QaState.REJECTED)))
                .isFalse();
    }

    @Test
    void 블록이_없어도_터지지_않는다() {
        assertThat(AutofixTaskStage.isAlreadyDone(task(null, false, null))).isFalse();
    }
}
