import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Fayd",
  description: "Social bets between friends — escrowed and trackable.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text">
        <div className="mx-auto max-w-app min-h-screen flex flex-col">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
