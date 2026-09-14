import type { Metadata } from "next";
import { League_Gothic, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { Header } from "@/components/navigation";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const leagueGothic = League_Gothic({
  variable: "--font-league-gothic",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const sourceSerif4 = Source_Serif_4({
  variable: "--font-source-serif-4",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

const sourceSans3 = Source_Sans_3({
  variable: "--font-source-sans-3",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://everythingsports.example"),
  title: {
    default: "Everything Sports",
    template: "%s | Everything Sports",
  },
  description:
    "Everything Sports is a 24/7 sports news publication covering basketball, football, baseball, and the whole sports conversation, edited with a point of view.",
  openGraph: {
    type: "website",
    siteName: "Everything Sports",
    title: "Everything Sports",
    description:
      "The whole sports conversation, edited with a point of view. Basketball, football, baseball, and more.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Everything Sports",
    description:
      "The whole sports conversation, edited with a point of view. Basketball, football, baseball, and more.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${leagueGothic.variable} ${sourceSerif4.variable} ${sourceSans3.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-canvas text-ink font-ui antialiased">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
