/**
 * Cliente do Lovable Cloud (Supabase). Opcional: sem as variáveis de ambiente
 * o app funciona em modo local (localStorage no navegador, memória no servidor).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
const url = supabaseUrl;
const key = supabaseKey;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: typeof window !== "undefined" } });
  return client;
}

export const cloudEnabled = Boolean(url && key);
