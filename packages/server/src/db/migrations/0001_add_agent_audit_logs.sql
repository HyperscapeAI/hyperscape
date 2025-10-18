-- Migration: Add agent_audit_logs table and agent-specific columns to users table
-- Description: Adds persistent audit logging for agent authentication events
-- Date: 2025-10-18

-- Add agent-specific columns to users table (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='runtimeId') THEN
        ALTER TABLE "users" ADD COLUMN "runtimeId" text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='ownerId') THEN
        ALTER TABLE "users" ADD COLUMN "ownerId" text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='isActive') THEN
        ALTER TABLE "users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN
        ALTER TABLE "users" ADD COLUMN "permissions" JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Create index on runtimeId for agent lookups (if not exists)
CREATE INDEX IF NOT EXISTS "idx_users_runtime" ON "users" USING btree ("runtimeId");

-- Create agent_audit_logs table for persistent audit logging
CREATE TABLE IF NOT EXISTS "agent_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" TIMESTAMPTZ NOT NULL,
	"event_type" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text,
	"runtime_id" text,
	"owner_id" text,
	"privy_user_id" text,
	"metadata" JSONB,
	"success" BOOLEAN NOT NULL,
	"error_message" text
);

-- Create indexes for fast lookups
-- Note: idx_agent_audit_agent and idx_agent_audit_event_type are redundant
-- as they are covered by composite indexes below
CREATE INDEX IF NOT EXISTS "idx_agent_audit_timestamp" ON "agent_audit_logs" USING btree ("timestamp");

-- Create composite indexes for common query patterns
-- These composite indexes are more efficient than single-column indexes
CREATE INDEX IF NOT EXISTS "idx_audit_agent_time" ON "agent_audit_logs" (agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_event_success" ON "agent_audit_logs" (event_type, success);
CREATE INDEX IF NOT EXISTS "idx_audit_composite" ON "agent_audit_logs" (agent_id, event_type, timestamp DESC);

-- Add comment to table
COMMENT ON TABLE "agent_audit_logs" IS 'Persistent audit log for agent authentication and authorization events. Used for security monitoring, breach detection, and forensics.';
