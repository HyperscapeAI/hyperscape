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
import { elizaLogger } from '@elizaos/core';
import { z } from 'zod';

/**
 * Agent token expiry time in seconds (5 minutes for enhanced security)
 * Valid range: 60-86400 seconds (1 minute to 24 hours)
 */
const AGENT_TOKEN_EXPIRY = (() => {
  const value = parseInt(process.env.AGENT_TOKEN_EXPIRY || '300', 10);
  if (value < 60 || value > 86400) {
    elizaLogger.warn(`[AgentAuth] Invalid AGENT_TOKEN_EXPIRY: ${value}. Must be between 60 and 86400. Using default: 300`);
    return 300;
  }
  return value;
})();

/**
 * Check if agent authentication is enabled
 */
const AGENT_AUTH_ENABLED = process.env.AGENT_AUTH_ENABLED !== 'false';

/**
 * Canonical list of allowed permissions for agents
 *
 * This is the authoritative list of valid permissions that can be granted to agents.
 * Any requested permissions not in this list will be rejected.
 */
const ALLOWED_AGENT_PERMISSIONS = [
  'chat',
  'move',
  'perceive',
  'interact',
  'trade',
  'craft',
  'attack',
  'build',
] as const;

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
          elizaLogger.error('[AgentAuth] Redis connection failed after 3 retries. Falling back to in-memory rate limiting.');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000); // Exponential backoff
      },
    });

    redisClient.on('error', (err) => {
      elizaLogger.error('[AgentAuth] Redis error:', err.message);
    });

    redisClient.on('connect', () => {
      elizaLogger.info('[AgentAuth] Redis connected - using distributed rate limiting');
    });
  } catch (error) {
    elizaLogger.error('[AgentAuth] Failed to initialize Redis:', error);
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
const agentRegistrationLimiter = (() => {
  const points = parseInt(process.env.AGENT_REGISTRATION_LIMIT || '10', 10);
  const duration = parseInt(process.env.AGENT_REGISTRATION_WINDOW || '900', 10);

  if (points <= 0) {
    elizaLogger.warn(`[AgentAuth] Invalid AGENT_REGISTRATION_LIMIT: ${points}. Must be > 0. Using default: 10`);
  }
  if (duration <= 0) {
    elizaLogger.warn(`[AgentAuth] Invalid AGENT_REGISTRATION_WINDOW: ${duration}. Must be > 0. Using default: 900`);
  }

  const validPoints = points > 0 ? points : 10;
  const validDuration = duration > 0 ? duration : 900;

  elizaLogger.info(`[AgentAuth] Rate limiting configuration - Points: ${validPoints}, Duration: ${validDuration}s`);
  elizaLogger.debug(`[AgentAuth] Using ${redisClient ? 'Redis-backed distributed' : 'in-memory'} rate limiting`);

  return redisClient
    ? new RateLimiterRedis({
        storeClient: redisClient,
        points: validPoints,
        duration: validDuration,
        keyPrefix: 'agent_reg_limit',
      })
    : new RateLimiterMemory({
        points: validPoints,
        duration: validDuration,
      });
})();

// Enforce Redis requirement in production (unless explicitly opted out)
if (!redisClient && process.env.NODE_ENV === 'production') {
  const allowInMemory = process.env.ALLOW_IN_MEMORY_RATE_LIMIT === 'true';

  if (!allowInMemory) {
    // Redis is required for production - throw error
    elizaLogger.error(
      '[AgentAuth] Redis is required for production deployments. ' +
      'In-memory rate limiting does NOT work correctly with multiple server instances. ' +
      'Each instance has its own rate limit counter, allowing attackers to bypass limits.'
    );
    throw new Error(
      'Redis required for production. Set REDIS_URL environment variable. ' +
      'Example: REDIS_URL=redis://localhost:6379 ' +
      'To override this check (UNSAFE for multi-instance), set ALLOW_IN_MEMORY_RATE_LIMIT=true'
    );
  }

  // User explicitly opted in to unsafe in-memory rate limiting
  elizaLogger.warn(
    '⚠️  [AgentAuth] UNSAFE: Using in-memory rate limiting in production! ' +
    'This is NOT secure for multi-instance deployments. ' +
    'Rate limits can be bypassed by distributing requests across instances. ' +
    'Set REDIS_URL environment variable to enable distributed rate limiting.'
  );
}

/**
 * Agent authentication information
 */
export interface AgentAuthInfo {
  /** Unique agent ID */
  agentId: string;

  /** Agent display name */
  agentName: string;

  /** ElizaOS runtime ID (if applicable) */
  runtimeId?: string;

  /** User ID that owns this agent (if applicable) */
  ownerId?: string;

  /** Privy user ID of owner (if applicable) */
  privyUserId?: string;

  /** Agent role (default: 'agent') */
  role: 'agent' | 'autonomous_agent' | 'npc' | 'bot';

  /** Allowed permissions */
  permissions: string[];

  /** Creation timestamp */
  createdAt: Date;

  /** Whether this agent is active */
  isActive: boolean;
}

/**
 * Agent metadata for audit trail
 */
export interface AgentMetadata {
  ipAddress?: string;
  userAgent?: string;
  version?: string;
}

/**
 * Agent authentication request
 */
export interface AgentAuthRequest {
  /** Agent name */
  agentName: string;

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
export interface AgentAuthResponse {
  /** JWT token for WebSocket connection */
  token: string;

  /** Agent identity info */
  agentInfo: AgentAuthInfo;

  /** Token expiry time (ISO string) */
  expiresAt: string;

  /** WebSocket URL to connect to */
  wsUrl: string;
}

/**
 * Audit log entry for agent authentication events
 */
export interface AgentAuthAuditEntry {
  timestamp: string;
  eventType: 'agent_registered' | 'agent_authenticated' | 'agent_token_refreshed' | 'agent_deactivated' | 'agent_auth_failed';
  agentId: string;
  agentName?: string;
  runtimeId?: string;
  ownerId?: string;
  privyUserId?: string;
  metadata?: Record<string, string | number | boolean>;
  success: boolean;
  errorMessage?: string;
}

/**
 * In-memory audit log (for quick access to recent entries)
 * NOTE: Also persisted to database for durability
 */
const auditLog: AgentAuthAuditEntry[] = [];

/**
 * Helper function to compute effective permissions from existing agent record
 *
 * Filters both existing and requested permissions against the canonical allowed list,
 * then computes the intersection. Falls back to defaults if no valid permissions remain.
 *
 * @param rawExistingPermissions - Permissions from database (may be invalid/outdated)
 * @param requestedPermissions - Newly requested permissions (may be invalid)
 * @param defaultPermissions - Default permissions to use as fallback
 * @returns Array of valid permissions to grant
 */
function computeExistingPermissions(
  rawExistingPermissions: string[],
  requestedPermissions: string[] | undefined,
  defaultPermissions: string[]
): string[] {
  // Filter existing permissions against canonical allowed list
  const validExistingPermissions = rawExistingPermissions.filter(
    (perm) => ALLOWED_AGENT_PERMISSIONS.includes(perm as typeof ALLOWED_AGENT_PERMISSIONS[number])
  );

  // Filter requested permissions against canonical allowed list
  const requestedPerms = requestedPermissions || defaultPermissions;
  const validRequestedPermissions = requestedPerms.filter(
    (perm) => ALLOWED_AGENT_PERMISSIONS.includes(perm as typeof ALLOWED_AGENT_PERMISSIONS[number])
  );

  // Use intersection of valid existing and valid requested permissions
  if (validExistingPermissions.length > 0) {
    const intersection = validExistingPermissions.filter((perm) => validRequestedPermissions.includes(perm));
    if (intersection.length > 0) {
      return intersection;
    }
  }

  // If no valid existing permissions or no intersection, use valid requested permissions
  if (validRequestedPermissions.length > 0) {
    return validRequestedPermissions;
  }

  // Fall back to defaults if nothing else works
  return defaultPermissions;
}

/**
 * Logs an agent authentication event to both memory and persistent storage
 */
async function logAgentAuthEvent(entry: AgentAuthAuditEntry, db?: SystemDatabase): Promise<void> {
  // Add to in-memory cache
  auditLog.push(entry);

  // Also log for debugging (without PII)
  // Note: Full metadata including IP addresses is persisted to database but excluded from logs to prevent PII exposure
  if (entry.success) {
    elizaLogger.info(`[AgentAuth] ${entry.eventType}:`, {
      agentId: entry.agentId,
      success: entry.success,
    });
  } else {
    elizaLogger.warn(`[AgentAuth] ${entry.eventType}:`, {
      agentId: entry.agentId,
      success: entry.success,
    });
  }

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
      elizaLogger.error('[AgentAuth] Failed to persist audit log:', error);
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
  const rateLimitKey = request.metadata?.ipAddress || request.runtimeId;
  if (!rateLimitKey) {
    throw new Error('Agent registration requires either IP address or runtime ID for rate limiting');
  }

  try {
    await agentRegistrationLimiter.consume(rateLimitKey);
  } catch (rateLimiterError) {
    // Rate limit exceeded
    const errorEntry: AgentAuthAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'agent_registered' as const,
      agentId: 'rate_limited',
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      metadata: request.metadata,
      success: false,
      errorMessage: 'Rate limit exceeded for agent registration',
    };
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
        // Check if agent is active (treat false, 0, or null as inactive)
        const isActive = existing.isActive === true || existing.isActive === 1;
        if (!isActive) {
          throw new Error('Agent is deactivated and cannot be reused');
        }

        // Ownership validation logic:
        // - If existing agent has privyUserId set, require ownership match
        // - If existing agent has no privyUserId but request has one, allow claiming
        // - If request has no privyUserId but existing has one, reject reuse
        const existingOwner = existing.privyUserId;
        const requestOwner = request.privyUserId;

        if (existingOwner && requestOwner && existingOwner !== requestOwner) {
          // Agent belongs to a different user - reject
          throw new Error('Agent belongs to different user');
        }

        if (!requestOwner && existingOwner) {
          // Anonymous request trying to reuse an owned agent - reject
          throw new Error('Cannot reuse owned agent without authentication');
        }

        // If agent has no owner and request has owner, claim it
        if (!existingOwner && requestOwner) {
          elizaLogger.info(`[AgentAuth] Claiming unclaimed agent ${existing.id} for user ${requestOwner}`);
          // Update ownership in database
          await db('users')
            .where('id', existing.id)
            .update({
              privyUserId: requestOwner,
              ownerId: requestOwner,
            });
          // Update existing record for response
          existing.privyUserId = requestOwner;
          existing.ownerId = requestOwner;
        }

        elizaLogger.info(`[AgentAuth] Found existing agent for runtimeId ${request.runtimeId}, reusing: ${existing.id}`);

        // Parse existing permissions (handle both JSON array and comma-separated string for backward compatibility)
        const rawExistingPermissions = (() => {
          if (!existing.permissions) return [];

          // Try parsing as JSON first
          try {
            const parsed = JSON.parse(existing.permissions);
            if (Array.isArray(parsed)) return parsed as string[];
          } catch {
            // Fall back to comma-separated string
          }

          // Handle comma-separated string
          if (typeof existing.permissions === 'string') {
            return existing.permissions.split(',').filter(Boolean);
          }

          return [];
        })();

        // Compute effective permissions using helper function
        const existingPermissions = computeExistingPermissions(
          rawExistingPermissions,
          request.requestedPermissions,
          permissions
        );

        // Generate new token for existing agent
        const token = await createJWT(
          {
            userId: existing.id,
            type: 'agent',
            runtimeId: request.runtimeId,
            permissions: existingPermissions,
          },
          AGENT_TOKEN_EXPIRY
        );

        const expiresAt = new Date(Date.now() + AGENT_TOKEN_EXPIRY * 1000).toISOString();
        const wsUrl = process.env.HYPERSCAPE_WS_URL || 'ws://localhost:5555/ws';

        const agentInfo: AgentAuthInfo = {
          agentId: existing.id,
          agentName: existing.name,
          runtimeId: existing.runtimeId || undefined,
          ownerId: existing.privyUserId || existing.ownerId || undefined,
          privyUserId: existing.privyUserId || undefined,
          role: 'agent' as const,
          permissions: existingPermissions,
          createdAt: new Date(existing.createdAt),
          isActive: existing.isActive !== false,
        };

        const response: AgentAuthResponse = {
          token,
          agentInfo,
          expiresAt,
          wsUrl,
        };

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
      ownerId: request.privyUserId || null, // Set owner to the privy user creating this agent
      privyUserId: request.privyUserId || null, // Also set privyUserId for the agent itself
      isActive: true,
      permissions: JSON.stringify(permissions),
    };

    // Use UPSERT to handle race conditions where agent might already exist
    // ON CONFLICT will update the existing record instead of failing
    await db('users')
      .insert(agentRecord)
      .onConflict('runtimeId')
      .merge({
        ownerId: request.privyUserId || null,
        privyUserId: request.privyUserId || null,
        permissions: JSON.stringify(permissions),
        isActive: true
      });

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
    const auditEntry: AgentAuthAuditEntry = {
      timestamp,
      eventType: 'agent_registered' as const,
      agentId,
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      privyUserId: request.privyUserId,
      metadata: request.metadata,
      success: true,
    };
    await logAgentAuthEvent(auditEntry, db);

    // Create agent info instance
    const agentInfo: AgentAuthInfo = {
      agentId,
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      ownerId: request.privyUserId,
      privyUserId: request.privyUserId,
      role: 'agent' as const,
      permissions,
      createdAt: new Date(timestamp),
      isActive: true,
    };

    // Create response instance
    const response: AgentAuthResponse = {
      token,
      agentInfo,
      expiresAt,
      wsUrl,
    };

    return response;
  } catch (error) {
    // Log failed registration
    const failureEntry: AgentAuthAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'agent_registered' as const,
      agentId: 'unknown',
      agentName: request.agentName,
      runtimeId: request.runtimeId,
      privyUserId: request.privyUserId,
      metadata: request.metadata,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
    await logAgentAuthEvent(failureEntry, db);

    throw error;
  }
}

