import { PlayerData, PlayerSkills } from "../types/core"

export function getSkillLevel(player: PlayerData, skill: keyof PlayerSkills): number {
    return player.skills[skill]?.level || 1
  }
  
  export function getTotalLevel(player: PlayerData): number {
    return Object.values(player.skills).reduce((total, skill) => total + skill.level, 0)
  }