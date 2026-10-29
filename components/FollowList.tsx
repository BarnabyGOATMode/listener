"use client";
import { useEffect, useRef, useState } from "react";
import type { MiniProfile } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import { Person } from "./People";

/** A pop-up list of someone's followers or the people they follow, each with a Follow button. */
export function FollowList({ userId, kind, name, onClose }: { userId: string; kind: "followers" | "following"; name: string; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [people, setPeople] = useState<MiniProfile[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    dlg.current?.showModal();
    const db = supabase();
    const query = kind === "followers"
      ? db.from("follows").select("created_at, p:profiles!follows_follower_id_fkey(*)").eq("followee_id", userId)
      : db.from("follows").select("created_at, p:profiles!follows_followee_id_fkey(*)").eq("follower_id", userId);
    query.order("created_at", { ascending: false }).limit(500).then(({ data }) => {
      setPeople((((data ?? []) as unknown) as { p: MiniProfile | null }[]).map((r) => r.p).filter(Boolean) as MiniProfile[]);
    });
  }, [userId, kind]);
  const t = q.trim().toLowerCase().replace(/^@/, "");
  const shown = (people ?? []).filter((p) => !t || p.handle.includes(t) || p.name.toLowerCase().includes(t));
  return (
    <dialog ref={dlg} className="senddlg" aria-label={kind === "followers" ? `${name}'s followers` : `People ${name} follows`} onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}>
      <div className="send-h"><h2>{kind === "followers" ? "Followers" : "Following"}</h2><button className="close" aria-label="Close" onClick={() => dlg.current?.close()}>×</button></div>
      {people && people.length > 8 && <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this list" />}
      <div className="send-list" style={{ maxHeight: 440 }}>
        {people === null ? <p className="muted">Loading…</p>
          : shown.length ? shown.map((p) => <Person key={p.id} p={p} />)
          : <p className="muted" style={{ margin: "12px 0" }}>{t ? "No one matches that." : kind === "followers" ? `No one follows ${name} yet.` : `${name} isn't following anyone yet.`}</p>}
      </div>
    </dialog>
  );
}
