"use client";

import { use } from "react";
import ReceiptsFeed from "@/components/automated-data-engineering/ReceiptsFeed";

// Route segment stays /runs; the user-facing label is "Execution Receipts".
export default function AdeReceiptsPage({ params }: { params: Promise<{ envId: string }> }) {
  const { envId } = use(params);
  return <ReceiptsFeed envId={envId} />;
}
