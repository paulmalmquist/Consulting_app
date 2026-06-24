"use client";

import { useParams } from "next/navigation";
import ReceiptsFeed from "@/components/automated-data-engineering/ReceiptsFeed";

// Route segment stays /runs; the user-facing label is "Execution Receipts".
export default function AdeReceiptsPage() {
  const { envId } = useParams<{ envId: string }>();
  return <ReceiptsFeed envId={envId} />;
}
