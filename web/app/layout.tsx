import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { Logo } from "@/components/Logo";
import "./globals.css";
import { MotionProvider } from "@/components/Motion";
import { Nav } from "@/components/Nav";

/**
 * Typography: a single family, Comfortaa, for display and body (Google Sans removed). Comfortaa
 * is not in next/font's catalogue, so it comes from the Google Fonts stylesheet in <head>; the
 * preconnects keep the handshake off the critical path.
 */

export const metadata: Metadata = {
  title: "IMBERE DATA — Financial resilience & targeting intelligence for Rwanda",
  description:
    "Where is financial fragility concentrated, what shock pushes households under the poverty line, and which targeting rule reaches them most cheaply. Built on NISR EICV7 and FinScope 2024.",
};

export const viewport: Viewport = {
  themeColor: "#005cab",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300..700&display=swap"
        />
      </head>
      <body className="paper-grain min-h-screen">
        <MotionProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-lg"
          >
            Skip to main content
          </a>
          <Nav />
          <main id="main" className="pb-20">{children}</main>
          <footer className="relative overflow-hidden border-t border-line bg-surface">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 select-none text-center"
            >
              <p className="display translate-y-1/4 text-[clamp(24px,5vw,64px)] leading-none text-ink/[0.05]">
                NISR 2026 Big Data Hackathon
              </p>
            </div>
            <div className="shell relative py-10">
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Logo className="text-primary-deep" />
                  <p className="mt-3 text-[13px] text-ink-soft">
                    NISR 2026 Big Data Hackathon
                  </p>
                  <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-ink-soft">
                    Financial resilience and targeting intelligence for Rwanda — where fragility
                    sits, what shock tips households under, and which targeting rule reaches them
                    most cheaply.
                  </p>
                </div>
                <div>
                  <p className="label mb-3">Sections</p>
                  <ul className="space-y-1.5 text-[14px]">
                    <li>
                      <Link href="/" className="text-ink-soft transition-colors hover:text-primary-deep">
                        Overview
                      </Link>
                    </li>
                    <li>
                      <Link href="/simulator" className="text-ink-soft transition-colors hover:text-primary-deep">
                        Shock simulator
                      </Link>
                    </li>
                    <li>
                      <Link href="/targeting" className="text-ink-soft transition-colors hover:text-primary-deep">
                        Targeting lab
                      </Link>
                    </li>
                    <li>
                      <Link href="/methodology" className="text-ink-soft transition-colors hover:text-primary-deep">
                        Method &amp; data
                      </Link>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="label mb-3">Data &amp; sources</p>
                  <p className="text-[14px] leading-relaxed text-ink-soft">
                    District poverty rates and national indicators are published NISR and FinScope
                    figures. Household rows are calibrated synthetic microdata, labelled as such
                    throughout, and replaced by the EICV7 file when microdata access is granted.
                    Shock parameters are stated assumptions.
                  </p>
                  <p className="mt-3 text-[13px] text-ink-soft">
                    Data: NISR (CC BY 4.0) · Boundaries: geoBoundaries / NISR Open Data (CC BY 4.0)
                  </p>
                </div>
              </div>
              <div className="mt-8 border-t border-line pt-4 text-[12.5px] text-ink-soft">
                © NISR 2026 Big Data Hackathon · IMBERE DATA · Built with AI assistance; data
                transcription, formulas and assumptions reviewed by the team.
              </div>
            </div>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
