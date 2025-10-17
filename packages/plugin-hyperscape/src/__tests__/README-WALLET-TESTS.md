# Wallet Integration Tests - Real Server Testing

## Philosophy: NO MOCKS, REAL CODE ONLY

Following CLAUDE.md principles, these tests connect to **real Hyperscape servers** with **real databases** and **real network connections**. No mocks, no spies, no fake responses.

## Test File: `wallet-integration.test.ts`

### What It Tests

#### ✅ Character Creation with Wallet
- Creates real characters via server API
- Verifies wallet fields populated in database
- Validates Ethereum address format
- Checks Privy wallet metadata

#### ✅ Agent Link Flow (linkAgent Action)
- Generates real challenge codes via `/api/agent/challenge`
- Exchanges challenge for JWT token
- Verifies token scopes and restrictions
- Confirms `no_wallet_access` restriction enforced

#### ✅ PLAYER_JOINED Event → Wallet Init
- Connects agent to Hyperscape WebSocket
- Triggers PLAYER_JOINED event
- Verifies `initializeWalletAuth()` called
- Confirms wallet data fetched from `/api/character/:id/wallet`

#### ✅ Runtime Wallet State
- Verifies `runtime.walletAddress` set after wallet init
- Verifies `runtime.walletChainType` set correctly
- Tests wallet state persistence across actions

#### ✅ Character Provider Integration
- Calls `characterProvider.get()` after wallet init
- Verifies wallet info included in provider output
- Tests graceful handling when no wallet exists

#### ✅ Environment Variable Handling
- Tests with `AGENT_CHARACTER_ID` set
- Tests without `AGENT_CHARACTER_ID` (server fallback)

#### ✅ API Endpoint Security
- **Read-Only Success**: GET `/api/character/:id/wallet` with agent token → 200
- **Signing Forbidden**: POST `/api/wallet/sign` with agent token → 403
- **Transfer Forbidden**: POST `/api/wallet/transfer` with agent token → 403

#### ✅ Error Handling (Fail Fast)
- Character without wallet → graceful handling
- Invalid character ID → returns null
- Network timeout → fails gracefully
- Malformed responses → proper errors

## Prerequisites

### 1. Running Hyperscape Server

You need a **real Hyperscape server** running with:
- WebSocket server at `ws://localhost:5555/ws`
- HTTP server at `http://localhost:5555`
- PostgreSQL database with character_wallets table
- Privy integration for wallet creation

**Start the server:**
```bash
# From hyperscape root
cd packages/server
bun run dev
```

### 2. Environment Configuration

Copy `.env.test.example` to `.env.test` and configure:

```bash
# Required: Server URLs
HYPERSCAPE_SERVER_URL=http://localhost:5555
WS_URL=ws://localhost:5555/ws

# Required: Test user token (for character creation)
# Generate this via Privy auth in the UI or test endpoint
TEST_USER_TOKEN=your-privy-jwt-token-here

# Optional: Pre-configured character ID
AGENT_CHARACTER_ID=550e8400-e29b-41d4-a716-446655440000

# Required: Database (tests use PGLite by default)
DATABASE_ADAPTER=pglite

# Optional: OpenAI for full agent testing
OPENAI_API_KEY=sk-proj-your-key-here
```

### 3. Database Setup

The server must have the character_wallets table:

```sql
CREATE TABLE IF NOT EXISTS character_wallets (
  character_id UUID PRIMARY KEY REFERENCES characters(id),
  account_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  chain_type TEXT NOT NULL DEFAULT 'ethereum',
  hd_index INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Running the Tests

### Run All Wallet Tests
```bash
cd packages/plugin-hyperscape
bun test src/__tests__/wallet-integration.test.ts
```

### Run Specific Test Suite
```bash
# Character creation tests only
bun test src/__tests__/wallet-integration.test.ts -t "Character Creation"

# Agent link flow only
bun test src/__tests__/wallet-integration.test.ts -t "Agent Link Flow"

# Security tests only
bun test src/__tests__/wallet-integration.test.ts -t "API Endpoint Security"
```

### Run with Verbose Output
```bash
bun test src/__tests__/wallet-integration.test.ts --reporter=verbose
```

### Run with Coverage
```bash
bun test src/__tests__/wallet-integration.test.ts --coverage
```

## Test Behavior

### With Server Running
- All tests execute against real server
- Database operations are real
- Network requests are real
- Tests MUST pass for wallet integration to be verified

### Without Server (SKIP_REAL_TESTS=true)
- Tests are automatically skipped
- No failures, just skip messages
- Use `.skipIf(SKIP_REAL_TESTS)` pattern

Example output when server is not available:
```
✓ src/__tests__/wallet-integration.test.ts (14 skipped)
  ✓ Wallet Integration Tests (Real Server) (14 skipped)
    ○ Character Creation with Wallet > should create character with wallet fields populated [skipped]
    ○ Agent Link Flow > should exchange challenge code for agent token [skipped]
    ...
