"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SearchHit, SongHit } from "@/lib/types";
import { Cover } from "./bits";

/** The side bar's + button: search for an album or a song and jump straight to rating it. */
export function NewReview({ trigger }: { trigger: (open: () => void) => React.ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ albums: SearchHit[]; songs: SongHit[]; songsFirst: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRes(null); return; }
    setBusy(true);
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await (await fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctl.signal })).json();
        setRes({ albums: (r.albums ?? []).slice(0, 6), songs: (r.songs ?? []).slice(0, 5), songsFirst: !!r.songsFirst });
      } catch { /* aborted or offline */ }
      setBusy(false);
    }, 350);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]);

  const close = () => dlg.current?.close();
  return (
    <>
      {trigger(() => { dlg.current?.showModal(); })}
      <dialog ref={dlg} className="senddlg reviewdlg" aria-label="New review" onClick={(e) => { if (e.target === e.currentTarget) close(); }} onClose={() => { setQ(""); setRes(null); }}>
        <div className="send-h"><h2>New review</h2><button className="close" aria-label="Close" onClick={close}>×</button></div>
        <input className="input" autoFocus placeholder="Search an album, song or artist" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search an album, song or artist" />
        {!res && <p className="hint" style={{ margin: 0 }}>Pick an album to rate it and its songs, or pick a single song to review on its own.</p>}
        {res && (
          <div className="send-list" style={{ maxHeight: 460 }}>
            {res.songsFirst ? <>
            {res.songs.length > 0 && <div className="label" style={{ margin: "4px 0 2px" }}>Songs</div>}
            {res.songs.map((s) => (
              <Link key={`${s.album_id}-${s.title}`} className="pick" href={`/album/${s.album_id}/find?title=${encodeURIComponent(s.title)}`} onClick={close}>
                <Cover album={{ id: s.album_id, title: s.album, artist: s.artist, cover_url: null }} size={250} />
                <span className="t"><b>{s.title}</b><small>{s.artist} · {s.album}</small></span>
                <span className="kicker">Song</span>
              </Link>
            ))}
            {res.albums.length > 0 && <div className="label" style={{ margin: "10px 0 2px" }}>Albums</div>}
            {res.albums.map((a) => (
              <Link key={a.id} className="pick" href={`/album/${a.id}`} onClick={close}>
                <Cover album={a} size={250} />
                <span className="t"><b>{a.title}</b><small>{a.artist}{a.year ? ` · ${a.year}` : ""}</small></span>
                <span className="kicker">{a.type === "Single" || a.type === "EP" ? a.type : "Album"}</span>
              </Link>
            ))}
            </> : <>
            {res.albums.length > 0 && <div className="label" style={{ margin: "10px 0 2px" }}>Albums</div>}
            {res.albums.map((a) => (
              <Link key={a.id} className="pick" href={`/album/${a.id}`} onClick={close}>
                <Cover album={a} size={250} />
                <span className="t"><b>{a.title}</b><small>{a.artist}{a.year ? ` · ${a.year}` : ""}</small></span>
                <span className="kicker">{a.type === "Single" || a.type === "EP" ? a.type : "Album"}</span>
              </Link>
            ))}
            {res.songs.length > 0 && <div className="label" style={{ margin: "4px 0 2px" }}>Songs</div>}
            {res.songs.map((s) => (
              <Link key={`${s.album_id}-${s.title}`} className="pick" href={`/album/${s.album_id}/find?title=${encodeURIComponent(s.title)}`} onClick={close}>
                <Cover album={{ id: s.album_id, title: s.album, artist: s.artist, cover_url: null }} size={250} />
                <span className="t"><b>{s.title}</b><small>{s.artist} · {s.album}</small></span>
                <span className="kicker">Song</span>
              </Link>
            ))}
            </>}
            {!busy && !res.songs.length && !res.albums.length && <p className="muted">Nothing matched. Try the artist&apos;s name too, or add it from Search with “Can&apos;t find it?”.</p>}
          </div>
        )}
        {busy && <p className="hint" style={{ margin: 0 }}>Searching…</p>}
      </dialog>
    </>
  );
}
