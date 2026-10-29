"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MiniProfile } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import type { InboxRow } from "@/lib/types";
import { useSession } from "./Providers";

export type Conversation = InboxRow & { other: MiniProfile | null };
type Ctx = { inbox: Conversation[]; unread: number; requests: number; refresh: () => Promise<void>; ready: boolean; problem: string | null };
const MessagesCtx = createContext<Ctx>({ inbox: [], unread: 0, requests: 0, refresh: async () => {}, ready: false, problem: null });

/** Turns a database error into something a person can act on. */
export function chatError(e: { code?: string; message?: string } | null | undefined) {
  const m = e?.message ?? "";
  if (e?.code === "PGRST202" || e?.code === "PGRST205" || e?.code === "42883" || e?.code === "42P01" || /could not find the (function|table)|does not exist/i.test(m))
    return "Messages aren't switched on yet. Run 0004_messages.sql in Supabase's SQL Editor, then reload this page.";
  if (/can't message|cannot message/i.test(m)) return "You can't message this account.";
  if (/row-level security/i.test(m)) return "You can't send messages in this chat.";
  if (/sign in/i.test(m)) return "Sign in to send messages.";
  return `Something went wrong with messages: ${m || "unknown error"}`;
}
export const useMessages = () => useContext(MessagesCtx);

/** Your conversations, kept live: new messages anywhere refresh the inbox and unread counts straight away. */
export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const [inbox, setInbox] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) { setInbox([]); return; }
    const db = supabase();
    const { data, error } = await db.rpc("my_inbox");
    if (error) { setProblem(chatError(error)); setReady(true); return; }
    setProblem(null);
    const rows = (data as InboxRow[]) ?? [];
    const ids = [...new Set(rows.map((r) => r.other_id))];
    const { data: people } = ids.length ? await db.from("profiles").select("*").in("id", ids) : { data: [] };
    const byId = new Map(((people as MiniProfile[]) ?? []).map((p) => [p.id, p]));
    setInbox(rows.map((r) => ({ ...r, other: byId.get(r.other_id) ?? null })));
    setReady(true);
  }, [profile]);

  useEffect(() => {
    if (!profile) { setInbox([]); return; }
    refresh();
    const db = supabase();
    const ch = db.channel(`inbox-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, () => refresh())
      .subscribe();
    const t = setInterval(refresh, 45_000); // safety net if the live connection drops
    return () => { db.removeChannel(ch); clearInterval(t); };
  }, [profile, refresh]);

  const value = useMemo(() => ({
    inbox,
    unread: inbox.filter((c) => c.my_status === "active").reduce((n, c) => n + c.unread, 0),
    requests: inbox.filter((c) => c.my_status === "request").length,
    refresh,
    ready,
    problem,
  }), [inbox, refresh, ready, problem]);
  return <MessagesCtx.Provider value={value}>{children}</MessagesCtx.Provider>;
}
