import { notFound } from "next/navigation";

/** Canonical 404 route: renders the root not-found state with a real 404 status. */
export default function NotFoundPage() {
  notFound();
}
