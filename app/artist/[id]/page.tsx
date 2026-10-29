import { ArtistView } from "./ArtistView";

export default async function ArtistRoute({ params }: PageProps<"/artist/[id]">) {
  const { id } = await params;
  return <ArtistView id={decodeURIComponent(id)} />;
}
