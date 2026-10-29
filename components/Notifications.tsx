"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ago } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album, Notification, Profile } from "@/lib/types";
import { ArtistBadge, Avatar, Cover } from "./bits";
import { useSession } from "./Providers";

type Row = Notification & { actor: Profile | null; album: Album | null };
type From = "header" | "rail";
type Ctx = { unread: number; open: From | null; toggle: (from: From) => void; available: boolean };
const NotifCtx = createContext<Ctx>({ unread: 0, open: null, toggle: () => {}, available: false });
export const useNotifications = () => useContext(NotifCtx);

/** One shared set of notifications for every bell on the page (masthead and side bar), polled once a minute. */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<From | null>(null);
  const [seen, setSeen] = useState<string>("");
  const panel = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => { if (profile) setSeen(profile.notif_seen_at); }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    const { data } = await supabase().from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(*), album:albums(id,title,artist,cover_url,tracks)")
      .order("created_at", { ascending: false }).limit(50);
    setRows((data as Row[]) ?? []);
  }, []);
  useEffect(() => {
    if (!profile) { setRows([]); return; }
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [profile?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setOpen(null), [path]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!panel.current?.contains(t) && !t.closest("[data-notif-trigger]")) setOpen(null); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const unread = profile ? rows.filter((n) => n.created_at > seen).length : 0;
  const toggle = async (from: From) => {
    if (open) { setOpen(null); return; }
    setOpen(from);
    if (unread && profile) {
      const now = new Date().toISOString();
      await supabase().from("profiles").update({ notif_seen_at: now }).eq("id", profile.id);
      setTimeout(() => setSeen(now), 4000); // keep new items highlighted for a moment
    }
  };

  return (
    <NotifCtx.Provider value={{ unread, open, toggle, available: !!profile }}>
      {children}
      {open && (
        <div className={`npanel from-${open}`} role="dialog" aria-label="Notifications" ref={panel}>
          <div className="nhead"><h2>Notifications</h2></div>
          {rows.length ? rows.map((n) => <Item key={n.id} n={n} unread={n.created_at > seen} />)
            : <p className="empty" style={{ padding: "22px 18px", margin: 0 }}>Nothing yet. When someone follows you, or likes or comments on your reviews, you&apos;ll see it here.</p>}
        </div>
      )}
    </NotifCtx.Provider>
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