```

## Debugging Test Failures

### Test Timeout
```
Error: test timed out after 5000ms
```
**Fix**: Server not running or slow to respond. Check server logs.

### Connection Refused
```
Error: Failed to connect to ws://localhost:5555/ws
```
**Fix**: Start the Hyperscape server.

### 401 Unauthorized
```
Error: Failed to fetch wallet: 401 Unauthorized
```
**Fix**: Set valid `TEST_USER_TOKEN` in `.env.test`

### Character Not Found
```
Error: Character char-123 does not have a wallet
```
**Fix**: Ensure Privy wallet creation is working on server

### Database Errors
```
Error: relation "character_wallets" does not exist
```
**Fix**: Run database migrations on test server

## Expected Test Results

When all tests pass:
```
✓ src/__tests__/wallet-integration.test.ts (23 tests)
  ✓ Wallet Integration Tests (Real Server) (23 tests)
    ✓ Character Creation with Wallet (2 tests)
      ✓ should create character with wallet fields populated
      ✓ should fail gracefully when wallet creation fails
    ✓ Agent Link Flow (2 tests)
      ✓ should exchange challenge code for agent token
      ✓ should fail with invalid challenge code
    ✓ PLAYER_JOINED Event Triggers Wallet Init (2 tests)
      ✓ should initialize wallet on PLAYER_JOINED event
      ✓ should handle character without wallet gracefully
    ✓ Runtime Wallet State (3 tests)
      ✓ should set runtime.walletAddress after wallet init
      ✓ should set runtime.walletChainType correctly
      ✓ should persist wallet state across action executions
    ✓ Character Provider Integration (2 tests)
      ✓ should include wallet info in provider output
      ✓ should handle missing wallet in provider
    ✓ Environment Variable Handling (2 tests)
      ✓ should use AGENT_CHARACTER_ID when set
      ✓ should fallback to server selection without AGENT_CHARACTER_ID
    ✓ API Endpoint Security (3 tests)
      ✓ should allow read-only wallet endpoint for agents
      ✓ should forbid signing endpoints for agents
      ✓ should forbid transfer endpoints for agents
    ✓ Error Handling (3 tests)
      ✓ should return null for invalid character ID
      ✓ should handle network timeout gracefully
      ✓ should throw on malformed wallet response

Test Files  1 passed (1)
     Tests  23 passed (23)
  Start at  14:23:15
  Duration  12.45s
```

## CI/CD Integration

Since these are integration tests requiring a real server:

### Option 1: Dedicated Test Server
```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_PASSWORD: test_password
  steps:
    - name: Start Hyperscape Test Server
      run: |
        cd packages/server
        bun run start:test &
        sleep 5
    - name: Run Wallet Integration Tests
      run: |
        cd packages/plugin-hyperscape
        bun test src/__tests__/wallet-integration.test.ts
```

### Option 2: Skip in CI, Run Locally
```yaml
# Only run integration tests manually
test:
  runs-on: ubuntu-latest
  steps:
    - name: Run Unit Tests Only
      run: bun test --exclude wallet-integration
```

## Manual Test Verification Checklist

Before considering wallet integration complete, verify ALL these pass:

- [ ] Character created with wallet fields populated
- [ ] Wallet address is valid Ethereum format (0x...)
- [ ] Challenge code exchange returns JWT token
- [ ] Agent token has `no_wallet_access` restriction
- [ ] PLAYER_JOINED event triggers wallet initialization
- [ ] `runtime.walletAddress` is set after connection
- [ ] Character provider includes wallet info in output
- [ ] AGENT_CHARACTER_ID environment variable works
- [ ] Read-only endpoint `/api/character/:id/wallet` returns 200
- [ ] Signing endpoint `/api/wallet/sign` returns 403
- [ ] Transfer endpoint `/api/wallet/transfer` returns 403
- [ ] Invalid character ID returns null gracefully
- [ ] Network timeout doesn't crash the agent

## Next Steps After Tests Pass

1. **Deploy to staging** - Test with real Privy accounts
2. **Security audit** - Verify agent tokens cannot access wallet operations
3. **Performance testing** - Test with 100+ concurrent agents
4. **Monitoring** - Add wallet initialization metrics
5. **Documentation** - Update user-facing docs with wallet features

---

**Remember**: These tests connect to REAL servers with REAL data. No mocks. No fakes. Fail fast when something is wrong.
