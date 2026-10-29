"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Look, Profile } from "@/lib/types";

type Session = {
  user: User | null;
  profile: Profile | null;
  ready: boolean;
  following: Set<string>;
  refresh: () => Promise<void>;
  setFollowing: (next: Set<string>) => void;
  toast: (msg: string) => void;
};
const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside Providers");
  return s;
};

export function applyLook(look: Look) {
  document.documentElement.dataset.look = look;
  try { localStorage.setItem("listener-look", look); } catch {}
}

const OPEN_PATHS = ["/login", "/welcome", "/reset", "/auth"];

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const path = usePathname();

  const load = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) { setProfile(null); setFollowing(new Set()); setReady(true); return; }
    const db = supabase();
    const [{ data: p }, { data: f }] = await Promise.all([
      db.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      db.from("follows").select("followee_id").eq("follower_id", u.id),
    ]);
    setProfile((p as Profile) ?? null);
    setFollowing(new Set((f ?? []).map((r: { followee_id: string }) => r.followee_id)));
    if (p?.look) applyLook(p.look);
    setReady(true);
  }, []);

  useEffect(() => {
    const db = supabase();
    db.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = db.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Signed in but no profile yet: finish signing up first.
  useEffect(() => {
    if (ready && user && !profile && !OPEN_PATHS.some((p) => path.startsWith(p))) router.replace("/welcome");
  }, [ready, user, profile, path, router]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const value = useMemo<Session>(() => ({
    user, profile, ready, following, setFollowing,
    refresh: async () => load((await supabase().auth.getUser()).data.user),
    toast: setMsg,
  }), [user, profile, ready, following, load]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}
