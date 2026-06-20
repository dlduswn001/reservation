import "./globals.css";
import type { Metadata, Viewport } from "next";
import PWAProvider from "./components/PWAProvider";

export const metadata: Metadata = {
  title: "문장학교 수업 예약",
  description: "문장학교 정규수업과 원데이 클래스 예약 페이지",
  applicationName: "문장학교 예약",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "문장학교 예약",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6b4f3b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <PWAProvider />
        {children}
      </body>
    </html>
  );
}
