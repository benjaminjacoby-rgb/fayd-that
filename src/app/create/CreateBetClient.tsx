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

// Quick-pick stake shortcuts ($5/$10/$25/$50/$100) that autofill the input.
const STAKE_QUICK_PICKS_CENTS = [500, 1000, 2500, 5000, 10000] as const;
const DEFAULT_STAKE_CENTS = 1000;

type Panel = "audience" | "mediator" | "expiry" | null;
type ScopeKind = BetScope; // "friends" | "group"
type MediatorChoice = "self" | "request";

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
  const [posterOdds, setPosterOdds] = useState(50);
  const [posterSide, setPosterSide] = useState<BetSide>("yes");
  const [stakeInput, setStakeInput] = useState<string>(
    (DEFAULT_STAKE_CENTS / 100).toString(),
  );

  // ── Audience state ─────────────────────────────────────────────────────
  const [scope, setScope] = useState<ScopeKind>("friends");
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string> | null>(
    null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [audienceTouched, setAudienceTouched] = useState(false);

  // ── Mediator state ─────────────────────────────────────────────────────
  const [mediatorChoice, setMediatorChoice] = useState<MediatorChoice>("self");
  const [mediatorFriendId, setMediatorFriendId] = useState<string | null>(null);
  // True when the user picks "Open request" — anyone in the audience may volunteer.
  const [mediatorOpen, setMediatorOpen] = useState(false);
  const [mediatorTouched, setMediatorTouched] = useState(false);

  // ── Expiry state ───────────────────────────────────────────────────────
  // Empty strings = "No expiry". The header label and submit validation derive
  // from these. Time defaults to 23:59 if a date is set but no time is entered.
  const [expiryDate, setExpiryDate] = useState<string>(""); // "YYYY-MM-DD"
  const [expiryTime, setExpiryTime] = useState<string>(""); // "HH:MM"
  const [expiryError, setExpiryError] = useState<string | null>(null);

  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────
  const stakeCents = useMemo(() => {
    const n = parseFloat(stakeInput);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [stakeInput]);

  const yesProbability =
    posterSide === "yes" ? posterOdds : 100 - posterOdds;
  const yesPercent = yesProbability;
  const noPercent = 100 - yesProbability;

  const payoutIfCorrectCents = useMemo(() => {
    const p = posterOdds / 100;
    if (p <= 0 || p >= 1) return 0;
    return Math.round(stakeCents / p);
  }, [posterOdds, stakeCents]);

  const overBalance = stakeCents > walletCents;

  // ── Audience helpers ───────────────────────────────────────────────────
  const targetFriendIds: string[] =
    scope === "friends" && selectedFriendIds
      ? Array.from(selectedFriendIds)
      : [];
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const audienceChipLabel = (() => {
    if (!audienceTouched) return "Select audience";
    if (scope === "group") {
      return selectedGroup ? selectedGroup.name : "Pick a group";
    }
    if (!selectedFriendIds) return "All Friends";
    const n = selectedFriendIds.size;
    if (n === 0) return "Pick friends";
    return `${n} ${n === 1 ? "friend" : "friends"}`;
  })();

  // ── Mediator helpers ───────────────────────────────────────────────────
  const mediatorFriend = useMemo(
    () => friends.find((f) => f.id === mediatorFriendId) ?? null,
    [friends, mediatorFriendId],
  );
  const mediatorChipLabel = (() => {
    if (!mediatorTouched) return "Choose mediator";
    if (mediatorChoice === "self") return "Self-mediate";
    if (mediatorOpen) return "Open request";
    return mediatorFriend ? fullName(mediatorFriend) : "Request mediator";
  })();

  // ── Expiry helpers ─────────────────────────────────────────────────────
  const noExpiry = expiryDate === "" && expiryTime === "";
  // Builds a local Date from the date/time inputs. Time defaults to 23:59 when
  // the user picks a date but not a time. Returns null when no date is set.
  function expiryDate_(): Date | null {
    if (!expiryDate) return null;
    const t = expiryTime || "23:59";
    const d = new Date(`${expiryDate}T${t}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function resolveExpiresAt(): string | null {
    const d = expiryDate_();
    return d ? d.toISOString() : null;
  }
  const expiryButtonLabel = (() => {
    const d = expiryDate_();
    return d ? formatLocalDate(d) : "Set expiry";
  })();

  // ── Submit ─────────────────────────────────────────────────────────────
  const canSubmit =
    question.trim().length > 4 &&
    stakeCents > 0 &&
    stakeCents <= walletCents &&
    (scope !== "group" || !!selectedGroupId) &&
    (mediatorChoice !== "request" || !!mediatorFriendId || mediatorOpen);

  function togglePanel(p: Exclude<Panel, null>) {
    setOpenPanel((cur) => (cur === p ? null : p));
  }

  function toggleFriend(id: string) {
    setAudienceTouched(true);
    setSelectedFriendIds((cur) => {
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
    setAudienceTouched(true);
    setSelectedFriendIds(null);
  }

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setExpiryError(null);
    const expiryD = expiryDate_();
    if (expiryD) {
      const minMs = Date.now() + 5 * 60_000;
      if (expiryD.getTime() < minMs) {
        setExpiryError("Expiry must be at least 5 minutes in the future.");
        setOpenPanel("expiry");
        return;
      }
    }
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
      <header className="relative flex items-center px-4 h-12 shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-text2 text-sm hover:text-text transition"
        >
          Cancel
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => togglePanel("expiry")}
            className={`rounded-pill bg-bg2 hover:bg-bg3 text-text2 text-xs font-medium px-2.5 py-1.5 transition whitespace-nowrap ${
              openPanel === "expiry" ? "ring-1 ring-yes/40" : ""
            }`}
          >
            {expiryButtonLabel}
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={submit}
            className="rounded-pill bg-yes text-bg font-bold text-xs px-4 py-1.5 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
      </header>

      {/* Expiry dropdown lives directly below the header. */}
      {openPanel === "expiry" ? (
        <div className="shrink-0 px-4 pb-2">
          <ExpiryPanel
            date={expiryDate}
            time={expiryTime}
            noExpiry={noExpiry}
            error={expiryError}
            setDate={(v) => {
              setExpiryDate(v);
              setExpiryError(null);
            }}
            setTime={(v) => {
              setExpiryTime(v);
              setExpiryError(null);
            }}
            clear={() => {
              setExpiryDate("");
              setExpiryTime("");
              setExpiryError(null);
            }}
          />
        </div>
      ) : null}

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

        {/* My position + YES/NO toggle */}
        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm font-medium text-text2">My position:</span>
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
              setPosterOdds(posterSide === "yes" ? v : 100 - v);
            }}
            className="fayd-slider w-full"
          />
        </div>

        {/* Stake — text input + quick picks */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-text3 font-semibold">
              Stake
            </div>
            <div className="text-xs text-text3">
              Wallet: {formatCents(walletCents)}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text2 text-base font-semibold pointer-events-none">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={stakeInput}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                setStakeInput(v);
              }}
              placeholder="0"
              className={`w-full bg-bg2 rounded-input pl-7 pr-3 py-2.5 text-base text-text outline-none focus:ring-2 ${
                overBalance ? "ring-2 ring-no/60" : "focus:ring-yes/30"
              }`}
            />
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            {STAKE_QUICK_PICKS_CENTS.map((tier) => {
              const disabled = tier > walletCents;
              return (
                <button
                  key={tier}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStakeInput((tier / 100).toString())}
                  className="rounded-pill px-3 py-1 text-xs font-semibold bg-bg2 text-text2 hover:bg-bg3 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {formatCents(tier)}
                </button>
              );
            })}
          </div>
          {overBalance ? (
            <p className="text-no text-xs mt-2">Stake exceeds wallet balance.</p>
          ) : null}
        </div>

        {/* Audience + Mediator chips (with inline expanding panels) */}
        <div className="mt-6 flex gap-2 flex-wrap">
          <ChipButton
            label={audienceChipLabel}
            open={openPanel === "audience"}
            onClick={() => togglePanel("audience")}
          />
          <ChipButton
            label={mediatorChipLabel}
            open={openPanel === "mediator"}
            onClick={() => togglePanel("mediator")}
          />
        </div>
        {openPanel === "audience" ? (
          <div className="mt-3">
            <AudiencePanel
              scope={scope}
              setScope={(s) => {
                setAudienceTouched(true);
                setScope(s);
              }}
              friends={friends}
              selectedFriendIds={selectedFriendIds}
              toggleFriend={toggleFriend}
              selectAllFriends={selectAllFriends}
              groups={groups}
              groupMemberCounts={groupMemberCounts}
              selectedGroupId={selectedGroupId}
              setSelectedGroupId={(id) => {
                setAudienceTouched(true);
                setSelectedGroupId(id);
              }}
            />
          </div>
        ) : null}
        {openPanel === "mediator" ? (
          <div className="mt-3">
            <MediatorPanel
              choice={mediatorChoice}
              setChoice={(c) => {
                setMediatorTouched(true);
                setMediatorChoice(c);
                if (c === "self") {
                  setMediatorOpen(false);
                  setMediatorFriendId(null);
                }
              }}
              friends={friends}
              mediatorFriendId={mediatorFriendId}
              mediatorOpen={mediatorOpen}
              setMediatorFriendId={(id) => {
                setMediatorTouched(true);
                setMediatorOpen(false);
                setMediatorFriendId(id);
              }}
              setMediatorOpen={() => {
                setMediatorTouched(true);
                setMediatorOpen(true);
                setMediatorFriendId(null);
              }}
            />
          </div>
        ) : null}

        {/* Win text — big, bold, green */}
        <div className="mt-6 text-yes font-bold text-xl">
          To Win {formatCents(payoutIfCorrectCents)}
        </div>

        {error ? <p className="text-no text-xs mt-3">{error}</p> : null}
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
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filteredFriends = q
    ? friends.filter((f) => fullName(f).toLowerCase().includes(q))
    : friends;
  const filteredGroups = q
    ? groups.filter((g) => g.name.toLowerCase().includes(q))
    : groups;

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

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={scope === "friends" ? "Search friends..." : "Search groups..."}
        className="bg-bg3 rounded-input px-3 py-2 text-sm text-text placeholder:text-text3 outline-none focus:ring-2 focus:ring-yes/30"
      />

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
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={selectAllFriends}
                className="flex items-center gap-1 rounded-pill px-3 py-1 text-xs font-semibold border border-dashed border-yes/60 text-yes bg-yes/10 hover:bg-yes/20 transition"
              >
                + Add all
              </button>
              {filteredFriends.map((f) => {
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
              {filteredFriends.length === 0 ? (
                <p className="text-text3 text-xs">No friends match.</p>
              ) : null}
            </div>
          </>
        )
      ) : (
        // Groups
        groups.length === 0 ? (
          <p className="text-text3 text-xs">
            You&apos;re not in any groups yet.
          </p>
        ) : filteredGroups.length === 0 ? (
          <p className="text-text3 text-xs">No groups match.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filteredGroups.map((g) => {
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
  mediatorOpen,
  setMediatorFriendId,
  setMediatorOpen,
}: {
  choice: MediatorChoice;
  setChoice: (c: MediatorChoice) => void;
  friends: UserRow[];
  mediatorFriendId: string | null;
  mediatorOpen: boolean;
  setMediatorFriendId: (id: string | null) => void;
  setMediatorOpen: () => void;
}) {
  return (
    <PanelShell>
      <MediatorOption
        title="Self-mediate"
        description="You verify the outcome"
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
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            type="button"
            onClick={setMediatorOpen}
            className={`flex items-center gap-2 rounded-pill px-3 py-1 text-xs border transition ${
              mediatorOpen
                ? "bg-yes/15 border-yes/50 text-yes"
                : "bg-bg3 border-dashed border-text3/60 text-text2"
            }`}
          >
            <span>Open request</span>
            {mediatorOpen ? <CheckIcon /> : null}
          </button>
          {friends.length === 0 ? (
            <p className="text-text3 text-xs self-center">
              Add friends to pick a specific mediator.
            </p>
          ) : (
            friends.map((f) => {
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
            })
          )}
        </div>
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
  date,
  time,
  noExpiry,
  error,
  setDate,
  setTime,
  clear,
}: {
  date: string;
  time: string;
  noExpiry: boolean;
  error: string | null;
  setDate: (v: string) => void;
  setTime: (v: string) => void;
  clear: () => void;
}) {
  return (
    <PanelShell>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={date}
          min={minDate()}
          onChange={(e) => setDate(e.target.value)}
          className="bg-bg3 rounded-input px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-yes/30"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="bg-bg3 rounded-input px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-yes/30"
        />
        <button
          type="button"
          onClick={clear}
          className={`rounded-pill px-3 py-2 text-xs font-semibold transition ${
            noExpiry
              ? "bg-yes text-bg"
              : "bg-bg3 text-text2 hover:bg-bg4"
          }`}
        >
          No expiry
        </button>
      </div>
      {error ? <p className="text-no text-xs">{error}</p> : null}
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

function minDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatLocalDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
