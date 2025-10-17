/**
 * Privy Wallet Manager - Character/Agent Embedded Wallet Management
 *
 * This module manages the creation and lifecycle of Privy embedded wallets
 * for characters/agents. Each character gets its own embedded wallet for
 * independent on-chain identity and autonomous economic activity.
 *
 * **Architecture**:
 * - One embedded wallet per character/agent
 * - Hierarchical deterministic (HD) wallets from user's master seed
 * - User maintains custody through Privy master account
 * - Wallets persist across sessions in characters table
 * - Integrated with agent challenge-response authentication
 *
 * **Agent Challenge Integration**:
 * - User generates challenge code (authenticated via Privy)
 * - Agent exchanges challenge for scoped JWT token
 * - Token includes userId but NO wallet/financial permissions
 * - Agent can play game but cannot access wallet funds
 * - Wallet operations require separate Privy authentication
 *
 * **Wallet Creation Methods**:
 * 1. Server-side: POST /v1/users/{user_id}/wallets (when user already exists)
 * 2. Client-side: useCreateWallet hook with createAdditional: true
 * 3. Character creation: Automatic wallet generation on character create
 *
 * **Features**:
 * - Multi-chain support (Ethereum, Solana, Bitcoin, etc.)
 * - HD wallet derivation for unlimited character wallets
 * - Policy enforcement and transaction controls
 * - Wallet metadata storage (policies, signers, etc.)
 * - Read-only access for agents (balance queries, address display)
 *
 * **Security**:
 * - Wallets use Shamir's Secret Sharing (2-of-2)
 * - Keys secured in Trusted Execution Environments (TEE)
 * - User authentication required for wallet operations
 * - Agent tokens explicitly DENY wallet/fund access
 * - <5ms signing with on-device key reconstruction
 *
 * **Referenced by**: ServerNetwork.ts, character creation handlers, agent auth
 */

import { PrivyClient } from "@privy-io/server-auth";

/**
 * Cached Privy client instance (singleton pattern)
 */
let privyClient: PrivyClient | null = null;

/**
 * Get or create the Privy client instance
 *
 * @returns Privy client instance or null if not configured
 */
function getPrivyClient(): PrivyClient | null {
  if (privyClient) {
    return privyClient;
  }

  const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    console.warn(
      "Privy credentials not configured. Wallet features will be disabled.",
    );
    return null;
  }

  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

/**
 * Chain types supported by Privy embedded wallets
 */
export type ChainType =
  | "ethereum"
  | "solana"
  | "bitcoin-segwit"
  | "cosmos"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base"
  | "zora";

/**
 * Wallet policy configuration
 */
export interface WalletPolicy {
  /** Policy ID from Privy dashboard */
  policyId: string;
  /** Policy description */
  description?: string;
}

/**
 * Additional signer configuration for multi-party wallets
 */
export interface AdditionalSigner {
  /** Signer ID (P-256 public key or user ID) */
  signerId: string;
  /** Override policy IDs for this signer */
  overridePolicyIds?: string[];
}

/**
 * Character wallet creation request
 */
export interface CreateCharacterWalletRequest {
  /** Privy user ID (from user's master account) */
  privyUserId: string;
  /** Character ID (for tracking) */
  characterId: string;
  /** Chain type (default: ethereum) */
  chainType?: ChainType;
  /** Create as smart wallet (account abstraction) */
  createSmartWallet?: boolean;
  /** Policy IDs to enforce on wallet (max 1) */
  policyIds?: string[];
  /** Additional signers for multi-party control */
  additionalSigners?: AdditionalSigner[];
  /** HD wallet index (optional, auto-increments if not specified) */
  hdIndex?: number;
}

/**
 * Created wallet information
 */
