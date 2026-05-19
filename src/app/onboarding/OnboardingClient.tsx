"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { AVATAR_COLORS } from "@/lib/avatar";
import { USE_MOCK_DATA } from "@/lib/config";

export function OnboardingClient() {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [username, setUsername] = useState("");
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    first.trim().length > 0 &&
    last.trim().length > 0 &&
    /^[a-z0-9_]{3,20}$/i.test(username);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (USE_MOCK_DATA) {
        router.push("/");
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No session");

      const { error } = await supabase.from("users").upsert({
        id: user.id,
        phone: user.phone ?? "",
        first_name: first.trim(),
        last_name_initial: last.trim().slice(0, 1).toUpperCase(),
        username: username.toLowerCase().trim(),
        avatar_color: color,
      });
      if (error) throw error;
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col px-6 pt-12">
      <h1 className="text-2xl font-bold">Set up your profile</h1>
      <p className="text-text2 text-sm mt-1 mb-6">This is how friends will see you.</p>

      <div className="flex flex-col items-center mb-6">
        <Avatar first={first || "?"} lastInitial={last || ""} color={color} size={80} />
        <div className="mt-4 flex gap-2 flex-wrap justify-center">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-pill border-2 ${color === c ? "border-text" : "border-transparent"}`}
              style={{ background: `var(--${c})` }}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="First name">
          <input
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40"
          />
        </Field>
        <Field label="Last initial">
          <input
            value={last}
            maxLength={1}
            onChange={(e) => setLast(e.target.value)}
            className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40 text-center"
          />
        </Field>
      </div>

      <Field label="Username">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, ""))}
          placeholder="3–20 chars, letters/numbers/_"
          className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40"
        />
      </Field>

      {error && <div className="text-no text-sm mt-3">{error}</div>}

      <div className="mt-6">
        <Button full disabled={!valid || busy} onClick={submit}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-text3 font-medium mb-1 block">{label}</span>
      {children}
    </label>
  );
}
