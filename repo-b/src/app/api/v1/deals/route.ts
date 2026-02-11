import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * In-memory deals store for the API stub.
 * In production this would be backed by a database.
 */
type DealStage =
  | "origination"
  | "underwriting"
  | "ic_review"
  | "closed_won"
  | "closed_lost";

type Deal = {
  id: string;
  name: string;
  company: string;
  value: number;
  stage: DealStage;
  owner: string;
  probability: number;
  createdAt: string;
};

const store: Deal[] = [];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** GET /api/v1/deals — list all deals */
export async function GET() {
  return Response.json({ deals: store });
}

/** POST /api/v1/deals — create a new deal */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, company, value, stage, owner, probability } = body;

  if (!name || !company || typeof value !== "number" || value <= 0) {
    return Response.json(
      { message: "name, company, and a positive value are required" },
      { status: 400 }
    );
  }

  const deal: Deal = {
    id: generateId(),
    name,
    company,
    value,
    stage: stage || "origination",
    owner: owner || "Unassigned",
    probability: typeof probability === "number" ? probability : 50,
    createdAt: new Date().toISOString(),
  };

  store.push(deal);
  return Response.json({ deal }, { status: 201 });
}

/** PATCH /api/v1/deals — update a deal's stage (body: { id, stage }) */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, stage } = body;

  if (!id || !stage) {
    return Response.json(
      { message: "id and stage are required" },
      { status: 400 }
    );
  }

  const idx = store.findIndex((d) => d.id === id);
  if (idx === -1) {
    return Response.json({ message: "Deal not found" }, { status: 404 });
  }

  store[idx] = { ...store[idx], stage };
  return Response.json({ deal: store[idx] });
}
