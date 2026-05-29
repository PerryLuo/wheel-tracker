-- CSP Screener results table (nightly pipeline output)
CREATE TABLE csp_screener_results (
  id                BIGSERIAL PRIMARY KEY,
  run_date          DATE        NOT NULL,
  rank              INTEGER     NOT NULL,
  symbol            TEXT        NOT NULL,
  stock_price       NUMERIC(10, 2),
  strike            NUMERIC(10, 2),
  premium           NUMERIC(10, 2),
  delta             NUMERIC(6, 4),
  cushion_pct       NUMERIC(6, 2),
  premium_yield_pct NUMERIC(6, 2),
  dte               INTEGER,
  expiration        DATE,
  current_iv        NUMERIC(6, 2),
  score             NUMERIC(8, 4),
  summary           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_csp_screener_run_date ON csp_screener_results (run_date DESC, rank ASC);

ALTER TABLE csp_screener_results ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read screener results (not user-specific data)
CREATE POLICY "allow_authenticated_read" ON csp_screener_results
  FOR SELECT TO authenticated USING (true);

-- Service role (GitHub Actions) bypasses RLS automatically for INSERT
