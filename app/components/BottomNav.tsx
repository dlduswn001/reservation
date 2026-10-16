"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Ticket, CalendarDays, Clock3, UserRound } from "lucide-react";

const navItems = [
  { href: "/", label: "홈", Icon: Home, matches: (path: string) => path === "/" },
  { href: "/passes", label: "수강권", Icon: Ticket, matches: (path: string) => path.startsWith("/passes") },
  { href: "/book", label: "수업예약", Icon: CalendarDays, matches: (path: string) => path.startsWith("/book") || path.startsWith("/regular") || path.startsWith("/oneday") },
  { href: "/history", label: "이용내역", Icon: Clock3, matches: (path: string) => path.startsWith("/history") || path.startsWith("/schedule") },
  { href: "/profile", label: "마이페이지", Icon: UserRound, matches: (path: string) => path.startsWith("/profile") },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";
  return (
    <nav className="bottomNav" aria-label="문장학교 수강생 메뉴">
      {navItems.map(({ href, label, Icon, matches }) => {
        const active = matches(pathname);
        return (
          <Link key={href} href={href} className={`bottomNavItem ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={24} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
