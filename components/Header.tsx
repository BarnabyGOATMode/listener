"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ago } from "@/lib/format";
import type { Album, Notification, Profile } from "@/lib/types";
import { ArtistBadge, Avatar, Cover } from "./bits";
import { useSession } from "./Providers";

const NAV = [["/", "Feed"], ["/discover", "Discover"], ["/albums", "Albums"]] as const;

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
          {profile && <Bell profile={profile} />}
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

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, ignore?: React.RefObject<HTMLElement | null>) {
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

type Row = Notification & { actor: Profile | null; album: Album | null };

function Bell({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(profile.notif_seen_at);
  const panel = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const path = usePathname();

  const load = useCallback(async () => {
    const { data } = await supabase().from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(id,handle,name,kind), album:albums(id,title,artist,cover_url,tracks)")
      .order("created_at", { ascending: false }).limit(50);
    setRows((data as Row[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => setOpen(false), [path]);

  const close = useCallback(() => setOpen(false), []);
  useOutside(panel, close, btn);
  const unread = rows.filter((n) => n.created_at > seen).length;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (unread) {
      const now = new Date().toISOString();
      await supabase().from("profiles").update({ notif_seen_at: now }).eq("id", profile.id);
      setTimeout(() => setSeen(now), 4000);
    }
  };

  return (
    <>
      <button ref={btn} className="bell" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && !open && <span className="dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="npanel" role="dialog" aria-label="Notifications" ref={panel}>
          <div className="nhead"><h2>Notifications</h2></div>
          {rows.length ? rows.map((n) => <Item key={n.id} n={n} unread={n.created_at > seen} />)
            : <p className="empty" style={{ padding: "22px 18px", margin: 0 }}>Nothing yet. When someone follows you, or likes or comments on your reviews, you&apos;ll see it here.</p>}
        </div>
      )}
    </>
  );
}

function Item({ n, unread }: { n: Row; unread: boolean }) {
  const song = n.track_index != null ? n.album?.tracks?.[n.track_index]?.title : null;
  const subject = song ?? n.album?.title;
  const what = n.target_type === "release" ? "your release" : "your review of";
  const text =
    n.kind === "like" ? <>liked {what} <i>{subject}</i></>
    : n.kind === "comment" ? <>commented on {what} <i>{subject}</i>: “{n.excerpt}”</>
    : n.kind === "rated" ? <>logged your release <i>{subject}</i></>
    : <>started following you</>;
  const href = n.kind === "follow" ? `/u/${n.actor?.handle}` : n.track_index != null ? `/album/${n.album_id}/song/${n.track_index + 1}` : `/album/${n.album_id}`;
  return (
    <Link href={href} className={`nitem${unread ? " unread" : ""}`}>
      <Avatar profile={n.actor} />
      <p><b>{n.actor?.handle ?? "someone"}</b><ArtistBadge profile={n.actor} /> {text} <small>· {ago(n.created_at)}</small></p>
      {n.album ? <span className="thumb"><Cover album={n.album} size={250} /></span> : <span />}
    </Link>
  );
}
