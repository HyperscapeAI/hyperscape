/**
 * Character Wallet Integration Example
 *
 * This file demonstrates how to integrate Privy embedded wallet creation
 * into the character creation flow. Use this as a reference when implementing
 * wallet support in ServerNetwork or character creation routes.
 *
 * **Integration Points**:
 * 1. Character Creation - Generate wallet when character is created
 * 2. Character Selection - Load wallet info when character is selected
 * 3. Character Deletion - Clean up wallet when character is deleted
 * 4. Agent Authentication - Use wallet for agent identity
 *
 * **Prerequisites**:
 * - Privy credentials configured (PRIVY_APP_ID, PRIVY_APP_SECRET)
 * - Database migrated with wallet fields (run 0001_add_character_wallets.sql)
 * - Drizzle ORM set up with characters table
 */

import { eq, and, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema";
import {
  createCharacterWallet,
  getNextHdIndex,
  isWalletFeatureEnabled,
  getWalletInfoReadOnly,
  type ChainType,
} from "./privy-wallet-manager";

/**
 * Example 1: Create character with embedded wallet
 *
 * Call this when a user creates a new character. It will:
 * 1. Generate a unique character ID
 * 2. Create an embedded wallet for the character
 * 3. Insert character with wallet info into database
 *
 * @param db - Drizzle database instance
 * @param accountId - User's account ID (from Privy or users table)
 * @param privyUserId - User's Privy user ID
 * @param characterName - Name for the new character
 * @param chainType - Blockchain to use (default: ethereum)
 * @returns Created character with wallet info
 */
export async function createCharacterWithWallet(
  db: PostgresJsDatabase<typeof schema>,
  accountId: string,
  privyUserId: string,
  characterName: string,
  chainType: ChainType = "ethereum",
) {
  // Generate character ID
  const characterId = `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Get existing HD indices for this account to determine next index
  const existingCharacters = await db
    .select({ hdIndex: schema.characters.walletHdIndex })
    .from(schema.characters)
    .where(eq(schema.characters.accountId, accountId));

  const hdIndices = existingCharacters
    .map((c) => c.hdIndex)
    .filter((idx): idx is number => idx !== null);

  const nextHdIndex = getNextHdIndex(hdIndices);

  console.log(
    `Creating character ${characterName} with HD index ${nextHdIndex}`,
  );

  // Create embedded wallet via Privy (if enabled)
  let walletData = null;
  if (isWalletFeatureEnabled()) {
    try {
      walletData = await createCharacterWallet({
        privyUserId,
        characterId,
        chainType,
        hdIndex: nextHdIndex,
      });
      console.log(
        `✅ Created wallet ${walletData.walletAddress} for character ${characterName}`,
      );
    } catch (error) {
      console.error("Failed to create wallet for character:", error);
      // Continue without wallet - it can be created later
    }
  } else {
    console.log("⚠️ Privy not configured - character created without wallet");
  }

  // Insert character into database
  const [character] = await db
    .insert(schema.characters)
    .values({
      id: characterId,
      accountId,
      name: characterName,
      // Combat stats (default values)
      combatLevel: 1,
      attackLevel: 1,
      strengthLevel: 1,
      defenseLevel: 1,
      constitutionLevel: 10,
      rangedLevel: 1,
      // Gathering skills (default values)
      woodcuttingLevel: 1,
      fishingLevel: 1,
      firemakingLevel: 1,
      cookingLevel: 1,
      // Experience (default values)
      attackXp: 0,
      strengthXp: 0,
      defenseXp: 0,
      constitutionXp: 1154, // Level 10 constitution
      rangedXp: 0,
      woodcuttingXp: 0,
      fishingXp: 0,
      firemakingXp: 0,
      cookingXp: 0,
      // Status
      health: 100,
      maxHealth: 100,
      coins: 0,
      // Position (spawn point)
      positionX: 0,
      positionY: 10,
      positionZ: 0,
      // Timestamps
      createdAt: Date.now(),
      lastLogin: Date.now(),
      // Wallet info (if created)
      walletAddress: walletData?.walletAddress || null,
      walletId: walletData?.walletId || null,
      walletChainType: walletData?.chainType || chainType,
      walletHdIndex: walletData?.hdIndex || nextHdIndex,
      walletCreatedAt: walletData?.createdAt || null,
      walletMetadata: walletData?.metadata
        ? JSON.stringify(walletData.metadata)
        : null,
    })
    .returning();

  return character;
}

/**
 * Example 2: Load character with wallet info
 *
 * Call this when a user selects a character to play. It will:
 * 1. Query character from database
 * 2. Parse wallet metadata
 * 3. Return complete character data including wallet
 *
 * @param db - Drizzle database instance
 * @param characterId - Character ID to load
 * @param accountId - User's account ID (for security check)
 * @returns Character with parsed wallet data
 */
export async function loadCharacterWithWallet(
  db: PostgresJsDatabase<typeof schema>,
  characterId: string,
  accountId: string,
) {
  const [character] = await db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.id, characterId),
        eq(schema.characters.accountId, accountId),
      ),
    );

  if (!character) {
    throw new Error(`Character ${characterId} not found or not owned by user`);
  }

  // Parse wallet metadata
  const walletMetadata = character.walletMetadata
    ? JSON.parse(character.walletMetadata)
    : null;

  return {
    ...character,
    wallet: character.walletAddress
      ? {
          address: character.walletAddress,
          id: character.walletId,
          chainType: character.walletChainType,
          hdIndex: character.walletHdIndex,
          createdAt: character.walletCreatedAt,
          metadata: walletMetadata,
        }
      : null,
  };
}

/**
 * Example 3: List all characters for an account with wallet info
 *
 * Call this to show character selection screen. It will:
 * 1. Query all characters for the account
 * 2. Include basic wallet info (address, chain type)
 * 3. Return array sorted by last login
 *
 * @param db - Drizzle database instance
 * @param accountId - User's account ID
 * @returns Array of characters with wallet addresses
 */
export async function listCharactersWithWallets(
  db: PostgresJsDatabase<typeof schema>,
  accountId: string,
) {
  const characters = await db
    .select({
      id: schema.characters.id,
      name: schema.characters.name,
      combatLevel: schema.characters.combatLevel,
      createdAt: schema.characters.createdAt,
      lastLogin: schema.characters.lastLogin,
      walletAddress: schema.characters.walletAddress,
      walletChainType: schema.characters.walletChainType,
    })
    .from(schema.characters)
    .where(eq(schema.characters.accountId, accountId))
    .orderBy(schema.characters.lastLogin);

  return characters.map((char) => ({
    ...char,
    hasWallet: !!char.walletAddress,
  }));
}

/**
 * Example 4: Add wallet to existing character (retroactive)
 *
 * Call this to add a wallet to a character that was created before
 * wallet support was added. Useful for migrations.
 *
 * @param db - Drizzle database instance
 * @param characterId - Character to add wallet to
 * @param privyUserId - User's Privy ID
 * @param chainType - Blockchain to use
 * @returns Updated character
 */
export async function addWalletToExistingCharacter(
  db: PostgresJsDatabase<typeof schema>,
  characterId: string,
  privyUserId: string,
  chainType: ChainType = "ethereum",
) {
  // Load character
  const [character] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId));

  if (!character) {
    throw new Error(`Character ${characterId} not found`);
  }

  // Check if character already has wallet
  if (character.walletAddress) {
    console.log(
      `Character ${character.name} already has wallet ${character.walletAddress}`,
    );
    return character;
  }

  // Get existing HD indices for this account
  const existingCharacters = await db
    .select({ hdIndex: schema.characters.walletHdIndex })
    .from(schema.characters)
    .where(eq(schema.characters.accountId, character.accountId));

  const hdIndices = existingCharacters
    .map((c) => c.hdIndex)
    .filter((idx): idx is number => idx !== null);

  const nextHdIndex = getNextHdIndex(hdIndices);

  // Create wallet
  const walletData = await createCharacterWallet({
    privyUserId,
    characterId,
    chainType,
    hdIndex: nextHdIndex,
  });

  // Update character
  const [updated] = await db
    .update(schema.characters)
    .set({
      walletAddress: walletData.walletAddress,
      walletId: walletData.walletId,
      walletChainType: walletData.chainType,
      walletHdIndex: walletData.hdIndex,
      walletCreatedAt: walletData.createdAt,
      walletMetadata: JSON.stringify(walletData.metadata),
    })
    .where(eq(schema.characters.id, characterId))
    .returning();

  console.log(
    `✅ Added wallet ${walletData.walletAddress} to character ${character.name}`,
  );

  return updated;
}

/**
 * Example 5: Get wallet info for agent authentication
 *
 * Call this when an ElizaOS agent needs to authenticate with its character wallet.
 * Returns wallet details needed for signing transactions and proving identity.
 *
 * @param db - Drizzle database instance
 * @param characterId - Character/agent ID
 * @returns Wallet info for authentication
 */
export async function getCharacterWalletForAuth(
  db: PostgresJsDatabase<typeof schema>,
  characterId: string,
) {
  const [character] = await db
    .select({
      id: schema.characters.id,
      name: schema.characters.name,
      accountId: schema.characters.accountId,
      walletAddress: schema.characters.walletAddress,
      walletId: schema.characters.walletId,
      walletChainType: schema.characters.walletChainType,
      walletHdIndex: schema.characters.walletHdIndex,
      walletMetadata: schema.characters.walletMetadata,
    })
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId));

  if (!character) {
    throw new Error(`Character ${characterId} not found`);
  }

  if (!character.walletAddress) {
    throw new Error(`Character ${character.name} does not have a wallet`);
  }

  return {
    characterId: character.id,
    characterName: character.name,
    accountId: character.accountId,
    wallet: {
      address: character.walletAddress,
      id: character.walletId!,
      chainType: character.walletChainType!,
      hdIndex: character.walletHdIndex,
      metadata: character.walletMetadata
        ? JSON.parse(character.walletMetadata)
        : null,
    },
  };
}

/**
 * Example 6: Update character wallet metadata (policies, signers, etc.)
 *
 * Call this when wallet policies or signers change.
 *
 * @param db - Drizzle database instance
 * @param characterId - Character to update
 * @param metadata - New metadata object
 */
export async function updateCharacterWalletMetadata(
  db: PostgresJsDatabase<typeof schema>,
  characterId: string,
  metadata: Record<string, unknown>,
) {
  await db
    .update(schema.characters)
    .set({
      walletMetadata: JSON.stringify(metadata),
    })
    .where(eq(schema.characters.id, characterId));

  console.log(`Updated wallet metadata for character ${characterId}`);
}

/**
 * Example 7: Get character wallet info for agent (read-only)
 *
 * This is safe to call with agent JWT tokens since it only returns
 * public wallet information. No signing capabilities exposed.
 *
 * **Security Note**: This is designed for agent challenge tokens which
 * have 'no_wallet_access' restrictions. Agents can see their wallet
 * address but cannot sign transactions or access funds.
 *
 * Use cases:
 * - Agent displays its wallet address in logs
 * - Agent queries blockchain for balance (via RPC)
 * - Agent verifies its on-chain identity
 *
 * @param db - Drizzle database instance
 * @param characterId - Character/agent ID
 * @returns Read-only wallet info (address, chain, no keys)
 */
export async function getAgentWalletInfoReadOnly(
  db: PostgresJsDatabase<typeof schema>,
  characterId: string,
) {
  const [character] = await db
    .select({
      walletAddress: schema.characters.walletAddress,
      walletId: schema.characters.walletId,
      walletChainType: schema.characters.walletChainType,
      walletHdIndex: schema.characters.walletHdIndex,
    })
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId));

  if (!character || !character.walletAddress) {
    return null;
  }

  // Return ONLY public information - no private keys or signing
  return {
    address: character.walletAddress,
    chainType: character.walletChainType as ChainType,
    hdIndex: character.walletHdIndex,
    // Can be extended with:
    // - balance (query blockchain RPC)
    // - transaction history (query blockchain explorer API)
    // - NFT count (query NFT indexer)
  };
}

/**
 * Example 8: Batch create wallets for multiple characters
 *
 * Useful for migration or bulk operations. Creates wallets for all
 * characters of a user that don't have wallets yet.
 *
 * @param db - Drizzle database instance
 * @param accountId - User's account ID
 * @param privyUserId - User's Privy ID
 * @param chainType - Chain to use for all wallets
 * @returns Array of created wallet addresses
 */
export async function batchCreateWalletsForAccount(
  db: PostgresJsDatabase<typeof schema>,
  accountId: string,
  privyUserId: string,
  chainType: ChainType = "ethereum",
): Promise<string[]> {
  // Get all characters without wallets
  const charactersWithoutWallets = await db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.accountId, accountId),
        isNull(schema.characters.walletAddress),
      ),
    );

  if (charactersWithoutWallets.length === 0) {
    console.log(`No characters without wallets for account ${accountId}`);
    return [];
  }

  console.log(
    `Creating wallets for ${charactersWithoutWallets.length} characters...`,
  );

  const createdAddresses: string[] = [];

  for (const character of charactersWithoutWallets) {
    try {
      await addWalletToExistingCharacter(
        db,
        character.id,
        privyUserId,
        chainType,
      );

      // Re-query to get the wallet address
      const [updated] = await db
        .select({ walletAddress: schema.characters.walletAddress })
        .from(schema.characters)
        .where(eq(schema.characters.id, character.id));

      if (updated?.walletAddress) {
        createdAddresses.push(updated.walletAddress);
      }

      console.log(`✅ Created wallet for ${character.name}`);
    } catch (error) {
      console.error(`❌ Failed to create wallet for ${character.name}:`, error);
    }
  }

  console.log(
    `Batch wallet creation complete: ${createdAddresses.length}/${charactersWithoutWallets.length} successful`,
  );

  return createdAddresses;
}
