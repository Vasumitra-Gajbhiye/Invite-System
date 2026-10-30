import type { Metadata } from "next";
import { EVENT } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: EVENT.name,
  description: EVENT.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
