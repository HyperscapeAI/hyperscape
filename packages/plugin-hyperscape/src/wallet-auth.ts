/**
 * Wallet-Based Agent Authentication
 *
 * This module enables ElizaOS agents to authenticate using their character's
 * embedded wallet. Each agent has its own wallet for independent on-chain identity.
 *
 * **Architecture**:
 * - Each character/agent has a Privy embedded wallet
 * - Wallet address serves as agent's on-chain identity
 * - User maintains custody through master Privy account
 * - Agent challenge tokens provide READ-ONLY wallet access
 *
 * **Agent Challenge Flow Integration**:
 * 1. User generates challenge code (authenticated via Privy)
 * 2. User gives challenge code to agent
 * 3. Agent exchanges challenge for scoped JWT token
 * 4. Token includes userId but NO wallet/financial permissions
 * 5. Agent can connect to game and see wallet address
 * 6. Agent CANNOT sign transactions or access funds
 *
 * **Security Model**:
 * - Agent tokens have 'no_wallet_access' restriction
 * - Agent can READ wallet address and balance
 * - Agent CANNOT sign transactions or transfer funds
 * - Wallet operations require separate Privy user authentication
 * - Keys never exposed to agents
 *
 * **Use Cases (Read-Only)**:
 * - Agent displays its wallet address in logs
 * - Agent queries blockchain for balance (via RPC)
 * - Agent verifies its on-chain identity
 * - Agent shows NFT ownership (read-only)
 *
 * **Future: Scoped Wallet Operations** (requires enhancement):
 * - Policy-based transaction limits
 * - Time-locked wallet access
 * - Multi-sig approval workflows
 * - Session-based signing keys
 *
 * **Integration with HyperscapeService**:
 * - Service queries database for character wallet (read-only)
 * - Includes wallet address in agent context
 * - Agent can display wallet info but not sign
 * - Signing requires user Privy authentication
 */

import type { IAgentRuntime } from "@elizaos/core";

/**
 * Character wallet information for agent authentication
 */
export interface AgentWalletInfo {
  /** Character/agent ID */
  characterId: string;
  /** Character name */
  characterName: string;
  /** User's account ID */
  accountId: string;
  /** Wallet details */
  wallet: {
    /** Blockchain address */
    address: string;
    /** Privy wallet ID */
    id: string;
    /** Chain type (ethereum, solana, etc.) */
    chainType: string;
    /** HD wallet index */
    hdIndex?: number;
    /** Additional metadata (policies, signers) */
    metadata?: {
      policyIds?: string[];
      additionalSigners?: Array<{
        signerId: string;
        overridePolicyIds?: string[];
      }>;
      isSmartWallet?: boolean;
    };
  };
}

/**
 * Wallet authentication options for agent connection
 */
export interface WalletAuthOptions {
  /** Character ID to authenticate with */
  characterId: string;
  /** Include wallet in connection handshake */
  includeWallet?: boolean;
  /** Agent JWT token (from challenge exchange) */
  agentToken?: string;
  /** Chain to use for operations (if multiple chains) */
  preferredChain?: string;
  /** Read-only mode (default for agent tokens) */
  readOnly?: boolean;
}

/**
 * Fetch character wallet info from server
 *
 * This queries the server's database for the character's wallet details.
 * The server must implement the /api/character/:id/wallet endpoint.
 *
 * @param wsUrl - WebSocket server URL
 * @param characterId - Character to fetch wallet for
 * @param authToken - Authentication token
 * @returns Wallet info or null if not found
 */
