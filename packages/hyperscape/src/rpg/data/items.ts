import type { RPGItem } from '../types'
import {
  EquipmentSlotName,
} from '../types/core'
import { ItemRarity } from '../types/entities'
import {
  AttackType,
  ItemRequirement,
  ItemType,
  WeaponType
} from '../types/index'

// Re-export types and enums for consumers
export type { RPGItem } from '../types'
export { AttackType, ItemType, WeaponType } from '../types/index'
export type { ItemRequirement } from '../types/index'

// Helper function to create RPGItem with sensible defaults
function createItem(partial: Partial<RPGItem> & Pick<RPGItem, 'id' | 'name' | 'type'>): RPGItem {
  const defaults: Omit<RPGItem, 'id' | 'name' | 'type'> = {
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 0,
    weight: 0.1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    description: `A ${partial.name?.toLowerCase() || 'item'}.`,
    examine: `This is a ${partial.name?.toLowerCase() || 'item'}.`,
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: `/assets/models/items/${partial.id || 'default'}.glb`,
    iconPath: `/icons/${partial.id || 'default'}.png`,
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: {
      attack: 0,
      defense: 0,
      ranged: 0,
      strength: 0
    },
    requirements: {
      level: 1,
      skills: {}
    }
  };

  return { ...defaults, ...partial };
}

// Specialized helper for weapons
function createWeapon(partial: Partial<RPGItem> & Pick<RPGItem, 'id' | 'name'> & { weaponType: WeaponType; attackType: AttackType }): RPGItem {
  return createItem({
    ...partial,
    type: ItemType.WEAPON,
    equipSlot: EquipmentSlotName.WEAPON,
    equipable: true,
    stackable: false,
    maxStackSize: 1,
    weight: 2.0,
    modelPath: `/assets/models/weapons/${partial.id}.glb`
  });
}

