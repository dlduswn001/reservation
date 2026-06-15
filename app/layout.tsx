import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "문장학교 수업 예약",
  description: "문장학교 정규수업과 원데이 클래스 예약 페이지",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
