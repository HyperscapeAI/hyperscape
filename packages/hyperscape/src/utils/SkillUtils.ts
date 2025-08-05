import { Player, Skills } from "../types/core"

export function getSkillLevel(player: Player, skill: keyof Skills): number {
    return player.skills[skill]?.level || 1
  }
  
  export function getTotalLevel(player: Player): number {
    return Object.values(player.skills).reduce((total, skill) => total + skill.level, 0)
  }