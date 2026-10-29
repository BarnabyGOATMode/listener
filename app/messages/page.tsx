"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
import { type Conversation, useMessages } from "@/components/Messages";
import { useSession } from "@/components/Providers";
import { MusicCard } from "@/components/SendMusic";
import type { MiniProfile } from "@/lib/feed";
import { ago } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album, Message } from "@/lib/types";

export default function MessagesPage() {
  return <Suspense><Inbox /></Suspense>;
}

function Inbox() {
  const { user, profile, ready: sessionReady } = useSession();
  const { inbox, requests, ready, refresh } = useMessages();
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get("c");
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [composing, setComposing] = useState(false);

  // Arriving from a profile's Message button (?to=<user id>): open or create that conversation.
  useEffect(() => {
    const to = params.get("to");
    if (!to || !user) return;
    supabase().rpc("start_conversation", { other: to }).then(async ({ data, error }) => {
      if (error) { router.replace("/messages"); return; }
      await refresh();
      router.replace(`/messages?c=${data}`);
    });
  }, [params, user, router, refresh]);

  if (sessionReady && !user) return <div className="empty"><strong>Messages</strong><Link href="/login">Sign in</Link> to chat with friends and send them music.</div>;
  if (!profile) return <p className="more">Loading…</p>;

  const list = inbox.filter((c) => (tab === "chats" ? c.my_status === "active" : c.my_status === "request"));
  const current = inbox.find((c) => c.conversation_id === active) ?? null;

  return (
    <div className={`dm${active ? " has-thread" : ""}`}>
      <aside className="dm-list" aria-label="Conversations">
        <div className="dm-list-h">
          <h1 className="display">Messages</h1>
          <button className="btn small ghost" onClick={() => setComposing(!composing)} aria-expanded={composing}>New message</button>
        </div>
        {composing && <NewMessage onPick={async (id) => {
          const { data, error } = await supabase().rpc("start_conversation", { other: id });
          if (error) return;
          await refresh(); setComposing(false); setTab("chats"); router.push(`/messages?c=${data}`);
        }} />}
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "chats"} onClick={() => setTab("chats")}>Chats</button>
          <button role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>Requests{requests ? ` (${requests})` : ""}</button>
        </div>
        {!ready ? <p className="more">Loading…</p> : list.length ? list.map((c) => (
          <Link key={c.conversation_id} href={`/messages?c=${c.conversation_id}`} className={`dm-row${c.conversation_id === active ? " on" : ""}${c.unread ? " unread" : ""}`}>
            <Avatar profile={c.other} />
            <span className="n"><b>{c.other?.name ?? "Someone"}</b><small>{c.last_message_preview ?? "Say hello"}</small></span>
            <span className="when">{c.last_message_at ? ago(c.last_message_at).replace(" ago", "") : ""}{c.unread > 0 && <span className="udot" aria-label={`${c.unread} unread`}>{c.unread}</span>}</span>
          </Link>
        )) : (
          <p className="muted" style={{ padding: "16px 0" }}>{tab === "chats" ? "No chats yet. Start one with “New message”, or send someone an album from its page." : "No message requests. Messages from people you don't both follow land here."}</p>
        )}
      </aside>
      <section className="dm-thread" aria-label="Conversation">
        {current ? <Thread key={current.conversation_id} conv={current} /> : (
          <div className="dm-empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3.5 10.6 13.9M21 3.5l-6.6 17-3.8-6.6L4 10.1z" /></svg>
            <h2 className="display">Your messages</h2>
            <p className="muted">Chat with friends and send them the albums and songs you can&apos;t stop playing.</p>
            <button className="btn" onClick={() => setComposing(true)}>Send a message</button>
          </div>
        )}
      </section>
    </div>
  );
}

