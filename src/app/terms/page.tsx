"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TermsPage() {
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
        <h1 className="text-xl font-bold mb-1">Fayd — Terms of Service</h1>
        <p className="text-text3 text-xs mb-8">Last updated: May 2026</p>

        <div className="flex flex-col gap-7 text-sm">
          <Section n="1" title="ACCEPTANCE OF TERMS">
            <p>By creating an account or using Fayd ("the App"), you agree to these Terms of Service. If you do not agree, do not use the App.</p>
          </Section>

          <Section n="2" title="ELIGIBILITY">
            <p>You must be at least 18 years old to use Fayd. By using the App, you confirm that you are 18 or older. We reserve the right to terminate any account we believe belongs to a minor.</p>
          </Section>

          <Section n="3" title="WHAT FAYD IS">
            <p>Fayd is a social app that lets friends post, share, and participate in friendly bets with each other. All balances and stakes within the App are virtual and have no real-world monetary value at this time. No real money is transferred, held, or paid out through the App. This may change in the future, and these Terms will be updated accordingly.</p>
          </Section>

          <Section n="4" title="YOUR ACCOUNT">
            <p>You are responsible for keeping your account credentials secure. You are responsible for all activity that occurs under your account. We use your phone number to verify your identity. You may not create accounts on behalf of others or operate multiple accounts.</p>
          </Section>

          <Section n="5" title="ACCEPTABLE USE">
            <p className="mb-3">You agree not to:</p>
            <ul className="flex flex-col gap-2 text-text2">
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Post content that is harassing, threatening, defamatory, or abusive toward any person</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Impersonate any person or entity</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Use the App for any unlawful purpose</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Attempt to manipulate or exploit the bet resolution process</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Use automated tools or bots to interact with the App</li>
              <li className="flex gap-2"><span className="text-text3 shrink-0">—</span>Post content that infringes on anyone's intellectual property rights</li>
            </ul>
          </Section>

          <Section n="6" title="BETS AND DISPUTES">
            <p>Bets on Fayd are social in nature. Outcomes are determined by participant voting or an assigned mediator. Fayd does not guarantee the accuracy or fairness of any outcome. We reserve the right to intervene in or void any bet at our discretion. All virtual balances are subject to correction if we identify errors or abuse.</p>
          </Section>

          <Section n="7" title="USER CONTENT">
            <p>You retain ownership of the content you post. By posting content on Fayd, you grant us a non-exclusive, royalty-free license to display and distribute that content within the App. You are solely responsible for the content you post. We may remove any content that violates these Terms without notice.</p>
          </Section>

          <Section n="8" title="TERMINATION">
            <p>We may suspend or terminate your account at any time, for any reason, including violation of these Terms. You may delete your account at any time by contacting us.</p>
          </Section>

          <Section n="9" title="DISCLAIMERS">
            <p>Fayd is provided "as is" without warranties of any kind. We do not guarantee the App will be available at all times or free from errors. Virtual balances have no monetary value and we make no guarantees about their continuity.</p>
          </Section>

          <Section n="10" title="LIMITATION OF LIABILITY">
            <p>To the maximum extent permitted by law, Fayd and its founders, employees, and agents shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App. Our total liability to you for any claim shall not exceed $100.</p>
          </Section>

          <Section n="11" title="CHANGES TO THESE TERMS">
            <p>We may update these Terms at any time. We will notify users of material changes. Continued use of the App after changes constitutes acceptance of the new Terms.</p>
          </Section>

          <Section n="12" title="GOVERNING LAW">
            <p>These Terms are governed by the laws of the State of Connecticut, without regard to conflict of law principles.</p>
          </Section>

          <Section n="13" title="CONTACT">
            <p>
              Questions about these Terms can be sent to:{" "}
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
