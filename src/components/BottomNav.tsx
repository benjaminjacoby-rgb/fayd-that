"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
  center?: boolean;
  /** When true, this tab is considered "active" if the URL starts with `href`. */
  prefixMatch?: boolean;
}

const TABS: Tab[] = [
  { href: "/",         label: "Home",       icon: <HomeIcon /> },
  { href: "/groups",   label: "Groups",     icon: <PeopleIcon />, prefixMatch: true },
  { href: "/create",   label: "Post a Bet", icon: <PlusIcon />, center: true },
  { href: "/messages", label: "Messages",   icon: <ChatIcon />, prefixMatch: true },
  { href: "/profile",  label: "Profile",    icon: <PersonIcon /> },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 w-full bg-bg2/95 backdrop-blur border-t border-bg3">
      <ul className="flex items-center justify-between px-3 pt-2 pb-3">
        {TABS.map((t) => {
          const active = t.prefixMatch
            ? pathname === t.href || pathname.startsWith(`${t.href}/`)
            : pathname === t.href;
          if (t.center) {
            return (
              <li key={t.href} className="-mt-6">
                <Link
                  href={t.href}
                  aria-label={t.label}
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
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6S15.5 16.6 15.5 20" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16 14.4c2.7.4 5 2.4 5 5.6" />
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
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
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