function NewMessage({ onPick }: { onPick: (id: string) => void }) {
  const { user, following } = useSession();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<MiniProfile[]>([]);
  useEffect(() => {
    const db = supabase();
    const term = q.trim().toLowerCase().replace(/^@/, "").replace(/[,()%*\\]/g, "");
    const t = setTimeout(async () => {
      const { data } = term
        ? await db.from("profiles").select("*").or(`handle.ilike.%${term}%,name.ilike.%${term}%`).neq("id", user?.id ?? "").limit(12)
        : following.size ? await db.from("profiles").select("*").in("id", [...following]).limit(12) : { data: [] };
      setPeople((data as MiniProfile[]) ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, user, following]);
  return (
    <div className="dm-new">
      <input className="input" autoFocus placeholder="To: name or @username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Who do you want to message?" />
      {people.map((p) => (
        <button key={p.id} className="dm-row" onClick={() => onPick(p.id)}>
          <Avatar profile={p} /><span className="n"><b>{p.name}</b><small>@{p.handle}</small></span><span />
        </button>
      ))}
    </div>
  );
}

function Thread({ conv }: { conv: Conversation }) {
  const { user, toast } = useSession();
  const { refresh } = useMessages();
  const router = useRouter();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [albums, setAlbums] = useState<Map<string, Album>>(new Map());
  const [text, setText] = useState("");
  const [otherRead, setOtherRead] = useState(conv.other_last_read);
  const [blocked, setBlocked] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const db = supabase();
  const other = conv.other;

  const loadAlbums = useCallback(async (list: Message[]) => {
    const ids = [...new Set(list.filter((m) => m.attachment_id).map((m) => m.attachment_id!))].filter((id) => !albums.has(id));
    if (!ids.length) return;
    const { data } = await db.from("albums").select("*").in("id", ids);
    setAlbums((cur) => { const next = new Map(cur); ((data as Album[]) ?? []).forEach((a) => next.set(a.id, a)); return next; });
  }, [albums, db]);

  const markRead = useCallback(async () => {
    if (!user) return;
    await db.from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conv.conversation_id).eq("user_id", user.id);
    refresh();
  }, [db, user, conv.conversation_id, refresh]);

  useEffect(() => {
    let live = true;
    db.from("messages").select("*").eq("conversation_id", conv.conversation_id).order("created_at", { ascending: false }).limit(200).then(({ data }) => {
      if (!live) return;
      const list = ((data as Message[]) ?? []).reverse();
      setMsgs(list); loadAlbums(list);
    });
    if (user && other) db.from("blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", other.id).maybeSingle().then(({ data }) => live && setBlocked(!!data));
    if (conv.unread && conv.my_status === "active") markRead();
    const ch = db.channel(`thread-${conv.conversation_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.conversation_id}` }, (p) => {
        const m = p.new as Message;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
        loadAlbums([m]);
        if (m.sender_id !== user?.id) markRead();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => setMsgs((cur) => cur.filter((x) => x.id !== (p.old as { id: string }).id)))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conv.conversation_id}` }, (p) => {
        const row = p.new as { user_id: string; last_read_at: string };
        if (row.user_id !== user?.id) setOtherRead(row.last_read_at);
      })
      .subscribe();
    return () => { live = false; db.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.conversation_id]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => setOtherRead(conv.other_last_read), [conv.other_last_read]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !user) return;
    setText("");
    const { data, error } = await db.from("messages").insert({ conversation_id: conv.conversation_id, sender_id: user.id, body }).select().single();
    if (error) { setText(body); return toast(blocked ? "Unblock this account to send messages." : "Couldn't send. You may not be able to message this account."); }
    setMsgs((cur) => (cur.some((x) => x.id === (data as Message).id) ? cur : [...cur, data as Message]));
    refresh();
  };
  const unsend = async (id: string) => {
    if (confirm !== id) return setConfirm(id);
    const { error } = await db.from("messages").delete().eq("id", id);
    if (!error) setMsgs((cur) => cur.filter((m) => m.id !== id));
    setConfirm(null);
  };
  const setStatus = async (status: "active" | "ignored") => {
    await db.from("conversation_members").update({ status }).eq("conversation_id", conv.conversation_id).eq("user_id", user!.id);
    await refresh();
    if (status === "ignored") router.replace("/messages");
  };
  const toggleBlock = async () => {
    if (!user || !other) return;
    const { error } = blocked ? await db.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", other.id) : await db.from("blocks").insert({ blocker_id: user.id, blocked_id: other.id });
    if (error) return toast("Couldn't update that. Try again.");
    setBlocked(!blocked); setMenu(false);
    toast(blocked ? `Unblocked @${other.handle}` : `Blocked @${other.handle}. They can't message you.`);
  };

  const lastMine = useMemo(() => [...msgs].reverse().find((m) => m.sender_id === user?.id), [msgs, user]);
  return (
    <>
      <header className="dm-h">
        <Link className="dm-back" href="/messages" aria-label="Back to messages">←</Link>
        <Avatar profile={other} />
        <div className="n">{other ? <Link className="u" href={`/u/${other.handle}`}>{other.name}</Link> : "Someone"}<small>{other ? `@${other.handle}` : ""}</small></div>
        <div style={{ position: "relative" }}>
          <button className="pill" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu">•••</button>
          {menu && (
            <div className="menu" role="menu" style={{ right: 0, top: "calc(100% + 6px)" }}>
              {other && <Link role="menuitem" href={`/u/${other.handle}`}>View profile</Link>}
              <button role="menuitem" onClick={toggleBlock}>{blocked ? "Unblock" : "Block"} {other ? `@${other.handle}` : ""}</button>
            </div>
          )}
        </div>
      </header>
      {conv.my_status === "request" && (
        <div className="dm-request">
          <p><b>{other?.name ?? "Someone"}</b> wants to message you. They won&apos;t see that you&apos;ve read it until you accept.</p>
          <div className="actions"><button className="btn small" onClick={() => setStatus("active")}>Accept</button><button className="btn small ghost" onClick={() => setStatus("ignored")}>Ignore</button><button className="btn small ghost" onClick={toggleBlock}>Block</button></div>
        </div>
      )}
      <div className="dm-msgs" aria-live="polite">
        {!msgs.length && <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>No messages yet. Say hello, or send them an album.</p>}
        {msgs.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const prev = msgs[i - 1];
          const gap = !prev || +new Date(m.created_at) - +new Date(prev.created_at) > 60 * 60 * 1000;
          return (
            <div key={m.id}>
              {gap && <div className="dm-time">{new Date(m.created_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</div>}
              <div className={`bubble-row${mine ? " mine" : ""}`}>
                <div className="bubble-col">
                  {m.attachment_type && <MusicCard album={albums.get(m.attachment_id!)} index={m.attachment_type === "song" ? m.attachment_index : null} mine={mine} />}
                  {m.body && <p className="bubble">{m.body}</p>}
                  {mine && <button className="unsend" onClick={() => unsend(m.id)}>{confirm === m.id ? "Tap again to unsend" : "Unsend"}</button>}
                </div>
              </div>
              {lastMine?.id === m.id && conv.my_status === "active" && otherRead >= m.created_at && <div className="seen">Seen</div>}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {blocked ? <p className="dm-blocked">You blocked @{other?.handle}. <button className="linkish" onClick={toggleBlock}><u>Unblock</u></button> to send messages.</p> : (
        <form className="dm-compose" onSubmit={send}>
          <textarea rows={1} value={text} maxLength={2000} placeholder="Message…" aria-label="Message"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn small" disabled={!text.trim()}>Send</button>
        </form>
      )}
    </>
  );
}
