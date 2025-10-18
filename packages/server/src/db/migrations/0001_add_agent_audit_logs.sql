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
        ALTER TABLE "users" ADD COLUMN "isActive" integer DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permissions') THEN
        ALTER TABLE "users" ADD COLUMN "permissions" text;
    END IF;
END $$;

-- Create index on runtimeId for agent lookups (if not exists)
CREATE INDEX IF NOT EXISTS "idx_users_runtime" ON "users" USING btree ("runtimeId");

-- Create agent_audit_logs table for persistent audit logging
CREATE TABLE IF NOT EXISTS "agent_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" text NOT NULL,
	"event_type" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text,
	"runtime_id" text,
	"owner_id" text,
	"privy_user_id" text,
	"metadata" text,
	"success" integer NOT NULL,
	"error_message" text
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS "idx_agent_audit_agent" ON "agent_audit_logs" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_audit_timestamp" ON "agent_audit_logs" USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_agent_audit_event_type" ON "agent_audit_logs" USING btree ("event_type");

-- Add comment to table
COMMENT ON TABLE "agent_audit_logs" IS 'Persistent audit log for agent authentication and authorization events. Used for security monitoring, breach detection, and forensics.';
