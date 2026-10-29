"use client";
import { supabase } from "./supabase/client";

/** Center-crops an image to a square and shrinks it to 400×400 JPEG, so uploads are small and every avatar is the same shape. */
async function squareJpeg(file: File, size = 400): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.88));
}

/** Uploads a new profile photo for this person and saves it to their profile. Returns the photo's URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPEG, PNG or WebP).");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is over 15 MB. Choose a smaller one.");
  const blob = await squareJpeg(file);
  const db = supabase();
  const path = `${userId}/avatar.jpg`;
  const { error } = await db.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (error) throw new Error(/bucket/i.test(error.message) ? "Photo uploads aren't switched on yet. Run the profile photos SQL in Supabase." : "Couldn't upload your photo. Try again.");
  const url = `${db.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error: e2 } = await db.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (e2) throw new Error("Couldn't save your photo. Try again.");
  return url;
}

export async function removeAvatar(userId: string) {
  const db = supabase();
  await db.storage.from("avatars").remove([`${userId}/avatar.jpg`]);
  const { error } = await db.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error) throw new Error("Couldn't remove your photo. Try again.");
}
