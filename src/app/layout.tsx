import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/ui/fonts";
import "@/ui/global.css";

export const metadata: Metadata = {
  title: { default: "DirectorXO", template: "%s · DirectorXO" },
};

export const viewport: Viewport = { themeColor: "#0b0d11", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