export async function fetchCharacterWallet(
  wsUrl: string,
  characterId: string,
  authToken: string,
): Promise<AgentWalletInfo | null> {
  try {
    // Convert ws://... to http://...
    const httpUrl = wsUrl.replace(/^wss?:\/\//, "http://");
    const apiUrl = `${httpUrl}/api/character/${characterId}/wallet`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(
          `Character ${characterId} does not have a wallet configured`,
        );
        return null;
      }
      throw new Error(
        `Failed to fetch wallet: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data as AgentWalletInfo;
  } catch (error) {
    console.error("Error fetching character wallet:", error);
    return null;
  }
}

/**
 * Create wallet-authenticated connection options
 *
 * This prepares connection parameters that include wallet authentication.
 * The wallet address is included in the handshake for server verification.
 *
 * @param options - Wallet auth options
 * @param walletInfo - Fetched wallet info
 * @returns Enhanced connection options
 */
export function createWalletAuthConnection(
  options: WalletAuthOptions,
  walletInfo: AgentWalletInfo,
) {
  return {
    characterId: options.characterId,
    walletAddress: walletInfo.wallet.address,
    walletId: walletInfo.wallet.id,
    chainType: options.preferredChain || walletInfo.wallet.chainType,
    walletAuth: true,
    requestSigning: options.requestSigningAuth || false,
  };
}

/**
 * Generate wallet-signed authentication message
 *
 * This creates a message that can be signed by the agent's wallet
 * to prove ownership. The signature can be verified server-side.
 *
 * **Note**: Actual signing requires client-side Privy SDK integration.
 * This just generates the message format.
 *
 * @param walletAddress - Agent's wallet address
 * @param characterId - Character ID
 * @param timestamp - Current timestamp
 * @returns Message to sign
 */
export function createWalletAuthMessage(
  walletAddress: string,
  characterId: string,
  timestamp: number = Date.now(),
): string {
  return `Hyperscape Agent Authentication\n\nWallet: ${walletAddress}\nCharacter: ${characterId}\nTimestamp: ${timestamp}\n\nSign this message to authenticate your agent.`;
}

/**
 * Wallet auth state manager for agents
 *
 * Tracks wallet authentication state for an agent session.
 */
export class AgentWalletAuthManager {
  private walletInfo: AgentWalletInfo | null = null;
  private authenticated: boolean = false;
  private lastAuthTime: number = 0;

  /**
   * Initialize wallet authentication
   *
   * @param runtime - ElizaOS runtime
   * @param characterId - Character to authenticate
   * @param wsUrl - Server URL
   * @param authToken - Auth token
   * @returns true if wallet loaded successfully
   */
  async initialize(
    runtime: IAgentRuntime,
    characterId: string,
    wsUrl: string,
    authToken: string,
  ): Promise<boolean> {
    console.log(`[WalletAuth] Initializing for character ${characterId}`);

    // Fetch wallet info
    this.walletInfo = await fetchCharacterWallet(
      wsUrl,
      characterId,
      authToken,
    );

    if (!this.walletInfo) {
      console.warn(
        `[WalletAuth] Character ${characterId} does not have a wallet`,
      );
      return false;
    }

    console.log(
      `[WalletAuth] Loaded wallet ${this.walletInfo.wallet.address} for ${this.walletInfo.characterName}`,
    );

    // Store wallet address in runtime for reference
    (runtime as unknown as Record<string, unknown>).walletAddress =
      this.walletInfo.wallet.address;
    (runtime as unknown as Record<string, unknown>).walletChainType =
      this.walletInfo.wallet.chainType;

    this.authenticated = true;
    this.lastAuthTime = Date.now();

    return true;
  }

  /**
   * Get wallet info
   */
  getWalletInfo(): AgentWalletInfo | null {
    return this.walletInfo;
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string | null {
    return this.walletInfo?.wallet.address || null;
  }

  /**
   * Get chain type
   */
  getChainType(): string | null {
    return this.walletInfo?.wallet.chainType || null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated && !!this.walletInfo;
  }

  /**
   * Get time since last auth
   */
  getTimeSinceAuth(): number {
    return Date.now() - this.lastAuthTime;
  }

  /**
   * Clear authentication state
   */
  clear(): void {
    this.walletInfo = null;
    this.authenticated = false;
    this.lastAuthTime = 0;
  }
}

/**
 * Example: Initialize agent with wallet authentication
 *
 * ```typescript
 * const walletAuth = new AgentWalletAuthManager();
 *
 * // Initialize during agent connection
 * const hasWallet = await walletAuth.initialize(
 *   runtime,
 *   characterId,
 *   wsUrl,
 *   authToken
 * );
 *
 * if (hasWallet) {
 *   console.log(`Agent wallet: ${walletAuth.getWalletAddress()}`);
 *
 *   // Include wallet in connection
 *   const walletInfo = walletAuth.getWalletInfo()!;
 *   const connectionOptions = createWalletAuthConnection(
 *     { characterId, includeWallet: true },
 *     walletInfo
 *   );
 * }
 * ```
 */
