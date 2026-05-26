"use client";

import { useEffect, useState } from "react";

/**
 * Renders a time string that depends on `Date.now()` only on the client.
 *
 * Why: doing the formatting during SSR bakes a "now" into the HTML that
 * disagrees with the client's recomputation moments later, which React flags
 * as a hydration mismatch. We render nothing on the server and post-mount
 * compute + tick the value on the client. `suppressHydrationWarning` is set
 * as a belt-and-braces guard in case formatter output ever changes between
 * the SSR pass and the first client paint.
 */
interface Props {
  iso: string;
  formatter: (iso: string, now: Date) => string;
  /** How often to recompute on the client. Defaults to 60s. */
  intervalMs?: number;
  className?: string;
}

export function RelativeTime({ iso, formatter, intervalMs = 60_000, className }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatter(iso, new Date()));
    const id = window.setInterval(() => {
      setLabel(formatter(iso, new Date()));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [iso, formatter, intervalMs]);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? ""}
    </span>
  );
}
