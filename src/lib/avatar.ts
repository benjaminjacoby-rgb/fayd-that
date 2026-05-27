export const AVATAR_COLORS = [
  "yes",
  "blue",
  "orange",
  "purple",
  "gold",
  "no",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

export function pickAvatarColor(seed: string): AvatarColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function initials(first: string | null, lastInitial: string | null): string {
  // Legacy path: explicit lastInitial provided (e.g. from old DB rows still in flight).
  if (lastInitial) {
    const f = first?.trim()[0]?.toUpperCase() ?? "?";
    const l = lastInitial.trim()[0]?.toUpperCase() ?? "";
    return `${f}${l}`;
  }
  // New path: full name stored in `first`. Derive two initials from words.
  const parts = (first ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const f = parts[0][0]?.toUpperCase() ?? "?";
  if (parts.length === 1) return f;
  return `${f}${parts[parts.length - 1][0]?.toUpperCase() ?? ""}`;
}
