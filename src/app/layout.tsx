import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Afloat — Quick Decision Support",
  description:
    "A no-fluff cognitive assistant. Get past context gates in under 2 minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased bg-white text-zinc-900`}>
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-100 py-4 px-6 text-center text-xs text-zinc-400">
            <span>Afloat &copy; {new Date().getFullYear()}</span>
            <span className="mx-2">&middot;</span>
            <a href="/privacy" className="hover:text-zinc-600 underline">
              Privacy Policy
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
