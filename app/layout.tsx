import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JSON Fixer",
  description: "Edit JSON files with drag, sort, add, delete. Client-side only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
