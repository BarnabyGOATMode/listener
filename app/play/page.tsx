import type { Metadata } from "next";
import { Undercover } from "./Undercover";

export const metadata: Metadata = { title: "Undercover", description: "Guess the album from its scrambled cover. A new one every day." };

export default function PlayPage() {
  return <Undercover />;
}
