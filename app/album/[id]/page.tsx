import { AlbumView } from "./AlbumView";

export default async function AlbumPage({ params }: PageProps<"/album/[id]">) {
  const { id } = await params;
  return <AlbumView id={decodeURIComponent(id)} />;
}
