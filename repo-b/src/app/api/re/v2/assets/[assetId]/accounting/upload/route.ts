import { getPool } from "@/lib/server/db";
import crypto from "crypto";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

/* --------------------------------------------------------------------------
 * Column detection — mirrors backend/app/services/re_tb_upload.py logic
 * -------------------------------------------------------------------------- */
const COL_PATTERNS: Record<string, string[]> = {
  account_code: ["account code", "account no", "account number", "acct", "acct no", "gl account", "gl code", "account #"],
  account_name: ["account name", "description", "account desc", "name", "account description"],
  debit: ["debit", "dr"],
  credit: ["credit", "cr"],
  balance: ["balance", "net", "amount", "ending balance", "net amount"],
};

function matchColumn(header: string): string | null {
  const h = header.trim().toLowerCase();
  for (const [canon, patterns] of Object.entries(COL_PATTERNS)) {
    for (const p of patterns) {
      if (h === p || h.replace(/_/g, " ") === p) return canon;
    }
  }
  return null;
}

function parseNumber(val: string | null | undefined): number | null {
  if (!val) return null;
  let s = val.trim();
  if (!s || s === "-" || s === "—" || s === "N/A") return null;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    s = s.slice(1, -1);
    neg = true;
  }
  s = s.replace(/[$,]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

interface ParsedRow {
  row_num: number;
  raw_account_code: string | null;
  raw_account_name: string | null;
  raw_debit: number | null;
  raw_credit: number | null;
  raw_balance: number | null;
  mapped_gl_account: string | null;
  mapping_confidence: number;
}

function parseCSV(text: string): ParsedRow[] {
  // Simple CSV parser (handles quoted fields)
  const lines = text.split(/\r?\n/);
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  // Find header row
  let headerIdx = -1;
  let headerCells: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = parseRow(lines[i]);
    const matches = cells.filter((c) => matchColumn(c)).length;
    if (matches >= 2) {
      headerIdx = i;
      headerCells = cells;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error("Could not detect header row. Expected columns like 'Account Code', 'Debit', 'Credit', 'Balance'.");
  }

  // Map columns
  const colMap: Record<string, number> = {};
  headerCells.forEach((cell, j) => {
    const canon = matchColumn(cell);
    if (canon && !(canon in colMap)) colMap[canon] = j;
  });

  if (!("account_code" in colMap) && !("account_name" in colMap)) {
    throw new Error("No account code or account name column found.");
  }
  if (!("balance" in colMap) && !("debit" in colMap)) {
    throw new Error("No balance or debit column found.");
  }

  // Parse data
  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (!cells.some((c) => c.trim())) continue;

    const get = (key: string) =>
      key in colMap && colMap[key] < cells.length ? cells[colMap[key]].trim() : null;

    const acctCode = get("account_code") || null;
    const acctName = get("account_name") || null;
    const debit = parseNumber(get("debit"));
    const credit = parseNumber(get("credit"));
    const balance = parseNumber(get("balance"));

    if (!acctCode && !acctName) continue;
    if (debit === null && credit === null && balance === null) continue;

    rows.push({
      row_num: rows.length + 1,
      raw_account_code: acctCode,
      raw_account_name: acctName,
      raw_debit: debit,
      raw_credit: credit,
      raw_balance: balance,
      mapped_gl_account: null,
      mapping_confidence: 0,
    });
  }
  return rows;
}

/* --------------------------------------------------------------------------
 * Auto-map accounts against existing chart of accounts + mapping rules
 * -------------------------------------------------------------------------- */
async function autoMapAccounts(
  rows: ParsedRow[],
  pool: ReturnType<typeof getPool>,
  envId: string,
  businessId: string,
): Promise<ParsedRow[]> {
  if (!pool) return rows;

  const coaRes = await pool.query("SELECT gl_account, name FROM acct_chart_of_accounts");
  const coa = new Map<string, string>(coaRes.rows.map((r: { gl_account: string; name: string }) => [r.gl_account, r.name]));

  for (const row of rows) {
    const code = row.raw_account_code || "";
    const name = (row.raw_account_name || "").toLowerCase();

    // Exact GL code match
    if (coa.has(code)) {
      row.mapped_gl_account = code;
      row.mapping_confidence = 1.0;
      continue;
    }

    // Name-based fuzzy match
    let bestMatch: string | null = null;
    let bestScore = 0;
    for (const [glCode, glName] of coa.entries()) {
      const gl = glName.toLowerCase();
      if (name && gl && (name.includes(gl) || gl.includes(name))) {
        const score = name === gl ? 0.95 : 0.7;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = glCode;
        }
      }
    }
    if (bestMatch && bestScore >= 0.7) {
      row.mapped_gl_account = bestMatch;
      row.mapping_confidence = bestScore;
    }
  }
  return rows;
}

