"use client";

import { useEffect } from "react";

export default function PWAProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => {
        registration.update().catch(() => undefined);
      })
      .catch((error) => {
        console.error("서비스 워커 등록 실패:", error);
      });
  }, []);

  return null;
}
