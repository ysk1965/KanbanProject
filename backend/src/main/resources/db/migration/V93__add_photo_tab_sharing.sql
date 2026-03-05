-- V93__add_photo_tab_sharing.sql
ALTER TABLE org_photo_tabs ADD COLUMN share_token VARCHAR(36) UNIQUE;
ALTER TABLE org_photo_tabs ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT FALSE;
