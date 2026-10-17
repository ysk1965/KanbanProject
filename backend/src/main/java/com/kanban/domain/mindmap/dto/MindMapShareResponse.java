package com.kanban.domain.mindmap.dto;

import com.kanban.domain.mindmap.MindMapShare;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/** 마인드맵 공유 설정 응답 (보드 멤버용) */
@Getter
@Builder
@AllArgsConstructor
public class MindMapShareResponse {
    private boolean enabled;
    private String shareCode;
    private boolean showTasks;
    private boolean showAssignees;
    private boolean showMemos;
    private LocalDateTime expiresAt;

    public static MindMapShareResponse of(MindMapShare share) {
        return MindMapShareResponse.builder()
                .enabled(Boolean.TRUE.equals(share.getEnabled()))
                .shareCode(share.getShareCode())
                .showTasks(Boolean.TRUE.equals(share.getShowTasks()))
                .showAssignees(Boolean.TRUE.equals(share.getShowAssignees()))
                .showMemos(Boolean.TRUE.equals(share.getShowMemos()))
                .expiresAt(share.getExpiresAt())
                .build();
    }

    /** 아직 공유 설정 행이 없는 보드의 기본값 */
    public static MindMapShareResponse empty() {
        return MindMapShareResponse.builder()
                .enabled(false)
                .shareCode(null)
                .showTasks(true)
                .showAssignees(false)
                .showMemos(false)
                .expiresAt(null)
                .build();
    }
}
