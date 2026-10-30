import type { Metadata, Viewport } from "next";
import { Germania_One, IM_Fell_English, IM_Fell_English_SC, New_Rocker, Pinyon_Script } from "next/font/google";
import { EVENT } from "@/lib/config";
import "./globals.css";

const title = New_Rocker({ weight: "400", subsets: ["latin"], variable: "--font-title" });
const display = Germania_One({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const caps = IM_Fell_English_SC({ weight: "400", subsets: ["latin"], variable: "--font-caps" });
const body = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-body" });
const script = Pinyon_Script({ weight: "400", subsets: ["latin"], variable: "--font-script" });

export const metadata: Metadata = {
  title: EVENT.name,
  description: EVENT.tagline,
};

export const viewport: Viewport = {
  themeColor: "#7f1d17",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={[title, display, caps, body, script].map((f) => f.variable).join(" ")}>
      <body>{children}</body>
    </html>
  );
}
