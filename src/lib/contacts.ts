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
 *
 * Until the Capacitor plugin is wired up, this returns an empty array so
 * real users are never shown hardcoded fake data.
 */
export async function fetchMatchedContacts(): Promise<MatchedContact[]> {
  cachedMatches = [];
  notify();
  return [];
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
