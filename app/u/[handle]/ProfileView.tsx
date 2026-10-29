"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { ArtistBadge, Avatar, Cover } from "@/components/bits";
import { FollowButton } from "@/components/FollowButton";
import { ProfileForm } from "@/components/ProfileForm";
import { applyLook, useSession } from "@/components/Providers";
import { plural, stars } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album, Log, Look, Profile, SongReview } from "@/lib/types";

type LogRow = Log & { album: Album };
type SongRow = SongReview & { album: Album };

export function ProfileView({ handle }: { handle: string }) {
  const { user, profile: me, refresh } = useSession();
  const params = useSearchParams();
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [releases, setReleases] = useState<Album[]>([]);
  const [favs, setFavs] = useState<Album[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(params.get("settings") === "1");
  const [adding, setAdding] = useState(false);
  const own = !!me && p?.id === me.id;

  useEffect(() => setSettings(params.get("settings") === "1"), [params]);

  useEffect(() => {
    let live = true;
    const db = supabase();
    (async () => {
      const { data: prof } = await db.from("profiles").select("*").eq("handle", handle).maybeSingle();
      if (!live) return;
      setP((prof as Profile) ?? null);
      if (!prof) return;
      const [l, s, r, f1, f2, fav] = await Promise.all([
        db.from("logs").select("*, album:albums(*)").eq("user_id", prof.id).order("listened_on", { ascending: false, nullsFirst: false }).order("posted_at", { ascending: false }).limit(500),
        db.from("song_reviews").select("*, album:albums(*)").eq("user_id", prof.id).order("posted_at", { ascending: false }).limit(100),
        prof.kind === "artist" ? db.from("albums").select("*").eq("source", "release").eq("owner_id", prof.id).order("year", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [] }),
        db.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", prof.id),
        db.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id),
        prof.favorites?.length ? db.from("albums").select("*").in("id", prof.favorites) : Promise.resolve({ data: [] }),
      ]);
      if (!live) return;
      setLogs(((l.data as LogRow[]) ?? []).filter((x) => x.album));
      setSongs(((s.data as SongRow[]) ?? []).filter((x) => x.album?.tracks?.[x.track_index]));
      setReleases((r.data as Album[]) ?? []);
      setCounts({ followers: f1.count ?? 0, following: f2.count ?? 0 });
      const favRows = (fav.data as Album[]) ?? [];
      setFavs((prof.favorites as string[]).map((id) => favRows.find((a) => a.id === id)).filter(Boolean) as Album[]);
    })();
    return () => { live = false; };
  }, [handle, me?.id]);

  const rated = logs.filter((l) => l.rating);
  const avg = rated.length ? rated.reduce((s, l) => s + Number(l.rating), 0) / rated.length : 0;
  const buckets = Array.from({ length: 10 }, (_, i) => rated.filter((l) => Number(l.rating) === (i + 1) / 2).length);
  const max = Math.max(1, ...buckets);
  const months = useMemo(() => {
    const g = new Map<string, LogRow[]>();
    for (const l of logs) { const k = l.listened_on?.slice(0, 7) ?? "undated"; g.set(k, [...(g.get(k) ?? []), l]); }
    return [...g.entries()];
  }, [logs]);

  if (p === undefined) return <p className="more">Loading profile…</p>;
  if (p === null) return <div className="empty"><strong>No one goes by @{handle}.</strong>Check the spelling, or <Link href="/">search for people from the feed</Link>.</div>;

  return (
    <>
      <div className="phead">
        <Avatar profile={p} large />
        <div style={{ minWidth: 0 }}>
          <h1 className="display">{p.name}<ArtistBadge profile={p} /></h1>
          <div className="h">@{p.handle}{p.kind === "artist" && (p.genre || p.location) ? ` · ${[p.genre, p.location].filter(Boolean).join(" · ")}` : ""}</div>
          {p.bio && <p>{p.bio}</p>}
          <div className="counts"><span><b>{logs.length}</b> logs</span><span><b>{counts.followers}</b> followers</span><span><b>{counts.following}</b> following</span></div>
          <div className="actions" style={{ marginTop: 12 }}>
            {own ? (
              <>
                <button className="btn ghost small" onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit profile"}</button>
                <button className="btn ghost small" aria-expanded={settings} onClick={() => setSettings(!settings)}>{settings ? "Close settings" : "Settings"}</button>
              </>
            ) : <FollowButton id={p.id} />}
          </div>
        </div>
      </div>

      {own && editing && user && (
        <>
          <div className="section-h"><h2>Edit profile</h2></div>
          <ProfileForm userId={user.id} existing={p} onCancel={() => setEditing(false)} onSaved={async (np) => { setP(np); setEditing(false); await refresh(); if (np.handle !== handle) location.assign(`/u/${np.handle}`); }} />
          <Favorites profile={p} logs={logs} onSaved={(ids) => { setP({ ...p, favorites: ids }); setFavs(ids.map((id) => logs.find((l) => l.album_id === id)!.album)); }} />
        </>
      )}
      {own && settings && <Settings profile={p} email={user?.email ?? ""} onLook={(look) => setP({ ...p, look })} />}

      {p.kind === "artist" && (
        <>
          <div className="section-h"><h2>Releases</h2><span>{releases.length}</span></div>
          {releases.length ? <div className="grid">{releases.map((a) => <AlbumCard key={a.id} album={a} sub={a.tracks.length ? plural(a.tracks.length, "song") : undefined} />)}</div>
            : <p className="muted">{own ? "Add your first release so people can find, rate and review your music." : "No releases yet."}</p>}
          {own && (adding ? <AddRelease artist={p} onDone={(a) => { setReleases([a, ...releases]); setAdding(false); }} onCancel={() => setAdding(false)} />
            : <div className="actions" style={{ marginTop: 16 }}><button className="btn" onClick={() => setAdding(true)}>Add a release</button></div>)}
        </>
      )}

      {favs.length > 0 && (
        <>
          <div className="section-h"><h2>Favorite albums</h2></div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", maxWidth: 640 }}>{favs.map((a) => <Link key={a.id} href={`/album/${a.id}`} title={a.title}><Cover album={a} size={250} /></Link>)}</div>
        </>
      )}

      <div className="statrow">
        <div className="stat"><span className="label">Albums logged</span><div>{logs.length}</div></div>
        <div className="stat"><span className="label">Songs reviewed</span><div>{songs.length}</div></div>
        <div className="stat"><span className="label">Average rating</span><div>{rated.length ? avg.toFixed(2) : "–"}</div></div>
        <div className="stat"><span className="label">Ratings</span>
          <div className="hist" aria-label="Ratings spread from half a star to five stars">{buckets.map((b, i) => <i key={i} style={{ height: `${(b / max) * 100}%` }} title={`${(i + 1) / 2} stars: ${b}`} />)}</div>
          <div className="hist-l"><span>½</span><span>★★★★★</span></div>
        </div>
      </div>

      {songs.length > 0 && (
        <>
          <div className="section-h"><h2>Song reviews</h2><span>{songs.length}</span></div>
          {songs.slice(0, 12).map((s) => (
            <Link key={s.id} className="drow" href={`/album/${s.album_id}/song/${s.track_index + 1}`}>
              <span className="day">{s.track_index + 1}</span><Cover album={s.album} size={250} />
              <span className="t"><b>{s.album.tracks[s.track_index].title}</b><small>{s.album.title} · {s.album.artist}</small></span>
              <span className="meta"><span className="stars">{stars(s.rating)}</span>{s.liked && <span className="heart">♥</span>}{s.review && "✎"}</span>
            </Link>
          ))}
        </>
      )}

      <div className="section-h"><h2>Diary</h2><span>{plural(logs.length, "album")}</span></div>
      {!logs.length && <div className="empty">{own ? <><strong>Your diary is empty.</strong>Find an album in <Link href="/albums">Albums</Link> and log the day you listened. Every entry lands here, grouped by month.</> : <><strong>{p.name} hasn&apos;t logged any albums yet.</strong></>}</div>}
      {months.map(([k, rows]) => (
        <div key={k} style={{ marginTop: 26 }}>
          <h3 className="label" style={{ marginBottom: 4 }}>{k === "undated" ? "Undated" : new Date(k + "-15T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
          {rows.map((l) => (
            <Link key={l.id} className="drow" href={`/album/${l.album_id}`}>
              <span className="day">{l.listened_on ? +l.listened_on.slice(8) : "–"}</span><Cover album={l.album} size={250} />
              <span className="t"><b>{l.album.title}</b><small>{l.album.artist}{l.album.year ? ` · ${l.album.year}` : ""}</small></span>
              <span className="meta"><span className="stars">{stars(l.rating)}</span>{l.liked && <span className="heart">♥</span>}{l.review && "✎"}</span>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

function Favorites({ profile, logs, onSaved }: { profile: Profile; logs: LogRow[]; onSaved: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>(profile.favorites ?? []);
  const { toast } = useSession();
  if (!logs.length) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div className="label" style={{ marginBottom: 6 }}>Four favorites <span className="hint">· pick up to 4 from albums you&apos;ve logged</span></div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 10 }}>
        {logs.slice(0, 60).map((l) => {
          const i = ids.indexOf(l.album_id);
          return (
            <button key={l.id} className="linkish" style={{ position: "relative", outline: i >= 0 ? "2px solid var(--fg)" : "none", outlineOffset: 2 }} aria-pressed={i >= 0} title={l.album.title}
              onClick={() => setIds(i >= 0 ? ids.filter((x) => x !== l.album_id) : ids.length < 4 ? [...ids, l.album_id] : ids)}>
              <Cover album={l.album} size={250} />
              {i >= 0 && <span className="badge" style={{ position: "absolute", top: 4, left: 4, margin: 0, background: "var(--fg)", color: "var(--bg)" }}>{i + 1}</span>}
            </button>
          );
        })}
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn small" onClick={async () => {
          const { error } = await supabase().from("profiles").update({ favorites: ids }).eq("id", profile.id);
          if (error) toast("Couldn't save favorites."); else { onSaved(ids); toast("Favorites saved"); }
        }}>Save favorites</button>
      </div>
    </div>
  );
}

const LOOKS: [Look, string, string, string][] = [["light", "Paper", "Ink on warm paper", "paper"], ["dark", "Evening", "Cream on warm black", "evening"], ["system", "Match device", "Follows your light or dark setting", "device"]];

function Settings({ profile, email, onLook }: { profile: Profile; email: string; onLook: (l: Look) => void }) {
  const router = useRouter();
  const { toast } = useSession();
  const [confirm, setConfirm] = useState(false);
  return (
    <section aria-label="Settings">
      <div className="section-h"><h2>Settings</h2></div>
      <div className="setrow">
        <div><h3>Appearance</h3><p>Choose how listener looks for you.</p></div>
        <div className="looks" role="group" aria-label="Appearance">
          {LOOKS.map(([v, name, note, pv]) => (
            <button key={v} className="look" aria-pressed={profile.look === v} onClick={async () => {
              applyLook(v); onLook(v);
              await supabase().from("profiles").update({ look: v }).eq("id", profile.id);
            }}>
              <span className={`pv ${pv}`} aria-hidden="true"><b /><i /><i /></span>
              <span className="nm">{name}<small>{note}</small></span>
            </button>
          ))}
        </div>
      </div>
      <div className="setrow">
        <div><h3>Account</h3><p>Signed in as {email}</p></div>
        <div className="actions">
          <button className="btn ghost" onClick={async () => { await supabase().auth.signOut(); router.push("/login"); router.refresh(); }}>Sign out</button>
          <button className="btn ghost" style={confirm ? { borderColor: "var(--like)", color: "var(--like)" } : undefined} onClick={async () => {
            if (!confirm) return setConfirm(true);
            const r = await fetch("/api/account", { method: "DELETE" });
            if (!r.ok) return toast((await r.json()).error ?? "Couldn't delete your account.");
            await supabase().auth.signOut();
            router.push("/login"); router.refresh();
          }}>{confirm ? "Tap again: delete my account and everything I've posted" : "Delete account"}</button>
        </div>
      </div>
    </section>
  );
}

function AddRelease({ artist, onDone, onCancel }: { artist: Profile; onDone: (a: Album) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [genre, setGenre] = useState(artist.genre);
  const [tracks, setTracks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="form logbox" style={{ maxWidth: 640, marginTop: 16 }} onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return setError("Give your release a title.");
      setBusy(true);
      const { data, error } = await supabase().from("albums").insert({
        id: `r-${crypto.randomUUID()}`, source: "release", owner_id: artist.id, title: title.trim(), artist: artist.name, year: Number(year) || null, genre: genre.trim(),
        tracks: tracks.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 80).map((t) => ({ title: t.slice(0, 200) })),
      }).select().single();
      setBusy(false);
      if (error) return setError("Couldn't publish the release. Try again.");
      onDone(data as Album);
    }}>
      <h3 className="display" style={{ fontSize: 28 }}>Add a release</h3>
      <p className="muted" style={{ margin: 0 }}>It appears on your profile, in Albums and in your followers&apos; feeds. People can log, rate and review it song by song.</p>
      <label className="field">Title<input className="input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="two">
        <label className="field">Release year<input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
        <label className="field">Genre <span className="hint">optional</span><input className="input" value={genre} maxLength={40} onChange={(e) => setGenre(e.target.value)} /></label>
      </div>
      <label className="field">Tracklist <span className="hint">one song per line</span><textarea className="textarea" rows={7} value={tracks} onChange={(e) => setTracks(e.target.value)} placeholder={"Opening song\nSecond song\nClosing song"} /></label>
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <div className="actions"><button className="btn" disabled={busy}>{busy ? "Publishing…" : "Publish release"}</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
