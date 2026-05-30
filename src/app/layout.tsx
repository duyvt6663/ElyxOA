/**
 * DECISION RECAP — 001 Scaffold Next.js App
 * - Next.js App Router, single static route.
 * - TS strict, `@/*` -> `src/*` alias.
 * - Tailwind enabled (globals.css imported here).
 * - Vitest for tests; ESLint via `next lint`; no Prettier.
 * - Node 22 + npm.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Server Component RootLayout wraps every route.
 * 2. Imports global Tailwind stylesheet once.
 * 3. Renders <html lang="en"> shell with children inside <body>.
 */

import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Elyx Resource Allocator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
