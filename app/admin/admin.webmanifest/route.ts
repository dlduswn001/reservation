import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";

/**
 * Admin has its own PWA identity so it can be installed independently of the
 * existing public student-booking app. The service worker remains shared.
 */
const manifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: "문장학교 관리자",
  short_name: "문장학교 관리",
  description: "문장학교 수업 예약·수강료·수강생·콘텐츠 통합 관리자",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "any",
  background_color: "#FFFFFF",
  theme_color: "#762C40",
  lang: "ko-KR",
  categories: ["education", "productivity"],
  icons: [
    {
      src: "/icons/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-maskable-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  shortcuts: [
    { name: "예약 관리자", short_name: "예약 관리", url: "/admin" },
    { name: "문장학교 운영 작업실", short_name: "운영 작업실", url: "/admin/studio" },
  ],
};

export function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
