"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListCard } from "@/components/ListCard";
import { useSession } from "@/components/Providers";
import { type ListRow, loadLists, popularLists } from "@/lib/lists";
import { supabase } from "@/lib/supabase/client";

export default function ListsPage() {
  const { user, profile, ready, toast } = useSession();
  const router = useRouter();
  const [popular, setPopular] = useState<ListRow[] | null>(null);
  const [recent, setRecent] = useState<ListRow[] | null>(null);
  const [mine, setMine] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    popularLists(8).then(setPopular, () => setPopular([]));
    loadLists({ limit: 30 }).then((ls) => setRecent(ls.filter((l) => l.items.length)), () => setRecent([]));
  }, []);
  useEffect(() => { if (ready && user) loadLists({ userId: user.id, limit: 50 }).then(setMine, () => {}); }, [ready, user]);

  const create = async () => {
    if (!user) return router.push("/login");
    setBusy(true);
    const { data, error } = await supabase().from("lists").insert({ user_id: user.id, title: "Untitled list" }).select("id").single();
    setBusy(false);
    if (error || !data) return toast("Couldn't start a list. Try again.");
    router.push(`/list/${data.id}`);
  };

  return (
    <>
      <div className="pagehead">
        <h1 className="display">Lists</h1>
        <p className="lede">Records gathered around an idea: a year, a mood, a ranking you&apos;d defend.</p>
        <div className="actions"><button className="btn" disabled={busy} onClick={create}>{busy ? "Starting…" : "Start a list"}</button></div>
      </div>
      {profile && mine.length > 0 && (
        <>
          <div className="section-h"><h2>Your lists</h2><Link className="u" href={`/u/${profile.handle}?tab=lists`}>see all</Link></div>
          <div className="lgrid">{mine.slice(0, 4).map((l) => <ListCard key={l.id} list={l} hideOwner />)}</div>
        </>
      )}
      {popular && popular.length > 0 && (
        <>
          <div className="section-h"><h2>Popular</h2><span>most liked</span></div>
          <div className="lgrid">{popular.map((l) => <ListCard key={l.id} list={l} />)}</div>
        </>
      )}
      <div className="section-h"><h2>Recently updated</h2><span>from everyone</span></div>
      {!recent ? <p className="more">Loading lists…</p>
        : recent.length ? <div className="lgrid">{recent.map((l) => <ListCard key={l.id} list={l} />)}</div>
        : <div className="empty"><strong>No lists yet.</strong>Be the first: start one above, or tap “Add to list” on any album.</div>}
    </>
  );
}