export interface CharacterWallet {
  /** Privy wallet ID (for API operations) */
  walletId: string;
  /** Blockchain address */
  walletAddress: string;
  /** Chain type */
  chainType: ChainType;
  /** HD wallet index */
  hdIndex?: number;
  /** Timestamp when created */
  createdAt: number;
  /** Associated character ID */
  characterId: string;
  /** Metadata (policies, signers, etc.) */
  metadata?: {
    policyIds?: string[];
    additionalSigners?: AdditionalSigner[];
    isSmartWallet?: boolean;
  };
}

/**
 * Create an embedded wallet for a character/agent
 *
 * This creates a new HD wallet for the character using Privy's API.
 * The wallet is derived from the user's master seed and stored in
 * the characters table for persistence.
 *
 * **Process**:
 * 1. Verify Privy client is configured
 * 2. Call Privy API to create wallet for user
 * 3. Extract wallet details (ID, address, chain)
 * 4. Return wallet info to persist in database
 *
 * **API Used**: POST /v1/users/{user_id}/wallets
 *
 * @param request - Wallet creation parameters
 * @returns Created wallet info or null if Privy not configured
 * @throws Error if wallet creation fails
 */
export async function createCharacterWallet(
  request: CreateCharacterWalletRequest,
): Promise<CharacterWallet | null> {
  const client = getPrivyClient();

  if (!client) {
    console.warn(
      "Privy not configured. Cannot create character wallet.",
    );
    return null;
  }

  try {
    // Prepare wallet creation request
    const walletConfig: Record<string, unknown> = {
      chain_type: request.chainType || "ethereum",
    };

    if (request.createSmartWallet) {
      walletConfig.create_smart_wallet = true;
    }

    if (request.policyIds && request.policyIds.length > 0) {
      // Privy currently supports max 1 policy per wallet
      walletConfig.policy_ids = request.policyIds.slice(0, 1);
    }

    if (request.additionalSigners && request.additionalSigners.length > 0) {
      walletConfig.additional_signers = request.additionalSigners.map(
        (signer) => ({
          signer_id: signer.signerId,
          ...(signer.overridePolicyIds && {
            override_policy_ids: signer.overridePolicyIds,
          }),
        }),
      );
    }

    // Call Privy API to create wallet
    // Note: The @privy-io/server-auth SDK doesn't expose wallet creation directly
    // We need to make HTTP request to Privy REST API
    const apiUrl = `https://api.privy.io/v1/users/${request.privyUserId}/wallets`;
    const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": appId!,
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        wallets: [walletConfig],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Privy API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();

    // Extract wallet info from response
    // Response contains updated user object with linked_accounts array
    // Find the newly created embedded wallet
    const user = data as Record<string, unknown>;
    const linkedAccounts = (user.linked_accounts || []) as Array<
      Record<string, unknown>
    >;

    const embeddedWallet = linkedAccounts
      .filter((account) => account.type === "wallet")
      .find((wallet) => wallet.wallet_client_type === "privy");

    if (!embeddedWallet) {
      throw new Error("Wallet created but not found in response");
    }

    const wallet: CharacterWallet = {
      walletId: embeddedWallet.wallet_id as string,
      walletAddress: embeddedWallet.address as string,
      chainType: (request.chainType || "ethereum") as ChainType,
      hdIndex: embeddedWallet.hd_index as number | undefined,
      createdAt: Date.now(),
      characterId: request.characterId,
      metadata: {
        policyIds: request.policyIds,
        additionalSigners: request.additionalSigners,
        isSmartWallet: request.createSmartWallet,
      },
    };

    console.log(
      `Created wallet ${wallet.walletAddress} for character ${request.characterId}`,
    );

    return wallet;
  } catch (error) {
    console.error("Failed to create character wallet:", error);
    throw error;
  }
}

/**
 * Get wallet information for a character
 *
 * This queries the Privy API to get current wallet state.
 * Useful for verifying wallet exists and checking balance/policies.
 *
 * @param walletId - Privy wallet ID
 * @returns Wallet info or null if not found
 */
