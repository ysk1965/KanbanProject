-- Convert legacy NONE and LOW priorities to MEDIUM
UPDATE personal_tasks SET priority = 'MEDIUM' WHERE priority IN ('NONE', 'LOW');

-- Set due_date to current date for tasks without due dates
UPDATE personal_tasks SET due_date = CURRENT_DATE WHERE due_date IS NULL;
