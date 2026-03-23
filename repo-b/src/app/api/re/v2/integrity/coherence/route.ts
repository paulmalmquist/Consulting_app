import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/integrity/coherence
 *
 * Runs all SQL integrity check functions from 362_re_integrity_checks.sql
 * and returns a unified coherence report.
 *
 * Returns:
 *   { checks: [{check_name, passed, detail}], passed: boolean, total, failures }
 */
export async function GET() {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "No database pool" }, { status: 503 });
  }

  try {
    const result = await pool.query(
      `SELECT check_name, passed, detail FROM re_run_all_integrity_checks()`
    );

    const checks = result.rows as Array<{
      check_name: string;
      passed: boolean;
      detail: string;
    }>;

    const failures = checks.filter((c) => !c.passed);
    const allPassed = failures.length === 0;

    return Response.json({
      checks,
      passed: allPassed,
      total: checks.length,
      failures: failures.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // If the function doesn't exist yet, return a helpful error
    const message = String(err);
    if (message.includes("does not exist")) {
      return Response.json(
        {
          error: "Integrity check functions not installed",
          detail: "Run 362_re_integrity_checks.sql to install check functions",
        },
        { status: 501 }
      );
    }
    console.error("[re/v2/integrity/coherence] DB error", err);
    return Response.json(
      { error: "Coherence check failed", detail: message },
      { status: 500 }
    );
  }
}
