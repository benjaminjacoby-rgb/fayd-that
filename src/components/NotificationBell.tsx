export function NotificationBell({ count = 0 }: { count?: number }) {
  return (
    <button className="relative w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center text-text2 hover:text-text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" />
        <path d="M10 21a2 2 0 004 0" />
      </svg>
      {count > 0 ? (
        <span className="absolute -top-1 -right-1 bg-no text-bg text-[10px] font-bold rounded-pill px-1.5 py-px min-w-[18px] text-center">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
