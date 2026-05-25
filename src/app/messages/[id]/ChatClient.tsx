"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { FaydThatSheet } from "@/components/FaydThatSheet";
import { StartNewContractSheet } from "@/components/StartNewContractSheet";
import { BetSharePicker } from "@/components/BetSharePicker";
import { Toast } from "@/components/Toast";
import { USE_MOCK_DATA } from "@/lib/config";
import { fullName } from "@/lib/format";
import { makeHandlers } from "@/app/HomeClient";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, toChatMessageView } from "@/lib/data/messagesClient";
import {
  addChatMessage,
  getExtraMessages,
  getSessionBetById,
  markConversationRead,
  useSessionStore,
} from "@/lib/sessionState";
import type {
  BetView,
  ChatMessageView,
  ConversationView,
  UserLite,
} from "@/types/db";

type FaydSheetState = { betId: string; subContractId: string | null } | null;
type StartSheetState = { betId: string; initialYesProbability?: number } | null;

interface Props {
  conversation: ConversationView;
  initialMessages: ChatMessageView[];
  /** Bets referenced by bet-messages in this thread. Kept mutable in local state. */
  initialBets: BetView[];
  /** Bets the current user can share into a DM. */
  shareableBets: BetView[];
  currentUser: UserLite;
}

export function ChatClient({
  conversation,
  initialMessages,
  initialBets,
  shareableBets,
  currentUser,
}: Props) {
  const [bets, setBets] = useState<BetView[]>(initialBets);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [faydSheet, setFaydSheet] = useState<FaydSheetState>(null);
  const [startSheet, setStartSheet] = useState<StartSheetState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handlers = makeHandlers({ currentUser, setBets, setToast });

  // Mark as read on first mount so the inbox + bottom-nav badges drop.
  useEffect(() => {
    markConversationRead(conversation.id);
  }, [conversation.id]);

  // Subscribe to the session store so cross-page additions (e.g. auto-posted
  // group bets) trigger a re-render here.
  useSessionStore();
  const sessionExtras = getExtraMessages(conversation.id);
  // Live messages received via realtime subscription this session.
  const [liveMessages, setLiveMessages] = useState<ChatMessageView[]>([]);
  const messages = useMemo(() => {
    const all = [...initialMessages, ...sessionExtras, ...liveMessages];
    const seen = new Set<string>();
    const out: ChatMessageView[] = [];
    for (const m of all) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [initialMessages, sessionExtras, liveMessages]);

  // Realtime: subscribe to new messages for this conversation and merge them
  // into local state so the thread updates without a refresh.
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string | null;
            content: string | null;
            bet_id: string | null;
            created_at: string;
          };
          // Skip our own optimistic inserts (already added in sendText / shareBet).
          if (row.sender_id === currentUser.id) return;
          // Pull sender profile so the bubble renders correctly.
          let senderLite: UserLite = {
            id: row.sender_id ?? "unknown",
            first_name: null,
            last_name_initial: null,
            username: null,
            avatar_color: "blue",
          };
          if (row.sender_id) {
            const { data: u } = await supabase
              .from("users")
              .select("id, username, full_name")
              .eq("id", row.sender_id)
              .maybeSingle();
            if (u) {
              const parts = (u.full_name ?? "").trim().split(/\s+/).filter(Boolean);
              const first = parts[0] ?? null;
              const last =
                parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
              senderLite = {
                id: u.id,
                first_name: first,
                last_name_initial: last && last.length ? last : null,
                username: u.username,
                avatar_color: senderLite.avatar_color,
              };
            }
          }
          const view = toChatMessageView(row, senderLite);
          setLiveMessages((xs) => (xs.some((m) => m.id === view.id) ? xs : [...xs, view]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUser.id]);

  // Hydrate inline bet cards: any bet referenced by an extra/session message
  // that isn't already in local `bets` should be pulled from the session store.
  const allBets = useMemo(() => {
    const byId = new Map<string, BetView>(bets.map((b) => [b.id, b]));
    for (const m of messages) {
      if (m.kind === "bet" && m.bet_id && !byId.has(m.bet_id)) {
        const sb = getSessionBetById(m.bet_id);
        if (sb) byId.set(sb.id, sb);
      }
    }
    return Array.from(byId.values());
  }, [bets, messages]);

  // Auto-scroll to bottom when the message list grows.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const faydBet = useMemo(
    () => (faydSheet ? allBets.find((b) => b.id === faydSheet.betId) ?? null : null),
    [allBets, faydSheet],
  );
  const faydSubContract = useMemo(() => {
    if (!faydSheet?.subContractId || !faydBet?.post_meta) return null;
    return faydBet.post_meta.sub_contracts.find((s) => s.id === faydSheet.subContractId) ?? null;
  }, [faydBet, faydSheet]);
  const startBet = useMemo(
    () => (startSheet ? allBets.find((b) => b.id === startSheet.betId) ?? null : null),
    [allBets, startSheet],
  );

  async function sendText() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");

    if (USE_MOCK_DATA) {
      addChatMessage(conversation.id, {
        id: `m-new-${Date.now()}`,
        conversation_id: conversation.id,
        sender: currentUser,
        kind: "text",
        text,
        created_at: new Date().toISOString(),
      });
      return;
    }

    // Optimistic local insert so the bubble shows immediately, then upsert
    // with the server id once the insert returns.
    const tempId = `m-new-${Date.now()}`;
    addChatMessage(conversation.id, {
      id: tempId,
      conversation_id: conversation.id,
      sender: currentUser,
      kind: "text",
      text,
      created_at: new Date().toISOString(),
    });
    try {
      await sendMessage({ conversationId: conversation.id, content: text }, currentUser);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't send · ${e.message}` : "Couldn't send message");
    }
  }

  async function shareBet(bet: BetView) {
    setPickerOpen(false);
    setBets((xs) => (xs.some((b) => b.id === bet.id) ? xs : [...xs, bet]));

    if (USE_MOCK_DATA) {
      addChatMessage(conversation.id, {
        id: `m-share-${Date.now()}`,
        conversation_id: conversation.id,
        sender: currentUser,
        kind: "bet",
        bet_id: bet.id,
        created_at: new Date().toISOString(),
      });
      return;
    }

    const tempId = `m-share-${Date.now()}`;
    addChatMessage(conversation.id, {
      id: tempId,
      conversation_id: conversation.id,
      sender: currentUser,
      kind: "bet",
      bet_id: bet.id,
      created_at: new Date().toISOString(),
    });
    try {
      await sendMessage({ conversationId: conversation.id, betId: bet.id }, currentUser);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't share · ${e.message}` : "Couldn't share bet");
    }
  }

  const isGroup = conversation.kind === "group";

  return (
    <>
      <ol className="flex-1 flex flex-col gap-2 px-3 pt-4 pb-2 overflow-y-auto">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const isMe = m.sender.id === currentUser.id;
          // Stack consecutive messages from the same sender by suppressing the avatar/name.
          const sameAuthorAsPrev = prev && prev.sender.id === m.sender.id;
          const showSenderHeader = !isMe && isGroup && !sameAuthorAsPrev;
          const bet = m.kind === "bet" && m.bet_id ? bets.find((b) => b.id === m.bet_id) : null;
          return (
            <li key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              {showSenderHeader ? (
                <div className="flex items-center gap-1.5 ml-1 mb-0.5 text-[11px] text-text3">
                  <Avatar
                    first={m.sender.first_name}
                    lastInitial={m.sender.last_name_initial}
                    color={m.sender.avatar_color}
                    size={18}
                  />
                  {fullName(m.sender)}
                </div>
              ) : null}

              {m.kind === "text" ? (
                <TextBubble text={m.text ?? ""} isMe={isMe} />
              ) : null}

              {m.kind === "bet" && bet ? (
                <div className={`max-w-[95%] w-full ${isMe ? "self-end" : "self-start"}`}>
                  <div className={`text-[10px] uppercase tracking-wide text-text3 mb-1 ${isMe ? "text-right" : "text-left"}`}>
                    {isMe ? "You shared" : `${m.sender.first_name} shared`} · {ago(m.created_at)}
                  </div>
                  <PostCard
                    bet={bet}
                    currentUserId={currentUser.id}
                    currentUser={currentUser}
                    onFaydThat={() => setFaydSheet({ betId: bet.id, subContractId: null })}
                    onCounter={(b) =>
                      setStartSheet({ betId: b.id, initialYesProbability: b.yes_probability })
                    }
                    onComment={() => setToast("Comments coming soon")}
                    onStartNewContract={(b) => setStartSheet({ betId: b.id })}
                    onReact={handlers.onReact}
                    onVote={handlers.onVote}
                    onAcceptMediator={handlers.onAcceptMediator}
                    onMarkConcluded={handlers.onMarkConcluded}
                    onOpenSubContract={(b, subContractId) =>
                      setFaydSheet({ betId: b.id, subContractId })
                    }
                  />
                </div>
              ) : null}

              {m.kind === "bet" && !bet ? (
                <TextBubble text="[bet card unavailable]" isMe={isMe} />
              ) : null}

              <div className={`text-[10px] text-text3 mt-0.5 ${isMe ? "mr-1" : "ml-1"}`}>
                {ago(m.created_at)}
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      {/* Composer */}
      <div className="sticky bottom-0 bg-bg2/95 backdrop-blur border-t border-bg3 px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => setPickerOpen(true)}
          aria-label="Share a bet"
          className="w-9 h-9 rounded-pill bg-bg3 hover:bg-bg4 inline-flex items-center justify-center text-text2 shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-5 h-5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder="Message…"
          className="flex-1 bg-bg3 rounded-pill px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-yes/40"
        />
        <button
          onClick={sendText}
          disabled={draft.trim().length === 0}
          aria-label="Send"
          className="w-9 h-9 rounded-pill bg-yes text-bg inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
          </svg>
        </button>
      </div>

      <BetSharePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        bets={shareableBets}
        onPick={shareBet}
      />

      <FaydThatSheet
        open={!!faydSheet}
        onClose={() => setFaydSheet(null)}
        bet={faydBet}
        subContract={faydSubContract}
        onConfirm={(p) => {
          handlers.onConfirmFill(p);
          setFaydSheet(null);
        }}
      />

      <StartNewContractSheet
        open={!!startSheet}
        onClose={() => setStartSheet(null)}
        bet={startBet}
        initialYesProbability={startSheet?.initialYesProbability}
        onPost={(p) => {
          handlers.onPostSubContract(p);
          setStartSheet(null);
        }}
      />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}

function TextBubble({ text, isMe }: { text: string; isMe: boolean }) {
  return (
    <div
      className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words ${
        isMe ? "bg-yes text-bg rounded-br-md" : "bg-bg3 text-text rounded-bl-md"
      }`}
    >
      {text}
    </div>
  );
}

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
