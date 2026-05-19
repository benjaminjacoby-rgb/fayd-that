import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

export function AppShell({
  title,
  unread = 0,
  pendingCount = 0,
  children,
}: {
  title: string;
  unread?: number;
  pendingCount?: number;
  children: ReactNode;
}) {
  return (
    <>
      <TopBar title={title} unread={unread} />
      <main className="flex-1 pb-4">{children}</main>
      <BottomNav pendingCount={pendingCount} />
    </>
  );
}
