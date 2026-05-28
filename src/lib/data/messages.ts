import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type {
  ChatMessageView,
  ConversationView,
  GroupView,
  UserLite,
} from "@/types/db";

interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface DbGroup {
  id: string;
  name: string;
  join_code: string;
  admin_id: string | null;
  created_at: string;
}

interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  bet_id: string | null;
  created_at: string;
}

interface DbConversation {
  id: string;
  type: "direct" | "group" | null;
  group_id: string | null;
  created_at: string;
}

/**
 * Builds the inbox for the signed-in user. Returns DMs and group chats
 * separately, each sorted by latest message timestamp (newest first).
 */
export async function getInbox(): Promise<{ dms: ConversationView[]; groups: ConversationView[] }> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { dms: [], groups: [] };

  // Fetch the current user's participant rows, including their last_read_at
  // timestamps so we can compute per-conversation unread counts below.
  const { data: myPartRows, error: pErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", authUser.id);
  if (pErr) throw pErr;
  const myParts = (myPartRows ?? []) as Array<{ conversation_id: string; last_read_at: string | null }>;
  const convIds = myParts.map((r) => r.conversation_id).filter((x): x is string => !!x);
  // Map conversation_id → last_read_at for unread count computation.
  const lastReadByConv = new Map<string, string | null>(
    myParts.map((r) => [r.conversation_id, r.last_read_at]),
  );
  if (convIds.length === 0) return { dms: [], groups: [] };

  const [convosRes, partsRes, lastMsgsRes] = await Promise.all([
    supabase.from("conversations").select("*").in("id", convIds),
    supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds),
    // Pull the latest message per conversation in one shot, then filter to the
    // newest below; cheaper than N round-trips.
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, bet_id, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (convosRes.error) throw convosRes.error;
  if (partsRes.error) throw partsRes.error;
  if (lastMsgsRes.error) throw lastMsgsRes.error;

  const convos = (convosRes.data ?? []) as DbConversation[];
  const partRows = (partsRes.data ?? []) as Array<{ conversation_id: string; user_id: string }>;
  const allMsgs = (lastMsgsRes.data ?? []) as DbMessage[];

  // Latest message per conversation (allMsgs is ordered newest-first).
  const lastByConv = new Map<string, DbMessage>();
  // Count of unread messages per conversation: messages after last_read_at
  // that were sent by someone else.
  const unreadByConv = new Map<string, number>();
  for (const m of allMsgs) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    if (m.sender_id !== authUser.id) {
      const lastRead = lastReadByConv.get(m.conversation_id) ?? null;
      const isUnread = !lastRead || new Date(m.created_at) > new Date(lastRead);
      if (isUnread) {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
      }
    }
  }

  const participantsByConv = new Map<string, string[]>();
  for (const p of partRows) {
    const arr = participantsByConv.get(p.conversation_id) ?? [];
    arr.push(p.user_id);
    participantsByConv.set(p.conversation_id, arr);
  }

  // Load all relevant users (participants + senders).
  const userIds = uniq([
    ...partRows.map((p) => p.user_id),
    ...allMsgs.map((m) => m.sender_id).filter((x): x is string => !!x),
  ]);
  const { data: usersData, error: uErr } = userIds.length
    ? await supabase.from("users").select("id, username, full_name, avatar_url").in("id", userIds)
    : { data: [] as DbUser[], error: null };
  if (uErr) throw uErr;
  const usersById = new Map(((usersData ?? []) as DbUser[]).map((u) => [u.id, u]));

  // Load any groups referenced by group-type conversations.
  const groupIds = uniq(convos.map((c) => c.group_id).filter((x): x is string => !!x));
  const { data: groupsData, error: gErr } = groupIds.length
    ? await supabase.from("groups").select("*").in("id", groupIds)
    : { data: [] as DbGroup[], error: null };
  if (gErr) throw gErr;
  const groupsById = new Map(((groupsData ?? []) as DbGroup[]).map((g) => [g.id, g]));

  const dms: ConversationView[] = [];
  const groups: ConversationView[] = [];

  for (const c of convos) {
    const ps = participantsByConv.get(c.id) ?? [];
    const last = lastByConv.get(c.id);
    const lastMessage = last ? toChatMessageView(last, usersById) : undefined;

    if (c.type === "direct") {
      const otherId = ps.find((id) => id !== authUser.id);
      const other = otherId ? toUserLite(usersById.get(otherId) ?? { id: otherId, username: null, full_name: null, avatar_url: null }) : undefined;
      dms.push({
        id: c.id,
        kind: "dm",
        other_user: other,
        title: other ? formatName(other) : "Direct message",
        unread_count: unreadByConv.get(c.id) ?? 0,
        last_message: lastMessage,
      });
    } else if (c.type === "group") {
      const g = c.group_id ? groupsById.get(c.group_id) : undefined;
      const groupView: GroupView | undefined = g
        ? {
            id: g.id,
            name: g.name,
            invite_code: g.join_code,
            admin_id: g.admin_id ?? "",
            created_at: g.created_at,
            admin: toUserLite(usersById.get(g.admin_id ?? "") ?? { id: g.admin_id ?? "", username: null, full_name: null, avatar_url: null }),
            member_count: ps.length,
            is_admin: g.admin_id === authUser.id,
            pending_join_count: 0,
          }
        : undefined;
      groups.push({
        id: c.id,
        kind: "group",
        group: groupView,
        title: g?.name ?? "Group chat",
        unread_count: unreadByConv.get(c.id) ?? 0,
        last_message: lastMessage,
      });
    }
  }

  const byLast = (a: ConversationView, b: ConversationView) => {
    const ta = a.last_message?.created_at ?? "";
    const tb = b.last_message?.created_at ?? "";
    return tb.localeCompare(ta);
  };
  dms.sort(byLast);
  groups.sort(byLast);

  return { dms, groups };
}

