-- Migration: Convert agents.isActive from INTEGER to BOOLEAN
-- Description: Changes isActive column from INTEGER (SQLite-style) to native BOOLEAN
-- Date: 2025-10-18

-- Convert agents.isActive from INTEGER to BOOLEAN
-- Step 1: Add new column with BOOLEAN type
ALTER TABLE agents ADD COLUMN isActive_new BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Copy data, converting INTEGER to BOOLEAN (1 = true, 0/NULL = false)
UPDATE agents SET isActive_new = (isActive = 1 OR isActive IS NULL);

-- Step 3: Drop old INTEGER column
ALTER TABLE agents DROP COLUMN isActive;

-- Step 4: Rename new column to original name
ALTER TABLE agents RENAME COLUMN isActive_new TO isActive;
