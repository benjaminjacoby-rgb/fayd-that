"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { AVATAR_COLORS } from "@/lib/avatar";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  fetchMatchedContacts,
  setContactsPermission,
  type MatchedContact,
} from "@/lib/contacts";

type Step = "profile" | "contacts" | "matches";

export function OnboardingClient() {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [username, setUsername] = useState("");
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("profile");
  const [matches, setMatches] = useState<MatchedContact[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [contactsBusy, setContactsBusy] = useState(false);

  const valid =
    first.trim().length > 0 &&
    last.trim().length > 0 &&
    /^[a-z0-9_]{3,20}$/i.test(username);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (USE_MOCK_DATA) {
        setStep("contacts");
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No session");

      const { error } = await supabase.from("users").upsert({
        id: user.id,
        phone_number: user.phone ?? "",
        full_name: `${first.trim()} ${last.trim()}`.trim(),
        username: username.toLowerCase().trim(),
        avatar_url: null,
      });
      if (error) throw error;
      setStep("contacts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function allowContacts() {
    setContactsBusy(true);
    try {
      setContactsPermission("granted");
      const result = await fetchMatchedContacts();
      setMatches(result);
      setStep("matches");
    } finally {
      setContactsBusy(false);
    }
  }

  function skipContacts() {
    setContactsPermission("denied");
    router.push("/");
  }

  function addContactFriend(id: string) {
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  if (step === "contacts") {
    return (
      <div className="flex-1 flex flex-col px-6 pt-12">
        <h1 className="text-2xl font-bold">Find friends from your contacts</h1>
        <p className="text-text2 text-sm mt-3 mb-8">
          Fayd will match your contacts' phone numbers to find friends already on
          the app. Your contacts are never stored or shared.
        </p>
        <div className="flex flex-col gap-3 mt-auto pb-8">
          <Button full disabled={contactsBusy} onClick={allowContacts}>
            {contactsBusy ? "Matching…" : "Allow access"}
          </Button>
          <button
            onClick={skipContacts}
            className="text-text2 text-sm py-3 hover:text-text"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  if (step === "matches") {
    return (
      <div className="flex-1 flex flex-col px-6 pt-12">
        <h1 className="text-2xl font-bold">Your contacts on Fayd</h1>
        <p className="text-text2 text-sm mt-1 mb-6">
          We found {matches.length} {matches.length === 1 ? "person" : "people"} you may know.
        </p>
        <ul className="flex flex-col divide-y divide-bg3">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <Avatar
                first={m.user.first_name}
                lastInitial={m.user.last_name_initial}
                color={m.user.avatar_color}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-text3 text-xs font-mono">{m.phone}</div>
              </div>
              {addedIds.has(m.id) ? (
                <span className="text-[11px] text-text3 italic">Requested</span>
              ) : (
                <button
                  onClick={() => addContactFriend(m.id)}
                  className="rounded-pill bg-yes text-bg text-xs font-semibold px-3 py-1.5 hover:brightness-110"
                >
                  Add friend
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-auto pb-8 pt-6">
          <Button full onClick={() => router.push("/")}>Continue</Button>
        </div>
      </div>
    );
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
        <Field label="Last name">
          <input
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40"
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
        <p className="text-center text-[11px] text-text3 mt-3 px-2 leading-relaxed">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline hover:text-text2 transition">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-text2 transition">
            Privacy Policy
          </Link>
        </p>
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
