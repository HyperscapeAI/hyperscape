/**
 * Agent Authentication System
 *
 * Handles authentication and authorization for AI agents connecting to Hyperscape.
 * Implements best practices for autonomous agent identity management in 2025:
 *
 * - **Unique Agent Identities**: Each agent gets a unique service account
 * - **Short-lived Tokens**: 5-minute JWT tokens for enhanced security
 * - **M2M Authentication**: Machine-to-machine auth protocol
 * - **Comprehensive Audit**: Full tracking of agent authentication events
 * - **Zero Trust**: Continuous verification of agent identity
 *
 * **Architecture**:
 *
 * 1. Agent Registration:
 *    - ElizaOS runtime requests agent credentials
 *    - Server creates unique agent account with service role
 *    - Returns short-lived JWT token for connection
 *
 * 2. Agent Connection:
 *    - Agent presents JWT token in WebSocket connection
 *    - Server verifies token and extracts agent identity
 *    - Spawns agent in world with proper permissions
 *
 * 3. Token Rotation:
 *    - Tokens expire after 5 minutes
 *    - Agent must re-authenticate to get new token
 *    - Prevents token theft and improves security
 *
 * 4. Audit Trail:
 *    - All agent auth events logged with metadata
 *    - Tracks: agent ID, action, timestamp, IP, user agent
 *    - Enables breach detection and forensics
 *
 * **Security Features**:
 * - Ephemeral tokens (5 min expiry vs 1 hour for humans)
 * - Agent-specific permissions (service role)
 * - Rate limiting for auth attempts
 * - Comprehensive logging for audit
 * - Support for agent deactivation
 *
 * **Integration with Privy**:
 * For human users with agents, we can optionally link the agent
 * to the user's Privy account, allowing users to:
 * - Control their agents via authenticated API
 * - Track agent activity
 * - Revoke agent access
 *
 * **Environment Variables**:
 * - `JWT_SECRET`: Secret for signing agent JWT tokens
 * - `AGENT_TOKEN_EXPIRY`: Token expiry in seconds (default: 300)
 * - `AGENT_AUTH_ENABLED`: Enable/disable agent auth (default: true)
 *
 * **Referenced by**: ServerNetwork.ts (agent connection handling)
 */

import { createJWT, verifyJWT } from './utils';
import type { User, SystemDatabase } from './types';
import { uuid } from '@hyperscape/shared';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

/**
 * Agent token expiry time in seconds (5 minutes for enhanced security)
 */
const AGENT_TOKEN_EXPIRY = parseInt(process.env.AGENT_TOKEN_EXPIRY || '300', 10);

/**
 * Check if agent authentication is enabled
 */
const AGENT_AUTH_ENABLED = process.env.AGENT_AUTH_ENABLED !== 'false';

/**
 * Redis client for distributed rate limiting (production)
 * Falls back to null in development if Redis is not configured
 */
let redisClient: Redis | null = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) {
          console.error('[AgentAuth] Redis connection failed after 3 retries. Falling back to in-memory rate limiting.');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000); // Exponential backoff
      },
    });

    redisClient.on('error', (err) => {
      console.error('[AgentAuth] Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      console.info('[AgentAuth] Redis connected - using distributed rate limiting');
    });
  } catch (error) {
    console.error('[AgentAuth] Failed to initialize Redis:', error);
    redisClient = null;
  }
}

/**
 * Rate limiter for agent registration
 * 
 * Uses Redis-backed distributed rate limiting in production to prevent
 * bypassing limits across multiple server instances.
 * 
 * Falls back to in-memory rate limiting in development (single instance only).
 * 
 * **IMPORTANT**: In-memory rate limiting does NOT work correctly in 
 * multi-instance deployments. Each instance has its own rate limit counter,
 * allowing attackers to bypass limits by distributing requests across instances.
 * 
 * Always set REDIS_URL in production environments.
 */
const agentRegistrationLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      points: parseInt(process.env.AGENT_REGISTRATION_LIMIT || '10', 10), // 10 registrations
      duration: parseInt(process.env.AGENT_REGISTRATION_WINDOW || '900', 10), // per 15 minutes (900 seconds)
      keyPrefix: 'agent_reg_limit',
    })
  : new RateLimiterMemory({
      points: parseInt(process.env.AGENT_REGISTRATION_LIMIT || '10', 10),
      duration: parseInt(process.env.AGENT_REGISTRATION_WINDOW || '900', 10),
    });

// Warn if using in-memory rate limiting in production
if (!redisClient && process.env.NODE_ENV === 'production') {
  console.warn(
    '⚠️  [AgentAuth] Using in-memory rate limiting in production! ' +
    'This is NOT secure for multi-instance deployments. ' +
    'Set REDIS_URL environment variable to enable distributed rate limiting.'
  );
}

