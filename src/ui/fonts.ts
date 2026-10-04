import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

/** Self-hosted Geist (no runtime font requests). Exposes --font-geist-sans/--font-geist-mono. */
export const fontVariables = `${GeistSans.variable} ${GeistMono.variable}`;
