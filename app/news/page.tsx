"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Cover } from "@/components/bits";
import type { MiniProfile } from "@/lib/feed";
import { ago, plural, stars } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album } from "@/lib/types";

type Story = { id: string; title: string; link: string; summary: string; image: string | null; source: string; published: string };

export default function NewsPage() {
  const [news, setNews] = useState<{ stories: Story[]; sources: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState("All");
  useEffect(() => {
    fetch("/api/news").then((r) => r.json()).then(setNews, () => setFailed(true));
  }, []);
  const stories = useMemo(() => (news?.stories ?? []).filter((s) => source === "All" || s.source === source), [news, source]);
  const [lead, ...rest] = stories;
  const top = rest.slice(0, 6), wire = rest.slice(6, 40);

  return (
    <>
      <div className="pagehead news-head">
        <h1 className="display">News</h1>
        <p className="lede" style={{ fontSize: 17 }}>The latest from the music press, and what&apos;s happening on listener this week.</p>
      </div>
      <div className="news-layout">
        <div className="news-main">
          {news && news.sources.length > 1 && (
            <div className="chips" style={{ margin: "18px 0 4px" }} role="group" aria-label="Filter by publication">
              {["All", ...news.sources].map((s) => <button key={s} className="chip" aria-pressed={s === source} onClick={() => setSource(s)}>{s}</button>)}
            </div>
          )}
          {!news && !failed && <p className="more">Loading the news…</p>}
          {(failed || (news && !news.stories.length)) && <div className="empty"><strong>The news wire is quiet right now.</strong>Couldn&apos;t reach the music publications. Try again in a few minutes.</div>}
          {lead && (
            <a className="lead" href={lead.link} target="_blank" rel="noopener noreferrer">
              {lead.image && <img src={lead.image} alt="" referrerPolicy="no-referrer" loading="eager" />}
              <div>
                <span className="kicker">{lead.source} · {ago(lead.published)}</span>
                <h2>{lead.title}</h2>
                {lead.summary && <p>{lead.summary}</p>}
                <span className="readon">Read at {lead.source} ↗</span>
              </div>
            </a>
          )}
          {top.length > 0 && (
            <div className="topstories">
              {top.map((s) => (
                <a key={s.id} className="story" href={s.link} target="_blank" rel="noopener noreferrer">
                  {s.image ? <img src={s.image} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <div className="story-noimg" />}
                  <span className="kicker">{s.source} · {ago(s.published)}</span>
                  <h3>{s.title}</h3>
                </a>
              ))}
            </div>
          )}
          {wire.length > 0 && (
            <>
              <div className="section-h"><h2>From the wire</h2><span>{plural(wire.length, "story")}</span></div>
              <ol className="wire">
                {wire.map((s) => (
                  <li key={s.id}>
                    <time dateTime={s.published}>{ago(s.published).replace(" ago", "")}</time>
                    <a href={s.link} target="_blank" rel="noopener noreferrer"><b>{s.title}</b><small>{s.source}</small></a>
                  </li>
                ))}
              </ol>
            </>
          )}
          {news && news.stories.length > 0 && <p className="hint" style={{ marginTop: 28 }}>Headlines and excerpts from each publication&apos;s public news feed. Stories open on the publication&apos;s own site.</p>}
        </div>
        <aside className="news-side"><ThisWeek /></aside>
      </div>
    </>
  );
}

type Row = { id: string; album_id: string; rating: number | null; review: string; posted_at: string; user_id: string; profile: MiniProfile | null; album: Album | null };

/** A column written from listener's own activity over the last seven days. */
function ThisWeek() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [likes, setLikes] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const db = supabase();
    db.from("logs").select("id, album_id, rating, review, posted_at, user_id, profile:profiles(*), album:albums(*)").gte("posted_at", since).order("posted_at", { ascending: false }).limit(500)
      .then(async ({ data }) => {
        const list = (((data as unknown) as Row[]) ?? []).filter((r) => r.album && r.profile);
        setRows(list);
        const ids = list.filter((r) => r.review).map((r) => r.id);
        if (!ids.length) return;
        const { data: l } = await db.from("likes").select("target_id").eq("target_type", "log").in("target_id", ids.slice(0, 300));
        const m = new Map<string, number>();
        for (const x of l ?? []) m.set(x.target_id, (m.get(x.target_id) ?? 0) + 1);
        setLikes(m);
      });
  }, []);

  const stats = useMemo(() => {
    if (!rows?.length) return null;
    const byAlbum = new Map<string, Row[]>();
    for (const r of rows) byAlbum.set(r.album_id, [...(byAlbum.get(r.album_id) ?? []), r]);
    const groups = [...byAlbum.values()];
    const most = groups.sort((a, b) => b.length - a.length)[0];
    const rated = groups.map((g) => ({ g, rs: g.filter((r) => r.rating).map((r) => Number(r.rating)) })).filter((x) => x.rs.length >= 2)
      .map((x) => ({ album: x.g[0].album!, avg: x.rs.reduce((a, b) => a + b, 0) / x.rs.length, n: x.rs.length })).sort((a, b) => b.avg - a.avg || b.n - a.n)[0];
    const liked = rows.filter((r) => r.review && likes.get(r.id)).sort((a, b) => (likes.get(b.id) ?? 0) - (likes.get(a.id) ?? 0))[0];
    const people = new Map<string, { p: MiniProfile; n: number }>();
    for (const r of rows) { const c = people.get(r.user_id) ?? { p: r.profile!, n: 0 }; c.n++; people.set(r.user_id, c); }
    const busiest = [...people.values()].sort((a, b) => b.n - a.n)[0];
    return { total: rows.length, most, rated, liked, busiest, albums: byAlbum.size, reviewers: people.size };
  }, [rows, likes]);

  return (
    <section className="thisweek" aria-label="This week on listener">
      <div className="friends-h"><h2>This week on listener</h2><span>last 7 days</span></div>
      {rows === null ? <p className="muted">Counting…</p> : !stats ? <p className="muted">Nothing logged this week yet. The first review of the week gets the front page.</p> : (
        <>
          <p className="tw-dek">{plural(stats.total, "review")} of {plural(stats.albums, "album")} by {plural(stats.reviewers, "listener")}.</p>
          <TW kicker="Most talked about" album={stats.most[0].album!} line={`Logged ${plural(stats.most.length, "time")} this week`} />
          {stats.rated && <TW kicker="Best reviewed" album={stats.rated.album} line={`★ ${stats.rated.avg.toFixed(1)} from ${plural(stats.rated.n, "rating")}`} />}
          {stats.liked && (
            <Link className="tw" href={`/album/${stats.liked.album_id}`}>
              <span className="kicker">Most-liked review</span>
              <q>{stats.liked.review.split("\n")[0].slice(0, 140)}</q>
              <small>@{stats.liked.profile!.handle} on <i>{stats.liked.album!.title}</i> {stars(stats.liked.rating)}</small>
            </Link>
          )}
          {stats.busiest && (
            <Link className="tw tw-person" href={`/u/${stats.busiest.p.handle}`}>
              <span className="kicker">Reviewer of the week</span>
              <span className="row"><Avatar profile={stats.busiest.p} /><span><b>{stats.busiest.p.name}</b><small>{plural(stats.busiest.n, "review")} this week</small></span></span>
            </Link>
          )}
        </>
      )}
    </section>
  );
}

function TW({ kicker, album, line }: { kicker: string; album: Album; line: string }) {
  return (
    <Link className="tw tw-album" href={`/album/${album.id}`}>
      <Cover album={album} size={250} />
      <span><span className="kicker">{kicker}</span><b>{album.title}</b><small>{album.artist} · {line}</small></span>
    </Link>
  );
}
