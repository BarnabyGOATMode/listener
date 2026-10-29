import { NextResponse } from "next/server";
import { adminSupabase, serverSupabase } from "@/lib/supabase/server";

/** Permanently deletes the signed-in person's account and everything they posted. */
export async function DELETE() {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { error } = await adminSupabase().auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Couldn't delete your account. Try again." }, { status: 500 });
  await db.auth.signOut();
  return NextResponse.json({ ok: true });
}
