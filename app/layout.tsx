import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Screening Portal",
  description: "OAuth login with RBAC, resume uploads, admin review tools, and AI candidate scoring."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
