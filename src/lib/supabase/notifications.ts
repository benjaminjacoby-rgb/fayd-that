import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/db";

interface DbNotificationRow {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface DbUserMini {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface MessageInfo {
  preview: string | null;
  group_name: string | null;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function getNotifications(userId: string): Promise<NotificationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as DbNotificationRow[];

  // Hydrate actor profile + bet question in one round-trip each. Both pieces
  // come from the new `actor_id` column (migration 010) and the bet reference,
  // so we don't need per-type joins like the previous friendships-only path.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)),
  );
  const usersById = new Map<string, DbUserMini>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, username, full_name, avatar_url")
      .in("id", actorIds);
    for (const u of (users ?? []) as DbUserMini[]) usersById.set(u.id, u);
  }

  const betIds = Array.from(
    new Set(
      rows
        .filter((r) => r.reference_type === "bet" && r.reference_id)
        .map((r) => r.reference_id as string),
    ),
  );
  const betQuestionById = new Map<string, string>();
  if (betIds.length > 0) {
    const { data: bets } = await supabase
      .from("bets")
      .select("id, question")
      .in("id", betIds);
    for (const b of (bets ?? []) as Array<{ id: string; question: string }>) {
      betQuestionById.set(b.id, b.question);
    }
  }

  // Message notifications: resolve preview text and group name from the
  // stored message reference so the UI can show rich content without an
  // extra network request at render time.
  const msgIds = Array.from(
    new Set(
      rows
        .filter((r) => r.type === "new_message" && r.reference_type === "message" && r.reference_id)
        .map((r) => r.reference_id as string),
    ),
  );
  const messageInfoById = new Map<string, MessageInfo>();
  if (msgIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, content, conversation_id")
      .in("id", msgIds);
    const msgRows = (msgs ?? []) as Array<{ id: string; content: string | null; conversation_id: string }>;

    const convIds = Array.from(new Set(msgRows.map((m) => m.conversation_id).filter(Boolean)));
    const groupNameByConvId = new Map<string, string>();
    if (convIds.length > 0) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, group_id")
        .in("id", convIds);
      const convRows = (convs ?? []) as Array<{ id: string; group_id: string | null }>;
      const groupIds = convRows.map((c) => c.group_id).filter((x): x is string => !!x);
      if (groupIds.length > 0) {
        const { data: groups } = await supabase
          .from("groups")
          .select("id, name")
          .in("id", groupIds);
        const groupNameById = new Map(
          ((groups ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]),
        );
        for (const c of convRows) {
          if (c.group_id) {
            const name = groupNameById.get(c.group_id);
            if (name) groupNameByConvId.set(c.id, name);
          }
        }
      }
    }

    for (const m of msgRows) {
      messageInfoById.set(m.id, {
        preview: m.content?.trim() ?? null,
        group_name: groupNameByConvId.get(m.conversation_id) ?? null,
      });
    }
  }

  return rows.map((r) => {
    const actor = r.actor_id ? usersById.get(r.actor_id) : undefined;
    const betQuestion =
      r.reference_type === "bet" && r.reference_id
        ? betQuestionById.get(r.reference_id) ?? null
        : null;
    const msgInfo =
      r.type === "new_message" && r.reference_type === "message" && r.reference_id
        ? messageInfoById.get(r.reference_id) ?? null
        : null;
    return {
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      payload: {
        reference_id: r.reference_id,
        reference_type: r.reference_type,
        actor_user_id: actor?.id ?? r.actor_id ?? null,
        actor_name: actor?.full_name ?? actor?.username ?? null,
        actor_avatar_url: actor?.avatar_url ?? null,
        bet_question: betQuestion,
        message_preview: msgInfo?.preview ?? null,
        group_name: msgInfo?.group_name ?? null,
      },
      read: r.is_read,
      created_at: r.created_at,
    };
  });
}
