import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { GlobalLogPanel } from "@/components/global-log-panel";
import { LogStreamProvider } from "@/components/log-stream-context";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "muxai",
  description: "AI Agent Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col h-screen bg-background">
        <ThemeProvider>
          <LogStreamProvider>
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto p-6">{children}</main>
            </div>
            <GlobalLogPanel />
          </LogStreamProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
