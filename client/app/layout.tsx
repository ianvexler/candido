import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { display } from "@/components/landing/fonts";
import { ReactNode } from "react";
import Navbar from "@/components/layout/Navbar";
import MainContent from "@/components/layout/MainContent";
import { AuthProvider } from "@/contexts/AuthContext";
import { JobsRefreshProvider } from "@/contexts/JobsRefreshContext";
import { Toaster } from "react-hot-toast";
import { TooltipProvider } from "@/components/ui/Tooltip";

const dmSans = localFont({
  src: "../fonts/dm-sans/latin.woff2",
  variable: "--font-dm-sans",
  weight: "400 700",
});

const geistMono = localFont({
  src: "../fonts/geist-mono/latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Candido",
  description: "Track your job applications",
};

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${geistMono.variable} ${display.variable} font-sans flex min-h-screen flex-col antialiased`}>
        <AuthProvider>
          <JobsRefreshProvider>
            <TooltipProvider>
              <div className="flex min-h-screen flex-1">
                <Navbar />
                <MainContent>
                  <main className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 min-h-0 flex flex-col">{children}</div>
                  </main>
                </MainContent>
              </div>
            </TooltipProvider>
          
            {/* On mobile, sit above the bottom tab bar. */}
            <Toaster position="bottom-right" containerClassName="max-md:!bottom-20" toastOptions={{ duration: 3000 }} />
          </JobsRefreshProvider>
        </AuthProvider>
      </body>
    </html>
  );
};

export default RootLayout;
