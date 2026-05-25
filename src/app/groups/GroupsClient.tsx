"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/Toast";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_CURRENT_USER } from "@/lib/mock";
import { fullName } from "@/lib/format";
import { createGroup as createGroupRemote } from "@/lib/data/groupsClient";
import type { GroupView } from "@/types/db";

type Sheet = null | "create" | "join";

export function GroupsClient({ initialGroups }: { initialGroups: GroupView[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupView[]>(initialGroups);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createGroup(name: string, invitedUserIds: string[] = []) {
    if (USE_MOCK_DATA) {
      const code = randomCode();
      const id = `g-new-${Date.now()}`;
      const me = MOCK_CURRENT_USER;
      const view: GroupView = {
        id,
        name: name.trim(),
        invite_code: code,
        admin_id: me.id,
        created_at: new Date().toISOString(),
        admin: {
          id: me.id,
          first_name: me.first_name,
          last_name_initial: me.last_name_initial,
          username: me.username,
          avatar_color: me.avatar_color,
        },
        member_count: 1,
        is_admin: true,
        pending_join_count: 0,
      };
      setGroups((xs) => [view, ...xs]);
      setSheet(null);
      setToast(`Group created · code ${code}`);
      return;
    }
    setBusy(true);
    try {
      const view = await createGroupRemote({ name, invitedUserIds });
      setGroups((xs) => [view, ...xs]);
      setSheet(null);
      setToast(`Group created · code ${view.invite_code}`);
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't create group · ${e.message}` : "Couldn't create group");
    } finally {
      setBusy(false);
    }
  }

  function joinByCode(code: string) {
    // Mock: pretend the code matches some real group; either request was sent or invalid.
    setSheet(null);
    setToast(`Request sent · code ${code.toUpperCase()}`);
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="grid grid-cols-2 gap-2 mb-5">
        <Button onClick={() => setSheet("create")}>+ Create</Button>
        <Button variant="secondary" onClick={() => setSheet("join")}>Join with code</Button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center pt-10">
          <div className="text-5xl mb-3">👥</div>
          <h2 className="text-lg font-semibold mb-1">You're not in any groups</h2>
          <p className="text-text2 text-sm">Create one or join with an invite code.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/groups/${g.id}`}
                className="bg-bg2 hover:bg-bg2/70 rounded-card p-4 flex items-center gap-3 transition"
              >
                <GroupGlyph name={g.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{g.name}</span>
                    {g.is_admin ? (
                      <span className="text-[10px] uppercase tracking-wide bg-gold/20 text-gold rounded-pill px-1.5 py-px font-semibold">
                        admin
                      </span>
                    ) : null}
                  </div>
                  <div className="text-text3 text-[11px] flex items-center gap-2 mt-0.5">
                    <span>
                      {g.member_count} member{g.member_count === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>admin: {fullName(g.admin)}</span>
                  </div>
                </div>
                {g.is_admin && g.pending_join_count > 0 ? (
                  <span className="bg-no text-bg text-[11px] font-bold rounded-pill px-2 py-0.5">
                    {g.pending_join_count}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sheet === "create" ? (
        <CreateSheet onClose={() => setSheet(null)} onCreate={createGroup} />
      ) : null}
      {sheet === "join" ? (
        <JoinSheet onClose={() => setSheet(null)} onJoin={joinByCode} />
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

function GroupGlyph({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="w-12 h-12 rounded-card bg-purple/20 text-purple flex items-center justify-center font-bold">
      {initials || "G"}
    </div>
  );
}

function CreateSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <ModalSheet onClose={onClose} title="Create a group">
      <label className="text-xs uppercase tracking-wide text-text3 font-medium block mb-1.5">
        Group name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="The Trading Floor"
        className="w-full bg-bg3 rounded-input px-3 py-2.5 outline-none focus:ring-2 focus:ring-yes/40 mb-4"
      />
      <Button full disabled={name.trim().length < 2} onClick={() => onCreate(name)}>
        Create group
      </Button>
      <p className="text-text3 text-[11px] text-center mt-3">
        You'll get a 6-character invite code to share.
      </p>
    </ModalSheet>
  );
}

function JoinSheet({ onClose, onJoin }: { onClose: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  const valid = code.trim().length === 6;
  return (
    <ModalSheet onClose={onClose} title="Join with code">
      <label className="text-xs uppercase tracking-wide text-text3 font-medium block mb-1.5">
        Invite code
      </label>
      <input
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
        placeholder="ABC123"
        className="w-full bg-bg3 rounded-input px-3 py-2.5 outline-none focus:ring-2 focus:ring-yes/40 mb-4 font-mono tracking-[0.4em] text-center text-lg uppercase"
      />
      <Button full disabled={!valid} onClick={() => onJoin(code)}>
        Send join request
      </Button>
      <p className="text-text3 text-[11px] text-center mt-3">
        The group's admin will approve your request.
      </p>
    </ModalSheet>
  );
}

function ModalSheet({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-app bg-bg2 rounded-t-2xl shadow-2xl px-5 pt-2 pb-6 animate-[slideup_180ms_ease-out]">
        <div className="flex justify-center mb-2">
          <div className="h-1 w-10 rounded-pill bg-bg4" />
        </div>
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        {children}
        <style jsx>{`
          @keyframes slideup {
            from { transform: translateY(20px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
