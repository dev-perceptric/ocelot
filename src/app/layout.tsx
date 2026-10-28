import type { Metadata } from "next";
import { Lato, Lora } from "next/font/google";
import { DialogHost } from "@/components/Dialog";
import { ToastHost } from "@/components/Toast";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const lato = Lato({ subsets: ["latin", "latin-ext"], weight: ["400", "700", "900"], variable: "--font-lato", display: "swap" });
const lora = Lora({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["400"], variable: "--font-lora", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Ocelot: Find your next move", template: "%s | Ocelot" },
  description:
    "Ocelot helps people find work and organize their job search, while giving companies a simple way to post jobs and manage applicants.",
  openGraph: { siteName: "Ocelot", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lato.variable} ${lora.variable}`}>
      <body className="min-h-screen bg-surface text-ink">
        {children}
        <DialogHost />
        <ToastHost />
      </body>
    </html>
  );
}
