"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { addToList, loadLists, type ListRow } from "@/lib/lists";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "./Providers";

/** "Add to list" on an album page: tick the lists it belongs on, or start a new one with it. */
export function AddToList({ albumId, albumTitle }: { albumId: string; albumTitle: string }) {
  const { user, toast } = useSession();
  const dlg = useRef<HTMLDialogElement>(null);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!user) return null;
  const open = async () => {
    dlg.current?.showModal();
    try { setLists(await loadLists({ userId: user.id, limit: 100 })); } catch { setLists([]); toast("Couldn't load your lists."); }
  };
  const toggle = async (l: ListRow) => {
    setBusy(l.id);
    const has = l.items.some((i) => i.album_id === albumId);
    try {
      if (has) {
        const { error } = await supabase().from("list_items").delete().eq("list_id", l.id).eq("album_id", albumId);
        if (error) throw new Error("Couldn't remove it from the list.");
        setLists((ls) => ls!.map((x) => (x.id === l.id ? { ...x, items: x.items.filter((i) => i.album_id !== albumId) } : x)));
      } else {
        const item = await addToList(l, albumId);
        setLists((ls) => ls!.map((x) => (x.id === l.id ? { ...x, items: [...x.items, item] } : x)));
        toast(`Added to ${l.title}`);
      }
    } catch (e) { toast((e as Error).message); }
    setBusy(null);
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy("new");
    const { data, error } = await supabase().from("lists").insert({ user_id: user.id, title: t }).select("*").single();
    if (error || !data) { setBusy(null); return toast("Couldn't make the list. Try again."); }
    const fresh = { ...(data as ListRow), profile: null, items: [] };
    try {
      const item = await addToList(fresh, albumId);
      setLists((ls) => [{ ...fresh, items: [item] }, ...(ls ?? [])]);
      setTitle("");
      toast(`Started “${t}” with ${albumTitle}`);
    } catch (err) { toast((err as Error).message); }
    setBusy(null);
  };

  return (
    <>
      <button className="btn ghost" onClick={open}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ico"><path d="M4 6.5h11M4 12h11M4 17.5h7M18 14v7M14.5 17.5h7" /></svg>Add to list
      </button>
      <dialog ref={dlg} className="senddlg" aria-label="Add to a list" onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}>
        <div className="send-h"><h2>Add to a list</h2><button className="close" aria-label="Close" onClick={() => dlg.current?.close()}>×</button></div>
        <form className="newlist" onSubmit={create}>
          <input className="input" placeholder="New list, e.g. “Best of 2025”" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New list name" />
          <button className="btn small" disabled={!title.trim() || busy === "new"}>Create</button>
        </form>
        <div className="send-list" style={{ maxHeight: 380 }}>
          {!lists ? <p className="hint">Loading your lists…</p>
            : !lists.length ? <p className="hint">You haven&apos;t made a list yet. Name one above and {albumTitle} goes in first.</p>
            : lists.map((l) => {
              const has = l.items.some((i) => i.album_id === albumId);
              return (
                <div key={l.id} className="listpick">
                  <button aria-pressed={has} disabled={busy === l.id} onClick={() => toggle(l)} aria-label={`${has ? "Remove from" : "Add to"} ${l.title}`}>
                    <span className="tick" aria-hidden="true">{has ? "✓" : "+"}</span>
                    <span className="t"><b>{l.title}</b><small>{l.items.length} {l.items.length === 1 ? "album" : "albums"}{l.ranked ? " · ranked" : ""}</small></span>
                  </button>
                  <Link className="kicker" href={`/list/${l.id}`}>Open</Link>
                </div>
              );
            })}
        </div>
      </dialog>
    </>
  );
}
