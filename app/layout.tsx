import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloud 9 — Scheduling",
  description: "Employee scheduling and shift management for Cloud 9.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f5f5f5] antialiased">{children}</body>
    </html>
  );
}
