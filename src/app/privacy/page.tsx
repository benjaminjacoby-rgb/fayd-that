"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm border-b border-[#222] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex items-center gap-1 text-text2 hover:text-text text-sm transition"
        >
          <BackArrow />
          Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-6 pb-20">
        <h1 className="text-xl font-bold mb-1">Fayd — Privacy Policy</h1>
        <p className="text-text3 text-xs mb-8">Last updated: May 2026</p>

        <div className="flex flex-col gap-7 text-sm">
          <Section n="1" title="WHAT WE COLLECT">
            <p className="mb-3">We collect the following information when you use Fayd:</p>
            <ul className="flex flex-col gap-2 text-text2 mb-3">
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Your phone number (used for account creation and login via SMS verification)</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Your display name and profile photo (provided by you)</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Bets you post, fill, or participate in</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Messages and group chat content</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Comments and reactions</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Notifications and activity within the App</li>
            </ul>
            <p>We do not collect payment information at this time.</p>
          </Section>

          <Section n="2" title="HOW WE USE YOUR INFORMATION">
            <p className="mb-3">We use your information to:</p>
            <ul className="flex flex-col gap-2 text-text2">
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Operate and maintain your account</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Enable social features like bets, chats, and notifications</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Send SMS verification codes</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Improve the App and debug issues</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Enforce our Terms of Service</li>
            </ul>
          </Section>

          <Section n="3" title="HOW WE SHARE YOUR INFORMATION">
            <p className="mb-3">We do not sell your personal information. We share information only in these limited cases:</p>
            <ul className="flex flex-col gap-2 text-text2">
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>With other users, as necessary to operate social features (for example, your display name and photo are visible to others on the App)</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>With our service providers who help operate the App, including Supabase (database and authentication) and Vercel (hosting). These providers are contractually obligated to protect your data.</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>If required by law or to protect the rights and safety of users or the public</li>
            </ul>
          </Section>

          <Section n="4" title="DATA RETENTION">
            <p>We retain your account information for as long as your account is active. If you delete your account, we will remove your personal information within 30 days, except where we are required to retain it by law.</p>
          </Section>

          <Section n="5" title="YOUR RIGHTS">
            <p className="mb-3">You have the right to:</p>
            <ul className="flex flex-col gap-2 text-text2 mb-3">
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Access the personal information we hold about you</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Request correction of inaccurate information</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Request deletion of your account and associated data</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Opt out of non-essential communications</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:legal@faydthat.com" className="text-yes underline">
                legal@faydthat.com
              </a>
              .
            </p>
          </Section>

          <Section n="6" title="SECURITY">
            <p>We take reasonable technical and organizational measures to protect your information. However, no system is completely secure and we cannot guarantee absolute security.</p>
          </Section>

          <Section n="7" title="CHILDREN'S PRIVACY">
            <p>Fayd is not intended for users under 18. We do not knowingly collect personal information from minors. If we become aware that a minor has created an account, we will terminate it and delete associated data.</p>
          </Section>

          <Section n="8" title="CHANGES TO THIS POLICY">
            <p>We may update this Privacy Policy from time to time. We will notify users of material changes. Continued use of the App after changes constitutes acceptance of the updated Policy.</p>
          </Section>

          <Section n="9" title="CONTACT">
            <p>
              Questions about this Privacy Policy can be sent to:{" "}
              <a href="mailto:benjamin.jacoby@gmail.com" className="text-yes underline">
                benjamin.jacoby@gmail.com
              </a>
            </p>
          </Section>
        </div>

        <div className="mt-10 pt-6 border-t border-[#222] flex items-center justify-center gap-3 text-text3 text-xs">
          <Link href="/terms" className="hover:text-text2 transition">Terms of Service</Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-text2 transition">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-semibold text-text mb-2">
        <span className="text-text3 font-mono text-xs mr-1.5">{n}.</span>
        {title}
      </h2>
      <div className="text-text2 leading-relaxed">{children}</div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden
    >
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}
