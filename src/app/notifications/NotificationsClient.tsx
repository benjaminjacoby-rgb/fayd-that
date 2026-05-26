"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { USE_MOCK_DATA } from "@/lib/config";
import { getNotifications, markAllRead } from "@/lib/data/notificationsClient";
import { pickAvatarColor } from "@/lib/avatar";
import type { NotificationRow } from "@/types/db";

interface NotifPayload {
  reference_id?: string | null;
  reference_type?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_avatar_url?: string | null;
  bet_question?: string | null;
}

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
          You&apos;ll be notified about friend requests, bet fills, comments,
          and settled bets here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-bg3 px-4 pt-2 pb-6">
      {items.map((n) => (
        <NotificationItem key={n.id} n={n} />
      ))}
    </ul>
  );
}

function NotificationItem({ n }: { n: NotificationRow }) {
  const p = (n.payload ?? {}) as NotifPayload;
  return (
    <li className="py-3 flex items-start gap-3">
      <ActorAvatar
        type={n.type}
        actorId={p.actor_user_id ?? null}
        actorName={p.actor_name ?? null}
        actorAvatarUrl={p.actor_avatar_url ?? null}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug">
          <Description type={n.type} payload={p} />
        </div>
        <div className="text-text3 text-[11px] mt-0.5">{ago(n.created_at)}</div>
      </div>
      {!n.read ? <span className="w-2 h-2 rounded-pill bg-no shrink-0 mt-2" /> : null}
    </li>
  );
}

function ActorAvatar({
  type,
  actorId,
  actorName,
  actorAvatarUrl,
}: {
  type: string;
  actorId: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
}) {
  // When the notification carries an actor, show their avatar (image if
  // present, otherwise an initialed bubble coloured by their id). Otherwise
  // fall back to a type-specific emoji so the row never renders blank.
  if (actorId || actorName) {
    if (actorAvatarUrl) {
      return (
        <img
          src={actorAvatarUrl}
          alt=""
          className="w-9 h-9 rounded-pill object-cover shrink-0 bg-bg3"
        />
      );
    }
    const initial = (actorName ?? "?").trim().slice(0, 1).toUpperCase() || "?";
    const colorClass = bgColorClass(actorId ?? actorName ?? "?");
    return (
      <div
        className={`w-9 h-9 rounded-pill ${colorClass} inline-flex items-center justify-center shrink-0 text-bg font-bold text-sm`}
      >
        {initial}
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center shrink-0 text-text2">
      {iconFor(type)}
    </div>
  );
}

function Description({ type, payload }: { type: string; payload: NotifPayload }) {
  const name = payload.actor_name ?? "Someone";
  const question = payload.bet_question ?? "your bet";
  switch (type) {
    case "friend_request":
      return (
        <>
          <span className="font-semibold">{name}</span>
          <span className="text-text2"> sent you a friend request</span>
        </>
      );
    case "friend_request_accepted":
      return (
        <>
          <span className="font-semibold">{name}</span>
          <span className="text-text2"> accepted your friend request</span>
        </>
      );
    case "bet_filled":
      return (
        <>
          <span className="font-semibold">{name}</span>
          <span className="text-text2"> filled your bet: </span>
          <span className="font-medium">{question}</span>
        </>
      );
    case "bet_targeted":
      return (
        <>
          <span className="font-semibold">{name}</span>
          <span className="text-text2"> sent you a bet: </span>
          <span className="font-medium">{question}</span>
        </>
      );
    case "bet_commented":
      return (
        <>
          <span className="font-semibold">{name}</span>
          <span className="text-text2"> commented on your bet: </span>
          <span className="font-medium">{question}</span>
        </>
      );
    case "bet_won":
      return (
        <>
          <span className="text-text2">Your bet has been settled: </span>
          <span className="font-medium">{question}</span>
          <span className="ml-1.5 text-[10px] uppercase tracking-wide font-bold bg-yes/20 text-yes rounded-pill px-1.5 py-px align-middle">
            You won
          </span>
        </>
      );
    case "bet_lost":
      return (
        <>
          <span className="text-text2">Your bet has been settled: </span>
          <span className="font-medium">{question}</span>
          <span className="ml-1.5 text-[10px] uppercase tracking-wide font-bold bg-no/20 text-no rounded-pill px-1.5 py-px align-middle">
            You lost
          </span>
        </>
      );
    case "new_message":
      return <span className="text-text2">New message</span>;
    default:
      return <span className="text-text2">{type.replace(/_/g, " ")}</span>;
  }
}

function iconFor(type: string): string {
  switch (type) {
    case "friend_request":
    case "friend_request_accepted":
      return "🤝";
    case "bet_filled":
      return "💵";
    case "bet_targeted":
      return "🎯";
    case "bet_won":
    case "bet_lost":
      return "🏁";
    case "bet_commented":
      return "💬";
    case "new_message":
      return "💬";
    default:
      return "🔔";
  }
}

function bgColorClass(seed: string): string {
  // Map the same palette pickAvatarColor uses to Tailwind background classes
  // so the initial bubble feels consistent with the rest of the app.
  const color = pickAvatarColor(seed);
  switch (color) {
    case "yes":
      return "bg-yes";
    case "no":
      return "bg-no";
    case "gold":
      return "bg-gold";
    case "purple":
      return "bg-purple";
    case "blue":
      return "bg-blue-500";
    case "orange":
      return "bg-orange-500";
    default:
      return "bg-bg4 text-text";
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
