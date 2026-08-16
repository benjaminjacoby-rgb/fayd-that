// Shared banned-word matcher. The real enforcement lives in Postgres — the
// `bets_check_language` trigger (migration 019) rejects the insert outright
// and can't be bypassed by calling the API directly. This module mirrors
// that trigger's word-boundary logic purely so the client can reject
// obviously-bad input before round-tripping to the DB.
//
// The list here is the mock-mode / pre-fetch fallback, not the source of
// truth — live mode fetches the current list from the `banned_words` table
// (src/lib/data/moderationClient.ts), which can be edited directly in
// Supabase without a deploy.
export const DEFAULT_BANNED_WORDS: readonly string[] = [
  "fuck", "fucker", "fucking", "motherfucker",
  "shit", "bullshit",
  "bitch", "bastard",
  "asshole", "dumbass", "jackass",
  "cunt", "dick", "dickhead", "cock", "pussy", "twat", "prick",
  "piss", "pissed",
  "slut", "whore",
  "wanker", "bollocks", "douchebag",
  "retard", "retarded",
  "rape", "rapist",
  "molest", "molester",
  "pedophile",
  "kys", "kill yourself",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive whole word/phrase match — mirrors the DB's \m...\M check. */
export function containsBannedWord(
  text: string,
  bannedWords: readonly string[] = DEFAULT_BANNED_WORDS,
): boolean {
  if (!text) return false;
  return bannedWords.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(text));
}
