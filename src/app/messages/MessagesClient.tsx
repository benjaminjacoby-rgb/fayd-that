"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { fullName } from "@/lib/format";
import { isConversationRead, useSessionStore } from "@/lib/sessionState";
import type { ChatMessageView, ConversationView, UserLite } from "@/types/db";

type Tab = "dm" | "group";

export function MessagesClient({
  dms: dmsProp,
  groups: groupsProp,
  currentUserId,
}: {
  dms: ConversationView[];
  groups: ConversationView[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("dm");
  useSessionStore(); // re-render when read state changes
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Override unread_count to 0 for any conversation the user opened this session.
  const applyRead = (xs: ConversationView[]): ConversationView[] =>
    mounted
      ? xs.map((c) => (isConversationRead(c.id) ? { ...c, unread_count: 0 } : c))
      : xs;
  const dms = applyRead(dmsProp);
  const groups = applyRead(groupsProp);

  const rows = tab === "dm" ? dms : groups;
  const totalDm = dms.reduce((s, c) => s + c.unread_count, 0);
  const totalGroup = groups.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="grid grid-cols-2 gap-1 bg-bg2 rounded-pill p-1 mb-3">
        <TabButton active={tab === "dm"}    badge={totalDm}    label="DMs"    onClick={() => setTab("dm")} />
        <TabButton active={tab === "group"} badge={totalGroup} label="Groups" onClick={() => setTab("group")} />
      </div>

      {rows.length === 0 ? (
        <Empty label={tab === "dm" ? "No DMs yet." : "No group chats yet."} />
      ) : (
        <ul className="flex flex-col divide-y divide-bg3">
          {rows.map((c) => (
            <li key={c.id}>
              <ConversationRow row={c} currentUserId={currentUserId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  badge,
  label,
  onClick,
}: {
  active: boolean;
  badge: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-pill text-sm font-medium py-2 transition ${
        active ? "bg-yes text-bg" : "text-text2"
      }`}
    >
      {label}
      {!active && badge > 0 ? (
        <span className="ml-1.5 text-[10px] bg-no text-bg rounded-pill px-1.5 py-px font-mono">
          {badge}
        </span>
      ) : null}
    </button>
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
    return <Avatar first={o.first_name} lastInitial={o.last_name_initial} color={o.avatar_color} size={44} />;
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
