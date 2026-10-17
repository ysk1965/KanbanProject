package com.kanban.domain.note;

/** 페이지(문서/화이트보드) 진행 상태. null = 미지정. 폴더에는 적용하지 않는다. */
public enum NoteStatus {
    DRAFT,
    IN_REVIEW,
    DONE
}
