"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsStandalone(standalone);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setDismissed(window.sessionStorage.getItem("pwa-install-dismissed") === "1");

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isStandalone || dismissed) return null;

  async function installApp() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvent(null);
    }
  }

  function dismiss() {
    window.sessionStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  }

  return (
    <aside className="installCard" aria-label="문장학교 예약 앱 설치 안내">
      <div>
        <strong className="installTitle">휴대폰에 앱으로 설치하기</strong>
        {installEvent ? (
          <p className="installText">홈 화면에 문장학교 예약 앱을 추가하면 더 빠르게 열 수 있어요.</p>
        ) : isIOS ? (
          <p className="installText">
            아이폰 Safari의 <b>공유 버튼</b>을 누른 뒤 <b>홈 화면에 추가</b>를 선택해 주세요.
          </p>
        ) : (
          <p className="installText">
            브라우저 메뉴에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택해 주세요.
          </p>
        )}
      </div>
      <div className="installActions">
        {installEvent && (
          <button type="button" className="compact" onClick={installApp}>
            앱 설치하기
          </button>
        )}
        <button type="button" className="compact secondary" onClick={dismiss}>
          나중에
        </button>
      </div>
    </aside>
  );
}
