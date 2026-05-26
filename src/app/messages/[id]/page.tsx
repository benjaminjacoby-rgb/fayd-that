import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatClient } from "./ChatClient";
import { BottomNav } from "@/components/BottomNav";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  MOCK_BETS,
  MOCK_CURRENT_USER,
  mockBetById,
  mockConversationById,
  mockMessagesFor,
  mockShareableBetsForCurrentUser,
} from "@/lib/mock";
import { getCurrentUserRow } from "@/lib/data/profile";
import { getConversationById } from "@/lib/data/messages";
import { getFeedBets } from "@/lib/data/bets";
import type { BetView, ConversationView } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: { id: string } }) {
  if (USE_MOCK_DATA) {
    const conversation = mockConversationById(params.id);
    if (!conversation) notFound();
    const messages = mockMessagesFor(params.id);
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

  const result = await getConversationById(params.id);
  if (!result) notFound();
  const { conversation, messages } = result;

  // Pull bets referenced by `bet` messages so the inline PostCards render.
  const referencedIds = new Set<string>();
  for (const m of messages) {
    if (m.kind === "bet" && m.bet_id) referencedIds.add(m.bet_id);
  }
  const allBets = await getFeedBets();
  const referencedBets = allBets.filter((b) => referencedIds.has(b.id));
  // Anything live the user could share into this thread.
  const me = (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const shareable = allBets.filter(
    (b) =>
      (b.creator_id === me.id || (b.contracts ?? []).some((c) => c.yes_user_id === me.id || c.no_user_id === me.id)) &&
      (b.status === "open" || b.status === "locked"),
  );
  const activeCount = allBets.filter((b) => b.status === "open" || b.status === "locked").length;

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
            avatar_url: me.avatar_url ?? null,
          }}
        />
      </main>
      <BottomNav />
    </>
  );
}

function subtitleFor(c: ConversationView | undefined): string | undefined {
  if (!c) return undefined;
  if (c.kind === "group" && c.group) return `${c.group.member_count} members`;
  if (c.kind === "dm" && c.other_user?.username) return `@${c.other_user.username}`;
  return undefined;
}

function ChatHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  pendingCount?: number;
}) {
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
      </div>
    </header>
  );
}
