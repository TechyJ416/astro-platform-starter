// src/lib/content.ts
import { createClient } from '@supabase/supabase-js';

export interface PageContent {
  [key: string]: any;
}

// Create a dedicated client for content fetching
function getSupabaseClient() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Get page content from database (no caching for now to ensure fresh data)
 */
export async function getPageContent(pageKey: string): Promise<PageContent> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('page_content')
      .select('content')
      .eq('page_key', pageKey)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error(`Content fetch error for ${pageKey}:`, error.message);
      return getDefaultContent(pageKey);
    }

    if (!data || !data.content) {
      console.warn(`No content found for ${pageKey}, using defaults`);
      return getDefaultContent(pageKey);
    }

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
