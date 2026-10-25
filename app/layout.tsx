import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { LogoMark, Wordmark } from "@/components/logo";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Wo Ọ̀nà: watch your delivery come down the road", template: "%s · Wo Ọ̀nà" },
  description: "Live delivery tracking for Nigerian businesses: riders share their location, customers watch it arrive on a map.",
  applicationName: "Wo Ọ̀nà",
  appleWebApp: { capable: true, title: "Wo Ọ̀nà", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  // Let the map and the rider's buttons use the whole phone screen.
  viewportFit: "cover",
};

// Runs before the first paint: applies a saved light/dark choice so the page
// never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-[2000] rounded-xl bg-surface px-4 py-2 font-bold text-brand shadow">
          Skip to content
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
        <footer className="border-t border-line bg-surface-2">
          <div className="container-page flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-ink-muted">
            <span className="flex items-center gap-2 text-base text-ink">
              <LogoMark className="size-6" /> <Wordmark />
            </span>
            <nav aria-label="Footer" className="flex flex-wrap gap-4">
              <Link className="hover:text-brand" href="/#track">Track a parcel</Link>
              <Link className="hover:text-brand" href="/signup">For businesses</Link>
              <Link className="hover:text-brand" href="/signup?role=rider">For riders</Link>
            </nav>
            <span>Built in Nigeria · Day 25 of 30</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
