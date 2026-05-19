"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { USE_MOCK_DATA } from "@/lib/config";

type Step = "phone" | "otp";

export function LoginClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendOtp() {
    setError(null);
    setBusy(true);
    try {
      if (USE_MOCK_DATA) {
        // Mock mode — skip the SMS round-trip.
        setStep("otp");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizePhone(phone),
        options: { channel: "sms" },
      });
      if (error) throw error;
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      if (USE_MOCK_DATA) {
        router.push("/onboarding");
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phone),
        token: otp,
        type: "sms",
      });
      if (error) throw error;
      // Check whether the user has completed onboarding.
      const { data: profile } = await supabase
        .from("users")
        .select("username")
        .eq("id", data.user!.id)
        .maybeSingle();
      router.push(profile?.username ? "/" : "/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col px-6 pt-16">
      <div className="mb-10">
        <div className="text-3xl font-bold tracking-tight text-yes">BetME</div>
        <p className="text-text2 mt-2 text-sm">Bets that stick. Between friends.</p>
      </div>

      {step === "phone" ? (
        <div className="flex flex-col gap-4">
          <label className="text-xs uppercase tracking-wide text-text3 font-medium">Phone number</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+1 (555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bg-bg3 rounded-input px-4 py-3 text-base outline-none focus:ring-2 focus:ring-yes/40"
          />
          {error && <div className="text-no text-sm">{error}</div>}
          <Button full disabled={busy || phone.length < 7} onClick={sendOtp}>
            {busy ? "Sending…" : "Send code"}
          </Button>
          {USE_MOCK_DATA ? (
            <p className="text-text3 text-xs text-center mt-2">
              Mock mode — any phone works, any code works.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="text-xs uppercase tracking-wide text-text3 font-medium">6-digit code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="bg-bg3 rounded-input px-4 py-3 text-base text-center font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-yes/40"
          />
          {error && <div className="text-no text-sm">{error}</div>}
          <Button full disabled={busy || (otp.length < 6 && !USE_MOCK_DATA)} onClick={verify}>
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
          <button onClick={() => setStep("phone")} className="text-text2 text-xs">
            ← change number
          </button>
        </div>
      )}
    </div>
  );
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (p.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
