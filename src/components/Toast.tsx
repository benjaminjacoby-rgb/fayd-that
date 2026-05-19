"use client";

import { useEffect } from "react";

export function Toast({
  message,
  onDone,
  durationMs = 2200,
}: {
  message: string;
  onDone: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDone]);

  return (
    <div className="fixed left-0 right-0 bottom-24 z-40 flex justify-center pointer-events-none px-4">
      <div className="max-w-app w-full pointer-events-auto bg-bg3 border border-bg4 text-text rounded-input px-4 py-2.5 shadow-xl flex items-center gap-2 animate-[fadein_140ms_ease-out]">
        <span className="w-2 h-2 rounded-pill bg-yes shrink-0" />
        <span className="text-sm flex-1">{message}</span>
      </div>
      <style jsx>{`
        @keyframes fadein {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
