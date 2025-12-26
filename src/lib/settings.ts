// src/lib/settings.ts
import { supabase } from './supabase';

// Type definitions for settings
export interface GeneralSettings {
  siteName: string;
  tagline: string;
  description: string;
  supportEmail: string;
  contactEmail: string;
  timezone: string;
}

export interface AppearanceSettings {
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  faviconUrl: string;
}

export interface EmailSettings {
  provider: string;
  fromName: string;
  fromEmail: string;
  enableWelcome: boolean;
  enableCampaignNotify: boolean;
  enableReviewNotify: boolean;
  enablePaymentNotify: boolean;
}

export interface PaymentSettings {
  processor: string;
  platformFee: number;
  minPayout: number;
  payoutSchedule: string;
  currency: string;
}

export interface SecuritySettings {
  requireEmailVerify: boolean;
  enableMfa: boolean;
  enableSignup: boolean;
  maintenanceMode: boolean;
}

export interface AllSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  email: EmailSettings;
  payments: PaymentSettings;
  security: SecuritySettings;
}

// Default settings (fallback if database is empty)
export const defaultSettings: AllSettings = {
  general: {
    siteName: 'Banity',
    tagline: 'Create Authentic Content. Get Paid.',
    description: 'Banity connects creators with brands for authentic UGC campaigns.',
    supportEmail: 'support@banity.com',
    contactEmail: 'hello@banity.com',
    timezone: 'America/Los_Angeles',
  },
  appearance: {
    primaryColor: '#2563eb',
    accentColor: '#059669',
    logoUrl: '',
    faviconUrl: '',
  },
  email: {
    provider: 'supabase',
    fromName: 'Banity',
    fromEmail: 'noreply@banity.com',
    enableWelcome: true,
    enableCampaignNotify: true,
    enableReviewNotify: true,
    enablePaymentNotify: true,
  },
  payments: {
    processor: 'stripe',
    platformFee: 15,
    minPayout: 50,
    payoutSchedule: 'biweekly',
    currency: 'USD',
  },
  security: {
    requireEmailVerify: true,
    enableMfa: false,
    enableSignup: true,
    maintenanceMode: false,
  },
};

// Cache for settings (to avoid repeated database calls)
let settingsCache: AllSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get a specific setting category
 */
export async function getSetting<K extends keyof AllSettings>(
  key: K
): Promise<AllSettings[K]> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) {
    console.warn(`Failed to load setting "${key}", using default:`, error?.message);
    return defaultSettings[key];
  }

  return { ...defaultSettings[key], ...data.value } as AllSettings[K];
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<AllSettings> {
  // Check cache first
  if (settingsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return settingsCache;
  }

  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value');

  if (error || !data) {
    console.warn('Failed to load settings, using defaults:', error?.message);
    return defaultSettings;
  }

  // Merge database settings with defaults
  const settings: AllSettings = { ...defaultSettings };
  
  for (const row of data) {
    const key = row.key as keyof AllSettings;
    if (key in defaultSettings) {
      settings[key] = { ...defaultSettings[key], ...row.value };
    }
  }

  // Update cache
  settingsCache = settings;
  cacheTimestamp = Date.now();

  return settings;
}

/**
 * Update a specific setting category
 */
export async function updateSetting<K extends keyof AllSettings>(
  key: K,
  value: Partial<AllSettings[K]>,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  // Get current value first
  const current = await getSetting(key);
  const merged = { ...current, ...value };

  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key,
      value: merged,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    }, {
      onConflict: 'key',
    });

  if (error) {
    console.error(`Failed to update setting "${key}":`, error.message);
    return { success: false, error: error.message };
  }

  // Invalidate cache
  settingsCache = null;

  return { success: true };
}

/**
 * Clear the settings cache (call after updates)
 */
export function clearSettingsCache(): void {
  settingsCache = null;
  cacheTimestamp = 0;
}

/**
 * Check if site is in maintenance mode
 */
export async function isMaintenanceMode(): Promise<boolean> {
  const security = await getSetting('security');
  return security.maintenanceMode;
}

/**
 * Check if signups are enabled
 */
export async function isSignupEnabled(): Promise<boolean> {
  const security = await getSetting('security');
  return security.enableSignup;
}

/**
 * Get site name for display
 */
export async function getSiteName(): Promise<string> {
  const general = await getSetting('general');
  return general.siteName;
}

/**
 * Get site colors for theming
 */
export async function getSiteColors(): Promise<{ primary: string; accent: string }> {
  const appearance = await getSetting('appearance');
  return {
    primary: appearance.primaryColor,
    accent: appearance.accentColor,
  };
}