export async function getConversationById(id: string): Promise<{
  conversation: ConversationView;
  messages: ChatMessageView[];
  participants: UserLite[];
} | null> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: convo, error: cErr } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!convo) return null;

  const { data: partRows, error: pErr } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", id);
  if (pErr) throw pErr;
  const participantIds = (partRows ?? []).map((r) => r.user_id).filter((x): x is string => !!x);

  // RLS will hide messages/conversations if the viewer isn't a participant.
  if (!participantIds.includes(authUser.id)) return null;

  const { data: msgs, error: mErr } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, content, bet_id, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  const senderIds = uniq(((msgs ?? []) as DbMessage[]).map((m) => m.sender_id).filter((x): x is string => !!x));
  const allUserIds = uniq([...participantIds, ...senderIds]);

  const { data: usersData, error: uErr } = allUserIds.length
    ? await supabase.from("users").select("id, username, full_name, avatar_url").in("id", allUserIds)
    : { data: [] as DbUser[], error: null };
  if (uErr) throw uErr;
  const usersById = new Map(((usersData ?? []) as DbUser[]).map((u) => [u.id, u]));

  const participants = participantIds.map((pid) =>
    toUserLite(usersById.get(pid) ?? { id: pid, username: null, full_name: null, avatar_url: null }),
  );
  const messages = ((msgs ?? []) as DbMessage[]).map((m) => toChatMessageView(m, usersById));

  const c = convo as DbConversation;
  let view: ConversationView;
  if (c.type === "direct") {
    const otherId = participantIds.find((pid) => pid !== authUser.id);
    const other = otherId
      ? toUserLite(usersById.get(otherId) ?? { id: otherId, username: null, full_name: null, avatar_url: null })
      : undefined;
    view = {
      id: c.id,
      kind: "dm",
      other_user: other,
      title: other ? formatName(other) : "Direct message",
      unread_count: 0,
      last_message: messages[messages.length - 1],
    };
  } else {
    const { data: gData } = c.group_id
      ? await supabase.from("groups").select("*").eq("id", c.group_id).maybeSingle()
      : { data: null };
    const g = gData as DbGroup | null;
    const groupView: GroupView | undefined = g
      ? {
          id: g.id,
          name: g.name,
          invite_code: g.join_code,
          admin_id: g.admin_id ?? "",
          created_at: g.created_at,
          admin: toUserLite(usersById.get(g.admin_id ?? "") ?? { id: g.admin_id ?? "", username: null, full_name: null, avatar_url: null }),
          member_count: participantIds.length,
          is_admin: g.admin_id === authUser.id,
          pending_join_count: 0,
        }
      : undefined;
    view = {
      id: c.id,
      kind: "group",
      group: groupView,
      title: g?.name ?? "Group chat",
      unread_count: 0,
      last_message: messages[messages.length - 1],
    };
  }

  return { conversation: view, messages, participants };
}

function toChatMessageView(m: DbMessage, usersById: Map<string, DbUser>): ChatMessageView {
  const sender = toUserLite(
    usersById.get(m.sender_id ?? "") ?? {
      id: m.sender_id ?? "unknown",
      username: null,
      full_name: null,
      avatar_url: null,
    },
  );
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

function toUserLite(u: DbUser): UserLite {
  return {
    id: u.id,
    first_name: u.full_name?.trim() ?? null,
    last_name_initial: null,
    username: u.username,
    avatar_color: pickAvatarColor(u.id),
    avatar_url: u.avatar_url ?? null,
  };
}

function formatName(u: UserLite): string {
  if (u.first_name) return u.first_name;
  if (u.username) return `@${u.username}`;
  return "Friend";
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
