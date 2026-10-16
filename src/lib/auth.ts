/**
 * Identidade do cartoleiro (cliente). A sessão é um cookie HttpOnly do
 * próprio servidor; aqui só lemos "quem sou eu" e mantemos o perfil local
 * (nome/avatar no cabeçalho) sincronizado com a conta.
 */
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchMe } from "../server/fnsConta";
import type { Author } from "./community";
import { DEFAULT_PROFILE, KEYS, readLocal, useLocal, writeLocal, type AvatarKey, type UserProfile } from "./storage";

export const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 5 * 60_000 });

export interface AuthState {
  user: Awaited<ReturnType<typeof fetchMe>>;
  isAdmin: boolean;
  me: Author;
  profile: UserProfile;
  ready: boolean;
  refresh: () => Promise<void>;
}

export function useAuth(): AuthState {
  const q = useQuery(meQuery);
  const qc = useQueryClient();
  const [profile] = useLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
  const user = q.data ?? null;

  useEffect(() => {
    if (!user) return;
    const cur = readLocal<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
    if (cur.nome !== user.nome || cur.avatar !== user.avatar || cur.bio !== user.bio) {
      writeLocal(KEYS.profile, { ...cur, nome: user.nome, bio: user.bio, avatar: user.avatar as AvatarKey });
    }
  }, [user]);

  return {
    user,
    isAdmin: Boolean(user?.admin),
    me: user ? { id: user.id, nome: user.nome, avatar: user.avatar as AvatarKey } : { id: "anon", nome: profile.nome || "Cartoleiro", avatar: profile.avatar },
    profile,
    ready: !q.isLoading,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: meQuery.queryKey });
    },
  };
}
