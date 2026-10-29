"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { Avatar } from "./bits";
import { useNotifications } from "./Notifications";
import { useSession } from "./Providers";

const NAV = [["/", "Feed"], ["/discover", "Discover"], ["/albums", "Search"]] as const;

export function Header() {
  const { user, profile } = useSession();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [date, setDate] = useState("");
  useEffect(() => setDate(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })), []);
  useEffect(() => setMenu(false), [path]);
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const mine = profile && path === `/u/${profile.handle}`;

  return (
    <header>
      <div className="wrap bar">
        <div className="dateline">{date}<span>Reviews of every record</span></div>
        <Link className="logo" href="/">listener</Link>
        <div className="tright">
          {profile && <Bell />}
          {profile ? (
            <button className="acct" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <Avatar profile={profile} /><span className="nm">@{profile.handle}</span>
            </button>
          ) : user ? null : (
            <Link className="btn small ghost" href="/login">Sign in</Link>
          )}
        </div>
        <nav className="nav">
          {NAV.map(([href, label]) => <Link key={href} href={href} aria-current={current(href) ? "page" : undefined}>{label}</Link>)}
          <Link href={profile ? `/u/${profile.handle}` : "/login"} aria-current={mine ? "page" : undefined}>Profile</Link>
        </nav>
        {menu && profile && <AccountMenu profile={profile} close={() => setMenu(false)} />}
      </div>
    </header>
  );
}

function AccountMenu({ profile, close }: { profile: Profile; close: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, close);
  return (
    <div className="menu" role="menu" ref={ref}>
      <Link role="menuitem" href={`/u/${profile.handle}`}>Your profile</Link>
      <Link role="menuitem" href={`/u/${profile.handle}?settings=1`}>Settings</Link>
      <button role="menuitem" onClick={async () => { await supabase().auth.signOut(); close(); router.push("/login"); router.refresh(); }}>Sign out</button>
    </div>
  );
}

export function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, ignore?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !ignore?.current?.contains(t)) onOutside();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [ref, onOutside, ignore]);
}

function Bell() {
  const { unread, open, toggle } = useNotifications();
  return (
    <button data-notif-trigger className="bell" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-haspopup="dialog" aria-expanded={open === "header"} onClick={() => toggle("header")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
      {unread > 0 && !open && <span className="dot">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}