export async function getCharacterWallet(
  walletId: string,
): Promise<CharacterWallet | null> {
  const client = getPrivyClient();

  if (!client) {
    return null;
  }

  try {
    // Note: @privy-io/server-auth doesn't expose direct wallet API
    // We'd need to make HTTP request to GET /v1/wallets/{wallet_id}
    const apiUrl = `https://api.privy.io/v1/wallets/${walletId}`;
    const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "privy-app-id": appId!,
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(
        `Privy API error: ${response.status} ${response.statusText}`,
      );
    }

    const wallet = (await response.json()) as Record<string, unknown>;

    return {
      walletId: wallet.id as string,
      walletAddress: wallet.address as string,
      chainType: wallet.chain_type as ChainType,
      hdIndex: wallet.hd_index as number | undefined,
      createdAt: wallet.created_at as number,
      characterId: "", // Not stored in Privy
      metadata: {
        policyIds: wallet.policy_ids as string[] | undefined,
        additionalSigners:
          (wallet.additional_signers as AdditionalSigner[] | undefined) || [],
      },
    };
  } catch (error) {
    console.error("Failed to get character wallet:", error);
    return null;
  }
}

/**
 * Delete a character's wallet
 *
 * This removes the wallet from Privy's system. Use with caution!
 * The wallet address will be permanently inaccessible.
 *
 * @param walletId - Privy wallet ID to delete
 * @returns true if deleted, false otherwise
 */
export async function deleteCharacterWallet(
  walletId: string,
): Promise<boolean> {
  const client = getPrivyClient();

  if (!client) {
    return false;
  }

  try {
    const apiUrl = `https://api.privy.io/v1/wallets/${walletId}`;
    const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        "privy-app-id": appId!,
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Privy API error: ${response.status} ${response.statusText}`,
      );
    }

    console.log(`Deleted wallet ${walletId}`);
    return true;
  } catch (error) {
    console.error("Failed to delete character wallet:", error);
    return false;
  }
}

/**
 * Check if Privy wallet features are enabled
 *
 * @returns true if Privy credentials are configured, false otherwise
 */
export function isWalletFeatureEnabled(): boolean {
  const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  return !!(appId && appSecret);
}

/**
 * Get the next available HD wallet index for a user
 *
 * This queries the database to find the highest HD index used
 * and returns the next available index.
 *
 * Note: This should be called from server code with database access.
 *
 * @param existingIndices - Array of existing HD indices (from database query)
 * @returns Next available HD index
 */
export function getNextHdIndex(existingIndices: number[]): number {
  if (existingIndices.length === 0) {
    return 0;
  }

  const maxIndex = Math.max(...existingIndices);
  return maxIndex + 1;
}

/**
 * Get wallet info for agent (read-only, no signing capabilities)
 *
 * This is safe to call with agent tokens since it only returns
 * public wallet information (address, chain type). No private
 * keys or signing capabilities are exposed.
 *
 * Use this for:
 * - Displaying wallet address in agent UI
 * - Checking wallet balance (via blockchain RPC)
 * - Verifying agent identity
 *
 * **Security**: Agent tokens have 'no_wallet_access' restriction,
 * meaning this is READ-ONLY. Agents cannot sign transactions.
 *
 * @param walletId - Privy wallet ID or address
 * @returns Public wallet info (address, chain, no keys)
 */
export async function getWalletInfoReadOnly(
  walletId: string,
): Promise<{
  address: string;
  chainType: ChainType;
  hdIndex?: number;
} | null> {
  const client = getPrivyClient();

  if (!client) {
    return null;
  }

  try {
    const wallet = await getCharacterWallet(walletId);

    if (!wallet) {
      return null;
    }

    // Return ONLY public info - no signing capabilities
    return {
      address: wallet.walletAddress,
      chainType: wallet.chainType,
      hdIndex: wallet.hdIndex,
    };
  } catch (error) {
    console.error("Failed to get wallet info:", error);
    return null;
  }
}