/* --------------------------------------------------------------------------
 * POST /api/re/v2/assets/[assetId]/accounting/upload
 * Upload + parse + auto-map a trial balance file (CSV).
 * Returns batch_id and parsed/mapped rows for preview.
 * -------------------------------------------------------------------------- */
export async function POST(
  request: Request,
  { params }: { params: { assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const periodMonth = formData.get("period_month") as string | null;
    const envId = formData.get("env_id") as string | null;
    const businessId = formData.get("business_id") as string | null;

    if (!file) return Response.json({ error: "file is required" }, { status: 400 });
    if (!periodMonth) return Response.json({ error: "period_month is required (e.g. 2026-01-01)" }, { status: 400 });
    if (!envId) return Response.json({ error: "env_id is required" }, { status: 400 });
    if (!businessId) return Response.json({ error: "business_id is required" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Check for duplicate
    const dupCheck = await pool.query(
      "SELECT id, status FROM acct_upload_batch WHERE env_id = $1 AND business_id = $2::uuid AND file_hash = $3",
      [envId, businessId, fileHash],
    );
    if (dupCheck.rows.length > 0) {
      return Response.json({
        batch_id: dupCheck.rows[0].id,
        status: dupCheck.rows[0].status,
        duplicate: true,
        message: `This file was already uploaded (status: ${dupCheck.rows[0].status})`,
      });
    }

    // Parse CSV
    const text = buffer.toString("utf-8").replace(/^\uFEFF/, ""); // strip BOM
    let rows: ParsedRow[];
    try {
      rows = parseCSV(text);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }

    if (rows.length === 0) {
      return Response.json({ error: "No data rows found in file" }, { status: 400 });
    }

    // Auto-map
    rows = await autoMapAccounts(rows, pool, envId, businessId);

    // Check for superseded batch
    const prevRes = await pool.query(
      `SELECT id FROM acct_upload_batch
       WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
         AND period_month = $4::date AND status = 'committed'
       ORDER BY created_at DESC LIMIT 1`,
      [envId, businessId, params.assetId, periodMonth],
    );
    const supersedesId = prevRes.rows.length > 0 ? prevRes.rows[0].id : null;

    // Insert batch
    const batchRes = await pool.query(
      `INSERT INTO acct_upload_batch
         (env_id, business_id, asset_id, period_month, filename, file_hash,
          file_size_bytes, row_count, status, supersedes_batch_id)
       VALUES ($1, $2::uuid, $3::uuid, $4::date, $5, $6, $7, $8, 'pending', $9)
       RETURNING id`,
      [envId, businessId, params.assetId, periodMonth, file.name, fileHash,
       buffer.length, rows.length, supersedesId],
    );
    const batchId = batchRes.rows[0].id;

    // Insert rows
    for (const row of rows) {
      await pool.query(
        `INSERT INTO acct_upload_row
           (batch_id, row_num, raw_account_code, raw_account_name,
            raw_debit, raw_credit, raw_balance,
            mapped_gl_account, mapping_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [batchId, row.row_num, row.raw_account_code, row.raw_account_name,
         row.raw_debit, row.raw_credit, row.raw_balance,
         row.mapped_gl_account, row.mapping_confidence],
      );
    }

    // Validate
    const totalDebit = rows.reduce((s, r) => s + (r.raw_debit ?? 0), 0);
    const totalCredit = rows.reduce((s, r) => s + (r.raw_credit ?? 0), 0);
    const hasDrCr = rows.some((r) => r.raw_debit !== null || r.raw_credit !== null);
    const balanced = !hasDrCr || Math.abs(totalDebit - totalCredit) <= 0.01;
    const unmappedCount = rows.filter((r) => !r.mapped_gl_account).length;

    return Response.json({
      batch_id: batchId,
      status: "pending",
      duplicate: false,
      row_count: rows.length,
      mapped_count: rows.length - unmappedCount,
      unmapped_count: unmappedCount,
      balanced,
      total_debit: totalDebit,
      total_credit: totalCredit,
      supersedes: supersedesId,
      rows,
    });
  } catch (err) {
    console.error("[accounting/upload] Error:", err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

/* --------------------------------------------------------------------------
 * GET /api/re/v2/assets/[assetId]/accounting/upload
 * List upload batches for this asset.
 * -------------------------------------------------------------------------- */
export async function GET(
  request: Request,
  { params }: { params: { assetId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");

  if (!envId || !businessId) {
    return Response.json({ error: "env_id and business_id required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT id, period_month, filename, row_count, status, uploaded_by, created_at, committed_at
       FROM acct_upload_batch
       WHERE env_id = $1 AND business_id = $2::uuid AND asset_id = $3::uuid
       ORDER BY created_at DESC
       LIMIT 50`,
      [envId, businessId, params.assetId],
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[accounting/upload] List error:", err);
    return Response.json([], { status: 200 });
  }
}
