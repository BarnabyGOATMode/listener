"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Look } from "@/lib/types";
import { AvatarFace, avatarColor } from "./bits";
import { useOutside } from "./Header";
import { useMessages } from "./Messages";
import { NewReview } from "./NewReview";
import { useNotifications } from "./Notifications";
import { applyLook, useSession } from "./Providers";

const I = {
  home: <path d="M3.5 10.6 12 3.5l8.5 7.1V20a.5.5 0 0 1-.5.5h-5.2v-6.2H9.2v6.2H4a.5.5 0 0 1-.5-.5z" />,
  compass: <><circle cx="12" cy="12" r="8.7" /><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z" /></>,
  search: <><circle cx="10.6" cy="10.6" r="6.6" /><path d="m15.6 15.6 4.9 4.9" /></>,
  heart: <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />,
  plus: <><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><path d="M12 8v8M8 12h8" /></>,
  user: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5" /></>,
  moon: <path d="M19.8 14.6A8.2 8.2 0 1 1 9.4 4.2a6.6 6.6 0 0 0 10.4 10.4z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  news: <><path d="M4.5 5.5h12v13a2 2 0 0 0 2 2h-12a2 2 0 0 1-2-2z" /><path d="M16.5 9.5h3v9a2 2 0 0 1-2 2M7.5 9h6M7.5 12.5h6M7.5 16h4" /></>,
  plane: <path d="M21 3.5 10.6 13.9M21 3.5l-6.6 17-3.8-6.6L4 10.1z" />,
};
const Icon = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;

function Item({ href, label, icon, current, onClick, badge, trigger }: { href?: string; label: string; icon: React.ReactNode; current?: boolean; onClick?: () => void; badge?: number; trigger?: boolean }) {
  const inner = <>{icon}{badge ? <span className="dot">{badge > 9 ? "9+" : badge}</span> : null}<span className="tip">{label}</span></>;
  return href
    ? <Link className="ri" href={href} aria-label={label} aria-current={current ? "page" : undefined}>{inner}</Link>
    : <button className="ri" aria-label={label} onClick={onClick} data-notif-trigger={trigger || undefined} aria-expanded={current}>{inner}</button>;
}

/** Instagram-style vertical bar of icons; hovering an icon slides its name out beside it. Shown on wider screens. */
export function Rail() {
  const { profile, user } = useSession();
  const { unread, open, toggle, available } = useNotifications();
  const { unread: unreadMessages, requests } = useMessages();
  const path = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null), menuBtn = useRef<HTMLDivElement>(null);
  useOutside(menuRef, () => setMenu(false), menuBtn);
  useEffect(() => setMenu(false), [path]);

  useEffect(() => {
    const read = () => {
      const l = document.documentElement.dataset.look;
      setDark(l === "dark" || (l === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-look"] });
    return () => mo.disconnect();
  }, []);
  const flipLook = async () => {
    const next: Look = dark ? "light" : "dark";
    applyLook(next);
    if (profile) await supabase().from("profiles").update({ look: next }).eq("id", profile.id);
  };

  const is = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const mine = !!profile && path.startsWith(`/u/${profile.handle}`);

  return (
    <nav className="rail" aria-label="Main">
      <Link href="/" className="rail-logo" aria-label="listener home">
        <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" /><circle cx="16" cy="16" r="10" className="groove" /><circle cx="16" cy="16" r="6.5" className="groove" /><circle cx="16" cy="16" r="3.4" className="label" /><circle cx="16" cy="16" r=".9" className="hole" /></svg>
        <span className="tip">listener</span>
      </Link>
      <div className="rail-items">
        <Item href="/" label="Feed" icon={<Icon d={I.home} />} current={is("/")} />
        <Item href="/discover" label="Discover" icon={<Icon d={I.compass} />} current={is("/discover")} />
        <Item href="/albums" label="Search" icon={<Icon d={I.search} />} current={is("/albums")} />
        <Item href="/news" label="News" icon={<Icon d={I.news} />} current={is("/news")} />
        {available && <Item label="Notifications" icon={<Icon d={I.heart} />} onClick={() => toggle("rail")} badge={open ? 0 : unread} current={open === "rail"} trigger />}
        {profile && <Item href="/messages" label="Messages" icon={<Icon d={I.plane} />} current={is("/messages")} badge={unreadMessages + requests} />}
        {profile && <NewReview trigger={(open) => <Item label="New review" icon={<Icon d={I.plus} />} onClick={open} />} />}
        {profile ? (
          <Link className="ri" href={`/u/${profile.handle}`} aria-label="Profile" aria-current={mine ? "page" : undefined}>
            <span className="rail-av" style={{ background: avatarColor(profile.id) }} aria-hidden="true"><AvatarFace profile={profile} /></span>
            <span className="tip">Profile</span>
          </Link>
        ) : !user && <Item href="/login" label="Sign in" icon={<Icon d={I.user} />} current={is("/login")} />}
      </div>
      <div className="rail-bottom">
        <Item label={dark ? "Paper mode" : "Evening mode"} icon={<Icon d={dark ? I.sun : I.moon} />} onClick={flipLook} />
        {profile && (
          <div ref={menuBtn} style={{ position: "relative" }}>
            <Item label="More" icon={<Icon d={I.menu} />} onClick={() => setMenu(!menu)} current={menu} />
          </div>
        )}
      </div>
      {menu && profile && (
        <div className="rail-menu" role="menu" ref={menuRef}>
          <Link role="menuitem" href={`/u/${profile.handle}`}>Your profile</Link>
          <Link role="menuitem" href={`/u/${profile.handle}?settings=1`}>Settings</Link>
          <button role="menuitem" onClick={async () => { await supabase().auth.signOut(); setMenu(false); router.push("/login"); router.refresh(); }}>Sign out</button>
        </div>
      )}
    </nav>
  );
}
