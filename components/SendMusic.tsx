"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MiniProfile } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import type { Album } from "@/lib/types";
import { Avatar, Cover } from "./bits";
import { useMessages } from "./Messages";
import { useSession } from "./Providers";

export type Attachment = { type: "album" | "song"; albumId: string; index?: number };

const PLANE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3.5 10.6 13.9M21 3.5l-6.6 17-3.8-6.6L4 10.1z" /></svg>;

/** Opens a picker to send an album or song to someone in a chat. `icon` renders it as an action-row icon. */
export function SendMusic({ attachment, label, icon }: { attachment: Attachment; label: string; icon?: boolean }) {
  const { user, profile, following, toast } = useSession();
  const { inbox, refresh } = useMessages();
  const dlg = useRef<HTMLDialogElement>(null);
  const [people, setPeople] = useState<MiniProfile[]>([]);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const open = async () => {
    dlg.current?.showModal();
    if (following.size) {
      const { data } = await supabase().from("profiles").select("*").in("id", [...following]).limit(100);
      setPeople((data as MiniProfile[]) ?? []);
    }
  };
  // Recent chats first, then everyone you follow.
  const list = useMemo(() => {
    const seen = new Set<string>(), out: MiniProfile[] = [];
    for (const c of inbox) if (c.other && c.my_status !== "ignored" && !seen.has(c.other.id)) { seen.add(c.other.id); out.push(c.other); }
    for (const p of people) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
    const t = q.trim().toLowerCase().replace(/^@/, "");
    return t ? out.filter((p) => p.handle.includes(t) || p.name.toLowerCase().includes(t)) : out;
  }, [inbox, people, q]);

  const send = async (to: MiniProfile) => {
    if (!user) return;
    setBusy(to.id);
    const db = supabase();
    const { data: conv, error } = await db.rpc("start_conversation", { other: to.id });
    if (!error) {
      const { error: e2 } = await db.from("messages").insert({
        conversation_id: conv, sender_id: user.id, body: note.trim(),
        attachment_type: attachment.type, attachment_id: attachment.albumId, attachment_index: attachment.type === "song" ? attachment.index ?? 0 : null,
      });
      if (!e2) { toast(`Sent to @${to.handle}`); setNote(""); dlg.current?.close(); refresh(); setBusy(null); return; }
    }
    toast(/message this account/.test(error?.message ?? "") ? "You can't message this account." : "Couldn't send that. Try again.");
    setBusy(null);
  };

  if (!profile) return null;
  return (
    <>
      {icon
        ? <button className="act" title="Send to a friend" onClick={open}>{PLANE}<span className="sr">Send to a friend</span></button>
        : <button className="btn ghost" onClick={open}>Send to a friend</button>}
      <dialog ref={dlg} className="senddlg" aria-label={`Send ${label}`} onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}>
        <div className="send-h"><h2>Send <i>{label}</i></h2><button className="close" aria-label="Close" onClick={() => dlg.current?.close()}>×</button></div>
        <input className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <div className="send-list">
          {list.length ? list.map((p) => (
            <div className="person" key={p.id}>
              <Avatar profile={p} />
              <div className="n"><b>{p.name}</b><small>@{p.handle}</small></div>
              <button className="follow" disabled={!!busy} onClick={() => send(p)}>{busy === p.id ? "Sending…" : "Send"}</button>
            </div>
          )) : <p className="muted" style={{ margin: "12px 0" }}>{q ? "No one matches that." : "Follow people to send them music."}</p>}
        </div>
        <input className="input" placeholder="Add a message (optional)" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Add a message" />
      </dialog>
    </>
  );
}

/** A shared album or song inside a chat: cover, title and artist, linking into listener. */
export function MusicCard({ album, index, mine }: { album: Album | undefined; index: number | null; mine: boolean }) {
  if (!album) return <div className={`mcard${mine ? " mine" : ""}`}><span className="muted">This album is no longer available.</span></div>;
  const song = index != null ? album.tracks[index] : null;
  const href = song ? `/album/${album.id}/song/${(index ?? 0) + 1}` : `/album/${album.id}`;
  return (
    <Link className={`mcard${mine ? " mine" : ""}`} href={href}>
      <Cover album={album} size={250} />
      <span className="t">
        <span className="kicker">{song ? "Song" : "Album"}</span>
        <b>{song ? song.title : album.title}</b>
        <small>{album.artist}{song ? ` · ${album.title}` : album.year ? ` · ${album.year}` : ""}</small>
      </span>
    </Link>
  );
}
