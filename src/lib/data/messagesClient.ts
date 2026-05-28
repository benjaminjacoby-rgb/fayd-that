"use client";

import { createClient } from "@/lib/supabase/client";
import { insertNotification } from "@/lib/data/notificationsClient";
import type { ChatMessageView, UserLite } from "@/types/db";

interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  bet_id: string | null;
  created_at: string;
}

/**
 * Find or create a conversation containing exactly the signed-in user and the
 * given friends (no extras, no missing). Single friend → type=direct; multiple
 * friends → type=group with group_id=null (ad-hoc multi-party chat). Real
 * group-backed chats (group_id IS NOT NULL) are excluded from the match so we
 * don't accidentally hijack them.
 */
export async function getOrCreateConversationWithFriends(friendIds: string[]): Promise<string> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  if (friendIds.length === 0) throw new Error("Pick at least one friend");

  const targetIds = new Set<string>([authUser.id, ...friendIds]);

  // 1. Conversations the current user is in.
  const { data: myConvRows, error: pErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", authUser.id);
  if (pErr) throw pErr;
  const myConvIds = (myConvRows ?? [])
    .map((r) => r.conversation_id)
    .filter((x): x is string => !!x);

  if (myConvIds.length) {
    // 2. Filter to ad-hoc convos (group_id IS NULL) — real-group chats are
    //    distinct and shouldn't be reused for an ad-hoc DM/group.
    const { data: convosRes, error: cErr } = await supabase
      .from("conversations")
      .select("id, group_id")
      .in("id", myConvIds);
    if (cErr) throw cErr;
    const adhocIds = (convosRes ?? [])
      .filter((c) => !c.group_id)
      .map((c) => c.id);

    if (adhocIds.length) {
      const { data: allParts, error: apErr } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", adhocIds);
      if (apErr) throw apErr;
      const byConv = new Map<string, Set<string>>();
      for (const p of allParts ?? []) {
        if (!p.conversation_id || !p.user_id) continue;
        const set = byConv.get(p.conversation_id) ?? new Set<string>();
        set.add(p.user_id);
        byConv.set(p.conversation_id, set);
      }
      for (const [cid, set] of byConv) {
        if (set.size !== targetIds.size) continue;
        let allMatch = true;
        for (const id of targetIds) {
          if (!set.has(id)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return cid;
      }
    }
  }

  // 3. None matched — create a fresh conversation + participants.
  //    Generate the id client-side so we don't rely on `.select()` returning
  //    the new row — the SELECT RLS policy on `conversations` requires a
  //    matching participant row, which doesn't exist yet at RETURNING time,
  //    which would make `.single()` throw "no rows returned".
  const conversationId = crypto.randomUUID();
  const convType = friendIds.length === 1 ? "direct" : "group";
  const { error: cInsErr } = await supabase
    .from("conversations")
    .insert({ id: conversationId, type: convType, group_id: null });
  if (cInsErr) throw cInsErr;

  const partRows = Array.from(targetIds).map((uid) => ({
    conversation_id: conversationId,
    user_id: uid,
  }));
  const { error: pInsErr } = await supabase
    .from("conversation_participants")
    .insert(partRows);
  if (pInsErr) throw pInsErr;

  return conversationId;
}

/**
 * Find or create a direct conversation between the signed-in user and
 * `otherUserId`. Returns the conversation id.
 */
export async function getOrCreateDirectConversation(otherUserId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  // Find existing direct conversation containing both users.
  const { data: myConvs, error: pErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", authUser.id);
  if (pErr) throw pErr;
  const myConvIds = (myConvs ?? []).map((r) => r.conversation_id).filter((x): x is string => !!x);

  if (myConvIds.length) {
    const { data: theirConvs } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", myConvIds);
    const shared = (theirConvs ?? []).map((r) => r.conversation_id).filter((x): x is string => !!x);
    if (shared.length) {
      const { data: direct } = await supabase
        .from("conversations")
        .select("id")
        .eq("type", "direct")
        .in("id", shared)
        .limit(1);
      if (direct && direct.length) return direct[0].id;
    }
  }

  const conversationId = crypto.randomUUID();
  const { error: cErr } = await supabase
    .from("conversations")
    .insert({ id: conversationId, type: "direct", group_id: null });
  if (cErr) throw cErr;

  const { error: pInsErr } = await supabase.from("conversation_participants").insert([
    { conversation_id: conversationId, user_id: authUser.id },
    { conversation_id: conversationId, user_id: otherUserId },
  ]);
  if (pInsErr) throw pInsErr;

  return conversationId;
}

export interface SendMessageInput {
  conversationId: string;
  content?: string;
  betId?: string;
}

export async function sendMessage(
  input: SendMessageInput,
  sender: UserLite,
): Promise<ChatMessageView> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: authUser.id,
      content: input.content ?? null,
      bet_id: input.betId ?? null,
    })
    .select("id, conversation_id, sender_id, content, bet_id, created_at")
    .single();
  if (error) throw error;

  // Fire notifications to every other participant (best effort).
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", input.conversationId);
  const recipients = (parts ?? [])
    .map((p) => p.user_id)
    .filter((id): id is string => !!id && id !== authUser.id);
  await Promise.all(
    recipients.map((uid) =>
      insertNotification({
        userId: uid,
        type: "new_message",
        actorId: authUser.id,
        referenceId: data.id,
        referenceType: "message",
      }),
    ),
  );

  return toChatMessageView(data as DbMessage, sender);
}

export function toChatMessageView(m: DbMessage, sender: UserLite): ChatMessageView {
  if (m.bet_id) {
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      sender,
      kind: "bet",
      bet_id: m.bet_id,
      created_at: m.created_at,
    };
  }
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender,
    kind: "text",
    text: m.content ?? "",
    created_at: m.created_at,
  };
}
