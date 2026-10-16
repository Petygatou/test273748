/**
 * Identidade do cartoleiro.
 * - Lovable Cloud configurado: sessão Supabase (e-mail + senha ou link mágico),
 *   papel de administrador lido de `user_roles` (protegido por RLS).
 * - Sem nuvem: identidade local (id aleatório no navegador). O Painel ADM em
 *   modo local exige o ADMIN_TOKEN do servidor para alterar prováveis.
 */
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Author } from "./community";
import { DEFAULT_PROFILE, KEYS, readLocal, useLocal, writeLocal, type UserProfile } from "./storage";
import { cloudEnabled, getSupabase } from "./supabase";

function localId(): string {
  let id = readLocal<string | null>("cfc:local-id", null);
  if (!id) {
    id = `local-${Math.random().toString(36).slice(2, 10)}`;
    writeLocal("cfc:local-id", id);
  }
  return id;
}

export interface AuthState {
  cloud: boolean;
  session: Session | null;
  userId: string;
  isAdmin: boolean;
  me: Author;
  profile: UserProfile;
  ready: boolean;
}

export function useAuth(): AuthState {
  const [profile] = useLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
  const [adminToken] = useLocal<string>(KEYS.adminToken, "");
  const [session, setSession] = useState<Session | null>(null);
  const [isAdminCloud, setIsAdminCloud] = useState(false);
  const [ready, setReady] = useState(!cloudEnabled);
  const [lid, setLid] = useState("local");

  useEffect(() => {
    setLid(localId());
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !session) {
      setIsAdminCloud(false);
      return;
    }
    sb.from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdminCloud(Boolean(data)));
  }, [session]);

  const userId = session?.user.id ?? lid;
  const isAdmin = cloudEnabled ? isAdminCloud : Boolean(adminToken) || import.meta.env.DEV;
  return {
    cloud: cloudEnabled,
    session,
    userId,
    isAdmin,
    me: { id: userId, nome: profile.nome || "Cartoleiro", avatar: profile.avatar },
    profile,
    ready,
  };
}

/** Sincroniza o perfil local com a tabela `profiles` quando logado. */
export async function syncProfile(p: UserProfile) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  await sb.from("profiles").upsert({ id: data.user.id, nome: p.nome, bio: p.bio, avatar: p.avatar, updated_at: new Date().toISOString() });
}
