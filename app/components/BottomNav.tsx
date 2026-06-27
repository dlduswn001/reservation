"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "홈", icon: "⌂", match: (path: string) => path === "/" },
  { href: "/history", label: "예약내역", icon: "▣", match: (path: string) => path.startsWith("/history") },
  { href: "/book", label: "예약하기", icon: "+", match: (path: string) => path.startsWith("/book") || path.startsWith("/regular") || path.startsWith("/oneday") },
  { href: "/schedule", label: "내 일정표", icon: "□", match: (path: string) => path.startsWith("/schedule") },
  { href: "/profile", label: "프로필", icon: "♙", match: (path: string) => path.startsWith("/profile") },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="bottomNav" aria-label="수강생 메뉴">
      {navItems.map((item) => {
        const active = item.match(pathname);
        return (
          <Link key={item.href} href={item.href} className={`bottomNavItem ${active ? "active" : ""}`}>
            <span className="bottomNavIcon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
