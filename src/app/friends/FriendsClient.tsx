"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/Toast";
import { USE_MOCK_DATA } from "@/lib/config";
import { fullName } from "@/lib/format";
import { mockSearchUsers, type MockFriendRequest } from "@/lib/mock";
import {
  acceptFriendRequest,
  cancelSentFriendRequest,
  declineFriendRequest,
  searchUsers,
  sendFriendRequest,
} from "@/lib/data/friendsClient";
import {
  fetchMatchedContacts,
  getCachedMatches,
  getContactsPermission,
  setContactsPermission,
  useContactsStore,
  type MatchedContact,
} from "@/lib/contacts";
import type { UserLite, UserRow } from "@/types/db";

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
  const [remoteResults, setRemoteResults] = useState<UserRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  useContactsStore();
  const contactsPermission = getContactsPermission();
  const cachedMatches = getCachedMatches();

  // Debounced remote search when not running on mock data.
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    const q = query.trim();
    if (!q) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsers(q)
        .then((rows) => {
          if (!cancelled) setRemoteResults(rows);
        })
        .catch(() => {
          if (!cancelled) setRemoteResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Hydrate cached matches on first visit once permission is granted.
  useEffect(() => {
    if (contactsPermission === "granted" && cachedMatches === null && !contactsLoading) {
      setContactsLoading(true);
      fetchMatchedContacts().finally(() => setContactsLoading(false));
    }
  }, [contactsPermission, cachedMatches, contactsLoading]);

  async function enableContacts() {
    setContactsLoading(true);
    try {
      setContactsPermission("granted");
      await fetchMatchedContacts();
    } finally {
      setContactsLoading(false);
    }
  }

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const friendIds = new Set(friends.map((f) => f.id));
    const sentIds = new Set(sent.map((s) => s.other.id));
    const incomingIds = new Set(incoming.map((i) => i.other.id));
    const source = USE_MOCK_DATA ? mockSearchUsers(query) : remoteResults;
    return source.map((u) => ({
      user: u,
      relation: friendIds.has(u.id)
        ? ("friend" as const)
        : sentIds.has(u.id)
          ? ("sent" as const)
          : incomingIds.has(u.id)
            ? ("incoming" as const)
            : ("none" as const),
    }));
  }, [query, remoteResults, friends, sent, incoming]);

  async function accept(req: MockFriendRequest) {
    const prevIncoming = incoming;
    const prevFriends = friends;
    setIncoming((xs) => xs.filter((x) => x.id !== req.id));
    setFriends((xs) => [req.other, ...xs]);
    setToast(`You're now friends with ${req.other.first_name}`);
    if (USE_MOCK_DATA) return;
    try {
      await acceptFriendRequest(req.id);
    } catch (e) {
      setIncoming(prevIncoming);
      setFriends(prevFriends);
      setToast(e instanceof Error ? `Couldn't accept · ${e.message}` : "Couldn't accept request");
    }
  }

  async function reject(req: MockFriendRequest) {
    const prev = incoming;
    setIncoming((xs) => xs.filter((x) => x.id !== req.id));
    setToast(`Request from ${req.other.first_name} dismissed`);
    if (USE_MOCK_DATA) return;
    try {
      await declineFriendRequest(req.id);
    } catch (e) {
      setIncoming(prev);
      setToast(e instanceof Error ? `Couldn't decline · ${e.message}` : "Couldn't decline request");
    }
  }

  async function sendRequest(other: UserLite) {
    if (USE_MOCK_DATA) {
      const req: MockFriendRequest = {
        id: `fr-out-${Date.now()}`,
        other,
        mutualCount: 0,
        createdAt: new Date().toISOString(),
      };
      setSent((xs) => [req, ...xs]);
      setToast(`Request sent to ${other.first_name}`);
      return;
    }
    try {
      const id = await sendFriendRequest(other.id);
      const req: MockFriendRequest = {
        id,
        other,
        mutualCount: 0,
        createdAt: new Date().toISOString(),
      };
      setSent((xs) => [req, ...xs]);
      setToast(`Request sent to ${other.first_name}`);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't send · ${e.message}` : "Couldn't send request");
    }
  }

  async function cancelSent(req: MockFriendRequest) {
    const prev = sent;
    setSent((xs) => xs.filter((x) => x.id !== req.id));
    setToast(`Request to ${req.other.first_name} cancelled`);
    if (USE_MOCK_DATA) return;
    try {
      await cancelSentFriendRequest(req.id);
    } catch (e) {
      setSent(prev);
      setToast(e instanceof Error ? `Couldn't cancel · ${e.message}` : "Couldn't cancel request");
    }
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
                <Avatar first={f.first_name} lastInitial={f.last_name_initial} color={f.avatar_color} imageUrl={f.avatar_url} size={40} />
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

          <ContactsSection
            permission={contactsPermission}
            matches={cachedMatches}
            loading={contactsLoading}
            knownFriendIds={new Set(friends.map((f) => f.id))}
            sentIds={new Set(sent.map((s) => s.other.id))}
            onEnable={enableContacts}
            onAdd={(user) => sendRequest(user)}
          />

          {!query.trim() ? (
            <p className="text-text3 text-xs mt-4">Try a username like <span className="font-mono">maxt</span> or a name.</p>
          ) : searchResults.length === 0 ? (
            <p className="text-text3 text-xs mt-4">No matches.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-bg3 mt-3">
              {searchResults.map(({ user, relation }) => (
                <li key={user.id} className="flex items-center gap-3 py-3">
                  <Avatar first={user.first_name} lastInitial={user.last_name_initial} color={user.avatar_color} imageUrl={user.avatar_url} size={36} />
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
                        avatar_url: user.avatar_url ?? null,
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
      <Avatar first={req.other.first_name} lastInitial={req.other.last_name_initial} color={req.other.avatar_color} imageUrl={req.other.avatar_url} size={40} />
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

function ContactsSection({
  permission,
  matches,
  loading,
  knownFriendIds,
  sentIds,
  onEnable,
  onAdd,
}: {
  permission: "unknown" | "granted" | "denied";
  matches: MatchedContact[] | null;
  loading: boolean;
  knownFriendIds: Set<string>;
  sentIds: Set<string>;
  onEnable: () => void;
  onAdd: (user: UserLite) => void;
}) {
  return (
    <div className="mt-5">
      <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-2">
        From your contacts
      </div>
      {permission !== "granted" ? (
        <div className="bg-bg2 rounded-card p-3 flex items-center gap-3">
          <div className="flex-1 text-sm text-text2">See friends from your contacts</div>
          <button
            onClick={onEnable}
            className="rounded-pill bg-yes text-bg text-xs font-semibold px-3 py-1.5 hover:brightness-110"
          >
            Enable
          </button>
        </div>
      ) : loading || matches === null ? (
        <p className="text-text3 text-xs italic px-1">Matching contacts…</p>
      ) : matches.length === 0 ? (
        <p className="text-text3 text-xs italic px-1">No contacts on Fayd yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bg3">
          {matches.map((m) => {
            const alreadyFriend = knownFriendIds.has(m.id);
            const alreadyRequested = sentIds.has(m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Avatar
                  first={m.user.first_name}
                  lastInitial={m.user.last_name_initial}
                  color={m.user.avatar_color}
                  imageUrl={m.user.avatar_url}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.name}</div>
                  <div className="text-text3 text-xs font-mono">{m.phone}</div>
                </div>
                {alreadyFriend ? (
                  <span className="text-[11px] text-text3 italic">Friends</span>
                ) : alreadyRequested ? (
                  <span className="text-[11px] text-text3 italic">Requested</span>
                ) : (
                  <button
                    onClick={() => onAdd(m.user)}
                    className="rounded-pill bg-yes text-bg text-xs font-semibold px-3 py-1.5 hover:brightness-110"
                  >
                    Add friend
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
