"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtistBadge, Avatar } from "@/components/bits";
import { useSession } from "@/components/Providers";
import { hash } from "@/lib/format";
import { ALBUMS, type GameAlbum, MAX_GUESSES, STAGES, albumFor, coverSrc, isAnswer, puzzleNumber, scramble, shareText, suggest } from "@/lib/game";
import type { MiniProfile } from "@/lib/feed";
import { norm, sameArtist } from "@/lib/match";
import { supabase } from "@/lib/supabase/client";

type Guess = { label: string; kind: "wrong" | "artist" | "skip" | "right" };
type Saved = { marks: string; guesses: Guess[] };
type Result = { user_id: string; marks: string; solved: boolean; profile: MiniProfile | null };

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: progress just isn't kept */ } },
};
const HISTORY = "undercover-history";

/** The daily game, plus a practice mode with random albums that isn't recorded. */
export function Undercover() {
  const { user, following, toast } = useSession();
  const today = useMemo(() => puzzleNumber(), []);
  const [practice, setPractice] = useState<number | null>(null); // index into ALBUMS when practising
  const [skip, setSkip] = useState(0);                            // albums passed over because no cover was found
  const [game, setGame] = useState<Saved>({ marks: "", guesses: [] });
  const [loaded, setLoaded] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  const album: GameAlbum = practice != null ? ALBUMS[practice] : albumFor(today, skip);
  const key = practice != null ? null : `undercover-${today}`;
  const won = game.marks.endsWith("O");
  const done = won || game.marks.length >= MAX_GUESSES;

  // Restore today's game: from this browser, or from your account if you played on another device.
  useEffect(() => {
    if (practice != null) return;
    const local = store.get<Saved>(`undercover-${today}`);
    if (local) setGame(local);
    setSkip(store.get<number>(`undercover-skip-${today}`) ?? 0);
    setLoaded(true);
  }, [today, practice]);
  useEffect(() => {
    if (!user || practice != null || !loaded) return;
    supabase().from("game_results").select("marks").eq("user_id", user.id).eq("puzzle", today).maybeSingle().then(({ data }) => {
      if (data && !store.get<Saved>(`undercover-${today}`)) setGame({ marks: data.marks, guesses: data.marks.split("").map((m: string) => ({ label: m === "S" ? "Skipped" : m === "O" ? "Got it" : "Wrong guess", kind: m === "S" ? "skip" : m === "O" ? "right" : "wrong" })) });
    });
  }, [user, today, practice, loaded]);

  const loadResults = useCallback(async () => {
    const { data } = await supabase().from("game_results").select("user_id, marks, solved, profile:profiles(id,handle,name,kind,avatar_url)").eq("puzzle", today).order("created_at", { ascending: true }).limit(500);
    setResults((data as unknown as Result[]) ?? []);
  }, [today]);
  useEffect(() => { loadResults(); }, [loadResults]);

  const finish = async (marks: string) => {
    if (practice != null) return;
    const hist = store.get<Record<string, string>>(HISTORY) ?? {};
    hist[today] = marks; store.set(HISTORY, hist);
    if (user) {
      const { error } = await supabase().from("game_results").insert({ user_id: user.id, puzzle: today, marks, solved: marks.endsWith("O") });
      if (error && error.code !== "23505") toast("Your result couldn't be saved to your profile, but it's kept on this device.");
      loadResults();
    }
  };

  const play = (g: Guess) => {
    if (done) return;
    const next = { marks: game.marks + (g.kind === "right" ? "O" : g.kind === "skip" ? "S" : "X"), guesses: [...game.guesses, g] };
    setGame(next);
    if (key) store.set(key, next);
    if (next.marks.endsWith("O") || next.marks.length >= MAX_GUESSES) finish(next.marks);
  };
  const guess = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (game.guesses.some((g) => norm(g.label.split(" — ")[0]) === norm(t))) return toast("You've already tried that one.");
    if (isAnswer(t, album)) return play({ label: `${album.title} — ${album.artist}`, kind: "right" });
    const match = ALBUMS.find((a) => norm(a.title) === norm(t));
    play({ label: match ? `${match.title} — ${match.artist}` : t, kind: match && sameArtist(match.artist, album.artist) ? "artist" : "wrong" });
  };

  const newPractice = () => {
    let i = Math.floor(Math.random() * ALBUMS.length);
    if (ALBUMS[i] === album) i = (i + 1) % ALBUMS.length;
    setPractice(i); setGame({ marks: "", guesses: [] });
  };
  const backToDaily = () => { setPractice(null); setLoaded(false); setGame({ marks: "", guesses: [] }); };
  const noCover = () => {
    if (practice != null) return newPractice();
    if (skip >= 6) return;
    setSkip(skip + 1); store.set(`undercover-skip-${today}`, skip + 1);
  };

  const mine = useMemo(() => results.filter((r) => r.profile && (r.user_id === user?.id || following.has(r.user_id))), [results, user, following]);
  const solvedToday = results.filter((r) => r.solved).length;

  return (
    <>
      <div className="pagehead uc-head">
        <div className="kicker">{practice != null ? "Practice round" : `Daily puzzle #${today}`}</div>
        <h1 className="display">Undercover</h1>
        <p className="lede">Name the album from its scrambled cover. Each miss brings it a little more into focus. You get {MAX_GUESSES} guesses.</p>
      </div>

      <div className="uc">
        <div className="uc-art">
          <ScrambledCover key={`${album.title}-${album.artist}`} album={album} stage={done ? null : game.marks.length} onMissing={noCover} />
          <ol className="uc-steps" aria-label={`Guess ${Math.min(game.marks.length + 1, MAX_GUESSES)} of ${MAX_GUESSES}`}>
            {Array.from({ length: MAX_GUESSES }, (_, i) => {
              const m = game.marks[i];
              return <li key={i} className={m === "O" ? "ok" : m === "S" ? "skip" : m === "X" ? "miss" : i === game.marks.length && !done ? "now" : ""} />;
            })}
          </ol>
        </div>

        <div className="uc-play">
          {!done ? (
            <GuessBox key={game.marks.length} tried={game.guesses.map((g) => g.label.split(" — ")[0])} onGuess={guess} onSkip={() => play({ label: "Skipped", kind: "skip" })} left={MAX_GUESSES - game.marks.length} />
          ) : (
            <div className="uc-end" role="status">
              <div className="kicker">{won ? `Got it in ${game.marks.length}` : "Out of guesses"}</div>
              <h2 className="display">{album.title}</h2>
              <p className="by">{album.artist} · {album.year}</p>
              <div className="actions">
                <Link className="btn" href={`/albums?q=${encodeURIComponent(`${album.title} ${album.artist}`)}`}>Rate it on listener</Link>
                {practice == null && <ShareButton text={shareText(today, game.marks, won)} />}
                <button className="btn ghost" onClick={newPractice}>{practice != null ? "Another one" : "Practice round"}</button>
                {practice != null && <button className="btn ghost" onClick={backToDaily}>Back to today&apos;s</button>}
              </div>
              {practice == null && <Countdown />}
            </div>
          )}

          {game.guesses.length > 0 && (
            <ol className="uc-guesses">
              {game.guesses.map((g, i) => (
                <li key={i} className={g.kind}>
                  <span className="uc-mark" aria-hidden="true">{g.kind === "right" ? "✓" : g.kind === "skip" ? "–" : "✕"}</span>
                  <span>{g.label}</span>
                  {g.kind === "artist" && <small>Right artist</small>}
                </li>
              ))}
            </ol>
          )}

          {practice == null && done && <Stats />}

          {practice == null && (
            <section className="uc-board">
              <div className="friends-h"><h2>Today on listener</h2><span>{results.length ? `${results.length} played · ${solvedToday} solved` : "be the first to finish"}</span></div>
              {!user ? <p className="hint"><Link className="u" href="/login">Sign in</Link> to save your streak and see how the people you follow did.</p>
                : !mine.length ? <p className="hint">No one you follow has played today yet.</p>
                : (
                  <ul>
                    {mine.map((r) => (
                      <li key={r.user_id}>
                        <Avatar profile={r.profile} />
                        <Link className="u" href={`/u/${r.profile!.handle}`}>{r.user_id === user.id ? "You" : r.profile!.name}</Link><ArtistBadge profile={r.profile} />
                        <span className="uc-row" aria-label={r.solved ? `solved in ${r.marks.length}` : "didn't get it"}>{shareText(today, r.marks, r.solved).split("\n")[1]}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** The cover drawn onto a canvas, scrambled for the current stage, or shown as it really is once the game is over. */
function ScrambledCover({ album, stage, onMissing }: { album: GameAlbum; stage: number | null; onMissing: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => setImg(i);
    i.onerror = () => { setFailed(true); onMissing(); };
    i.src = coverSrc(album);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album]);

  useEffect(() => {
    const c = canvas.current;
    if (!img || !c) return;
    const size = 600, ctx = c.getContext("2d")!;
    c.width = c.height = size;
    if (stage == null) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, size, size);
    } else {
      const s = STAGES[Math.min(stage, STAGES.length - 1)];
      // Average the cover down to a small grid (in two steps, so each square is a fair average of its patch).
      const mid = document.createElement("canvas"); mid.width = mid.height = 96;
      const m = mid.getContext("2d")!; m.imageSmoothingQuality = "high"; m.drawImage(img, 0, 0, 96, 96);
      const small = document.createElement("canvas"); small.width = small.height = s.grid;
      const sc = small.getContext("2d", { willReadFrequently: true })!; sc.imageSmoothingQuality = "high"; sc.drawImage(mid, 0, 0, s.grid, s.grid);
      const data = sc.getImageData(0, 0, s.grid, s.grid);
      data.data.set(scramble(data.data, s.grid, s, hash(album.title + album.artist) + stage));
      sc.putImageData(data, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, size, size);
      // Hairline gaps between the squares, so it reads as tiles rather than a blurry photo.
      ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
      const step = size / s.grid;
      for (let i = 1; i < s.grid; i++) { ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke(); }
    }
    // Each new stage settles in from a soft blur.
    c.animate?.([{ opacity: 0.35, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 550, easing: "cubic-bezier(.25,.6,.3,1)" });
  }, [img, stage, album]);

  return (
    <div className="uc-cover">
      <canvas ref={canvas} className={img ? "in" : ""} role="img" aria-label={stage == null ? `${album.title} by ${album.artist}` : "The scrambled album cover"} />
      {!img && <span className="uc-wait">{failed ? "Finding another cover…" : "Scrambling the cover…"}</span>}
    </div>
  );
}

function GuessBox({ tried, onGuess, onSkip, left }: { tried: string[]; onGuess: (t: string) => void; onSkip: () => void; left: number }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(true);
  const found = useMemo(() => suggest(q, tried), [q, tried]);
  const options = open ? found : [];
  const submit = (t: string) => { onGuess(t); setQ(""); };
  return (
    <form className="uc-form" onSubmit={(e) => { e.preventDefault(); submit(options[sel] ? options[sel].title : q); }}>
      <label className="label" htmlFor="uc-q">Your guess <span className="hint">· {left} {left === 1 ? "guess" : "guesses"} left</span></label>
      <div className="uc-input">
        <input id="uc-q" className="input" autoComplete="off" autoFocus placeholder="Type an album or artist" value={q} role="combobox" aria-expanded={options.length > 0} aria-controls="uc-opts"
          onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, options.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          }} />
        {options.length > 0 && (
          <ul id="uc-opts" className="uc-opts" role="listbox">
            {options.map((a, i) => (
              <li key={`${a.title}-${a.artist}`} role="option" aria-selected={i === sel}>
                <button type="button" onMouseEnter={() => setSel(i)} onClick={() => submit(a.title)}><b>{a.title}</b><small>{a.artist}</small></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="actions">
        <button className="btn" disabled={!q.trim()}>Guess</button>
        <button type="button" className="btn ghost" onClick={onSkip}>Skip</button>
      </div>
    </form>
  );
}

function ShareButton({ text }: { text: string }) {
  const { toast } = useSession();
  return (
    <button className="btn ghost" onClick={async () => {
      const full = `${text}\n${location.origin}/play`;
      try {
        if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text: full });
        else { await navigator.clipboard.writeText(full); toast("Result copied. Paste it anywhere."); }
      } catch { /* share sheet closed */ }
    }}>Share result</button>
  );
}

function Countdown() {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const s = Math.max(0, Math.floor((+next - +now) / 1000));
      setLeft(`${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return <p className="hint" style={{ marginTop: 12 }}>Next cover in {left}</p>;
}

/** Played, win rate, streaks and how many guesses it usually takes, from this device's history. */
function Stats() {
  const [s, setS] = useState<{ played: number; wins: number; streak: number; best: number; dist: number[] } | null>(null);
  useEffect(() => {
    const hist = store.get<Record<string, string>>(HISTORY) ?? {};
    const days = Object.keys(hist).map(Number).sort((a, b) => a - b);
    const dist = Array(MAX_GUESSES).fill(0);
    let wins = 0, run = 0, best = 0, prev = -1;
    for (const d of days) {
      const m = hist[d], ok = m.endsWith("O");
      if (ok) { wins++; dist[m.length - 1]++; run = prev === d - 1 ? run + 1 : 1; } else run = 0;
      best = Math.max(best, run); prev = d;
    }
    const today = puzzleNumber();
    const streak = prev >= today - 1 ? run : 0;
    setS({ played: days.length, wins, streak, best, dist });
  }, []);
  if (!s?.played) return null;
  const max = Math.max(1, ...s.dist);
  return (
    <section className="uc-stats">
      <div className="uc-nums">
        <div><b>{s.played}</b><span>played</span></div>
        <div><b>{Math.round((s.wins / s.played) * 100)}%</b><span>solved</span></div>
        <div><b>{s.streak}</b><span>streak</span></div>
        <div><b>{s.best}</b><span>best streak</span></div>
      </div>
      <div className="hbars">{s.dist.map((n, i) => <div key={i}><span>{i + 1} {i ? "guesses" : "guess"}</span><i style={{ width: `${(n / max) * 100}%` }} /><b>{n}</b></div>)}</div>
    </section>
  );
}
