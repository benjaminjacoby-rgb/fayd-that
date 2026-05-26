"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { RelativeTime } from "./RelativeTime";
import { fullName } from "@/lib/format";
import { getComments, postComment } from "@/lib/data/commentsClient";
import type { CommentView, UserLite } from "@/types/db";

interface Props {
  betId: string;
  currentUser: UserLite;
  /** Optional seed (e.g. mock comments from post_meta) shown until the live query lands. */
  initial?: CommentView[];
}

const VISIBLE_COUNT = 5;

export function CommentsSection({ betId, currentUser, initial }: Props) {
  const [comments, setComments] = useState<CommentView[]>(initial ?? []);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    getComments(betId)
      .then((rows) => {
        if (cancelled.current) return;
        setComments(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled.current) return;
        setLoaded(true);
      });
    return () => {
      cancelled.current = true;
    };
  }, [betId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const row = await postComment({ betId, content: trimmed });
      // Compose the view locally from the inserted row + currentUser so the
      // new comment appears immediately without depending on a follow-up join.
      const inserted: CommentView = {
        id: row.id,
        user: currentUser,
        text: row.content,
        created_at: row.created_at,
      };
      setComments((prev) => [inserted, ...prev]);
      setText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not post comment";
      setError(msg);
      console.warn("postComment failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  const visible = showAll ? comments : comments.slice(0, VISIBLE_COUNT);
  const hasMore = comments.length > VISIBLE_COUNT;

  return (
    <div className="flex flex-col gap-3">
      {loaded && comments.length === 0 ? (
        <div className="text-[#777] text-xs">Be the first to comment</div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((c) => (
            <li key={c.id} className="flex gap-2 items-start">
              <Avatar
                first={c.user.first_name}
                lastInitial={c.user.last_name_initial}
                color={c.user.avatar_color}
                size={28}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-text2">{fullName(c.user)}</span>
                  <RelativeTime
                    iso={c.created_at}
                    formatter={formatRelative}
                    className="text-[10px] text-text3 font-mono"
                  />
                </div>
                <div className="text-sm text-[#cfcfcf] break-words leading-snug">
                  {c.text}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasMore && !showAll ? (
        <button
          onClick={() => setShowAll(true)}
          className="text-[#777] text-xs hover:text-text2 text-left"
        >
          View all {comments.length} comments
        </button>
      ) : null}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-1">
        <Avatar
          first={currentUser.first_name}
          lastInitial={currentUser.last_name_initial}
          color={currentUser.avatar_color}
          size={28}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 min-w-0 bg-bg3 rounded-pill px-3 py-1.5 text-sm text-text placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-yes/40"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="rounded-pill bg-yes text-bg font-semibold text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] transition"
        >
          {submitting ? "Posting…" : "Post"}
        </button>
      </form>
      {error ? <div className="text-xs text-no">{error}</div> : null}
    </div>
  );
}

function formatRelative(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diffMs = now.getTime() - t;
  if (Number.isNaN(diffMs) || diffMs < 0) return "now";
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}
