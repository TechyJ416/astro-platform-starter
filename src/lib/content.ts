// src/lib/content.ts
import { supabase } from './supabase';

export interface PageContent {
  [key: string]: any;
}

// Cache for page content (reduces DB calls)
const contentCache: Map<string, { data: PageContent; timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get page content from database with caching
 */
export async function getPageContent(pageKey: string): Promise<PageContent> {
  // Check cache first
  const cached = contentCache.get(pageKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase
      .from('page_content')
      .select('content')
      .eq('page_key', pageKey)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.error(`Failed to load content for ${pageKey}:`, error);
      return getDefaultContent(pageKey);
    }

    // Update cache
    contentCache.set(pageKey, { data: data.content, timestamp: Date.now() });
    
    return data.content;
  } catch (e) {
    console.error(`Error loading content for ${pageKey}:`, e);
    return getDefaultContent(pageKey);
  }
}

/**
 * Get nested value from object using dot notation
 */
export function getContentValue(content: PageContent, path: string, defaultValue: any = ''): any {
  if (!path) return content;
  return path.split('.').reduce((obj, key) => obj?.[key], content) ?? defaultValue;
}

/**
 * Default content fallbacks
 */
function getDefaultContent(pageKey: string): PageContent {
  const defaults: Record<string, PageContent> = {
    home: {
      hero: {
        badge: 'Creator Platform',
        title: 'Turn Your Content Into Income',
        subtitle: 'Connect with brands, create content, get paid.',
        cta_primary: { text: 'Join as Creator', link: '/signup' },
        cta_secondary: { text: 'Browse Campaigns', link: '/campaigns' },
      },
      stats: { creators: '500+', campaigns: '50+', paid_out: '$50k+' },
    },
    about: {
      hero: {
        badge: 'About Us',
        title: 'Connecting Creators with Brands',
        subtitle: 'We believe in authentic partnerships.',
      },
    },
    creators: {
      hero: {
        badge: 'For Creators',
        title: 'Turn Your Content Into Income',
        subtitle: 'Join our platform and start earning.',
      },
    },
    contact: {
      hero: {
        badge: 'Contact',
        title: 'Get in Touch',
        subtitle: 'Have questions? We would love to hear from you.',
      },
      info: {
        email: 'hello@banity.com',
        support_email: 'support@banity.com',
      },
    },
    legal: {
      last_updated: 'January 1, 2025',
      company_name: 'Banity Ltd',
      privacy_email: 'privacy@banity.com',
      legal_email: 'legal@banity.com',
    },
  };

  return defaults[pageKey] || {};
}

/**
 * Clear content cache (call after updates)
 */
export function clearContentCache(pageKey?: string) {
  if (pageKey) {
    contentCache.delete(pageKey);
  } else {
    contentCache.clear();
  }
}
