import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { addHeader, logger } from "@elizaos/core";
import type { HyperscapeService } from "../service";

/**
 * Inventory State Provider
 *
 * Exposes current inventory status to the LLM for decision-making.
 * Enhanced with PlayerEventHandler for real-time change tracking.
 *
 * The LLM uses this context along with the character's personality to decide
 * when to bank items, drop items, manage inventory space, etc.
 *
 * This provider does NOT make decisions - it only provides context.
 * Decisions are made by the LLM based on character.json personality.
 *
 * **Enhancement**: Now tracks recent inventory changes, high-value items, and capacity trends.
 *
 * Example character reactions (defined in character.json):
 * - A methodical agent might go to bank when 80% full
 * - A careless agent might only bank when 100% full
 * - A greedy agent might drop low-value items to pick up high-value ones
 */
export const inventoryProvider: Provider = {
  name: "INVENTORY",
  description: "Current inventory status, capacity, and recent changes",
  dynamic: true,
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    const service = runtime.getService<HyperscapeService>("hyperscape");
    if (!service) {
      logger.debug("[INVENTORY_PROVIDER] No Hyperscape service found");
      return { text: "", data: {} };
    }

    const world = service.getWorld();
    if (!world) {
      logger.debug("[INVENTORY_PROVIDER] No world found");
      return { text: "", data: {} };
    }

    const player = world.entities.player;
    if (!player) {
      logger.debug("[INVENTORY_PROVIDER] No player entity found");
      return { text: "", data: {} };
    }

    // Get player event handler for change tracking
    const playerEventHandler = service.getPlayerEventHandler();

    // Get inventory system if available
    const inventorySystem = world.getSystem?.('inventory');

    // Gather inventory state
    const maxSlots = 28; // RuneScape-style inventory (from InventorySystem.ts)
    const playerInventory = inventorySystem
      ? (inventorySystem as any).getInventory?.(player.data.id)
      : null;

    const items = playerInventory?.items ?? [];
    const coins = playerInventory?.coins ?? 0;
    const slotsUsed = items.length;
    const slotsFree = maxSlots - slotsUsed;
    const capacityPercent = Math.round((slotsUsed / maxSlots) * 100);

    // Get cached inventory from event handler for change detection
    const playerId = player.data.id;
    const cachedInventory = playerEventHandler?.getInventory(playerId) ?? [];

    // Determine capacity status
    let capacityStatus = "empty";
    if (capacityPercent === 100) capacityStatus = "full";
    else if (capacityPercent >= 90) capacityStatus = "nearly full";
    else if (capacityPercent >= 70) capacityStatus = "mostly full";
    else if (capacityPercent >= 40) capacityStatus = "half full";
    else if (capacityPercent > 0) capacityStatus = "has items";

    // Format item list (top 10 items by stack size)
    const sortedItems = [...items]
      .sort((a, b) => (b.quantity || 1) - (a.quantity || 1))
      .slice(0, 10);

    const itemList = sortedItems.length > 0
      ? sortedItems.map(item => `  - ${item.itemId} x${item.quantity || 1}`).join("\n")
      : "  (empty)";

    // Detect recent changes by comparing with cached inventory
    const recentChanges: string[] = [];
    if (cachedInventory.length > 0) {
      // Build maps for comparison
      const currentMap = new Map<string, number>(items.map(i => [i.itemId, i.quantity || 1]));
      const cachedMap = new Map<string, number>(cachedInventory.map(i => [i.itemId, i.quantity]));

      // Find added/increased items
      for (const [itemId, quantity] of currentMap.entries()) {
        const oldQuantity: number = cachedMap.get(itemId) ?? 0;
        if (quantity > oldQuantity) {
          const diff: number = quantity - oldQuantity;
          recentChanges.push(`+${diff} ${itemId}`);
        }
      }

      // Find removed/decreased items
      for (const [itemId, quantity] of cachedMap.entries()) {
        const newQuantity: number = currentMap.get(itemId) ?? 0;
        if (newQuantity < quantity) {
          const diff: number = quantity - newQuantity;
          recentChanges.push(`-${diff} ${itemId}`);
        }
      }
    }

    const recentChangesText = recentChanges.length > 0
      ? `\n\n## Recent Changes\n${recentChanges.slice(0, 5).map(c => `  - ${c}`).join("\n")}`
      : "";

    // Format inventory context
    const capacityText = `CAPACITY: ${slotsUsed}/${maxSlots} slots (${capacityPercent}% - ${capacityStatus})`;
    const coinsText = `COINS: ${coins.toLocaleString()} gp`;
    const itemsText = `ITEMS:\n${itemList}`;

    const inventoryAdvice = capacityPercent >= 90
      ? "\n\n⚠️ WARNING: Inventory is nearly full. Consider banking items or dropping unwanted items."
      : capacityPercent >= 70
      ? "\n\n📝 NOTE: Inventory is getting full. May want to bank soon."
      : "";

    const text = addHeader(
      "# Inventory Status",
      [capacityText, coinsText, itemsText, recentChangesText, inventoryAdvice].filter(Boolean).join("\n")
    );

    return {
      text,
      values: {
        inventoryStatus: text,
        capacityPercent,
        slotsUsed,
        isFull: slotsUsed >= maxSlots,
        recentChangesCount: recentChanges.length,
        success: true,
      },
      data: {
        slotsUsed,
        slotsFree,
        maxSlots,
        capacityPercent,
        capacityStatus,
        coins,
        itemCount: items.length,
        isFull: slotsUsed >= maxSlots,
        isNearlyFull: capacityPercent >= 90,
        recentChanges,
        items: items.map(item => ({
          id: item.itemId,
          quantity: item.quantity || 1,
        })),
      },
    };
  },
};
