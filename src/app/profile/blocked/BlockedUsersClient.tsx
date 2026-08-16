"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Toast } from "@/components/Toast";
import { USE_MOCK_DATA } from "@/lib/config";
import { fullName } from "@/lib/format";
import { unblockUser } from "@/lib/data/blockedClient";
import { useSessionStore, getBlockedUserIdsMock, unblockUserMock } from "@/lib/sessionState";
import { MOCK_USER_DIRECTORY } from "@/lib/mock";
import type { UserLite } from "@/types/db";

export function BlockedUsersClient({ initialBlocked }: { initialBlocked: UserLite[] }) {
  const router = useRouter();
  useSessionStore(); // re-render when mock block state changes
  const [blocked, setBlocked] = useState<UserLite[]>(initialBlocked);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list: UserLite[] = USE_MOCK_DATA
    ? getBlockedUserIdsMock()
        .map((id) => MOCK_USER_DIRECTORY[id])
        .filter((u): u is NonNullable<typeof u> => !!u)
    : blocked;

  async function handleUnblock(user: UserLite) {
    if (busyId) return;
    setBusyId(user.id);
    try {
      if (USE_MOCK_DATA) {
        unblockUserMock(user.id);
      } else {
        await unblockUser(user.id);
        setBlocked((prev) => prev.filter((u) => u.id !== user.id));
        router.refresh();
      }
      setToast(`Unblocked ${user.first_name ?? "user"}`);
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't unblock · ${e.message}` : "Couldn't unblock user");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-4 pt-4 pb-6">
      {list.length === 0 ? (
        <div className="px-6 pt-16 text-center">
          <div className="text-5xl mb-3">🚫</div>
          <h2 className="text-lg font-semibold mb-1">No blocked users</h2>
          <p className="text-text2 text-sm">
            Block someone from the "…" menu on any of their bets — they'll show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-bg3">
          {list.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <Avatar
                first={u.first_name}
                lastInitial={u.last_name_initial}
                color={u.avatar_color}
                imageUrl={u.avatar_url}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{fullName(u)}</div>
                <div className="text-text3 text-xs">@{u.username ?? "—"}</div>
              </div>
              <button
                type="button"
                disabled={busyId === u.id}
                onClick={() => handleUnblock(u)}
                className="rounded-pill bg-bg3 hover:bg-bg4 text-text text-xs font-semibold px-3 py-1.5 disabled:opacity-40 transition"
              >
                {busyId === u.id ? "Unblocking…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
