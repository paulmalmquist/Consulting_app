import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "DB not configured" } },
      { status: 404 }
    );
  }

  try {
    const res = await pool.query(
      `SELECT
         a.asset_id::text,
         a.name,
         a.asset_type,
         a.acquisition_date,
         a.cost_basis,
         COALESCE(a.asset_status, 'active') AS asset_status,
         a.jv_id::text,
         a.created_at,
         pa.property_type,
         pa.units,
         pa.market,
         pa.city,
         pa.state,
         pa.msa,
         pa.address,
         pa.gross_sf AS square_feet,
         COALESCE(pa.square_feet, pa.gross_sf) AS sq_ft,
         pa.year_built,
         pa.current_noi,
         pa.occupancy,
         -- Sector capacity fields
         pa.avg_rent_per_unit::float8,
         pa.unit_mix_json,
         pa.beds,
         pa.licensed_beds,
         pa.care_mix_json,
         pa.revenue_per_occupied_bed::float8,
         pa.beds_student,
         pa.preleased_pct::float8,
         pa.university_name,
         pa.leasable_sf::float8,
         pa.leased_sf::float8,
         pa.walt_years::float8,
         pa.anchor_tenant,
         pa.health_system_affiliation,
         pa.clear_height_ft::float8,
         pa.dock_doors,
         pa.rail_served,
         pa.warehouse_sf::float8,
         pa.office_sf::float8,
         d.deal_id::text AS investment_id,
         d.name AS investment_name,
         d.deal_type AS investment_type,
         d.stage AS investment_stage,
         d.fund_id::text,
         f.name AS fund_name,
         f.business_id::text,
         ebb.env_id::text
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
       LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
       WHERE a.asset_id = $1::uuid
       LIMIT 1`,
      [params.assetId]
    );

    if (!res.rows[0]) {
      return Response.json(
        { detail: { error_code: "NOT_FOUND", message: "Asset not found" } },
        { status: 404 }
      );
    }

    const row = res.rows[0];

    return Response.json({
      asset: {
        asset_id: row.asset_id,
        name: row.name,
        asset_type: row.asset_type,
        acquisition_date: row.acquisition_date,
        cost_basis: row.cost_basis,
        status: row.asset_status,
        jv_id: row.jv_id,
        created_at: row.created_at,
      },
      property: {
        property_type: row.property_type,
        units: row.units,
        market: row.market,
        city: row.city,
        state: row.state,
        msa: row.msa,
        address: row.address,
        square_feet: row.sq_ft,
        year_built: row.year_built,
        current_noi: row.current_noi,
        occupancy: row.occupancy,
        // Multifamily
        avg_rent_per_unit: row.avg_rent_per_unit ?? null,
        unit_mix_json: row.unit_mix_json ?? null,
        // Senior Housing
        beds: row.beds ?? null,
        licensed_beds: row.licensed_beds ?? null,
        care_mix_json: row.care_mix_json ?? null,
        revenue_per_occupied_bed: row.revenue_per_occupied_bed ?? null,
        // Student Housing
        beds_student: row.beds_student ?? null,
        preleased_pct: row.preleased_pct ?? null,
        university_name: row.university_name ?? null,
        // MOB
        leasable_sf: row.leasable_sf ?? null,
        leased_sf: row.leased_sf ?? null,
        walt_years: row.walt_years ?? null,
        anchor_tenant: row.anchor_tenant ?? null,
        health_system_affiliation: row.health_system_affiliation ?? null,
        // Industrial
        clear_height_ft: row.clear_height_ft ?? null,
        dock_doors: row.dock_doors ?? null,
        rail_served: row.rail_served ?? null,
        warehouse_sf: row.warehouse_sf ?? null,
        office_sf: row.office_sf ?? null,
      },
      investment: {
        investment_id: row.investment_id,
        name: row.investment_name,
        investment_type: row.investment_type,
        stage: row.investment_stage,
      },
      fund: {
        fund_id: row.fund_id,
        name: row.fund_name,
      },
      env: {
        env_id: row.env_id,
        business_id: row.business_id,
      },
    });
  } catch (err) {
    console.error("[re/v2/assets/[assetId]] DB error", err);
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "Asset not found" } },
      { status: 404 }
    );
  }
}
