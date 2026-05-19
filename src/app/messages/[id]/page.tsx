import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatClient } from "./ChatClient";
import { BottomNav } from "@/components/BottomNav";
import {
  MOCK_BETS,
  MOCK_CURRENT_USER,
  mockBetById,
  mockConversationById,
  mockMessagesFor,
  mockShareableBetsForCurrentUser,
} from "@/lib/mock";
import type { BetView } from "@/types/db";

export const dynamic = "force-dynamic";

export default function ChatPage({ params }: { params: { id: string } }) {
  const conversation = mockConversationById(params.id);
  if (!conversation) notFound();

  const messages = mockMessagesFor(params.id);
  // Build a map of all bets referenced by `bet` messages so the chat can
  // render full PostCards inline without re-fetching.
  const referencedIds = new Set<string>();
  for (const m of messages) {
    if (m.kind === "bet" && m.bet_id) referencedIds.add(m.bet_id);
  }
  const referencedBets: BetView[] = [];
  for (const id of referencedIds) {
    const b = mockBetById(id);
    if (b) referencedBets.push(b);
  }
  const shareable = mockShareableBetsForCurrentUser();
  const activeCount = MOCK_BETS.filter(
    (b) => b.status === "open" || b.status === "locked",
  ).length;

  const me = MOCK_CURRENT_USER;

  return (
    <>
      <ChatHeader title={conversation.title} subtitle={subtitleFor(conversation)} pendingCount={activeCount} />
      <main className="flex-1 flex flex-col bg-bg pb-0">
        <ChatClient
          conversation={conversation}
          initialMessages={messages}
          initialBets={referencedBets}
          shareableBets={shareable}
          currentUser={{
            id: me.id,
            first_name: me.first_name,
            last_name_initial: me.last_name_initial,
            username: me.username,
            avatar_color: me.avatar_color,
          }}
        />
      </main>
      <BottomNav />
    </>
  );
}

function subtitleFor(c: ReturnType<typeof mockConversationById>): string | undefined {
  if (!c) return undefined;
  if (c.kind === "group" && c.group) return `${c.group.member_count} members`;
  if (c.kind === "dm" && c.other_user?.username) return `@${c.other_user.username}`;
  return undefined;
}

function ChatHeader({
  title,
  subtitle,
  pendingCount,
}: {
  title: string;
  subtitle?: string;
  pendingCount: number;
}) {
  // Custom TopBar replacement: includes a back link and a stacked title/subtitle.
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-bg2">
      <div className="flex items-center gap-2 px-2 py-3">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center text-text2 hover:text-text"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold tracking-tight truncate">{title}</h1>
          {subtitle ? <div className="text-text3 text-[11px] truncate">{subtitle}</div> : null}
        </div>
        <TopBarHeader pendingCount={pendingCount} />
      </div>
    </header>
  );
}

function TopBarHeader({ pendingCount }: { pendingCount: number }) {
  // Reuses the same controls as the standard TopBar to keep parity.
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/pending"
        aria-label="Pending bets"
        className="relative w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center text-text2 hover:text-text"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {pendingCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-no text-bg text-[10px] font-bold rounded-pill px-1.5 py-px min-w-[18px] text-center">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

