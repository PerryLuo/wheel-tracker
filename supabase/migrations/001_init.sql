-- Sprint 2: RLS policies will be added when auth is implemented (Sprint 5)

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  date TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  symbol TEXT,
  underlying TEXT,
  expiry TIMESTAMPTZ,
  strike DECIMAL,
  option_type TEXT,
  quantity INTEGER,
  price DECIMAL,
  fees DECIMAL,
  amount DECIMAL,
  broker TEXT DEFAULT 'schwab',
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_underlying ON transactions(underlying);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
