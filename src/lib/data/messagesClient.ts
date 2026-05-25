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

  const { data: convo, error: cErr } = await supabase
    .from("conversations")
    .insert({ type: "direct", group_id: null })
    .select("id")
    .single();
  if (cErr) throw cErr;

  const { error: pInsErr } = await supabase.from("conversation_participants").insert([
    { conversation_id: convo.id, user_id: authUser.id },
    { conversation_id: convo.id, user_id: otherUserId },
  ]);
  if (pInsErr) throw pInsErr;

  return convo.id;
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
