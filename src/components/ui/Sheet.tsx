"use client";

import { useEffect, type ReactNode } from "react";

export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-app bg-bg2 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto pb-6 animate-[slideup_180ms_ease-out]">
        <div className="sticky top-0 bg-bg2 pt-2 pb-3 flex justify-center">
          <div className="h-1 w-10 rounded-pill bg-bg4" />
        </div>
        {children}
      </div>
      <style jsx>{`
        @keyframes slideup {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
