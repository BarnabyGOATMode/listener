import { ListView } from "./ListView";

export default async function ListPage({ params }: PageProps<"/list/[id]">) {
  const { id } = await params;
  return <ListView id={decodeURIComponent(id)} />;
}
