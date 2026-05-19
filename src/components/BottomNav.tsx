"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
  center?: boolean;
}

const TABS: Tab[] = [
  { href: "/",        label: "Home",    icon: <HomeIcon /> },
  { href: "/map",     label: "Map",     icon: <PinIcon /> },
  { href: "/create",  label: "Create",  icon: <PlusIcon />, center: true },
  { href: "/pending", label: "Pending", icon: <ClockIcon /> },
  { href: "/profile", label: "Profile", icon: <PersonIcon /> },
];

export function BottomNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 w-full bg-bg2/95 backdrop-blur border-t border-bg3">
      <ul className="flex items-center justify-between px-3 pt-2 pb-3">
        {TABS.map((t) => {
          const active = pathname === t.href;
          if (t.center) {
            return (
              <li key={t.href} className="-mt-6">
                <Link
                  href={t.href}
                  className="inline-flex items-center justify-center w-14 h-14 rounded-pill bg-yes text-bg shadow-lg shadow-yes/30 active:scale-95 transition"
                >
                  {t.icon}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`relative flex flex-col items-center gap-0.5 text-[10px] font-medium ${
                  active ? "text-yes" : "text-text3"
                }`}
              >
                <span className="w-6 h-6">{t.icon}</span>
                {t.label}
                {t.href === "/pending" && pendingCount > 0 ? (
                  <span className="absolute -top-1 right-1/3 translate-x-3 bg-no text-bg text-[10px] font-bold rounded-pill px-1.5 py-px min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="28" height="28">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}