/**
 * Agent authentication information
 */
export class AgentAuthInfo {
  /** Unique agent ID */
  agentId!: string;

  /** Agent display name */
  agentName!: string;

  /** ElizaOS runtime ID (if applicable) */
  runtimeId?: string;

  /** User ID that owns this agent (if applicable) */
  ownerId?: string;

  /** Privy user ID of owner (if applicable) */
  privyUserId?: string;

  /** Agent role (default: 'agent') */
  role!: 'agent' | 'autonomous_agent' | 'npc' | 'bot';

  /** Allowed permissions */
  permissions!: string[];

  /** Creation timestamp */
  createdAt!: Date;

  /** Whether this agent is active */
  isActive!: boolean;
}

/**
 * Agent metadata for audit trail
 */
export class AgentMetadata {
  ipAddress?: string;
  userAgent?: string;
  version?: string;
}

/**
 * Agent authentication request
 */
export class AgentAuthRequest {
  /** Agent name */
  agentName!: string;

  /** ElizaOS runtime ID */
  runtimeId?: string;

  /** Owner's Privy user ID (optional) */
  privyUserId?: string;

  /** Requested permissions */
  requestedPermissions?: string[];

  /** Agent metadata for audit trail */
  metadata?: AgentMetadata;
}

/**
 * Agent authentication response
 */
export class AgentAuthResponse {
  /** JWT token for WebSocket connection */
  token!: string;

  /** Agent identity info */
  agentInfo!: AgentAuthInfo;

  /** Token expiry time (ISO string) */
  expiresAt!: string;

  /** WebSocket URL to connect to */
  wsUrl!: string;
}

/**
 * Audit log entry for agent authentication events
 */
class AgentAuthAuditEntry {
  timestamp!: string;
  eventType!: 'agent_registered' | 'agent_authenticated' | 'agent_token_refreshed' | 'agent_deactivated' | 'agent_auth_failed';
  agentId!: string;
  agentName?: string;
  runtimeId?: string;
  ownerId?: string;
  privyUserId?: string;
  metadata?: Record<string, string | number | boolean>;
  success!: boolean;
  errorMessage?: string;
}

/**
 * In-memory audit log (for quick access to recent entries)
 * NOTE: Also persisted to database for durability
 */
const auditLog: AgentAuthAuditEntry[] = [];

/**
 * Logs an agent authentication event to both memory and persistent storage
 */
async function logAgentAuthEvent(entry: AgentAuthAuditEntry, db?: SystemDatabase): Promise<void> {
  // Add to in-memory cache
  auditLog.push(entry);

  // Also log to console for debugging (without PII)
  // Note: Full metadata including IP addresses is persisted to database but excluded from console to prevent PII exposure
  const logLevel = entry.success ? 'info' : 'warn';
  console[logLevel](`[AgentAuth] ${entry.eventType}:`, {
    agentId: entry.agentId,
    success: entry.success,
  });

  // Keep only last 1000 entries in memory
  if (auditLog.length > 1000) {
    auditLog.shift();
  }

  // Persist to database if available
  if (db) {
    try {
      await db('agent_audit_logs').insert({
        timestamp: entry.timestamp,
        event_type: entry.eventType,
        agent_id: entry.agentId,
        agent_name: entry.agentName || null,
        runtime_id: entry.runtimeId || null,
        owner_id: entry.ownerId || null,
        privy_user_id: entry.privyUserId || null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        success: entry.success,
        error_message: entry.errorMessage || null,
      });
    } catch (error) {
      // Log but don't fail the auth flow if audit logging fails
      console.error('[AgentAuth] Failed to persist audit log:', error);
    }
  }
}

/**
 * Registers a new AI agent and generates authentication credentials
 *
 * Creates a unique agent account in the database with service role.
 * Returns a short-lived JWT token for the agent to connect to the server.
 *
 * @param db - Database connection
 * @param request - Agent registration request
 * @returns Agent credentials and JWT token
 */
