-- Migration: Fix database schema types and remove redundant indexes
-- Description:
--   1. Remove redundant indexes that are covered by composite indexes
--   2. Convert success column from INTEGER to BOOLEAN in agent_audit_logs
--   3. Convert isActive column from INTEGER to BOOLEAN in users table
--   4. Convert permissions column from TEXT to JSONB in users table
-- Date: 2025-10-18

-- =============================================================================
-- PART 1: Remove redundant indexes
-- =============================================================================

-- Drop idx_agent_audit_agent - covered by idx_audit_agent_time (agent_id, timestamp DESC)
DROP INDEX IF EXISTS "idx_agent_audit_agent";

-- Drop idx_agent_audit_event_type - covered by idx_audit_event_success (event_type, success)
DROP INDEX IF EXISTS "idx_agent_audit_event_type";

-- =============================================================================
-- PART 2: Convert agent_audit_logs.success from INTEGER to BOOLEAN
-- =============================================================================

-- Step 1: Add new column with BOOLEAN type
ALTER TABLE "agent_audit_logs" ADD COLUMN "success_new" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Copy data, converting INTEGER to BOOLEAN (1 = true, 0 = false)
UPDATE "agent_audit_logs" SET "success_new" = ("success" = 1);

-- Step 3: Drop old INTEGER column
ALTER TABLE "agent_audit_logs" DROP COLUMN "success";

-- Step 4: Rename new column to original name
ALTER TABLE "agent_audit_logs" RENAME COLUMN "success_new" TO "success";

-- =============================================================================
-- PART 3: Convert users.isActive from INTEGER to BOOLEAN
-- =============================================================================

-- Only perform this migration if isActive column exists and is INTEGER type
DO $$
BEGIN
    -- Check if isActive exists and is INTEGER type
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'isActive'
        AND data_type IN ('integer', 'smallint', 'bigint')
    ) THEN
        -- Step 1: Add new column with BOOLEAN type
        ALTER TABLE "users" ADD COLUMN "isActive_new" BOOLEAN NOT NULL DEFAULT true;

        -- Step 2: Copy data, converting INTEGER to BOOLEAN (1 = true, 0/NULL = false)
        UPDATE "users" SET "isActive_new" = (COALESCE("isActive", 0) = 1);

        -- Step 3: Drop old INTEGER column
        ALTER TABLE "users" DROP COLUMN "isActive";

        -- Step 4: Rename new column to original name
        ALTER TABLE "users" RENAME COLUMN "isActive_new" TO "isActive";
    END IF;
END $$;

-- =============================================================================
-- PART 4: Convert users.permissions from TEXT to JSONB
-- =============================================================================

-- Only perform this migration if permissions column exists and is TEXT type
DO $$
BEGIN
    -- Check if permissions exists and is TEXT type
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'permissions'
        AND data_type IN ('text', 'character varying')
    ) THEN
        -- Step 1: Add new column with JSONB type
        ALTER TABLE "users" ADD COLUMN "permissions_new" JSONB DEFAULT '[]'::jsonb;

        -- Step 2: Convert comma-separated text to JSON array
        -- Handle empty strings, null values, and malformed data
        UPDATE "users"
        SET "permissions_new" = CASE
            -- If it's empty or just whitespace, use empty array
            WHEN "permissions" IS NULL OR TRIM("permissions") = '' OR TRIM("permissions") = '{}' THEN
                '[]'::jsonb
            -- If it's valid JSON already (starts with [ or {), try to cast it
            WHEN "permissions" ~ '^[\[\{]' THEN
                CASE
                    -- Safe cast check: attempt to validate JSON
                    WHEN "permissions"::text IS JSON THEN
                        "permissions"::jsonb
                    ELSE
                        '[]'::jsonb
                END
            -- If it contains commas, convert comma-separated string to flat JSON array
            WHEN "permissions" ~ ',' THEN
                to_jsonb(string_to_array("permissions", ','))
            -- Otherwise, single permission - wrap in array
            ELSE
                to_jsonb(ARRAY["permissions"])
        END;

        -- Step 3: Drop old TEXT column
        ALTER TABLE "users" DROP COLUMN "permissions";

        -- Step 4: Rename new column to original name
        ALTER TABLE "users" RENAME COLUMN "permissions_new" TO "permissions";
    END IF;
END $$;

-- Add comment to document the changes
COMMENT ON TABLE "agent_audit_logs" IS 'Persistent audit log for agent authentication and authorization events. Updated: 2025-10-18 - success column converted to BOOLEAN, redundant indexes removed.';
COMMENT ON TABLE "users" IS 'User accounts with authentication and authorization. Updated: 2025-10-18 - isActive converted to BOOLEAN, permissions converted to JSONB array.';
