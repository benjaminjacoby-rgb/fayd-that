"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { PostCard } from "@/components/PostCard";
import { FaydThatSheet } from "@/components/FaydThatSheet";
import { StartNewContractSheet } from "@/components/StartNewContractSheet";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/Toast";
import { fullName } from "@/lib/format";
import { makeHandlers } from "@/app/HomeClient";
import type { MockPendingJoin } from "@/lib/mock";
import type { BetView, GroupView, UserLite } from "@/types/db";

type Tab = "feed" | "members" | "pending";
type FaydSheetState = { betId: string; subContractId: string | null } | null;
type StartSheetState = { betId: string; initialYesProbability?: number } | null;

export function GroupClient({
  group,
  initialMembers,
  initialPending,
  bets: initialBets,
  currentUser,
}: {
  group: GroupView;
  initialMembers: UserLite[];
  initialPending: MockPendingJoin[];
  bets: BetView[];
  currentUser: UserLite;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const [members, setMembers] = useState<UserLite[]>(initialMembers);
  const [pending, setPending] = useState<MockPendingJoin[]>(initialPending);
  const [bets, setBets] = useState<BetView[]>(initialBets);
  const [adminId, setAdminId] = useState<string>(group.admin_id);
  const [faydSheet, setFaydSheet] = useState<FaydSheetState>(null);
  const [startSheet, setStartSheet] = useState<StartSheetState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isAdmin = adminId === currentUser.id;

  const handlers = makeHandlers({ currentUser, setBets, setToast });

  const faydBet = useMemo(
    () => (faydSheet ? bets.find((b) => b.id === faydSheet.betId) ?? null : null),
    [bets, faydSheet],
  );
  const faydSubContract = useMemo(() => {
    if (!faydSheet?.subContractId || !faydBet?.post_meta) return null;
    return faydBet.post_meta.sub_contracts.find((s) => s.id === faydSheet.subContractId) ?? null;
  }, [faydBet, faydSheet]);
  const startBet = useMemo(
    () => (startSheet ? bets.find((b) => b.id === startSheet.betId) ?? null : null),
    [bets, startSheet],
  );

  // ── Admin actions ─────────────────────
  function approve(pj: MockPendingJoin) {
    setPending((xs) => xs.filter((x) => x.id !== pj.id));
    setMembers((xs) => [...xs, pj.user]);
    setToast(`${pj.user.first_name} added to ${group.name}`);
  }
  function reject(pj: MockPendingJoin) {
    setPending((xs) => xs.filter((x) => x.id !== pj.id));
    setToast(`Request from ${pj.user.first_name} declined`);
  }
  function removeMember(user: UserLite) {
    if (user.id === adminId) return;
    setMembers((xs) => xs.filter((m) => m.id !== user.id));
    setToast(`${user.first_name} removed`);
  }
  function transferAdmin(user: UserLite) {
    setAdminId(user.id);
    setToast(`Admin transferred to ${user.first_name}`);
  }

  return (
    <div className="px-4 pt-4 pb-6">
      {/* Header card */}
      <section className="bg-bg2 rounded-card p-4 mb-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-card bg-purple/20 text-purple flex items-center justify-center font-bold">
          {initialsOf(group.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold truncate">{group.name}</h2>
            {isAdmin ? (
              <span className="text-[10px] uppercase tracking-wide bg-gold/20 text-gold rounded-pill px-1.5 py-px font-semibold">
                admin
              </span>
            ) : null}
          </div>
          <div className="text-text3 text-[11px] mt-0.5">
            {members.length} member{members.length === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            code <span className="font-mono text-text2">{group.invite_code}</span>
          </div>
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(group.invite_code);
            setToast(`Code ${group.invite_code} copied`);
          }}
          className="text-xs bg-bg3 hover:bg-bg4 rounded-pill px-3 py-1.5"
        >
          Copy code
        </button>
      </section>

      <Tabs
        tab={tab}
        setTab={setTab}
        feedCount={bets.length}
        memberCount={members.length}
        pendingCount={isAdmin ? pending.length : 0}
        showPending={isAdmin}
      />

      {tab === "feed" ? (
        bets.length === 0 ? (
          <Empty body="No bets in this group yet." />
        ) : (
          <ul className="flex flex-col gap-3 mt-2">
            {bets.map((b) => (
              <li key={b.id}>
                <PostCard
                  bet={b}
                  currentUserId={currentUser.id}
                  currentUser={currentUser}
                  onFaydThat={() => setFaydSheet({ betId: b.id, subContractId: null })}
                  onCounter={(bet) =>
                    setStartSheet({ betId: bet.id, initialYesProbability: bet.yes_probability })
                  }
                  onComment={() => setToast("Comments coming soon")}
                  onStartNewContract={(bet) => setStartSheet({ betId: bet.id })}
                  onReact={handlers.onReact}
                  onVote={handlers.onVote}
                  onAcceptMediator={handlers.onAcceptMediator}
                  onMarkConcluded={handlers.onMarkConcluded}
                  onOpenSubContract={(bet, subContractId) =>
                    setFaydSheet({ betId: bet.id, subContractId })
                  }
                />
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "members" ? (
        <ul className="flex flex-col divide-y divide-bg3 mt-2">
          {members.map((m) => {
            const isMemberAdmin = m.id === adminId;
            const isMe = m.id === currentUser.id;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Avatar
                  first={m.first_name}
                  lastInitial={m.last_name_initial}
                  color={m.avatar_color}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {isMe ? "You" : fullName(m)}
                    {isMemberAdmin ? (
                      <span className="text-[10px] uppercase tracking-wide bg-gold/20 text-gold rounded-pill px-1.5 py-px font-semibold">
                        admin
                      </span>
                    ) : null}
                  </div>
                  <div className="text-text3 text-xs">@{m.username ?? "—"}</div>
                </div>
                {isAdmin && !isMemberAdmin && !isMe ? (
                  <MemberMenu
                    onTransfer={() => transferAdmin(m)}
                    onRemove={() => removeMember(m)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === "pending" && isAdmin ? (
        pending.length === 0 ? (
          <Empty body="No pending join requests." />
        ) : (
          <ul className="flex flex-col gap-2 mt-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="bg-bg2 rounded-card p-3 flex items-center gap-3"
              >
                <Avatar
                  first={p.user.first_name}
                  lastInitial={p.user.last_name_initial}
                  color={p.user.avatar_color}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{fullName(p.user)}</div>
                  <div className="text-text3 text-xs">@{p.user.username ?? "—"}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="primary" onClick={() => approve(p)}>Approve</Button>
                  <Button variant="ghost" onClick={() => reject(p)}>Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

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
    </div>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "G";
}

function Tabs({
  tab,
  setTab,
  feedCount,
  memberCount,
  pendingCount,
  showPending,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  feedCount: number;
  memberCount: number;
  pendingCount: number;
  showPending: boolean;
}) {
  const items: Array<{ id: Tab; label: string; badge?: number; show: boolean }> = [
    { id: "feed",    label: "Feed",    badge: feedCount,    show: true },
    { id: "members", label: "Members", badge: memberCount,  show: true },
    { id: "pending", label: "Pending", badge: pendingCount, show: showPending },
  ];
  const visible = items.filter((i) => i.show);
  return (
    <div
      className="grid gap-1 bg-bg2 rounded-pill p-1 mb-2"
      style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
    >
      {visible.map((it) => {
        const active = it.id === tab;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className={`rounded-pill text-sm font-medium py-2 transition ${
              active ? "bg-yes text-bg" : "text-text2"
            }`}
          >
            {it.label}
            {!active && it.badge !== undefined && it.badge > 0 ? (
              <span className="ml-1.5 text-[10px] bg-bg4 text-text2 rounded-pill px-1.5 py-px font-mono">
                {it.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MemberMenu({ onTransfer, onRemove }: { onTransfer: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-pill bg-bg3 hover:bg-bg4 inline-flex items-center justify-center"
        aria-label="member actions"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-text2">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute right-0 mt-1 z-20 bg-bg3 rounded-input shadow-lg overflow-hidden w-44">
            <li>
              <button
                onClick={() => { setOpen(false); onTransfer(); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-bg4 text-text"
              >
                Transfer admin
              </button>
            </li>
            <li>
              <button
                onClick={() => { setOpen(false); onRemove(); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-bg4 text-no"
              >
                Remove from group
              </button>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Empty({ body }: { body: string }) {
  return (
    <div className="text-text3 text-sm italic text-center mt-10">{body}</div>
  );
}
