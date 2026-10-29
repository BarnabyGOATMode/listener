"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ResetPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="authcard">
      <h1 className="display" style={{ fontSize: 44 }}>Choose a new password</h1>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        const { error } = await supabase().auth.updateUser({ password });
        setBusy(false);
        if (error) setError(error.message); else router.push("/");
      }}>
        <label className="field">New password<input className="input" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions"><button className="btn" disabled={busy}>Save password</button></div>
      </form>
    </div>
  );
}