/**
 * Agent database record structure
 *
 * This interface defines the shape of agent data stored in the users table.
 * Agents have additional fields beyond regular users (runtimeId, ownerId, permissions, isActive).
 */
export interface AgentRecord {
  /** Unique agent identifier */
  agentId: string;
  /** ElizaOS runtime ID (nullable) */
  runtimeId: string | null;
  /** Owner's user ID (nullable) */
  ownerId: string | null;
  /** Privy user ID of owner (nullable) */
  privyUserId: string | null;
  /** Whether agent is active (boolean) */
  isActive: boolean | number | null;
  /** Permissions as JSON array string or comma-separated string (for backward compatibility) */
  permissions: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Zod schema for runtime validation of agent database records
 *
 * Validates that database records match expected structure before use.
 * Catches data corruption, schema mismatches, and type coercion issues.
 */
const AgentRecordSchema = z.object({
  /** Unique agent ID (required string) */
  id: z.string(),

  /** Agent display name (required string) */
  name: z.string(),

  /** ElizaOS runtime ID (nullable string) */
  runtimeId: z.string().nullable().optional(),

  /** Owner's user ID (nullable string) */
  ownerId: z.string().nullable().optional(),

  /** Privy user ID of owner (nullable string) */
  privyUserId: z.string().nullable().optional(),

  /** Whether agent is active (boolean, number, or null - handle database type variations) */
  isActive: z.union([z.boolean(), z.number(), z.null()]).optional(),

  /** Permissions string (nullable) */
  permissions: z.string().nullable().optional(),

  /** Creation timestamp (string or number) */
  createdAt: z.union([z.string(), z.number()]),
});

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
      const entry: AgentAuthAuditEntry = {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: 'unknown',
        success: false,
        errorMessage: 'Invalid token payload',
      };
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Check if this is an agent token
    if (payload.type !== 'agent') {
      const entry: AgentAuthAuditEntry = {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Not an agent token',
      };
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Load agent from database (raw, unvalidated row)
    const rawRow = await db('users').where('id', payload.userId as string).first();

    // Handle missing row case
    if (!rawRow) {
      const entry: AgentAuthAuditEntry = {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Agent not found in database',
      };
      await logAgentAuthEvent(entry, db);
      elizaLogger.warn('[AgentAuth] Agent record not found in database', {
        agentId: payload.userId,
      });
      return null;
    }

    // Runtime validation with Zod - catches data corruption and type mismatches
    const parseResult = AgentRecordSchema.safeParse(rawRow);

    if (!parseResult.success) {
      // Validation failed - log error and reject auth
      const entry: AgentAuthAuditEntry = {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Agent record failed validation',
      };
      await logAgentAuthEvent(entry, db);
      elizaLogger.error('[AgentAuth] Agent record validation failed', {
        agentId: payload.userId,
        errors: parseResult.error.errors,
      });
      return null;
    }

    // Use validated data
    const agentRecord = parseResult.data;

    // Check if agent is active (handle both boolean and integer types)
    if (agentRecord.isActive === false || agentRecord.isActive === 0 || agentRecord.isActive === null) {
      const entry: AgentAuthAuditEntry = {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Agent is deactivated',
      };
      await logAgentAuthEvent(entry, db);
      return null;
    }

    // Log successful authentication
    const successEntry: AgentAuthAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'agent_authenticated' as const,
      agentId: payload.userId as string,
      agentName: agentRecord.name,
      runtimeId: payload.runtimeId as string | undefined,
      privyUserId: agentRecord.privyUserId || undefined,
      success: true,
    };
    await logAgentAuthEvent(successEntry, db);

