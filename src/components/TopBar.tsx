import { NotificationBell } from "./NotificationBell";

export function TopBar({ title, unread = 0 }: { title: string; unread?: number }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-bg2">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <NotificationBell count={unread} />
      </div>
    </header>
  );
}
