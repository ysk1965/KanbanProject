package com.kanban.domain.sermonhighlight;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

/**
 * 성경 읽기 「형광펜」 한 줄. id 는 기기에서 만든다 (오프라인에서 먼저 칠하고 나중에 올린다).
 *
 * <p>범위는 verse_from 의 char_start 부터 verse_to 의 char_end 까지. 둘 다 null 이면 절 전체. 지우면 deleted_at 만 찍는다.
 */
@Entity
@Table(
        name = "sermon_highlights",
        indexes = @Index(name = "idx_sermon_highlights_user_ch", columnList = "user_id, book, chapter"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonHighlight {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "book", nullable = false)
    private short book;

    @Column(name = "chapter", nullable = false)
    private short chapter;

    @Column(name = "verse_from", nullable = false)
    private short verseFrom;

    @Column(name = "verse_to", nullable = false)
    private short verseTo;

    @Column(name = "char_start")
    private Integer charStart;

    @Column(name = "char_end")
    private Integer charEnd;

    @Column(name = "color", length = 10)
    private String color;

    @Column(name = "underline", nullable = false)
    private boolean underline;

    @Column(name = "memo", length = 200)
    private String memo;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void apply(
            int book,
            int chapter,
            int verseFrom,
            int verseTo,
            Integer charStart,
            Integer charEnd,
            String color,
            boolean underline,
            String memo,
            LocalDateTime at) {
        this.book = (short) book;
        this.chapter = (short) chapter;
        this.verseFrom = (short) verseFrom;
        this.verseTo = (short) verseTo;
        this.charStart = charStart;
        this.charEnd = charEnd;
        this.color = color;
        this.underline = underline;
        this.memo = memo;
        this.updatedAt = at;
    }

    public void delete(LocalDateTime at) {
        if (this.deletedAt == null) {
            this.deletedAt = at;
            this.updatedAt = at;
        }
    }
}
