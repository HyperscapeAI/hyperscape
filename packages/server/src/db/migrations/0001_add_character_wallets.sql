-- Migration: Add embedded wallet fields to characters table
-- Date: 2025-10-16
-- Description: Adds Privy embedded wallet support for per-character/agent authentication

-- Add wallet columns to characters table
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS "walletAddress" text UNIQUE,
ADD COLUMN IF NOT EXISTS "walletId" text,
ADD COLUMN IF NOT EXISTS "walletChainType" text DEFAULT 'ethereum',
ADD COLUMN IF NOT EXISTS "walletHdIndex" integer,
ADD COLUMN IF NOT EXISTS "walletCreatedAt" bigint,
ADD COLUMN IF NOT EXISTS "walletMetadata" text;

-- Create index on walletAddress for fast lookups
CREATE INDEX IF NOT EXISTS "idx_characters_wallet" ON characters ("walletAddress");

-- Add comments for documentation
COMMENT ON COLUMN characters."walletAddress" IS 'Ethereum/blockchain address (unique per character)';
COMMENT ON COLUMN characters."walletId" IS 'Privy wallet ID for API operations';
COMMENT ON COLUMN characters."walletChainType" IS 'Chain type: ethereum, solana, bitcoin, etc.';
COMMENT ON COLUMN characters."walletHdIndex" IS 'Hierarchical deterministic wallet index';
COMMENT ON COLUMN characters."walletCreatedAt" IS 'Timestamp when wallet was generated';
COMMENT ON COLUMN characters."walletMetadata" IS 'JSON for additional wallet data (policies, signers, etc.)';
