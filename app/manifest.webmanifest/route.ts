import { NextResponse } from "next/server";
import type { MetadataRoute } from "next";

// Keep the student app manifest as an ordinary route instead of the special
// app/manifest.ts metadata file. The special file overrides route-specific
// manifests even inside /admin and caused admin app installs to launch "/".
const publicManifest: MetadataRoute.Manifest = {
  id: "/",
  name: "문장학교",
  short_name: "문장학교",
  description: "문장학교 정규수업과 원데이 클래스를 예약하고 수강 기록을 확인하는 앱",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  lang: "ko-KR",
  categories: ["education", "productivity"],
  icons: [
    { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET() {
  return NextResponse.json(publicManifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
