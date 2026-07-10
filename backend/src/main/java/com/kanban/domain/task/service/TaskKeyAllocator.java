package com.kanban.domain.task.service;

import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.task.TaskKeyGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 보드에 유일한 태스크 키 프리픽스를 할당한다. 이름으로부터 후보를 파생한 뒤, 이미 사용 중이면
 * 숫자 접미사(STORY → STORY2 → STORY3 …)를 붙여 전역 유일성을 확보한다.
 *
 * <p>동시성: 서로 다른 두 보드가 동시에 같은 후보를 뽑을 수 있으나, boards(UPPER(key_prefix))
 * 유니크 인덱스가 최종 안전망이다(둘 중 하나의 커밋이 실패). 태스크 생성 경로는 보드 행을
 * 비관적 락으로 잡은 상태에서 호출되므로 보드별로는 안전하다.
 */
@Component
@RequiredArgsConstructor
public class TaskKeyAllocator {

    private final BoardRepository boardRepository;

    public String allocateUniquePrefix(String boardName) {
        String base = TaskKeyGenerator.derivePrefix(boardName);
        String candidate = base;
        int suffix = 1;
        while (boardRepository.existsByKeyPrefixIgnoreCase(candidate)) {
            suffix++;
            candidate = base + suffix;
        }
        return candidate;
    }
}
