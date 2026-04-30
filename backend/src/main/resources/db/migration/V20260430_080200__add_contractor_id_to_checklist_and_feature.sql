-- ChecklistItem, Feature 에 외주 담당자(contractor_id) FK 추가.
-- assignee_id (User FK) 와 OR 관계로, 둘 중 하나만 set 되어야 함.
DO $$ BEGIN
    ALTER TABLE checklist_items ADD COLUMN contractor_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_checklist_items_contractor') THEN
        ALTER TABLE checklist_items
          ADD CONSTRAINT fk_checklist_items_contractor
          FOREIGN KEY (contractor_id) REFERENCES board_contractors(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_checklist_items_contractor_id ON checklist_items(contractor_id);

DO $$ BEGIN
    ALTER TABLE features ADD COLUMN contractor_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_features_contractor') THEN
        ALTER TABLE features
          ADD CONSTRAINT fk_features_contractor
          FOREIGN KEY (contractor_id) REFERENCES board_contractors(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_features_contractor_id ON features(contractor_id);
