CREATE TABLE task_dependencies (
    id VARCHAR(36) PRIMARY KEY,
    board_id VARCHAR(36) NOT NULL,
    predecessor_id VARCHAR(36) NOT NULL,
    successor_id VARCHAR(36) NOT NULL,
    dependency_type VARCHAR(10) NOT NULL DEFAULT 'FS',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_dep_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_dep_predecessor FOREIGN KEY (predecessor_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_dep_successor FOREIGN KEY (successor_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT uk_task_dependency UNIQUE (predecessor_id, successor_id),
    CONSTRAINT chk_no_self_dependency CHECK (predecessor_id != successor_id)
);

CREATE INDEX idx_task_dep_predecessor ON task_dependencies(predecessor_id);
CREATE INDEX idx_task_dep_successor ON task_dependencies(successor_id);
CREATE INDEX idx_task_dep_board ON task_dependencies(board_id);
