package com.kanban.domain.task;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "task_dependencies",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_task_dependency",
        columnNames = {"predecessor_id", "successor_id"}
    ),
    indexes = {
        @Index(name = "idx_task_dep_predecessor", columnList = "predecessor_id"),
        @Index(name = "idx_task_dep_successor", columnList = "successor_id"),
        @Index(name = "idx_task_dep_board", columnList = "board_id")
    }
)
public class TaskDependency {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "predecessor_id", nullable = false)
    private Task predecessor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "successor_id", nullable = false)
    private Task successor;

    @Column(name = "dependency_type", nullable = false, length = 10)
    private String dependencyType = "FS";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected TaskDependency() {}

    public static TaskDependency create(Board board, Task predecessor, Task successor) {
        TaskDependency dep = new TaskDependency();
        dep.id = java.util.UUID.randomUUID().toString();
        dep.board = board;
        dep.predecessor = predecessor;
        dep.successor = successor;
        dep.dependencyType = "FS";
        dep.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        return dep;
    }

    public String getId() { return id; }
    public Board getBoard() { return board; }
    public Task getPredecessor() { return predecessor; }
    public Task getSuccessor() { return successor; }
    public String getDependencyType() { return dependencyType; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
