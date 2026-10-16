/**
 * Preferências e dados locais do cartoleiro (navegador).
 * Toda leitura/escrita é protegida: modo anônimo, armazenamento bloqueado
 * ou SSR simplesmente caem no valor padrão.
 */
import { useCallback, useEffect, useState } from "react";
import type { FormationKey } from "../engine/rules";
import type { ProfileKey } from "../engine/types";

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("local-storage", { detail: key }));
  } catch {
    /* armazenamento indisponível */
  }
}

/** Estado sincronizado com localStorage (e entre abas/componentes). */
export function useLocal<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    setValue(readLocal(key, fallback));
    const onChange = (e: Event) => {
      const k = e instanceof StorageEvent ? e.key : (e as CustomEvent).detail;
      if (k === key) setValue(readLocal(key, fallback));
    };
    window.addEventListener("storage", onChange);
    window.addEventListener("local-storage", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("local-storage", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(readLocal(key, fallback)) : v;
      writeLocal(key, next);
      setValue(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}

export interface SavedLineup {
  id: string;
  nome: string;
  rodada: number;
  temporada: number;
  formation: FormationKey;
  profile: ProfileKey;
  titulares: number[];
  captainId: number;
  reservas: Array<{ atletaId: number; posicaoId: number; luxo?: boolean }>;
  custo: number;
  xP: number;
  criadoEm: string;
}

export interface UserProfile {
  nome: string;
  bio: string;
  avatar: AvatarKey;
  tom: "agressivo" | "conservador";
  foco: "pontos" | "cartoletas";
}

export const AVATAR_KEYS = ["aguia", "leao", "astronauta", "gladiador", "robo", "capitao", "lobo", "estrategista"] as const;
export type AvatarKey = (typeof AVATAR_KEYS)[number];

export const DEFAULT_PROFILE: UserProfile = { nome: "Cartoleiro", bio: "", avatar: "aguia", tom: "conservador", foco: "pontos" };

export const KEYS = {
  profile: "cfc:profile",
  lineups: "cfc:lineups",
  fixed: "cfc:fixed",
  banned: "cfc:banned",
  builder: "cfc:builder",
  lastLineup: "cfc:last-lineup",
  chat: "cfc:chat",
  cartolaToken: "cfc:cartola-token",
  followed: "cfc:followed-teams",
} as const;
