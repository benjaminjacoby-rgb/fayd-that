"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { EditProfileSheet } from "@/components/EditProfileSheet";
import { Toast } from "@/components/Toast";
import { formatCents, fullName } from "@/lib/format";
import { IS_PAYMENTS_LIVE, USE_MOCK_DATA } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { GroupView, UserRow } from "@/types/db";

export function ProfileClient({
  me: meProp,
  friends,
  pendingRequestsCount,
  groups,
  /** When true (the default), this is the signed-in user's own profile and
   *  edit controls are rendered. When viewing someone else's profile in the
   *  future, the caller can pass `isCurrentUser={false}` to hide editing UI. */
  isCurrentUser = true,
}: {
  me: UserRow;
  stats?: { totalBets: number; winRate: number; totalWonCents: number; currentStreak: number };
  friends: UserRow[];
  pendingRequestsCount: number;
  groups: GroupView[];
  isCurrentUser?: boolean;
}) {
  const router = useRouter();
  const [me, setMe] = useState<UserRow>(meProp);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const totalPendingApprovals = groups.reduce((s, g) => s + (g.is_admin ? g.pending_join_count : 0), 0);

  async function logOut() {
    setLoggingOut(true);
    try {
      if (!USE_MOCK_DATA) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
      setToast("Failed to log out — try again.");
    }
  }

  return (
    <div className="px-4 pt-4 flex flex-col gap-5">
      {/* Identity */}
      <div className="flex items-center gap-4">
        <Avatar
          first={me.first_name}
          lastInitial={me.last_name_initial}
          color={me.avatar_color}
          imageUrl={me.avatar_url}
          size={64}
        />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold truncate">{fullName(me)}</div>
          <div className="text-text2 text-sm truncate">@{me.username ?? "—"}</div>
        </div>
        {isCurrentUser && !USE_MOCK_DATA ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-input bg-bg3 hover:bg-bg4 text-text text-xs font-medium px-3 py-1.5"
          >
            Edit
          </button>
        ) : null}
      </div>

      {/* Wallet */}
      <section className="bg-bg2 rounded-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text3">Wallet balance</div>
            <div className="font-mono text-2xl font-semibold text-yes">{formatCents(me.wallet_balance_cents)}</div>
          </div>
          {!IS_PAYMENTS_LIVE ? (
            <span className="text-[10px] uppercase tracking-wide bg-orange/15 text-orange rounded-pill px-2 py-0.5">
              mock mode
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setToast("Real payments aren't live yet — coming soon.")}>
            Add Funds
          </Button>
          <Button
            variant="secondary"
            onClick={() => setToast("Real payments aren't live yet — coming soon.")}
          >
            Withdraw
          </Button>
        </div>
      </section>

      {/* Friends */}
      <section className="bg-bg2 rounded-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Friends</h2>
          {pendingRequestsCount > 0 ? (
            <Link href="/friends" className="text-xs bg-no/20 text-no rounded-pill px-2 py-0.5">
              {pendingRequestsCount} pending
            </Link>
          ) : null}
        </div>
        {friends.length === 0 ? (
          <p className="text-text3 text-xs">No friends yet — search to add some.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friends.slice(0, 6).map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                <Avatar first={f.first_name} lastInitial={f.last_name_initial} color={f.avatar_color} imageUrl={f.avatar_url} size={32} />
                <div className="flex-1">
                  <div className="text-sm">{fullName(f)}</div>
                  <div className="text-text3 text-xs">@{f.username ?? "—"}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/friends"
          className="block text-center mt-3 text-sm font-medium text-text2 hover:text-text bg-bg3 hover:bg-bg4 rounded-input py-2.5"
        >
          Manage friends
        </Link>
      </section>

      {/* Groups */}
      <section className="bg-bg2 rounded-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Groups</h2>
          {totalPendingApprovals > 0 ? (
            <span className="text-xs bg-no/20 text-no rounded-pill px-2 py-0.5">
              {totalPendingApprovals} to review
            </span>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <p className="text-text3 text-xs mb-3">You're not in any groups yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 mb-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="bg-bg3 hover:bg-bg4 rounded-input px-3 py-2.5 flex items-center justify-between transition"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <span className="truncate">{g.name}</span>
                      {g.is_admin ? (
                        <span className="text-[10px] uppercase tracking-wide bg-gold/20 text-gold rounded-pill px-1.5 py-px font-semibold">
                          admin
                        </span>
                      ) : null}
                    </div>
                    <div className="text-text3 text-[11px] mt-0.5">
                      {g.member_count} members · code{" "}
                      <span className="font-mono text-text2">{g.invite_code}</span>
                    </div>
                  </div>
                  {g.is_admin && g.pending_join_count > 0 ? (
                    <span className="bg-no text-bg text-[11px] font-bold rounded-pill px-2 py-0.5">
                      {g.pending_join_count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/groups"
          className="block text-center text-sm font-medium text-text2 hover:text-text bg-bg3 hover:bg-bg4 rounded-input py-2.5"
        >
          Manage groups
        </Link>
      </section>

      {/* Account */}
      <button
        type="button"
        onClick={logOut}
        disabled={loggingOut}
        className="text-no text-sm font-medium bg-bg2 hover:bg-bg3 rounded-input py-2.5 disabled:opacity-50"
      >
        {loggingOut ? "Logging out…" : "Log out"}
      </button>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-3 py-2 pb-4">
        <Link href="/terms" className="text-text3 text-xs hover:text-text2 transition">
          Terms of Service
        </Link>
        <span className="text-text3 text-xs" aria-hidden>·</span>
        <Link href="/privacy" className="text-text3 text-xs hover:text-text2 transition">
          Privacy Policy
        </Link>
      </div>

      {editing ? (
        <EditProfileSheet
          me={me}
          onClose={() => setEditing(false)}
          onSaved={({ fullName: newName, username, avatarUrl }) => {
            setMe({
              ...me,
              first_name: newName?.trim() ?? me.first_name,
              last_name_initial: null,
              username,
              avatar_url: avatarUrl,
            });
            setEditing(false);
            // Refresh server data so other pages reading the user row pick up
            // the new name/avatar on next navigation.
            router.refresh();
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

