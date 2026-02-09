-- Add baseline date columns to tasks table for Gantt baseline comparison
ALTER TABLE tasks ADD COLUMN baseline_start_date DATE;
ALTER TABLE tasks ADD COLUMN baseline_due_date DATE;