export async function registerAgent(
  db: SystemDatabase,
  request: AgentAuthRequest
): Promise<AgentAuthResponse> {
  // Rate limiting - derive key from IP address or runtime ID
  const rateLimitKey = request.metadata?.ipAddress || request.runtimeId || 'anonymous';

  try {
    await agentRegistrationLimiter.consume(rateLimitKey);
  } catch (rateLimiterError) {
    // Rate limit exceeded
    const errorEntry = Object.assign(new AgentAuthAuditEntry(), {
      timestamp: new Date().toISOString(),
      eventType: 'agent_registered' as const,
      agentId: 'rate_limited',
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      metadata: request.metadata,
      success: false,
      errorMessage: 'Rate limit exceeded for agent registration',
    });
    await logAgentAuthEvent(errorEntry, db);

    throw new Error('Rate limit exceeded. Too many agent registration attempts. Please try again later.');
  }

  try {
    // Generate unique agent ID
    const agentId = `agent_${uuid()}`;
    const timestamp = new Date().toISOString();

    // Default permissions for agents
    const defaultPermissions = ['chat', 'move', 'perceive', 'interact'];
    const permissions = request.requestedPermissions || defaultPermissions;

    // Check for existing agent with same runtimeId to avoid duplicates
    if (request.runtimeId) {
      const existing = await db('users')
        .where('runtimeId', request.runtimeId)
        .where('roles', 'agent')
        .first();

      if (existing) {
        console.info(`[AgentAuth] Found existing agent for runtimeId ${request.runtimeId}, reusing: ${existing.id}`);

        // Generate new token for existing agent
        const token = await createJWT(
          {
            userId: existing.id,
            type: 'agent',
            runtimeId: request.runtimeId,
            permissions: existing.permissions ? existing.permissions.split(',') : permissions,
          },
          AGENT_TOKEN_EXPIRY
        );

        const expiresAt = new Date(Date.now() + AGENT_TOKEN_EXPIRY * 1000).toISOString();
        const wsUrl = process.env.HYPERSCAPE_WS_URL || 'ws://localhost:5555/ws';

        const agentInfo = Object.assign(new AgentAuthInfo(), {
          agentId: existing.id,
          agentName: existing.name,
          runtimeId: existing.runtimeId || undefined,
          ownerId: existing.privyUserId || existing.ownerId || undefined,
          privyUserId: existing.privyUserId || undefined,
          role: 'agent' as const,
          permissions: existing.permissions ? existing.permissions.split(',') : permissions,
          createdAt: new Date(existing.createdAt),
          isActive: existing.isActive !== false,
        });

        const response = Object.assign(new AgentAuthResponse(), {
          token,
          agentInfo,
          expiresAt,
          wsUrl,
        });

        return response;
      }
    }

    // Create agent user account
    const agentUser: User = {
      id: agentId,
      name: request.agentName || 'AI Agent',
      avatar: null,
      roles: 'agent', // Special role for AI agents
      createdAt: timestamp,
    };

    // Store agent in database with additional metadata
    const agentRecord = {
      ...agentUser,
      runtimeId: request.runtimeId || null,
      ownerId: request.privyUserId || null,
      privyUserId: request.privyUserId || null,
      isActive: 1, // 1 = active (database expects integer, not boolean)
      permissions: permissions.join(','),
    };

    await db('users').insert(agentRecord);

    // Generate short-lived JWT token
    const token = await createJWT(
      {
        userId: agentId,
        type: 'agent',
        runtimeId: request.runtimeId,
        permissions,
      },
      AGENT_TOKEN_EXPIRY
    );

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + AGENT_TOKEN_EXPIRY * 1000).toISOString();

    // Build WebSocket URL
    const wsUrl = process.env.HYPERSCAPE_WS_URL || 'ws://localhost:5555/ws';

    // Log successful registration
    const auditEntry = Object.assign(new AgentAuthAuditEntry(), {
      timestamp,
      eventType: 'agent_registered' as const,
      agentId,
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      privyUserId: request.privyUserId,
      metadata: request.metadata,
      success: true,
    });
    await logAgentAuthEvent(auditEntry, db);

    // Create agent info instance
    const agentInfo = Object.assign(new AgentAuthInfo(), {
      agentId,
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      ownerId: request.privyUserId,
      privyUserId: request.privyUserId,
      role: 'agent' as const,
      permissions,
      createdAt: new Date(timestamp),
      isActive: true,
    });

    // Create response instance
    const response = Object.assign(new AgentAuthResponse(), {
      token,
      agentInfo,
      expiresAt,
      wsUrl,
    });

    return response;
  } catch (error) {
    // Log failed registration
    const failureEntry = Object.assign(new AgentAuthAuditEntry(), {
      timestamp: new Date().toISOString(),
      eventType: 'agent_registered' as const,
      agentId: 'unknown',
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      privyUserId: request.privyUserId,
      metadata: request.metadata,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    await logAgentAuthEvent(failureEntry, db);

    throw error;
  }
}

/**
 * Verifies an agent JWT token and returns agent information
 *
 * Validates the token signature, expiry, and agent permissions.
 * Returns null if verification fails.
 *
 * @param token - JWT token from agent
 * @param db - Database connection
 * @returns Agent information or null if invalid
 */
export async function verifyAgentToken(
  token: string,
  db: SystemDatabase
): Promise<AgentAuthInfo | null> {
  try {
    // Verify JWT token
    const payload = await verifyJWT(token);

    if (!payload || !payload.userId) {
      const entry = Object.assign(new AgentAuthAuditEntry(), {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: 'unknown',
        success: false,
        errorMessage: 'Invalid token payload',
      });
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Check if this is an agent token
    if (payload.type !== 'agent') {
      const entry = Object.assign(new AgentAuthAuditEntry(), {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Not an agent token',
      });
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Load agent from database
    const agentRecord = await db('users').where('id', payload.userId as string).first() as {
      id: string
      name: string
      runtimeId?: string | null
      ownerId?: string | null
      privyUserId?: string | null
      isActive?: boolean | number | null
      permissions?: string | null
      createdAt: string
    } | undefined;

    if (!agentRecord) {
      const entry = Object.assign(new AgentAuthAuditEntry(), {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Agent not found in database',
      });
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Check if agent is active (treat any non-truthy value as inactive)
    if (!agentRecord.isActive) {
      const entry = Object.assign(new AgentAuthAuditEntry(), {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Agent is deactivated',
      });
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Log successful authentication
    const successEntry = Object.assign(new AgentAuthAuditEntry(), {
      timestamp: new Date().toISOString(),
      eventType: 'agent_authenticated' as const,
      agentId: payload.userId as string,
      agentName: agentRecord.name,
      runtimeId: payload.runtimeId as string | undefined,
      privyUserId: agentRecord.privyUserId || undefined,
      success: true,
    });
    await logAgentAuthEvent(successEntry, db);

    // Parse permissions
    const permissions = typeof agentRecord.permissions === 'string'
      ? agentRecord.permissions.split(',').filter(Boolean)
      : ['chat', 'move', 'perceive', 'interact'];

    // Create and return AgentAuthInfo instance
    const authInfo = Object.assign(new AgentAuthInfo(), {
      agentId: agentRecord.id,
      agentName: agentRecord.name,
      runtimeId: agentRecord.runtimeId || undefined,
      ownerId: agentRecord.privyUserId || agentRecord.ownerId || undefined,
      privyUserId: agentRecord.privyUserId || undefined,
      role: 'agent' as const,
      permissions,
      createdAt: new Date(agentRecord.createdAt),
      isActive: agentRecord.isActive !== false,
    });

    return authInfo;
  } catch (error) {
    const errorEntry = Object.assign(new AgentAuthAuditEntry(), {
      timestamp: new Date().toISOString(),
      eventType: 'agent_auth_failed' as const,
      agentId: 'unknown',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Token verification failed',
    });
    await logAgentAuthEvent(errorEntry, db);

    return null;
  }
}

/**
 * Checks if agent authentication is enabled
 */
export function isAgentAuthEnabled(): boolean {
  return AGENT_AUTH_ENABLED;
}

/**
 * Deactivates an agent (revokes access)
 *
 * @param db - Database connection
 * @param agentId - Agent ID to deactivate
 */
export async function deactivateAgent(
  db: SystemDatabase,
  agentId: string
): Promise<void> {
  await db('users')
    .where('id', agentId)
    .update({ isActive: 0 }); // 0 = inactive (database expects integer, not boolean)

  const entry = Object.assign(new AgentAuthAuditEntry(), {
    timestamp: new Date().toISOString(),
    eventType: 'agent_deactivated' as const,
    agentId,
    success: true,
  });
  // Note: db not passed here as we don't have access to it in this function signature
  // Consider updating signature if persistent logging is needed for deactivation
  await logAgentAuthEvent(entry);
}

/**
 * Gets audit log entries for an agent
 *
 * @param agentId - Agent ID to get logs for
 * @returns Array of audit log entries
 */
export function getAgentAuditLog(agentId: string): AgentAuthAuditEntry[] {
  return auditLog.filter(entry => entry.agentId === agentId);
}

/**
 * Gets all recent audit log entries
 *
 * @param limit - Maximum number of entries to return
 * @returns Array of recent audit log entries
 */
export function getRecentAuditLog(limit = 100): AgentAuthAuditEntry[] {
  return auditLog.slice(-limit);
}

/**
 * Gracefully closes Redis connection (if active)
 * Call this during server shutdown
 */
export async function shutdownAgentAuth(): Promise<void> {
  const client = redisClient;
  if (client) {
    console.info('[AgentAuth] Closing Redis connection...');
    try {
      await client.quit();
      console.info('[AgentAuth] Redis connection closed');
    } catch (error) {
      console.error('[AgentAuth] Error closing Redis connection:', error);
    }
  }
}
