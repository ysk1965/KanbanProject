package com.kanban.domain.diary;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "diary_entries",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "diary_date"}),
        indexes = {
                @Index(name = "idx_diary_user_date", columnList = "user_id, diary_date"),
                @Index(name = "idx_diary_user_yearmonth", columnList = "user_id, diary_date")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DiaryEntry extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "diary_date", nullable = false)
    private LocalDate diaryDate;

    @Column(name = "title", length = 200)
    private String title;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "mood", length = 50)
    private String mood;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20)
    @Builder.Default
    private DiaryStatus status = DiaryStatus.CHATTING;

    @OneToMany(mappedBy = "diary", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("messageOrder ASC")
    @Builder.Default
    private List<DiaryMessage> messages = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void addMessage(DiaryMessage message) {
        this.messages.add(message);
    }

    public void complete(String title, String content, String mood) {
        this.title = title;
        this.content = content;
        this.mood = mood;
        this.status = DiaryStatus.COMPLETED;
    }

    public void updateContent(String title, String content, String mood) {
        if (title != null) this.title = title;
        if (content != null) this.content = content;
        if (mood != null) this.mood = mood;
    }

    public boolean isOwner(String userId) {
        return this.user.getId().equals(userId);
    }

    public boolean isChatting() {
        return this.status == DiaryStatus.CHATTING;
    }

    public boolean isCompleted() {
        return this.status == DiaryStatus.COMPLETED;
    }

    public void reopen() {
        this.status = DiaryStatus.CHATTING;
    }

    public void reset() {
        this.title = null;
        this.content = null;
        this.mood = null;
        this.status = DiaryStatus.CHATTING;
        this.messages.clear();
    }
}
