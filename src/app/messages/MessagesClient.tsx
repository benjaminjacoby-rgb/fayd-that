"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { fullName } from "@/lib/format";
import { isConversationRead, useSessionStore } from "@/lib/sessionState";
import { USE_MOCK_DATA } from "@/lib/config";
import { getOrCreateConversationWithFriends } from "@/lib/data/messagesClient";
import type { ChatMessageView, ConversationView, UserLite } from "@/types/db";

export function MessagesClient({
  dms: dmsProp,
  groups: groupsProp,
  currentUserId,
  friends,
}: {
  dms: ConversationView[];
  groups: ConversationView[];
  currentUserId: string;
  friends: UserLite[];
}) {
  const router = useRouter();
  useSessionStore(); // re-render when read state changes
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [pickerOpen, setPickerOpen] = useState(false);

  // Override unread_count to 0 for any conversation the user opened this session.
  const applyRead = useCallback(
    (xs: ConversationView[]): ConversationView[] =>
      mounted
        ? xs.map((c) => (isConversationRead(c.id) ? { ...c, unread_count: 0 } : c))
        : xs,
    [mounted],
  );

  // Merge DMs and group chats into one list sorted by most recent message.
  const all = useMemo(() => {
    const merged = [...applyRead(dmsProp), ...applyRead(groupsProp)];
    merged.sort((a, b) => {
      const ta = a.last_message?.created_at ?? a.id;
      const tb = b.last_message?.created_at ?? b.id;
      return tb.localeCompare(ta);
    });
    return merged;
  }, [dmsProp, groupsProp, applyRead]);

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-input bg-yes text-bg font-semibold text-sm py-2.5 hover:brightness-110 transition"
        >
          New Message
        </button>
      </div>

      {all.length === 0 ? (
        <Empty label="No messages yet." />
      ) : (
        <ul className="flex flex-col divide-y divide-bg3">
          {all.map((c) => (
            <li key={c.id}>
              <ConversationRow row={c} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <NewMessagePicker
          friends={friends}
          onClose={() => setPickerOpen(false)}
          onCreated={(conversationId) => {
            setPickerOpen(false);
            router.refresh();
            router.push(`/messages/${conversationId}`);
          }}
        />
      ) : null}
    </div>
  );
}

function NewMessagePicker({
  friends,
  onClose,
  onCreated,
}: {
  friends: UserLite[];
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => (a.first_name ?? "").localeCompare(b.first_name ?? "")),
    [friends],
  );

  function toggle(id: string) {
    setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  }

  async function create() {
    if (selected.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      if (USE_MOCK_DATA) {
        // Mock mode can't represent ad-hoc multi-party convos. Single-friend
        // selections route to the seeded `dm-<friendId>` mock conversation.
        if (selected.length === 1) {
          onCreated(`dm-${selected[0]}`);
          return;
        }
        setError("Multi-party chats require Supabase (not available in mock mode).");
        return;
      }
      const convId = await getOrCreateConversationWithFriends(selected);
      onCreated(convId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-app bg-bg2 rounded-t-2xl shadow-2xl px-5 pt-2 pb-6 max-h-[80vh] flex flex-col">
        <div className="flex justify-center mb-2">
          <div className="h-1 w-10 rounded-pill bg-bg4" />
        </div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold">New message</h2>
          <span className="text-text3 text-xs">
            {selected.length === 0
              ? "Pick a friend"
              : selected.length === 1
                ? "1 selected · DM"
                : `${selected.length} selected · group chat`}
          </span>
        </div>

        {sortedFriends.length === 0 ? (
          <p className="text-text3 text-sm py-6 text-center">
            You don't have any friends yet — add some from the Friends tab.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto -mx-5 px-5 divide-y divide-bg3">
            {sortedFriends.map((f) => {
              const active = selected.includes(f.id);
              return (
                <li key={f.id}>
                  <button
                    onClick={() => toggle(f.id)}
                    className="w-full flex items-center gap-3 py-3 text-left hover:bg-bg3/50 transition rounded"
                  >
                    <Avatar
                      first={f.first_name}
                      lastInitial={f.last_name_initial}
                      color={f.avatar_color}
                      imageUrl={f.avatar_url}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{fullName(f)}</div>
                      <div className="text-text3 text-xs truncate">@{f.username ?? "—"}</div>
                    </div>
                    <span
                      className={`shrink-0 w-5 h-5 rounded-pill inline-flex items-center justify-center text-[10px] font-bold ${
                        active
                          ? "bg-yes text-bg"
                          : "bg-bg3 text-text3 border border-bg4"
                      }`}
                      aria-hidden
                    >
                      {active ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error ? <p className="text-no text-xs mt-2">{error}</p> : null}

        <div className="mt-3 pt-3 border-t border-bg3">
          <Button full disabled={selected.length === 0 || busy} onClick={create}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}


function ConversationRow({
  row,
  currentUserId,
}: {
  row: ConversationView;
  currentUserId: string;
}) {
  return (
    <Link
      href={`/messages/${row.id}`}
      className="flex items-center gap-3 py-3 hover:bg-bg2/50 -mx-4 px-4 transition"
    >
      <ConvoAvatar row={row} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${row.unread_count > 0 ? "font-bold" : "font-semibold"}`}>
            {row.title}
          </span>
          {row.last_message ? (
            <span className="text-[11px] text-text3 font-mono shrink-0">
              {ago(row.last_message.created_at)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={`text-[13px] truncate ${
              row.unread_count > 0 ? "text-text" : "text-text3"
            }`}
          >
            {previewFor(row, currentUserId)}
          </p>
          {row.unread_count > 0 ? (
            <span className="bg-no text-bg text-[10px] font-bold rounded-pill px-1.5 py-px min-w-[18px] text-center">
              {row.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function ConvoAvatar({ row }: { row: ConversationView }) {
  if (row.kind === "dm" && row.other_user) {
    const o = row.other_user;
    return <Avatar first={o.first_name} lastInitial={o.last_name_initial} color={o.avatar_color} imageUrl={o.avatar_url} size={44} />;
  }
  // group: 2x2 grid look
  const initials = (row.title || "G")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="w-11 h-11 rounded-pill bg-purple/20 text-purple flex items-center justify-center font-bold text-sm">
      {initials}
    </div>
  );
}

function previewFor(c: ConversationView, currentUserId: string): string {
  const m = c.last_message;
  if (!m) return "Say hi 👋";
  const senderPrefix = senderLabel(m, c, currentUserId);
  if (m.kind === "text") return senderPrefix ? `${senderPrefix}: ${m.text}` : m.text ?? "";
  if (m.kind === "bet")  return senderPrefix ? `${senderPrefix} shared a bet 🎲` : "shared a bet 🎲";
  return "";
}

function senderLabel(m: ChatMessageView, c: ConversationView, currentUserId: string): string {
  if (m.sender.id === currentUserId) return c.kind === "group" ? "You" : "";
  if (c.kind === "group") return m.sender.first_name ?? "";
  return ""; // DM other-user preview doesn't need a name prefix
}

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Empty({ label }: { label: string }) {
  return <div className="text-text3 text-sm italic text-center mt-12">{label}</div>;
}

// Convenience re-export for the chat page to reuse the helper without a duplicate file.
export type { UserLite };
