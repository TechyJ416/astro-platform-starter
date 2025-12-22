/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    isMasterKeySession: boolean;
    session: import('@supabase/supabase-js').Session | null;
    profile: {
      id: string;
      email: string;
      full_name: string;
      role: string;
      avatar_url?: string;
      bio?: string;
      is_verified?: boolean;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
    } | null;
    isAdmin: boolean;
    isModerator: boolean;
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_KEY: string;
  readonly ADMIN_MASTER_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
