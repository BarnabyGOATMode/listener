"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MiniProfile } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import type { InboxRow } from "@/lib/types";
import { useSession } from "./Providers";

export type Conversation = InboxRow & { other: MiniProfile | null };
type Ctx = { inbox: Conversation[]; unread: number; requests: number; refresh: () => Promise<void>; ready: boolean };
const MessagesCtx = createContext<Ctx>({ inbox: [], unread: 0, requests: 0, refresh: async () => {}, ready: false });
export const useMessages = () => useContext(MessagesCtx);

/** Your conversations, kept live: new messages anywhere refresh the inbox and unread counts straight away. */
export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  const [inbox, setInbox] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile) { setInbox([]); return; }
    const db = supabase();
    const { data, error } = await db.rpc("my_inbox");
    if (error) { setReady(true); return; } // messages not set up yet (migration 0004), or offline
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
  }), [inbox, refresh, ready]);
  return <MessagesCtx.Provider value={value}>{children}</MessagesCtx.Provider>;
}
