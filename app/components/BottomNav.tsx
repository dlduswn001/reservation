"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Ticket, CalendarDays, ClipboardList, UserRound } from "lucide-react";

const navItems = [
  { href: "/", label: "홈", Icon: House, match: (path: string) => path === "/" },
  { href: "/passes", label: "수강권", Icon: Ticket, match: (path: string) => path.startsWith("/passes") },
  { href: "/book", label: "수업예약", Icon: CalendarDays, match: (path: string) => path.startsWith("/book") || path.startsWith("/regular") || path.startsWith("/oneday") },
  { href: "/history", label: "이용내역", Icon: ClipboardList, match: (path: string) => path.startsWith("/history") },
  { href: "/profile", label: "마이페이지", Icon: UserRound, match: (path: string) => path.startsWith("/profile") },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="bottomNav" aria-label="문장학교 수강생 메뉴">
      {navItems.map((item) => {
        const active = item.match(pathname);
        return (
          <Link key={item.href} href={item.href} className={`bottomNavItem ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="bottomNavIcon" aria-hidden="true"><item.Icon size={23} strokeWidth={active ? 2.25 : 1.8} /></span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
