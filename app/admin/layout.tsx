import type { Metadata } from "next";

/**
 * Installed manager experience: independent manifest identity and launch path.
 * Public booking PWA (/manifest.webmanifest) remains unchanged.
 */
export const metadata: Metadata = {
  title: "문장학교 관리자",
  description: "문장학교 수업 예약·수강료·수강생·콘텐츠 통합 관리자",
  applicationName: "문장학교 관리자",
  manifest: "/admin/admin.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "문장학교 관리자",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
