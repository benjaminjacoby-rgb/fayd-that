"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { MAX_PROBABILITY, MIN_PROBABILITY, USE_MOCK_DATA } from "@/lib/config";
import { formatCents, fullName } from "@/lib/format";
import { createBet } from "@/lib/data/betsClient";
import { addChatMessage, addMyPost } from "@/lib/sessionState";
import type {
  BetScope,
  BetSide,
  BetView,
  ChatMessageView,
  GroupRow,
  MediatorState,
  UserLite,
  UserRow,
} from "@/types/db";

// Stake tiers for the Social Composer ($5/$10/$25/$50/$100).
const STAKE_OPTIONS_CENTS = [500, 1000, 2500, 5000, 10000] as const;
const DEFAULT_STAKE_CENTS = 1000;

type Panel = "audience" | "mediator" | "expiry" | null;
type ScopeKind = BetScope; // "friends" | "group"
type MediatorChoice = "self" | "request";
type ExpiryKind = "none" | "24h" | "3d" | "1w" | "custom";

interface Props {
  walletCents: number;
  friends: UserRow[];
  groups: GroupRow[];
  groupMemberCounts: Record<string, number>;
  currentUser: UserLite;
}

export function CreateBetClient({
  walletCents,
  friends,
  groups,
  groupMemberCounts,
  currentUser,
}: Props) {
  const router = useRouter();

  // ── Composer state ─────────────────────────────────────────────────────
  const [question, setQuestion] = useState("");
  // Poster's confidence in their chosen side, 5–95.
  const [posterOdds, setPosterOdds] = useState(50);
  const [posterSide, setPosterSide] = useState<BetSide>("yes");
  const [stakeCents, setStakeCents] = useState<number>(DEFAULT_STAKE_CENTS);

  // ── Audience state ─────────────────────────────────────────────────────
  // Default: "All Friends" — scope=friends, no targetIds means everyone.
  const [scope, setScope] = useState<ScopeKind>("friends");
  // null = all friends selected; non-null Set = explicit subset.
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string> | null>(
    null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // ── Mediator state ─────────────────────────────────────────────────────
  const [mediatorChoice, setMediatorChoice] = useState<MediatorChoice>("self");
  const [mediatorFriendId, setMediatorFriendId] = useState<string | null>(null);

  // ── Expiry state ───────────────────────────────────────────────────────
  const [expiryKind, setExpiryKind] = useState<ExpiryKind>("none");
  // YYYY-MM-DDTHH:MM, populated when expiryKind === "custom".
  const [customExpiry, setCustomExpiry] = useState<string>("");

  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────
  // YES probability (canonical). The slider tracks the poster's odds in their
  // chosen side; we convert at write time so the rest of the system (PostCard,
  // settle_bet) keeps treating `yes_probability` as YES's chance of winning.
  const yesProbability =
    posterSide === "yes" ? posterOdds : 100 - posterOdds;
  const yesPercent = yesProbability;
  const noPercent = 100 - yesProbability;

  // Payout if correct = stake + counter-party stake. No fees deducted.
  const payoutIfCorrectCents = useMemo(() => {
    const p = posterOdds / 100;
    if (p <= 0 || p >= 1) return 0;
    return Math.round(stakeCents / p);
  }, [posterOdds, stakeCents]);

  // ── Audience helpers ───────────────────────────────────────────────────
  const targetFriendIds: string[] =
    scope === "friends" && selectedFriendIds
      ? Array.from(selectedFriendIds)
      : [];
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const audienceLabel = (() => {
    if (scope === "group") {
      return selectedGroup ? `👥 ${selectedGroup.name}` : "👥 Pick a group";
    }
    if (!selectedFriendIds) return "👥 All Friends";
    const n = selectedFriendIds.size;
    if (n === 0) return "👥 Pick friends";
    return `👥 ${n} ${n === 1 ? "friend" : "friends"}`;
  })();

  // ── Mediator helpers ───────────────────────────────────────────────────
  const mediatorFriend = useMemo(
    () => friends.find((f) => f.id === mediatorFriendId) ?? null,
    [friends, mediatorFriendId],
  );
  const mediatorLabel =
    mediatorChoice === "self"
      ? "⚖️ Self-mediate"
      : mediatorFriend
        ? `⚖️ ${fullName(mediatorFriend)}`
        : "⚖️ Request mediator";

  // ── Expiry helpers ─────────────────────────────────────────────────────
  function resolveExpiresAt(): string | null {
    const now = Date.now();
    switch (expiryKind) {
      case "24h":
        return new Date(now + 24 * 3600_000).toISOString();
      case "3d":
        return new Date(now + 3 * 24 * 3600_000).toISOString();
      case "1w":
        return new Date(now + 7 * 24 * 3600_000).toISOString();
      case "custom":
        if (!customExpiry) return null;
        return new Date(customExpiry).toISOString();
      case "none":
      default:
        return null;
    }
  }
  const expiryLabel = (() => {
    switch (expiryKind) {
      case "24h":
        return "⏱ 24 hours";
      case "3d":
        return "⏱ 3 days";
      case "1w":
        return "⏱ 1 week";
      case "custom":
        return customExpiry ? `⏱ ${formatLocal(customExpiry)}` : "⏱ Pick date & time";
      case "none":
      default:
        return "⏱ No expiry";
    }
  })();

  // ── Submit ─────────────────────────────────────────────────────────────
  const canSubmit =
    question.trim().length > 4 &&
    stakeCents > 0 &&
    stakeCents <= walletCents &&
    (scope !== "group" || !!selectedGroupId) &&
    (mediatorChoice !== "request" || !!mediatorFriendId);

  function togglePanel(p: Exclude<Panel, null>) {
    setOpenPanel((cur) => (cur === p ? null : p));
  }

  function toggleFriend(id: string) {
    setSelectedFriendIds((cur) => {
      // Switching from "all" into explicit subset starts from full set minus
      // the toggled friend, matching the user's natural mental model.
      if (cur === null) {
        const all = new Set(friends.map((f) => f.id));
        all.delete(id);
        return all;
      }
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFriends() {
    setSelectedFriendIds(null);
  }

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const expiry_at = new Date(Date.now() + 24 * 3600_000).toISOString();
      const expires_at = resolveExpiresAt();
      const mediatorType: "none" | "self" | "requested" =
        mediatorChoice === "self" ? "self" : "requested";
      const mediator_id =
        mediatorChoice === "request" ? mediatorFriendId : null;
      const mediatorState: MediatorState =
        mediatorChoice === "self"
          ? { mode: "accepted", mediator: currentUser }
          : mediatorFriend
            ? { mode: "accepted", mediator: toUserLite(mediatorFriend) }
            : { mode: "requested" };

      if (USE_MOCK_DATA) {
        const newBet: BetView = {
          id: `b-new-${Date.now()}`,
          creator_id: currentUser.id,
          question: question.trim(),
          category: "other",
          yes_probability: yesProbability,
          stake_cents: stakeCents,
          expiry_at,
          resolution_notes: null,
          status: "open",
          scope,
          group_id: scope === "group" ? selectedGroupId : null,
          expires_at,
          created_at: new Date().toISOString(),
          resolved_at: null,
          creator: currentUser,
          participants: [],
          contracts: [],
          open_negotiations: [],
          post_meta: {
            relationship: { kind: "self", label: "You" },
            poster_side: posterSide,
            original_filled_cents: 0,
            reactions: [],
            comments: [],
            poll: { yes_votes: 0, no_votes: 0, my_vote: null },
            sub_contracts: [],
            mediator: mediatorState,
            end_at: null,
            concluded: false,
            target_friend_ids:
              scope === "friends" && targetFriendIds.length > 0
                ? targetFriendIds
                : undefined,
          },
        };
        addMyPost(newBet);
        if (scope === "group" && selectedGroupId) {
          const msg: ChatMessageView = {
            id: `m-auto-${newBet.id}`,
            conversation_id: selectedGroupId,
            sender: currentUser,
            kind: "bet",
            bet_id: newBet.id,
            created_at: new Date().toISOString(),
          };
          addChatMessage(selectedGroupId, msg);
        }
        router.push("/");
        return;
      }

      const newBetId = await createBet({
        question: question.trim(),
        yes_probability: yesProbability,
        stake_cents: stakeCents,
        expiry_at,
        expires_at,
        scope,
        group_id: scope === "group" ? selectedGroupId : null,
        mediator_id,
        target_friend_ids: targetFriendIds,
        poster_side: posterSide,
        mediator_type: mediatorType,
      });

      const postedBet: BetView = {
        id: newBetId,
        creator_id: currentUser.id,
        question: question.trim(),
        category: "other",
        yes_probability: yesProbability,
        stake_cents: stakeCents,
        expiry_at,
        resolution_notes: null,
        status: "open",
        scope,
        group_id: scope === "group" ? selectedGroupId : null,
        created_at: new Date().toISOString(),
        resolved_at: null,
        creator: currentUser,
        participants: [],
        contracts: [],
        open_negotiations: [],
        post_meta: {
          relationship: { kind: "self", label: "You" },
          poster_side: posterSide,
          original_filled_cents: 0,
          reactions: [],
          comments: [],
          poll: { yes_votes: 0, no_votes: 0, my_vote: null },
          sub_contracts: [],
          mediator: mediatorState,
          end_at: null,
          concluded: false,
          target_friend_ids:
            scope === "friends" && targetFriendIds.length > 0
              ? targetFriendIds
              : undefined,
        },
      };
      addMyPost(postedBet);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create bet");
    } finally {
      setBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-bg flex flex-col h-screen w-full">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex items-center px-4 h-12 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-text2 text-sm hover:text-text transition"
        >
          Cancel
        </button>
        <h1 className="flex-1 text-center text-base font-semibold tracking-tight">
          New Bet
        </h1>
        {/* Right-side spacer keeps the title centered. */}
        <div className="w-[52px]" aria-hidden />
      </header>

      {/* ── Scrollable composer body ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {/* Composer: avatar + textarea */}
        <div className="flex gap-3">
          <Avatar
            first={currentUser.first_name}
            lastInitial={currentUser.last_name_initial}
            color={currentUser.avatar_color}
            imageUrl={currentUser.avatar_url}
            size={40}
          />
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Write your bet here..."
            rows={4}
            className="flex-1 bg-transparent resize-none text-text text-lg leading-snug placeholder:text-text3 outline-none"
          />
        </div>

        {/* Your confidence + YES/NO toggle */}
        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm font-medium text-text2">Your confidence</span>
          <div className="inline-flex bg-bg2 rounded-pill p-1">
            <SideToggleButton
              label="YES"
              active={posterSide === "yes"}
              onClick={() => setPosterSide("yes")}
              tone="yes"
            />
            <SideToggleButton
              label="NO"
              active={posterSide === "no"}
              onClick={() => setPosterSide("no")}
              tone="no"
            />
          </div>
        </div>

        {/* Odds slider */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-2 tabular-nums">
            <span className="text-yes font-extrabold text-2xl">{yesPercent}%</span>
            <span className="text-no font-extrabold text-2xl">{noPercent}%</span>
          </div>
          <input
            type="range"
            min={MIN_PROBABILITY}
            max={MAX_PROBABILITY}
            step={1}
            value={posterSide === "yes" ? yesPercent : noPercent}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              // The slider always represents the LEFT (YES) side's percentage
              // visually; convert into the poster's odds for their chosen side.
              setPosterOdds(posterSide === "yes" ? v : 100 - v);
            }}
            className="fayd-slider w-full"
          />
        </div>

        {/* Stake */}
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-text3 font-semibold mb-2">
            Stake
          </div>
          <div className="flex gap-2 flex-wrap">
            {STAKE_OPTIONS_CENTS.map((tier) => {
              const active = tier === stakeCents;
              const disabled = tier > walletCents;
              return (
                <button
                  key={tier}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStakeCents(tier)}
                  className={`rounded-pill px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-yes text-bg"
                      : "bg-bg2 text-text2 hover:bg-bg3"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {formatCents(tier)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-sm text-yes font-medium">
            Win {formatCents(payoutIfCorrectCents)} if correct
          </div>
          {stakeCents > walletCents ? (
            <p className="text-no text-xs mt-1">Stake exceeds wallet balance.</p>
          ) : null}
        </div>

        {/* Summary tags */}
        <div className="mt-6 flex gap-2 flex-wrap">
          <SummaryTag>{audienceLabel}</SummaryTag>
          <SummaryTag>{mediatorLabel}</SummaryTag>
          <SummaryTag>{expiryLabel}</SummaryTag>
        </div>
      </div>

      {/* ── Sticky bottom ────────────────────────────────────────────── */}
      <div className="shrink-0 bg-bg px-4 pt-3 pb-4 flex flex-col gap-3">
        {/* Chip row */}
        <div className="flex gap-2">
          <ChipButton
            label={audienceLabel}
            open={openPanel === "audience"}
            onClick={() => togglePanel("audience")}
          />
          <ChipButton
            label={mediatorLabel}
            open={openPanel === "mediator"}
            onClick={() => togglePanel("mediator")}
          />
        </div>

        {/* Expanded inline panels */}
        {openPanel === "audience" ? (
          <AudiencePanel
            scope={scope}
            setScope={setScope}
            friends={friends}
            selectedFriendIds={selectedFriendIds}
            toggleFriend={toggleFriend}
            selectAllFriends={selectAllFriends}
            groups={groups}
            groupMemberCounts={groupMemberCounts}
            selectedGroupId={selectedGroupId}
            setSelectedGroupId={setSelectedGroupId}
          />
        ) : null}
        {openPanel === "mediator" ? (
          <MediatorPanel
            choice={mediatorChoice}
            setChoice={setMediatorChoice}
            friends={friends}
            mediatorFriendId={mediatorFriendId}
            setMediatorFriendId={setMediatorFriendId}
          />
        ) : null}
        {openPanel === "expiry" ? (
          <ExpiryPanel
            kind={expiryKind}
            setKind={setExpiryKind}
            customValue={customExpiry}
            setCustomValue={setCustomExpiry}
          />
        ) : null}

        {/* Expiry selector + Post button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => togglePanel("expiry")}
            className={`rounded-pill bg-bg2 hover:bg-bg3 text-text2 text-xs font-medium px-3 py-2.5 transition whitespace-nowrap ${
              openPanel === "expiry" ? "ring-1 ring-yes/40" : ""
            }`}
          >
            {expiryLabel}
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={submit}
            className="flex-1 rounded-pill bg-yes text-bg font-bold text-sm py-3 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Posting…" : `Post bet — lock ${formatCents(stakeCents)}`}
          </button>
        </div>
        {error ? <p className="text-no text-xs">{error}</p> : null}
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────

function SideToggleButton({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "yes" | "no";
}) {
  const toneActive = tone === "yes" ? "bg-yes text-bg" : "bg-no text-bg";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
        active ? toneActive : "text-text2 hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] text-text3 bg-bg2/60 rounded-pill px-2 py-1">
      {children}
    </span>
  );
}

function ChipButton({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-medium transition ${
        open
          ? "bg-bg3 text-text ring-1 ring-yes/40"
          : "bg-bg2 text-text2 hover:bg-bg3"
      }`}
    >
      <span>{label}</span>
      <ChevronIcon open={open} />
    </button>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg2 rounded-card p-3 flex flex-col gap-3 max-h-72 overflow-y-auto">
      {children}
    </div>
  );
}

function AudiencePanel({
  scope,
  setScope,
  friends,
  selectedFriendIds,
  toggleFriend,
  selectAllFriends,
  groups,
  groupMemberCounts,
  selectedGroupId,
  setSelectedGroupId,
}: {
  scope: ScopeKind;
  setScope: (s: ScopeKind) => void;
  friends: UserRow[];
  selectedFriendIds: Set<string> | null;
  toggleFriend: (id: string) => void;
  selectAllFriends: () => void;
  groups: GroupRow[];
  groupMemberCounts: Record<string, number>;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
}) {
  return (
    <PanelShell>
      <div className="inline-flex bg-bg3 rounded-pill p-1 self-start">
        <PanelTab active={scope === "friends"} onClick={() => setScope("friends")}>
          Friends
        </PanelTab>
        <PanelTab active={scope === "group"} onClick={() => setScope("group")}>
          Group
        </PanelTab>
      </div>

      {scope === "friends" ? (
        friends.length === 0 ? (
          <p className="text-text3 text-xs">
            Add friends first to pick recipients.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] text-text3">
              <span>
                {selectedFriendIds === null
                  ? `All ${friends.length}`
                  : `${selectedFriendIds.size} selected`}
              </span>
              <button
                type="button"
                onClick={selectAllFriends}
                className="text-yes hover:underline"
              >
                + Add all
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {friends.map((f) => {
                const selected =
                  selectedFriendIds === null || selectedFriendIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFriend(f.id)}
                    className={`flex items-center gap-2 rounded-pill pl-1 pr-3 py-1 text-xs border transition ${
                      selected
                        ? "bg-yes/15 border-yes/50 text-yes"
                        : "bg-bg3 border-transparent text-text2"
                    }`}
                  >
                    <Avatar
                      first={f.first_name}
                      lastInitial={f.last_name_initial}
                      color={f.avatar_color}
                      imageUrl={f.avatar_url}
                      size={20}
                    />
                    <span>{fullName(f)}</span>
                    {selected ? <CheckIcon /> : null}
                  </button>
                );
              })}
            </div>
          </>
        )
      ) : (
        // Groups
        groups.length === 0 ? (
          <p className="text-text3 text-xs">
            You&apos;re not in any groups yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {groups.map((g) => {
              const active = g.id === selectedGroupId;
              const count = groupMemberCounts[g.id] ?? 0;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    setSelectedGroupId(active ? null : g.id)
                  }
                  className={`text-left rounded-input px-3 py-2.5 border transition ${
                    active
                      ? "bg-yes/15 border-yes/50"
                      : "bg-bg3 border-transparent hover:bg-bg4"
                  }`}
                >
                  <div className="text-sm font-semibold text-text">
                    {g.name}
                  </div>
                  <div className="text-[11px] text-text3 mt-0.5">
                    {count} {count === 1 ? "member" : "members"}
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
    </PanelShell>
  );
}

function MediatorPanel({
  choice,
  setChoice,
  friends,
  mediatorFriendId,
  setMediatorFriendId,
}: {
  choice: MediatorChoice;
  setChoice: (c: MediatorChoice) => void;
  friends: UserRow[];
  mediatorFriendId: string | null;
  setMediatorFriendId: (id: string | null) => void;
}) {
  return (
    <PanelShell>
      <MediatorOption
        title="Self-mediate"
        description="Participants vote on the outcome"
        active={choice === "self"}
        onClick={() => setChoice("self")}
      />
      <MediatorOption
        title="Request mediator"
        description="Choose a friend to make the final call"
        active={choice === "request"}
        onClick={() => setChoice("request")}
      />
      {choice === "request" ? (
        friends.length === 0 ? (
          <p className="text-text3 text-xs">
            Add friends first to pick a mediator.
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap pt-1">
            {friends.map((f) => {
              const active = f.id === mediatorFriendId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMediatorFriendId(active ? null : f.id)}
                  className={`flex items-center gap-2 rounded-pill pl-1 pr-3 py-1 text-xs border transition ${
                    active
                      ? "bg-yes/15 border-yes/50 text-yes"
                      : "bg-bg3 border-transparent text-text2"
                  }`}
                >
                  <Avatar
                    first={f.first_name}
                    lastInitial={f.last_name_initial}
                    color={f.avatar_color}
                    imageUrl={f.avatar_url}
                    size={20}
                  />
                  <span>{fullName(f)}</span>
                </button>
              );
            })}
          </div>
        )
      ) : null}
    </PanelShell>
  );
}

function MediatorOption({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-input px-3 py-2.5 border transition ${
        active
          ? "bg-yes/15 border-yes/50"
          : "bg-bg3 border-transparent hover:bg-bg4"
      }`}
    >
      <div className={`text-sm font-semibold ${active ? "text-yes" : "text-text"}`}>
        {title}
      </div>
      <div className="text-[11px] text-text3 mt-0.5">{description}</div>
    </button>
  );
}

function ExpiryPanel({
  kind,
  setKind,
  customValue,
  setCustomValue,
}: {
  kind: ExpiryKind;
  setKind: (k: ExpiryKind) => void;
  customValue: string;
  setCustomValue: (s: string) => void;
}) {
  const options: { value: ExpiryKind; label: string }[] = [
    { value: "none", label: "No expiry" },
    { value: "24h", label: "24 hours" },
    { value: "3d", label: "3 days" },
    { value: "1w", label: "1 week" },
    { value: "custom", label: "Pick date & time" },
  ];
  return (
    <PanelShell>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setKind(o.value)}
            className={`rounded-pill px-3 py-1.5 text-xs font-medium border transition ${
              kind === o.value
                ? "bg-yes/15 border-yes/50 text-yes"
                : "bg-bg3 border-transparent text-text2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {kind === "custom" ? (
        <input
          type="datetime-local"
          value={customValue}
          min={minLocal()}
          onChange={(e) => setCustomValue(e.target.value)}
          className="bg-bg3 rounded-input px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-yes/30"
        />
      ) : null}
    </PanelShell>
  );
}

function PanelTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3 py-1 text-xs font-semibold transition ${
        active ? "bg-yes text-bg" : "text-text2 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className="w-3 h-3"
      aria-hidden
    >
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────

function toUserLite(u: UserRow): UserLite {
  return {
    id: u.id,
    first_name: u.first_name,
    last_name_initial: u.last_name_initial,
    username: u.username,
    avatar_color: u.avatar_color,
    avatar_url: u.avatar_url ?? null,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function minLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatLocal(iso: string): string {
  // The date-time-local input yields "YYYY-MM-DDTHH:MM" in local time. Render
  // it back in a friendlier "Jun 7, 3:30 PM" form for the chip label.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
