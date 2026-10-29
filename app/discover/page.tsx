"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { LiveFeed } from "@/components/LiveFeed";
import { useSession } from "@/components/Providers";
import { ago } from "@/lib/format";
import { type Pick, type Signal, recommend } from "@/lib/recommend";
import { supabase } from "@/lib/supabase/client";
import type { Album } from "@/lib/types";

type Shelves = { picks: Pick[]; fresh: Album[]; loved: { album: Album; n: number }[]; popular: Album[]; top: { album: Album; avg: number }[] };

export default function DiscoverPage() {
  const { user, ready, following } = useSession();
  const [s, setS] = useState<Shelves | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const db = supabase();
      const [recent, mineRes, poolRes, freshRes] = await Promise.all([
        db.from("logs").select("user_id,album_id,rating,liked").order("posted_at", { ascending: false }).limit(1000),
        user ? db.from("logs").select("user_id,album_id,rating,liked").eq("user_id", user.id) : Promise.resolve({ data: [] }),
        db.from("albums").select("*").order("updated_at", { ascending: false }).limit(300),
        db.from("albums").select("*").eq("source", "release").order("created_at", { ascending: false }).limit(12),
      ]);
      const everyone = (recent.data as Signal[]) ?? [], mine = (mineRes.data as Signal[]) ?? [];
      const pool = (poolRes.data as Album[]) ?? [];
      const byId = new Map(pool.map((a) => [a.id, a]));
      const mineIds = new Set(mine.map((m) => m.album_id));
      const counts = new Map<string, { n: number; sum: number; rated: number }>();
      for (const e of everyone) { const c = counts.get(e.album_id) ?? { n: 0, sum: 0, rated: 0 }; c.n++; if (e.rating) { c.sum += Number(e.rating); c.rated++; } counts.set(e.album_id, c); }
      const lovedMap = new Map<string, number>();
      for (const e of everyone) if (following.has(e.user_id) && (Number(e.rating) >= 4 || e.liked) && !mineIds.has(e.album_id)) lovedMap.set(e.album_id, (lovedMap.get(e.album_id) ?? 0) + 1);
      setS({
        picks: recommend({ mine, everyone, pool }),
        fresh: (freshRes.data as Album[]) ?? [],
        loved: [...lovedMap.entries()].filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, n]) => ({ album: byId.get(id)!, n })),
        popular: [...counts.entries()].filter(([id]) => byId.has(id)).sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([id]) => byId.get(id)!),
        top: [...counts.entries()].filter(([id, c]) => byId.has(id) && c.rated).map(([id, c]) => ({ album: byId.get(id)!, avg: c.sum / c.rated, rated: c.rated }))
          .sort((a, b) => b.avg - a.avg || b.rated - a.rated).slice(0, 12),
      });
    })();
  }, [ready, user, following]);

  return (
    <>
      <div className="pagehead">
        <h1 className="display">Discover</h1>
        <p className="lede">New music picked for you. Open any record to rate it.</p>
      </div>
      {!s ? <p className="more">Finding records…</p> : (
        <>
          <Shelf title="Picked for you" note={user ? "based on your ratings" : "sign in to tune these"}>{s.picks.map((p) => <AlbumCard key={p.album.id} album={p.album} note={p.why} />)}</Shelf>
          <Shelf title="New from artists on listener" note="latest releases">{s.fresh.map((a) => <AlbumCard key={a.id} album={a} note={`New ${ago(a.created_at)}`} />)}</Shelf>
          <Shelf title="Loved by people you follow" note="rated 4★ or more">{s.loved.map(({ album, n }) => <AlbumCard key={album.id} album={album} note={`Loved by ${n} ${n === 1 ? "person" : "people"} you follow`} />)}</Shelf>
          <Shelf title="Popular on listener" note="most logged">{s.popular.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>
          <Shelf title="Highest rated" note="community average">{s.top.map(({ album, avg }) => <AlbumCard key={album.id} album={album} sub={`★ ${avg.toFixed(1)}`} />)}</Shelf>
          {!s.picks.length && !s.popular.length && <div className="empty"><strong>Nothing to recommend yet.</strong>Picks appear once people start logging albums. Start in <Link href="/albums">Search</Link>.</div>}
          <div className="mobile-only" style={{ marginTop: 32 }}><LiveFeed /></div>
          <p className="notice" style={{ marginTop: 32 }}>These picks come from a simple first version that looks at the genres you rate highly. Smarter recommendations are on the way.</p>
        </>
      )}
    </>
  );
}

function Shelf({ title, note, children }: { title: string; note: string; children: React.ReactNode[] }) {
  if (!children.length) return null;
  return (
    <>
      <div className="section-h"><h2>{title}</h2><span>{note}</span></div>
      <div className="shelf">{children}</div>
    </>
  );
}
