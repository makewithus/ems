import type { Metadata } from "next";
import { Toaster } from "sonner";
import TitleUpdater from "@/components/TitleUpdater";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "makewithus",
    template: "%s | makewithus",
  },
  description:
    "Enterprise-grade Employee Management System for HR departments. Manage attendance, payroll, leaves, documents, and more.",
  keywords: ["employee management", "HR software", "attendance", "payroll", "leaves"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <TitleUpdater />
        {children}
        <Toaster
          position="top-right"
          duration={3000}
          toastOptions={{
            style: {
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              fontFamily: "'Space Mono', monospace",
              fontSize: "13px",
              padding: "16px",
              borderRadius: "var(--radius)",
            },
            classNames: {
              toast: "group toast",
              title: "font-semibold text-[14px]",
              description: "text-muted-foreground",
              actionButton: "bg-primary text-primary-foreground",
              cancelButton: "bg-muted text-muted-foreground",
              error: "text-red-500",
              success: "text-green-500",
              warning: "text-amber-500",
              info: "text-blue-500",
            },
          }}
        />
      </body>
    </html>
  );
}
