"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { ArtistBadge, Avatar, Cover } from "@/components/bits";
import { useSession } from "@/components/Providers";
import { Reactions } from "@/components/Reactions";
import { ago, plural } from "@/lib/format";
import { addToList, type ListItemRow, type ListRow, loadList } from "@/lib/lists";
import { supabase } from "@/lib/supabase/client";
import type { SearchHit } from "@/lib/types";

export function ListView({ id }: { id: string }) {
  const { user, toast } = useSession();
  const router = useRouter();
  const [list, setList] = useState<ListRow | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const own = !!user && list?.user_id === user.id;

  useEffect(() => { loadList(id).then(setList, () => setList(null)); }, [id]);
  useEffect(() => { if (own && list && !list.items.length) setEditing(true); }, [own, list?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (list === undefined) return <p className="more">Loading list…</p>;
  if (list === null) return <div className="empty"><strong>This list doesn&apos;t exist any more.</strong><Link href="/lists">Browse other lists</Link></div>;

  const setItems = (items: ListItemRow[]) => setList({ ...list, items });
  const move = async (from: number, to: number) => {
    if (to < 0 || to >= list.items.length) return;
    const items = [...list.items];
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    const renumbered = items.map((x, i) => ({ ...x, position: i }));
    setItems(renumbered);
    const db = supabase();
    const was = new Map(list.items.map((x) => [x.album_id, x.position]));
    const changed = renumbered.filter((x) => was.get(x.album_id) !== x.position);
    const results = await Promise.all(changed.map((x) => db.from("list_items").update({ position: x.position }).eq("list_id", list.id).eq("album_id", x.album_id)));
    if (results.some((r) => r.error)) toast("Couldn't save the new order. Refresh and try again.");
  };
  const remove = async (albumId: string) => {
    const { error } = await supabase().from("list_items").delete().eq("list_id", list.id).eq("album_id", albumId);
    if (error) return toast("Couldn't remove it.");
    setItems(list.items.filter((x) => x.album_id !== albumId));
  };
  const saveNote = async (albumId: string, note: string) => {
    const { error } = await supabase().from("list_items").update({ note: note.trim() }).eq("list_id", list.id).eq("album_id", albumId);
    if (error) toast("Couldn't save the note.");
    else setItems(list.items.map((x) => (x.album_id === albumId ? { ...x, note: note.trim() } : x)));
  };

  return (
    <>
      <div className="lhead">
        <div className="lhead-art" aria-hidden="true">
          {list.items.slice(0, 4).map((i) => <Cover key={i.album_id} album={i.album} size={250} />)}
          {Array.from({ length: Math.max(0, 4 - list.items.length) }, (_, n) => <span key={n} className="blank" />)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="kicker">{list.ranked ? "Ranked list" : "List"}</div>
          <h1 className="display">{list.title}</h1>
          {list.profile && (
            <div className="lby"><Avatar profile={list.profile} /><span>by <Link className="u" href={`/u/${list.profile.handle}`}>{list.profile.name}</Link><ArtistBadge profile={list.profile} /> · {plural(list.items.length, "album")} · updated {ago(list.updated_at)}</span></div>
          )}
          {list.description && <p className="ldesc">{list.description}</p>}
          {own && (
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn ghost small" onClick={() => setEditing(!editing)}>{editing ? "Done editing" : "Edit list"}</button>
            </div>
          )}
        </div>
      </div>

      {own && editing && <ListSettings list={list} onSaved={(l) => setList({ ...list, ...l })} onDeleted={() => { toast("List deleted"); router.push(`/u/${list.profile?.handle ?? ""}`); }} />}
      {own && editing && <AddAlbums list={list} onAdd={(item) => setItems([...list.items, item])} />}

      <div className="section-h"><h2>{list.ranked ? "The ranking" : "The albums"}</h2><span>{plural(list.items.length, "album")}</span></div>
      {!list.items.length ? (
        <p className="muted">{own ? "Nothing on this list yet. Search above to add albums, or use “Add to list” on any album page." : "Nothing on this list yet."}</p>
      ) : list.ranked || editing ? (
        <ol className="lrank">
          {list.items.map((it, i) => (
            <li key={it.album_id}>
              {list.ranked && <span className="lno">{i + 1}</span>}
              <Link href={`/album/${it.album_id}`} className="lcov" tabIndex={-1} aria-hidden="true"><Cover album={it.album} size={250} /></Link>
              <div className="lmeta">
                <Link className="u" href={`/album/${it.album_id}`}><b>{it.album.title}</b></Link>
                <small>{it.album.artist_mbid ? <Link className="u" href={`/artist/${it.album.artist_mbid}`}>{it.album.artist}</Link> : it.album.artist}{it.album.year ? ` · ${it.album.year}` : ""}</small>
                {editing ? <Note value={it.note} onSave={(v) => saveNote(it.album_id, v)} /> : it.note && <p>{it.note}</p>}
              </div>
              {editing && (
                <div className="ledit">
                  <button className="pill" aria-label={`Move ${it.album.title} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                  <button className="pill" aria-label={`Move ${it.album.title} down`} disabled={i === list.items.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                  <button className="pill" aria-label={`Remove ${it.album.title}`} onClick={() => remove(it.album_id)}>×</button>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="grid">{list.items.map((it) => <AlbumCard key={it.album_id} album={it.album} note={it.note || undefined} />)}</div>
      )}

      <Reactions type="list" id={list.id} ownerId={list.user_id} />
    </>
  );
}

function Note({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <input className="input lnote" maxLength={300} placeholder="Add a note (optional)" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onSave(v)} />;
}

function ListSettings({ list, onSaved, onDeleted }: { list: ListRow; onSaved: (l: Partial<ListRow>) => void; onDeleted: () => void }) {
  const { toast } = useSession();
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description);
  const [ranked, setRanked] = useState(list.ranked);
  const [confirm, setConfirm] = useState(false);
  const dirty = title.trim() !== list.title || description.trim() !== list.description || ranked !== list.ranked;
  return (
    <form className="form logbox" style={{ marginTop: 24 }} onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return toast("Give the list a name.");
      const patch = { title: title.trim(), description: description.trim(), ranked, updated_at: new Date().toISOString() };
      const { error } = await supabase().from("lists").update(patch).eq("id", list.id);
      if (error) return toast("Couldn't save the list.");
      onSaved(patch); toast("List saved");
    }}>
      <label className="field">Name<input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field">Description <span className="hint">optional</span><textarea className="textarea" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What ties these records together?" /></label>
      <label className="check"><input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} /> Ranked list <span className="hint">· number the albums in order</span></label>
      <div className="actions">
        <button className="btn small" disabled={!dirty}>Save</button>
        <button type="button" className="btn ghost small" style={confirm ? { borderColor: "var(--like)", color: "var(--like)" } : undefined} onClick={async () => {
          if (!confirm) return setConfirm(true);
          const { error } = await supabase().from("lists").delete().eq("id", list.id);
          if (error) return toast("Couldn't delete the list.");
          onDeleted();
        }}>{confirm ? "Tap again to delete this list" : "Delete list"}</button>
      </div>
    </form>
  );
}

function AddAlbums({ list, onAdd }: { list: ListRow; onAdd: (item: ListItemRow) => void }) {
  const { toast } = useSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setHits(null); return; }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try { setHits(((await (await fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctl.signal })).json()).albums ?? []).slice(0, 8)); } catch { /* aborted */ }
    }, 350);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]);
  const have = new Set(list.items.map((i) => i.album_id));
  return (
    <div style={{ marginTop: 24 }}>
      <div className="label" style={{ marginBottom: 8 }}>Add albums</div>
      <input className="input" placeholder="Search an album or artist" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search for an album to add" />
      {hits && (
        <div className="send-list" style={{ marginTop: 8, maxHeight: 340 }}>
          {!hits.length && <p className="hint">Nothing matched. Try adding the artist&apos;s name.</p>}
          {hits.map((a) => (
            <button key={a.id} className="pick" disabled={have.has(a.id) || busy === a.id} onClick={async () => {
              setBusy(a.id);
              try { onAdd(await addToList(list, a.id)); toast(`Added ${a.title}`); } catch (e) { toast((e as Error).message); }
              setBusy(null);
            }}>
              <Cover album={a} size={250} />
              <span className="t"><b>{a.title}</b><small>{a.artist}{a.year ? ` · ${a.year}` : ""}</small></span>
              <span className="kicker">{have.has(a.id) ? "On the list" : busy === a.id ? "Adding…" : "Add"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