    // Parse permissions (handle both JSON array and comma-separated string for backward compatibility)
    const permissions = (() => {
      if (!agentRecord.permissions) return ['chat', 'move', 'perceive', 'interact'];

      // Try parsing as JSON first
      try {
        const parsed = JSON.parse(agentRecord.permissions);
        if (Array.isArray(parsed)) return parsed as string[];
      } catch {
        // Fall back to comma-separated string
      }

      // Handle comma-separated string
      if (typeof agentRecord.permissions === 'string') {
        return agentRecord.permissions.split(',').filter(Boolean);
      }

      return ['chat', 'move', 'perceive', 'interact'];
    })();

    // Create and return AgentAuthInfo instance
    const authInfo: AgentAuthInfo = {
      agentId: agentRecord.id,
      agentName: agentRecord.name,
      runtimeId: agentRecord.runtimeId ? agentRecord.runtimeId : undefined, // Convert null to undefined
      ownerId: agentRecord.privyUserId || agentRecord.ownerId || undefined,
      privyUserId: agentRecord.privyUserId || undefined,
      role: 'agent' as const,
      permissions,
      createdAt: new Date(agentRecord.createdAt),
      isActive: agentRecord.isActive !== false,
    };

    return authInfo;
  } catch (error) {
    const errorEntry: AgentAuthAuditEntry = {
      timestamp: new Date().toISOString(),
      eventType: 'agent_auth_failed' as const,
      agentId: 'unknown',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Token verification failed',
    };
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
    .update({ isActive: false });

  const entry: AgentAuthAuditEntry = {
    timestamp: new Date().toISOString(),
    eventType: 'agent_deactivated' as const,
    agentId,
    success: true,
  };
  await logAgentAuthEvent(entry, db);
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
 * @param limit - Maximum number of entries to return (1-1000, default 100)
 * @returns Array of recent audit log entries
 */
export function getRecentAuditLog(limit = 100): AgentAuthAuditEntry[] {
  // Clamp limit to valid range (1-1000) to prevent abuse
  const validatedLimit = Math.max(1, Math.min(limit, 1000));
  return auditLog.slice(-validatedLimit);
}

/**
 * Gracefully closes Redis connection (if active)
 * Call this during server shutdown
 */
export async function shutdownAgentAuth(): Promise<void> {
  const client = redisClient;
  if (client) {
    elizaLogger.info('[AgentAuth] Closing Redis connection...');
    try {
      await client.quit();
      elizaLogger.info('[AgentAuth] Redis connection closed');
    } catch (error) {
      elizaLogger.error('[AgentAuth] Error closing Redis connection:', error);
    }
  }
}
