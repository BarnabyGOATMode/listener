"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { Avatar } from "./bits";
import { useMessages } from "./Messages";
import { useNotifications } from "./Notifications";
import { useSession } from "./Providers";

const NAV = [["/", "Feed"], ["/discover", "Discover"], ["/albums", "Search"], ["/news", "News"]] as const;

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
          <MastheadSearch />
          <Link className="bell mobile-news" href="/news" aria-label="News"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h12v13a2 2 0 0 0 2 2h-12a2 2 0 0 1-2-2z" /><path d="M16.5 9.5h3v9a2 2 0 0 1-2 2M7.5 9h6M7.5 12.5h6M7.5 16h4" /></svg></Link>
          {profile && <MessagesLink />}
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

/** The masthead's search box (wider screens only): Enter opens the Search page with results. */
function MastheadSearch() {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState("");
  useEffect(() => { if (!path.startsWith("/albums")) setQ(""); }, [path]);
  return (
    <form className="hsearch" role="search" onSubmit={(e) => { e.preventDefault(); const t = q.trim(); if (t) router.push(`/albums?q=${encodeURIComponent(t)}`); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.6" cy="10.6" r="6.6" /><path d="m15.6 15.6 4.9 4.9" /></svg>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search albums, songs, artists" aria-label="Search albums, songs and artists" />
    </form>
  );
}

function MessagesLink() {
  const { unread, requests } = useMessages();
  const n = unread + requests;
  return (
    <Link className="bell" href="/messages" aria-label={n ? `Messages, ${n} new` : "Messages"}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3.5 10.6 13.9M21 3.5l-6.6 17-3.8-6.6L4 10.1z" /></svg>
      {n > 0 && <span className="dot">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
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
