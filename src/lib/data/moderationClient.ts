"use client";

import { createClient } from "@/lib/supabase/client";

/** Current banned-word list from the DB — the same table the `bets_check_language` trigger reads. */
export async function fetchBannedWords(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("banned_words").select("word");
  if (error) throw error;
  return ((data ?? []) as Array<{ word: string }>).map((r) => r.word);
}
