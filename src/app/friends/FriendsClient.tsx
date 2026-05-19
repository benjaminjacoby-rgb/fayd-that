"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/Toast";
import { fullName } from "@/lib/format";
import { mockSearchUsers, type MockFriendRequest } from "@/lib/mock";
import type { UserLite } from "@/types/db";

type Tab = "friends" | "requests" | "search";

export function FriendsClient({
  initialFriends,
  initialIncoming,
  initialSent,
}: {
  initialFriends: UserLite[];
  initialIncoming: MockFriendRequest[];
  initialSent: MockFriendRequest[];
}) {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<UserLite[]>(initialFriends);
  const [incoming, setIncoming] = useState<MockFriendRequest[]>(initialIncoming);
  const [sent, setSent] = useState<MockFriendRequest[]>(initialSent);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const friendIds = new Set(friends.map((f) => f.id));
    const sentIds = new Set(sent.map((s) => s.other.id));
    const incomingIds = new Set(incoming.map((i) => i.other.id));
    return mockSearchUsers(query).map((u) => ({
      user: u,
      relation: friendIds.has(u.id)
        ? ("friend" as const)
        : sentIds.has(u.id)
          ? ("sent" as const)
          : incomingIds.has(u.id)
            ? ("incoming" as const)
            : ("none" as const),
    }));
  }, [query, friends, sent, incoming]);

  function accept(req: MockFriendRequest) {
    setIncoming((xs) => xs.filter((x) => x.id !== req.id));
    setFriends((xs) => [req.other, ...xs]);
    setToast(`You're now friends with ${req.other.first_name}`);
  }

  function reject(req: MockFriendRequest) {
    setIncoming((xs) => xs.filter((x) => x.id !== req.id));
    setToast(`Request from ${req.other.first_name} dismissed`);
  }

  function sendRequest(other: UserLite) {
    const req: MockFriendRequest = {
      id: `fr-out-${Date.now()}`,
      other,
      mutualCount: 0,
      createdAt: new Date().toISOString(),
    };
    setSent((xs) => [req, ...xs]);
    setToast(`Request sent to ${other.first_name}`);
  }

  function cancelSent(req: MockFriendRequest) {
    setSent((xs) => xs.filter((x) => x.id !== req.id));
    setToast(`Request to ${req.other.first_name} cancelled`);
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <Tabs tab={tab} setTab={setTab} incomingCount={incoming.length} friendsCount={friends.length} />

      {tab === "friends" ? (
        friends.length === 0 ? (
          <EmptyHint
            emoji="🤝"
            title="No friends yet"
            body="Search to add someone — you'll be able to bet with them once they accept."
            ctaLabel="Find friends"
            onCta={() => setTab("search")}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-bg3 mt-2">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3">
                <Avatar first={f.first_name} lastInitial={f.last_name_initial} color={f.avatar_color} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{fullName(f)}</div>
                  <div className="text-text3 text-xs">@{f.username ?? "—"}</div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "requests" ? (
        <div className="mt-2 flex flex-col gap-5">
          <RequestSection title={`Incoming · ${incoming.length}`}>
            {incoming.length === 0 ? (
              <EmptyHint inline body="No incoming requests." />
            ) : (
              incoming.map((r) => (
                <RequestRow key={r.id} req={r}>
                  <Button variant="primary" onClick={() => accept(r)}>Accept</Button>
                  <Button variant="ghost" onClick={() => reject(r)}>Reject</Button>
                </RequestRow>
              ))
            )}
          </RequestSection>

          <RequestSection title={`Sent · ${sent.length}`}>
            {sent.length === 0 ? (
              <EmptyHint inline body="No outgoing requests." />
            ) : (
              sent.map((r) => (
                <RequestRow key={r.id} req={r}>
                  <span className="text-xs text-text3 italic mr-2">Awaiting…</span>
                  <Button variant="ghost" onClick={() => cancelSent(r)}>Cancel</Button>
                </RequestRow>
              ))
            )}
          </RequestSection>
        </div>
      ) : null}

      {tab === "search" ? (
        <div className="mt-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, or phone"
            className="w-full bg-bg3 rounded-input px-3 py-2.5 outline-none focus:ring-2 focus:ring-yes/40"
          />

          {!query.trim() ? (
            <p className="text-text3 text-xs mt-4">Try a username like <span className="font-mono">maxt</span> or a name.</p>
          ) : searchResults.length === 0 ? (
            <p className="text-text3 text-xs mt-4">No matches.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-bg3 mt-3">
              {searchResults.map(({ user, relation }) => (
                <li key={user.id} className="flex items-center gap-3 py-3">
                  <Avatar first={user.first_name} lastInitial={user.last_name_initial} color={user.avatar_color} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{fullName(user)}</div>
                    <div className="text-text3 text-xs">@{user.username ?? "—"}</div>
                  </div>
                  <SearchRowCta
                    relation={relation}
                    onAdd={() =>
                      sendRequest({
                        id: user.id,
                        first_name: user.first_name,
                        last_name_initial: user.last_name_initial,
                        username: user.username,
                        avatar_color: user.avatar_color,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

function Tabs({
  tab,
  setTab,
  incomingCount,
  friendsCount,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  incomingCount: number;
  friendsCount: number;
}) {
  const items: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: "friends",  label: "Friends",  badge: friendsCount },
    { id: "requests", label: "Requests", badge: incomingCount },
    { id: "search",   label: "Search" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 bg-bg2 rounded-pill p-1 mb-4">
      {items.map((it) => {
        const active = it.id === tab;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className={`relative rounded-pill text-sm font-medium py-2 transition ${
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

function RequestSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-2">{title}</div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function RequestRow({
  req,
  children,
}: {
  req: MockFriendRequest;
  children: React.ReactNode;
}) {
  return (
    <li className="bg-bg2 rounded-card p-3 flex items-center gap-3">
      <Avatar first={req.other.first_name} lastInitial={req.other.last_name_initial} color={req.other.avatar_color} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{fullName(req.other)}</div>
        <div className="text-text3 text-[11px]">
          @{req.other.username ?? "—"}
          {req.mutualCount > 0 ? <> · {req.mutualCount} mutual</> : null}
        </div>
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
    </li>
  );
}

function SearchRowCta({
  relation,
  onAdd,
}: {
  relation: "none" | "friend" | "sent" | "incoming";
  onAdd: () => void;
}) {
  if (relation === "friend") return <span className="text-[11px] text-text3 italic">Friends</span>;
  if (relation === "sent") return <span className="text-[11px] text-text3 italic">Requested</span>;
  if (relation === "incoming") return <span className="text-[11px] text-blue italic">Sent you one</span>;
  return (
    <button onClick={onAdd} className="rounded-pill bg-yes text-bg text-xs font-semibold px-3 py-1.5 hover:brightness-110">
      Add
    </button>
  );
}

function EmptyHint({
  emoji,
  title,
  body,
  ctaLabel,
  onCta,
  inline,
}: {
  emoji?: string;
  title?: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
  inline?: boolean;
}) {
  if (inline) {
    return <p className="text-text3 text-xs italic px-1">{body}</p>;
  }
  return (
    <div className="px-6 pt-14 text-center">
      <div className="text-5xl mb-3">{emoji}</div>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-text2 text-sm mb-5">{body}</p>
      {ctaLabel && onCta ? (
        <button onClick={onCta} className="inline-block bg-yes text-bg font-semibold px-5 py-3 rounded-input">
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
