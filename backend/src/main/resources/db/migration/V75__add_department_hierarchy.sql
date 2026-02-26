ALTER TABLE organization_departments
ADD COLUMN parent_department_id VARCHAR(36) REFERENCES organization_departments(id) ON DELETE SET NULL;

ALTER TABLE organization_departments
ADD COLUMN leader_id VARCHAR(36) REFERENCES organization_members(id) ON DELETE SET NULL;

ALTER TABLE organization_departments
ADD COLUMN description VARCHAR(500);

CREATE INDEX idx_orgdept_parent ON organization_departments(organization_id, parent_department_id);
CREATE INDEX idx_orgdept_leader ON organization_departments(leader_id);
