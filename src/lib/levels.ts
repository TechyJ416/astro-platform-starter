// src/lib/levels.ts
// Creator Leveling System Utilities

export interface LevelInfo {
  level: number;
  title: string;
  expRequired: number;
  multiplier: number;
  badgeColor: string;
  badgeIcon: string;
}

// Level definitions matching the database
export const LEVELS: LevelInfo[] = [
  { level: 10, title: 'Recruit', expRequired: 10, multiplier: 1.0, badgeColor: '#6b7280', badgeIcon: '⬡' },
  { level: 20, title: 'Digital Scout', expRequired: 20, multiplier: 1.1, badgeColor: '#8b5cf6', badgeIcon: '⬢' },
  { level: 30, title: 'Digital Specialist', expRequired: 30, multiplier: 1.1, badgeColor: '#a855f7', badgeIcon: '◈' },
  { level: 40, title: 'Ops Enforcer', expRequired: 40, multiplier: 1.2, badgeColor: '#c026d3', badgeIcon: '◆' },
  { level: 50, title: 'Tactical Uplink', expRequired: 50, multiplier: 1.2, badgeColor: '#d946ef', badgeIcon: '⬣' },
  { level: 60, title: 'Network Commander', expRequired: 60, multiplier: 1.3, badgeColor: '#ec4899', badgeIcon: '✦' },
  { level: 70, title: 'Digital General', expRequired: 70, multiplier: 1.3, badgeColor: '#f43f5e', badgeIcon: '★' },
  { level: 80, title: 'Campaign Marshal', expRequired: 80, multiplier: 1.4, badgeColor: '#f59e0b', badgeIcon: '✪' },
  { level: 90, title: 'Digital Warlord', expRequired: 90, multiplier: 1.4, badgeColor: '#eab308', badgeIcon: '⚔' },
  { level: 100, title: '5 Star Digital General', expRequired: 100, multiplier: 1.5, badgeColor: '#fbbf24', badgeIcon: '⭐' },
];

export const MAX_LEVEL = 100;
export const MAX_EXP = 100;

/**
 * Get level info from EXP amount
 */
export function getLevelFromExp(exp: number): LevelInfo {
  const cappedExp = Math.min(exp, MAX_EXP);
  
  // Find the highest level that the exp qualifies for
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (cappedExp >= LEVELS[i].expRequired) {
      return LEVELS[i];
    }
  }
  
  return LEVELS[0]; // Default to Recruit
}

/**
 * Get level info by level number
 */
export function getLevelInfo(level: number): LevelInfo | undefined {
  return LEVELS.find(l => l.level === level);
}

/**
 * Get next level info
 */
export function getNextLevel(currentLevel: number): LevelInfo | null {
  const currentIndex = LEVELS.findIndex(l => l.level === currentLevel);
  if (currentIndex === -1 || currentIndex === LEVELS.length - 1) {
    return null; // Already max or not found
  }
  return LEVELS[currentIndex + 1];
}

/**
 * Calculate EXP needed for next level
 */
export function getExpToNextLevel(currentExp: number): number {
  const currentLevel = getLevelFromExp(currentExp);
  const nextLevel = getNextLevel(currentLevel.level);
  
  if (!nextLevel) return 0; // Already max level
  
  return nextLevel.expRequired - currentExp;
}

/**
 * Calculate progress percentage to next level
 */
export function getLevelProgress(currentExp: number): number {
  const currentLevel = getLevelFromExp(currentExp);
  const nextLevel = getNextLevel(currentLevel.level);
  
  if (!nextLevel) return 100; // Max level
  
  const expInCurrentLevel = currentExp - currentLevel.expRequired;
  const expNeededForNext = nextLevel.expRequired - currentLevel.expRequired;
  
  return Math.min(100, Math.round((expInCurrentLevel / expNeededForNext) * 100));
}

/**
 * Format multiplier for display
 */
export function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(1)}x`;
}

/**
 * Get payment with multiplier applied
 */
export function applyMultiplier(basePayment: number, multiplier: number): number {
  return Math.round(basePayment * multiplier * 100) / 100;
}

/**
 * Generate level badge HTML/CSS styles
 */
export function getLevelBadgeStyles(level: number): Record<string, string> {
  const info = getLevelInfo(level);
  if (!info) return {};
  
  return {
    backgroundColor: `${info.badgeColor}20`,
    borderColor: `${info.badgeColor}50`,
    color: info.badgeColor,
  };
}

/**
 * Check if user leveled up after gaining exp
 */
export function checkLevelUp(oldExp: number, newExp: number): { leveledUp: boolean; newLevel: LevelInfo | null } {
  const oldLevel = getLevelFromExp(oldExp);
  const newLevel = getLevelFromExp(newExp);
  
  if (newLevel.level > oldLevel.level) {
    return { leveledUp: true, newLevel };
  }
  
  return { leveledUp: false, newLevel: null };
}

// Level tier categories for UI grouping
export const LEVEL_TIERS = {
  rookie: [10, 20, 30],      // Entry levels
  veteran: [40, 50, 60],     // Mid-tier
  elite: [70, 80, 90, 100],  // Top tier
};

export function getTierName(level: number): string {
  if (LEVEL_TIERS.rookie.includes(level)) return 'Rookie';
  if (LEVEL_TIERS.veteran.includes(level)) return 'Veteran';
  if (LEVEL_TIERS.elite.includes(level)) return 'Elite';
  return 'Unknown';
}

export function getTierColor(level: number): string {
  if (LEVEL_TIERS.rookie.includes(level)) return '#8b5cf6';
  if (LEVEL_TIERS.veteran.includes(level)) return '#ec4899';
  if (LEVEL_TIERS.elite.includes(level)) return '#fbbf24';
  return '#6b7280';
}
