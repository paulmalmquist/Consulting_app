-- CRE Intelligence: Multi-metro registry
-- Maps CBSA codes to state/county FIPS for parameterized connector scope.

CREATE TABLE IF NOT EXISTS cre_metro_registry (
  cbsa_code   text PRIMARY KEY,
  metro_name  text NOT NULL,
  state_fips  text[] NOT NULL,
  county_fips text[] NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed initial metros (only Miami active by default)
INSERT INTO cre_metro_registry (cbsa_code, metro_name, state_fips, county_fips, is_active) VALUES
  ('33100', 'Miami-Fort Lauderdale-West Palm Beach, FL',
   '{12}', '{12086,12011,12099}', true),
  ('35620', 'New York-Newark-Jersey City, NY-NJ-PA',
   '{36,34,42}', '{36061,36047,36081,36005,36085,34013,34017,34023,34025,34029,34035,34039,42045,42077,42103}', false),
  ('31080', 'Los Angeles-Long Beach-Anaheim, CA',
   '{06}', '{06037,06059}', false),
  ('41860', 'San Francisco-Oakland-Berkeley, CA',
   '{06}', '{06001,06013,06075,06081,06041}', false),
  ('19100', 'Dallas-Fort Worth-Arlington, TX',
   '{48}', '{48085,48113,48121,48139,48221,48231,48251,48257,48367,48397,48425,48439,48497}', false),
  ('12060', 'Atlanta-Sandy Springs-Alpharetta, GA',
   '{13}', '{13089,13121,13135,13067,13063,13057,13117,13151,13247}', false)
ON CONFLICT (cbsa_code) DO NOTHING;
