import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import { formatCents } from "@/lib/format";

export function TopBar({
  title,
  unread = 0,
  walletCents,
}: {
  title: string;
  unread?: number;
  /** Accepted but no longer rendered; kept for prop compatibility. */
  pendingCount?: number;
  /** When provided, surfaces the wallet balance to the left of the messages + notifications buttons. */
  walletCents?: number;
}) {
  const homeMode = typeof walletCents === "number";

  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-bg2">
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <div className="flex items-center gap-2">
          {homeMode ? (
            <span className="text-sm font-mono text-text2">
              Balance <span className="text-text font-semibold">{formatCents(walletCents!)}</span>
            </span>
          ) : null}
          {/* The rightmost two buttons must always be Messages then Notifications. */}
          <MessagesButton />
          <NotificationBell count={unread} />
        </div>
      </div>
    </header>
  );
}

function MessagesButton() {
  return (
    <Link
      href="/messages"
      aria-label="Messages"
      className="relative w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center text-text2 hover:text-text"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    </Link>
  );
}