// RPG Item Database
export const RPG_ITEMS: Map<string, RPGItem> = new Map([
  // Currency
  ['coins', createItem({
    id: 'coins',
    name: 'Coins',
    description: 'The universal currency of Hyperia',
    type: ItemType.CURRENCY,
    stackable: true,
    maxStackSize: 2147483647,
    value: 1,
    weight: 0,
    examine: 'Gold coins used as currency throughout the realm.'
  })],

  // Weapons - Swords
  ['bronze_sword', createWeapon({
    id: 'bronze_sword',
    name: 'Bronze Sword',
    description: 'A basic sword made of bronze',
    weaponType: WeaponType.SWORD,
    attackType: AttackType.MELEE,
    value: 100,
    weight: 2,
    requirements: {
      level: 1,
      skills: { attack: 1 }
    },
    bonuses: {
      attack: 4,
      strength: 3,
      defense: 0,
      ranged: 0
    }
  })],

  ['steel_sword', createWeapon({
    id: 'steel_sword',
    name: 'Steel Sword',
    description: 'A sturdy sword made of steel',
    weaponType: WeaponType.SWORD,
    attackType: AttackType.MELEE,
    value: 500,
    weight: 3,
    requirements: {
      level: 10,
      skills: { attack: 10 }
    },
    bonuses: {
      attack: 12,
      strength: 10,
      defense: 0,
      ranged: 0
    }
  })],

  ['mithril_sword', {
    id: 'mithril_sword',
    name: 'Mithril Sword',
    description: 'A legendary sword made of mithril',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 2000,
    weight: 2,
    equipSlot: EquipmentSlotName.WEAPON,
    weaponType: WeaponType.SWORD,
    equipable: true,
    attackType: AttackType.MELEE,
    examine: 'This is a legendary sword made of mithril.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/mithril_sword.glb',
    iconPath: '/icons/mithril_sword.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 25, 
      strength: 22,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 20,
      skills: { attack: 20 } 
    }
  }],

  // Weapons - Bows
  ['wood_bow', {
    id: 'wood_bow',
    name: 'Wood Bow',
    description: 'A simple bow made of wood',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 80,
    weight: 1,
    equipSlot: EquipmentSlotName.WEAPON,
    weaponType: WeaponType.BOW,
    equipable: true,
    attackType: AttackType.RANGED,
    examine: 'This is a simple bow made of wood.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/wood_bow.glb',
    iconPath: '/icons/wood_bow.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 5 
    },
    requirements: { 
      level: 1,
      skills: { ranged: 1 } 
    }
  }],

  ['oak_bow', {
    id: 'oak_bow',
    name: 'Oak Bow',
    description: 'A sturdy bow made of oak',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 400,
    weight: 1,
    equipSlot: EquipmentSlotName.WEAPON,
    weaponType: WeaponType.BOW,
    equipable: true,
    attackType: AttackType.RANGED,
    examine: 'This is a sturdy bow made of oak.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/oak_bow.glb',
    iconPath: '/icons/oak_bow.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 15 
    },
    requirements: { 
      level: 10,
      skills: { ranged: 10 } 
    }
  }],

  ['willow_bow', {
    id: 'willow_bow',
    name: 'Willow Bow',
    description: 'A fine bow made of willow',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 1500,
    weight: 1,
    equipSlot: EquipmentSlotName.WEAPON,
    weaponType: WeaponType.BOW,
    equipable: true,
    attackType: AttackType.RANGED,
    examine: 'This is a fine bow made of willow.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/willow_bow.glb',
    iconPath: '/icons/willow_bow.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 30 
    },
    requirements: { 
      level: 20,
      skills: { ranged: 20 } 
    }
  }],

  // Shields
  ['bronze_shield', {
    id: 'bronze_shield',
    name: 'Bronze Shield',
    description: 'A basic shield made of bronze',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 80,
    weight: 3,
    equipSlot: EquipmentSlotName.SHIELD,
    weaponType: WeaponType.SHIELD,
    equipable: true,
    attackType: AttackType.MELEE,
    examine: 'This is a basic shield made of bronze.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/bronze_shield.glb',
    iconPath: '/icons/bronze_shield.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 5,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['steel_shield', {
    id: 'steel_shield',
    name: 'Steel Shield',
    description: 'A sturdy shield made of steel',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 400,
    weight: 4,
    equipSlot: EquipmentSlotName.SHIELD,
    weaponType: WeaponType.SHIELD,
    equipable: true,
    attackType: AttackType.MELEE,
    examine: 'This is a sturdy shield made of steel.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/steel_shield.glb',
    iconPath: '/icons/steel_shield.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 15,
      ranged: 0 
    },
    requirements: { 
      level: 10,
      skills: { defense: 10 } 
    }
  }],

  ['mithril_shield', {
    id: 'mithril_shield',
    name: 'Mithril Shield',
    description: 'A legendary shield made of mithril',
    type: ItemType.WEAPON,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 1800,
    weight: 3,
    equipSlot: EquipmentSlotName.SHIELD,
    weaponType: WeaponType.SHIELD,
    equipable: true,
    attackType: AttackType.MELEE,
    examine: 'This is a legendary shield made of mithril.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/weapons/mithril_shield.glb',
    iconPath: '/icons/mithril_shield.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 30,
      ranged: 0 
    },
    requirements: { 
      level: 20,
      skills: { defense: 20 } 
    }
  }],

  // Armor - Helmets
  ['bronze_helmet', {
    id: 'bronze_helmet',
    name: 'Bronze Helmet',
    description: 'A basic helmet made of bronze',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 60,
    weight: 2,
    equipSlot: EquipmentSlotName.HELMET,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is a basic helmet made of bronze.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/armor/bronze_helmet.glb',
    iconPath: '/icons/bronze_helmet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 3,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['steel_helmet', {
    id: 'steel_helmet',
    name: 'Steel Helmet',
    description: 'A sturdy helmet made of steel',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 300,
    weight: 3,
    equipSlot: EquipmentSlotName.HELMET,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is a sturdy helmet made of steel.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/armor/steel_helmet.glb',
    iconPath: '/icons/steel_helmet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 8,
      ranged: 0 
    },
    requirements: { 
      level: 10,
      skills: { defense: 10 } 
    }
  }],

  ['mithril_helmet', {
    id: 'mithril_helmet',
    name: 'Mithril Helmet',
    description: 'A legendary helmet made of mithril',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 1200,
    weight: 2,
    equipSlot: EquipmentSlotName.HELMET,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is a legendary helmet made of mithril.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/armor/mithril_helmet.glb',
    iconPath: '/icons/mithril_helmet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 18,
      ranged: 0 
    },
    requirements: { 
      level: 20,
      skills: { defense: 20 } 
    }
  }],

  // Armor - Body
  ['bronze_body', {
    id: 'bronze_body',
    name: 'Bronze Body',
    description: 'Basic body armor made of bronze',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 120,
    weight: 5,
    equipSlot: EquipmentSlotName.BODY,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is basic body armor made of bronze.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/armor/bronze_body.glb',
    iconPath: '/icons/bronze_body.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 6,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['steel_body', {
    id: 'steel_body',
    name: 'Steel Body',
    description: 'Sturdy body armor made of steel',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 600,
    weight: 7,
    equipSlot: EquipmentSlotName.BODY,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is sturdy body armor made of steel.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/armor/steel_body.glb',
    iconPath: '/icons/steel_body.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 16,
      ranged: 0 
    },
    requirements: { 
      level: 10,
      skills: { defense: 10 } 
    }
  }],

  ['mithril_body', {
    id: 'mithril_body',
    name: 'Mithril Body',
    description: 'Legendary body armor made of mithril',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 2400,
    weight: 5,
    equipSlot: EquipmentSlotName.BODY,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is legendary body armor made of mithril.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/mithril_body.glb',
    iconPath: '/icons/mithril_body.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 35,
      ranged: 0 
    },
    requirements: { 
      level: 20,
      skills: { defense: 20 } 
    }
  }],

  // Armor - Legs
  ['bronze_legs', {
    id: 'bronze_legs',
    name: 'Bronze Legs',
    description: 'Basic leg armor made of bronze',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 80,
    weight: 3,
    equipSlot: EquipmentSlotName.LEGS,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is basic leg armor made of bronze.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/bronze_legs.glb',
    iconPath: '/icons/bronze_legs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 4,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['steel_legs', {
    id: 'steel_legs',
    name: 'Steel Legs',
    description: 'Sturdy leg armor made of steel',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 400,
    weight: 4,
    equipSlot: EquipmentSlotName.LEGS,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is sturdy leg armor made of steel.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/steel_legs.glb',
    iconPath: '/icons/steel_legs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 12,
      ranged: 0 
    },
    requirements: { 
      level: 10,
      skills: { defense: 10 } 
    }
  }],

  ['mithril_legs', {
    id: 'mithril_legs',
    name: 'Mithril Legs',
    description: 'Legendary leg armor made of mithril',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 1600,
    weight: 3,
    equipSlot: EquipmentSlotName.LEGS,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is legendary leg armor made of mithril.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/mithril_legs.glb',
    iconPath: '/icons/mithril_legs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 25,
      ranged: 0 
    },
    requirements: { 
      level: 20,
      skills: { defense: 20 } 
    }
  }],

  // Leather Armor - Helmets
  ['leather_helmet', {
    id: 'leather_helmet',
    name: 'Leather Helmet',
    description: 'Basic helmet made of leather',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 20,
    weight: 1,
    equipSlot: EquipmentSlotName.HELMET,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is a basic helmet made of leather.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/leather_helmet.glb',
    iconPath: '/icons/leather_helmet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 1,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['hard_leather_helmet', {
    id: 'hard_leather_helmet',
    name: 'Hard Leather Helmet',
    description: 'Reinforced leather helmet',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 40,
    weight: 1.5,
    equipSlot: EquipmentSlotName.HELMET,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is a reinforced leather helmet.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/hard_leather_helmet.glb',
    iconPath: '/icons/hard_leather_helmet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 2,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['studded_leather_helmet', {
    id: 'studded_leather_helmet',
    name: 'Studded Leather Helmet',
    description: 'Leather helmet reinforced with metal studs',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 80,
    weight: 2,
    equipSlot: EquipmentSlotName.HELMET,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is a leather helmet reinforced with metal studs.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/studded_leather_helmet.glb',
    iconPath: '/icons/studded_leather_helmet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 3,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  // Leather Armor - Body
  ['leather_body', {
    id: 'leather_body',
    name: 'Leather Body',
    description: 'Basic body armor made of leather',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 40,
    weight: 3,
    equipSlot: EquipmentSlotName.BODY,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is basic body armor made of leather.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/leather_body.glb',
    iconPath: '/icons/leather_body.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 2,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['hard_leather_body', {
    id: 'hard_leather_body',
    name: 'Hard Leather Body',
    description: 'Reinforced leather body armor',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 80,
    weight: 4,
    equipSlot: EquipmentSlotName.BODY,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is reinforced leather body armor.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/hard_leather_body.glb',
    iconPath: '/icons/hard_leather_body.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 4,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['studded_leather_body', {
    id: 'studded_leather_body',
    name: 'Studded Leather Body',
    description: 'Leather body armor reinforced with metal studs',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 160,
    weight: 5,
    equipSlot: EquipmentSlotName.BODY,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is leather body armor reinforced with metal studs.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/studded_leather_body.glb',
    iconPath: '/icons/studded_leather_body.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 5,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  // Leather Armor - Legs
  ['leather_legs', {
    id: 'leather_legs',
    name: 'Leather Legs',
    description: 'Basic leg armor made of leather',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 30,
    weight: 2,
    equipSlot: EquipmentSlotName.LEGS,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is basic leg armor made of leather.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/leather_legs.glb',
    iconPath: '/icons/leather_legs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 1,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['hard_leather_legs', {
    id: 'hard_leather_legs',
    name: 'Hard Leather Legs',
    description: 'Reinforced leather leg armor',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 60,
    weight: 2.5,
    equipSlot: EquipmentSlotName.LEGS,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is reinforced leather leg armor.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/hard_leather_legs.glb',
    iconPath: '/icons/hard_leather_legs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 3,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  ['studded_leather_legs', {
    id: 'studded_leather_legs',
    name: 'Studded Leather Legs',
    description: 'Leather leg armor reinforced with metal studs',
    type: ItemType.ARMOR,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 120,
    weight: 3,
    equipSlot: EquipmentSlotName.LEGS,
    weaponType: null,
    equipable: true,
    attackType: null,
    examine: 'This is leather leg armor reinforced with metal studs.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/armor/studded_leather_legs.glb',
    iconPath: '/icons/studded_leather_legs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 4,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { defense: 1 } 
    }
  }],

  // Ammunition
  ['arrows', {
    id: 'arrows',
    name: 'Arrows',
    description: 'Basic arrows for bows',
    type: ItemType.MISC,
    quantity: 1,
    stackable: true,
    maxStackSize: 1000,
    value: 1,
    weight: 0.1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'These are basic arrows for bows.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/arrows/arrows.glb',
    iconPath: '/icons/arrows.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  // Tools
  ['bronze_hatchet', {
    id: 'bronze_hatchet',
    name: 'Bronze Hatchet',
    description: 'A basic hatchet for chopping trees',
    type: ItemType.TOOL,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 50,
    weight: 1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a basic hatchet for chopping trees.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/tools/bronze_hatchet.glb',
    iconPath: '/icons/bronze_hatchet.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { woodcutting: 1 } 
    }
  }],

  ['fishing_rod', {
    id: 'fishing_rod',
    name: 'Fishing Rod',
    description: 'A basic fishing rod',
    type: ItemType.TOOL,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 30,
    weight: 1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a basic fishing rod.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/tools/fishing_rod.glb',
    iconPath: '/icons/fishing_rod.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { fishing: 1 } 
    }
  }],

  ['tinderbox', {
    id: 'tinderbox',
    name: 'Tinderbox',
    description: 'Used to light fires',
    type: ItemType.TOOL,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 10,
    weight: 0.1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is used to light fires.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/tools/tinderbox.glb',
    iconPath: '/icons/tinderbox.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: { firemaking: 1 } 
    }
  }],

  // Resources
  ['logs', {
    id: 'logs',
    name: 'Logs',
    description: 'Wood logs from trees',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 5,
    weight: 0.5,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'These are wood logs from trees.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/assets/models/resources/logs.glb',
    iconPath: '/icons/logs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['oak_logs', {
    id: 'oak_logs',
    name: 'Oak Logs',
    description: 'Sturdy oak logs',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 15,
    weight: 0.6,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'These are sturdy oak logs.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/oak_logs.glb',
    iconPath: '/icons/oak_logs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['willow_logs', {
    id: 'willow_logs',
    name: 'Willow Logs',
    description: 'Flexible willow logs',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 25,
    weight: 0.4,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'These are flexible willow logs.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/willow_logs.glb',
    iconPath: '/icons/willow_logs.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  // Generic Fish (for testing and backwards compatibility)
  ['raw_fish', {
    id: 'raw_fish',
    name: 'Raw Fish',
    description: 'A generic raw fish',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 10,
    weight: 0.3,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a generic raw fish.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/raw_fish.glb',
    iconPath: '/icons/raw_fish.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['cooked_fish', {
    id: 'cooked_fish',
    name: 'Cooked Fish',
    description: 'A generic cooked fish (heals 5 HP)',
    type: ItemType.CONSUMABLE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 20,
    weight: 0.3,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a generic cooked fish that heals 5 HP.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/consumables/cooked_fish.glb',
    iconPath: '/icons/cooked_fish.png',
    healAmount: 5,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  // Fish (Raw)
  ['raw_shrimps', {
    id: 'raw_shrimps',
    name: 'Raw Shrimps',
    description: 'Fresh shrimps from the water',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 2,
    weight: 0.1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'These are fresh shrimps from the water.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/raw_shrimps.glb',
    iconPath: '/icons/raw_shrimps.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['raw_sardine', {
    id: 'raw_sardine',
    name: 'Raw Sardine',
    description: 'A small but tasty fish',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 5,
    weight: 0.2,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a small but tasty fish.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/raw_sardine.glb',
    iconPath: '/icons/raw_sardine.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['raw_trout', {
    id: 'raw_trout',
    name: 'Raw Trout',
    description: 'A medium-sized freshwater fish',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 15,
    weight: 0.3,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a medium-sized freshwater fish.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/raw_trout.glb',
    iconPath: '/icons/raw_trout.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['raw_salmon', {
    id: 'raw_salmon',
    name: 'Raw Salmon',
    description: 'A large and nutritious fish',
    type: ItemType.RESOURCE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 30,
    weight: 0.4,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a large and nutritious fish.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/resources/raw_salmon.glb',
    iconPath: '/icons/raw_salmon.png',
    healAmount: 0,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  // Fish (Cooked)
  ['cooked_shrimps', {
    id: 'cooked_shrimps',
    name: 'Cooked Shrimps',
    description: 'Delicious cooked shrimps (heals 3 HP)',
    type: ItemType.CONSUMABLE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 5,
    weight: 0.1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'These are delicious cooked shrimps that heal 3 HP.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/consumables/cooked_shrimps.glb',
    iconPath: '/icons/cooked_shrimps.png',
    healAmount: 3,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['cooked_sardine', {
    id: 'cooked_sardine',
    name: 'Cooked Sardine',
    description: 'A well-cooked sardine (heals 4 HP)',
    type: ItemType.CONSUMABLE,
    quantity: 1,
    stackable: true,
    maxStackSize: 100,
    value: 8,
    weight: 0.2,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    examine: 'This is a well-cooked sardine that heals 4 HP.',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: '/models/consumables/cooked_sardine.glb',
    iconPath: '/icons/cooked_sardine.png',
    healAmount: 4,
    stats: {
      attack: 0,
      defense: 0,
      strength: 0
    },
    bonuses: { 
      attack: 0,
      strength: 0,
      defense: 0,
      ranged: 0 
    },
    requirements: { 
      level: 1,
      skills: {} 
    }
  }],

  ['cooked_trout', createItem({
    id: 'cooked_trout',
    name: 'Cooked Trout',
    description: 'A perfectly cooked trout (heals 7 HP)',
    type: ItemType.CONSUMABLE,
    value: 25,
    weight: 0.3,
    healAmount: 7,
    modelPath: '/models/consumables/cooked_trout.glb',
    iconPath: '/icons/cooked_trout.png'
  })],

  ['cooked_salmon', createItem({
    id: 'cooked_salmon',
    name: 'Cooked Salmon',
    description: 'A hearty cooked salmon (heals 9 HP)',
    type: ItemType.CONSUMABLE,
    value: 45,
    weight: 0.4,
    healAmount: 9,
    modelPath: '/models/consumables/cooked_salmon.glb',
    iconPath: '/icons/cooked_salmon.png'
  })],

  // Burnt Food Items (for cooking failures)
  ['burnt_shrimps', createItem({
    id: 'burnt_shrimps',
    name: 'Burnt Shrimps',
    description: 'Completely burnt shrimps (inedible)',
    type: ItemType.CONSUMABLE,
    value: 1,
    weight: 0.1,
    healAmount: 0,
    modelPath: '/models/consumables/burnt_shrimps.glb',
    iconPath: '/icons/burnt_shrimps.png'
  })],

  ['burnt_sardine', createItem({
    id: 'burnt_sardine',
    name: 'Burnt Sardine',
    description: 'A completely burnt sardine (inedible)',
    type: ItemType.CONSUMABLE,
    value: 1,
    weight: 0.1,
    healAmount: 0,
    modelPath: '/models/consumables/burnt_sardine.glb',
    iconPath: '/icons/burnt_sardine.png'
  })],

  ['burnt_trout', createItem({
    id: 'burnt_trout',
    name: 'Burnt Trout',
    description: 'A completely burnt trout (inedible)',
    type: ItemType.CONSUMABLE,
    value: 1,
    weight: 0.1,
    healAmount: 0,
    modelPath: '/models/consumables/burnt_trout.glb',
    iconPath: '/icons/burnt_trout.png'
  })],

  ['burnt_salmon', createItem({
    id: 'burnt_salmon',
    name: 'Burnt Salmon',
    description: 'A completely burnt salmon (inedible)',
    type: ItemType.CONSUMABLE,
    value: 1,
    weight: 0.1,
    healAmount: 0,
    modelPath: '/models/consumables/burnt_salmon.glb',
    iconPath: '/icons/burnt_salmon.png'
  })]
])

// Helper function to get item by ID
export function getItem(itemId: string): RPGItem | null {
  return RPG_ITEMS.get(itemId) || null
}

// Helper function to get all items of a specific type
export function getItemsByType(type: ItemType): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => item.type === type)
}

// Helper function to get all weapons
export function getWeapons(): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => item.type === 'weapon')
}

// Helper function to get all armor
export function getArmor(): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => item.type === 'armor')
}

// Helper function to get all tools
export function getTools(): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => item.type === 'tool')
}

// Helper function to get all consumables
export function getConsumables(): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => item.type === 'consumable')
}

// Helper function to get all resources
export function getResources(): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => item.type === 'resource')
}

// Helper function to get items by skill requirement
export function getItemsBySkill(skill: string): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => 
    item.requirements && item.requirements[skill as keyof ItemRequirement]
  )
}

// Helper function to get items by level requirement  
export function getItemsByLevel(level: number): RPGItem[] {
  return Array.from(RPG_ITEMS.values()).filter(item => {
    if (!item.requirements) return true;
    
    return Object.values(item.requirements).every(req => 
      typeof req === 'number' ? req <= level : true
    );
  })
}

export const SHOP_ITEMS = [
  'bronze_hatchet',
  'fishing_rod', 
  'tinderbox',
  'arrows'
]

// Convert Map to object for compatibility 
const itemsObject: { [key: string]: RPGItem } = {}
for (const [key, value] of RPG_ITEMS) {
  itemsObject[key] = value
}

// Export both formats for different consumers
export const items = itemsObject  // For Object.values(items) usage