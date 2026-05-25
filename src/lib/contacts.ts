"use client";

// Contacts permission + matching. All UI-only for now — the fetchMatchedContacts
// function is the swap point for the eventual Capacitor Contacts plugin call.
//
// When wiring real contacts:
//   1. Replace fetchMatchedContacts() with a Capacitor Contacts read + phone-
//      number normalization, then post hashed numbers to the matching endpoint.
//   2. Move getContactsPermission()/setContactsPermission() to a persisted
//      store (Capacitor Preferences) instead of in-memory.
// Everything else (UI components, friend-add flow) stays the same.

import { useSyncExternalStore } from "react";
import type { UserLite } from "@/types/db";

export interface MatchedContact {
  /** Stable id — mirrors UserLite.id when matched to a real user. */
  id: string;
  name: string;
  phone: string;
  user: UserLite;
}

// ── In-memory permission state ──────────────────────────────────────────────
type Permission = "unknown" | "granted" | "denied";

let permission: Permission = "unknown";
let cachedMatches: MatchedContact[] | null = null;
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}

export function getContactsPermission(): Permission {
  return permission;
}

export function setContactsPermission(p: Permission) {
  if (permission === p) return;
  permission = p;
  if (p !== "granted") cachedMatches = null;
  notify();
}

export function getCachedMatches(): MatchedContact[] | null {
  return cachedMatches;
}

/**
 * Async fetch of matched contacts. Swap this body for a real Capacitor
 * Contacts call + server-side phone matching when going to production.
 */
export async function fetchMatchedContacts(): Promise<MatchedContact[]> {
  // Simulate the I/O the real plugin will incur.
  await new Promise((r) => setTimeout(r, 250));
  const matches: MatchedContact[] = [
    {
      id: "u-emma",
      name: "Emma R.",
      phone: "+1 (555) 555-0105",
      user: { id: "u-emma", first_name: "Emma", last_name_initial: "R", username: "emmar", avatar_color: "yes" },
    },
    {
      id: "u-liam",
      name: "Liam C.",
      phone: "+1 (555) 555-0106",
      user: { id: "u-liam", first_name: "Liam", last_name_initial: "C", username: "liamc", avatar_color: "no" },
    },
    {
      id: "u-aisha",
      name: "Aisha B.",
      phone: "+1 (555) 555-0107",
      user: { id: "u-aisha", first_name: "Aisha", last_name_initial: "B", username: "aishab", avatar_color: "purple" },
    },
    {
      id: "u-diego",
      name: "Diego M.",
      phone: "+1 (555) 555-0108",
      user: { id: "u-diego", first_name: "Diego", last_name_initial: "M", username: "diegom", avatar_color: "orange" },
    },
  ];
  cachedMatches = matches;
  notify();
  return matches;
}

// ── React hook ──────────────────────────────────────────────────────────────
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function getVersion() {
  return version;
}

/** Re-renders consumers whenever permission or cached matches change. */
export function useContactsStore(): number {
  return useSyncExternalStore(subscribe, getVersion, () => 0);
}
