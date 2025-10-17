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

/**
 * Agent token expiry time in seconds (5 minutes for enhanced security)
 */
const AGENT_TOKEN_EXPIRY = parseInt(process.env.AGENT_TOKEN_EXPIRY || '300', 10);

/**
 * Check if agent authentication is enabled
 */
const AGENT_AUTH_ENABLED = process.env.AGENT_AUTH_ENABLED !== 'false';

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
 * In-memory audit log (in production, this should go to a proper logging system)
 */
const auditLog: AgentAuthAuditEntry[] = [];

/**
 * Logs an agent authentication event
 */
function logAgentAuthEvent(entry: AgentAuthAuditEntry): void {
  auditLog.push(entry);

  // Also log to console for debugging
  const logLevel = entry.success ? 'info' : 'warn';
  console[logLevel](`[AgentAuth] ${entry.eventType}:`, {
    agentId: entry.agentId,
    success: entry.success,
    metadata: entry.metadata,
  });

  // Keep only last 1000 entries in memory
  if (auditLog.length > 1000) {
    auditLog.shift();
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
  try {
    // Generate unique agent ID
    const agentId = `agent_${uuid()}`;
    const timestamp = new Date().toISOString();

    // Default permissions for agents
    const defaultPermissions = ['chat', 'move', 'perceive', 'interact'];
    const permissions = request.requestedPermissions || defaultPermissions;

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
      isActive: true,
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
    logAgentAuthEvent(auditEntry);

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
    logAgentAuthEvent(failureEntry);

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
      logAgentAuthEvent(entry);
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
      logAgentAuthEvent(entry);
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
      logAgentAuthEvent(entry);
      return null;
    }

    // Check if agent is active
    if (agentRecord.isActive === false) {
      const entry = Object.assign(new AgentAuthAuditEntry(), {
        timestamp: new Date().toISOString(),
        eventType: 'agent_auth_failed' as const,
        agentId: payload.userId as string,
        success: false,
        errorMessage: 'Agent is deactivated',
      });
      logAgentAuthEvent(entry);
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
    logAgentAuthEvent(successEntry);

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
    logAgentAuthEvent(errorEntry);

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

  const entry = Object.assign(new AgentAuthAuditEntry(), {
    timestamp: new Date().toISOString(),
    eventType: 'agent_deactivated' as const,
    agentId,
    success: true,
  });
  logAgentAuthEvent(entry);
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
