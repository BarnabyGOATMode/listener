import { ProfileView } from "./ProfileView";

export default async function UserPage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  return <ProfileView handle={decodeURIComponent(handle).toLowerCase()} />;
}
