import Link from "next/link";
import { NotificationBell } from "./NotificationBell";

export function TopBar({
  title,
  unread = 0,
  pendingCount = 0,
}: {
  title: string;
  unread?: number;
  pendingCount?: number;
}) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-bg2">
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <div className="flex items-center gap-2">
          <PendingClockButton count={pendingCount} />
          <NotificationBell count={unread} />
        </div>
      </div>
    </header>
  );
}

function PendingClockButton({ count }: { count: number }) {
  return (
    <Link
      href="/pending"
      aria-label="Pending bets"
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
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {count > 0 ? (
        <span className="absolute -top-1 -right-1 bg-no text-bg text-[10px] font-bold rounded-pill px-1.5 py-px min-w-[18px] text-center">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
