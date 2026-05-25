"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { USE_MOCK_DATA } from "@/lib/config";
import { getNotifications, markAllRead } from "@/lib/data/notificationsClient";
import type { NotificationRow } from "@/types/db";

export function NotificationsClient({
  initialNotifications,
}: {
  initialNotifications: NotificationRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);

  // Mark every notification as read the moment the user opens this view.
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    if (initialNotifications.some((n) => !n.read)) {
      markAllRead()
        .then(() => {
          setItems((xs) => xs.map((n) => ({ ...n, read: true })));
          router.refresh();
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh-on-focus for the list itself.
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    async function refresh() {
      try {
        const fresh = await getNotifications();
        setItems(fresh);
      } catch {
        // ignore
      }
    }
    window.addEventListener("focus", refresh);
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="px-6 pt-16 text-center">
        <div className="text-5xl mb-3">🔔</div>
        <h2 className="text-lg font-semibold mb-1">No notifications yet</h2>
        <p className="text-text2 text-sm">
          You'll be notified about new friend requests, bet fills, and messages here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-bg3 px-4 pt-2 pb-6">
      {items.map((n) => (
        <li key={n.id} className="py-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center shrink-0 text-text2">
            {iconFor(n.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{labelFor(n.type)}</div>
            <div className="text-text3 text-[11px] mt-0.5">{ago(n.created_at)}</div>
          </div>
          {!n.read ? <span className="w-2 h-2 rounded-pill bg-no shrink-0 mt-2" /> : null}
        </li>
      ))}
    </ul>
  );
}

function iconFor(type: string): string {
  switch (type) {
    case "friend_request":
    case "friend_request_accepted":
      return "🤝";
    case "bet_filled":
      return "💵";
    case "bet_resolved":
      return "🏁";
    case "mediator_assigned":
      return "⚖️";
    case "new_message":
      return "💬";
    default:
      return "🔔";
  }
}

function labelFor(type: string): string {
  switch (type) {
    case "friend_request":
      return "New friend request";
    case "friend_request_accepted":
      return "Friend request accepted";
    case "bet_filled":
      return "Someone faded your bet";
    case "bet_resolved":
      return "A bet you filled was resolved";
    case "mediator_assigned":
      return "You were assigned as mediator";
    case "new_message":
      return "New message";
    default:
      return type.replace(/_/g, " ");
  }
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
