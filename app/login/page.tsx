"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up" | "forgot">(params.get("mode") === "up" ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const router = useRouter();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSent(""); setBusy(true);
    const db = supabase();
    try {
      if (mode === "in") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/"); router.refresh();
      } else if (mode === "up") {
        const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback?next=/welcome` } });
        if (error) throw error;
        if (data.session) router.push("/welcome");
        else setSent(`We sent a confirmation link to ${email}. Open it to finish creating your account.`);
      } else {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset` });
        if (error) throw error;
        setSent(`If ${email} has an account, a link to choose a new password is on its way.`);
      }
    } catch (err) {
      const m = (err as Error).message || "";
      setError(/invalid login/i.test(m) ? "That email and password don't match an account." : /already registered/i.test(m) ? "There's already an account with that email. Sign in instead." : m || "Something went wrong. Try again.");
    } finally { setBusy(false); }
  };

  const title = mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset your password";
  return (
    <div className="authcard">
      <div className="kicker">Welcome to listener</div>
      <h1 className="display" style={{ fontSize: 44 }}>{title}</h1>
      <form className="form" onSubmit={submit}>
        <label className="field">Email<input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== "forgot" && (
          <label className="field">Password
            <input className="input" type="password" required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === "up" && <span className="hint">At least 8 characters.</span>}
          </label>
        )}
        {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
        {sent && <p className="notice" role="status" style={{ margin: 0 }}>{sent}</p>}
        <div className="actions">
          <button className="btn" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}</button>
        </div>
      </form>
      <div className="actions muted" style={{ fontSize: 14 }}>
        {mode !== "up" && <button className="linkish" onClick={() => { setMode("up"); setError(""); setSent(""); }}>New here? <u>Create an account</u></button>}
        {mode !== "in" && <button className="linkish" onClick={() => { setMode("in"); setError(""); setSent(""); }}>Have an account? <u>Sign in</u></button>}
        {mode === "in" && <button className="linkish" onClick={() => { setMode("forgot"); setError(""); setSent(""); }}><u>Forgot your password?</u></button>}
      </div>
      <p className="hint">By creating an account you agree to listener&apos;s <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p>
    </div>
  );
}
