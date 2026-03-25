import { NextResponse } from "next/server";
import { getMarketLandingFeed } from "@/lib/market-intelligence/landing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const feed = await getMarketLandingFeed();
    return NextResponse.json(feed);
  } catch (error) {
    console.error("Failed to build market intelligence landing feed", error);
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status: {
          engineStatus: "Unknown",
          regimeLabel: "Unknown",
          confidenceText: "Landing feed unavailable",
          latestDigestDate: null,
          pipelineState: "Could not aggregate the markdown intelligence sources.",
          sourceHealthNotes: ["The landing feed route hit an unexpected parser error."],
        },
        rotation: { nextStep: null, summary: null, selectedSegments: [] },
        digest: {
          regimeSummary: null,
          topSignals: [],
          crossVerticalAlertSummary: null,
          pipelineHealthSummary: null,
        },
        dailyIntel: null,
        competitorWatch: [],
        salesPositioning: [],
        featureRadar: null,
        demoAngle: null,
        buildQueue: [],
        sources: [],
      },
      { status: 200 }
    );
  }
}
