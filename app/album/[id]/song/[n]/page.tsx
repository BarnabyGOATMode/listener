import { SongView } from "./SongView";

export default async function SongPage({ params }: PageProps<"/album/[id]/song/[n]">) {
  const { id, n } = await params;
  return <SongView id={decodeURIComponent(id)} index={Math.max(0, (parseInt(n, 10) || 1) - 1)} />;
}
