import Link from "next/link";

export default function NotFound() {
  return <div className="empty"><strong>This page doesn&apos;t exist.</strong>It may have been moved or deleted. <Link href="/">Back to the feed</Link></div>;
}
