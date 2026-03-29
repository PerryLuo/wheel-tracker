# Auth Architecture — Wheel Tracker

## What Each System Is Responsible For

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                            │
│  • Stores session cookie (set by Supabase, httpOnly + secure)       │
│  • Supabase SDK auto-attaches JWT to every request                  │
│  • No token management needed in app code                           │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP request + cookie
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NEXT.JS MIDDLEWARE  (middleware.ts)                                 │
│  • Runs before every route — API and page                           │
│  • Reads session cookie, validates JWT with Supabase                │
│  • No session → redirect to /login                                  │
│  • Valid session → allow request through                            │
└─────────────────────────────────────────────────────────────────────┘
                              │ request passes through
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NEXT.JS API ROUTES  (/api/import, /api/transactions)               │
│  • Creates server-side Supabase client (reads cookie)               │
│  • Calls supabase.auth.getUser() — re-validates JWT                 │
│  • Extracts user.id from the validated session                      │
│  • Stamps user_id on every INSERT                                   │
│  • Never writes WHERE user_id = ? on SELECT — RLS handles it        │
└─────────────────────────────────────────────────────────────────────┘
                              │ SQL query + JWT in Authorization header
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  AUTH ENGINE                                                 │   │
│  │  • Manages Google OAuth handshake                           │   │
│  │  • Creates + stores user accounts in auth.users             │   │
│  │  • Issues JWTs (access token, expires 1hr)                  │   │
│  │  • Issues refresh tokens (long-lived, rotates on use)       │   │
│  │  • Auto-refreshes access token before expiry                │   │
│  │  • Handles sign out (invalidates refresh token)             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  RLS (Row Level Security)                                    │   │
│  │  • Reads auth.uid() from the JWT on every query             │   │
│  │  • Rewrites SELECT to add WHERE user_id = auth.uid()        │   │
│  │  • Blocks INSERT if user_id ≠ auth.uid()                    │   │
│  │  • Enforced at database engine level — cannot be bypassed   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  POSTGRESQL (your data)                                      │   │
│  │  • auth.users    — managed by Supabase, you don't touch it  │   │
│  │  • transactions  — your table, user_id FK → auth.users      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Google OAuth → Supabase Sign-In Flow

```
User clicks "Sign in with Google"
        │
        ▼
Supabase SDK calls Google OAuth endpoint
        │
        ▼
Browser redirects to Google consent screen
  "Wheel Tracker wants access to your Google account"
        │
        ▼ (user approves)
Google sends auth code to /auth/callback on your site
        │
        ▼
Supabase exchanges code for Google identity (email, name)
Looks up or creates row in auth.users:
  {
    id:         "a1b2-c3d4-...",   ← permanent UUID for this user
    email:      "alice@gmail.com",
    provider:   "google",
    created_at: "2026-03-27"
  }
        │
        ▼
Supabase issues two tokens and sets them as cookies:
  sb-access-token   JWT, expires in 1 hour
                    payload: { sub: "a1b2-c3d4", email: "alice@gmail.com" }
  sb-refresh-token  long-lived, used to get a new access token silently
        │
        ▼
User lands on / (P&L page) — they are now signed in
Same Google account → always same UUID → always same data
```

---

## Import Request — End to End

```
BROWSER
  User selects Schwab JSON file, clicks Import
  POST /api/import  ← cookie sent automatically
        │
        ▼
MIDDLEWARE (middleware.ts)
  Reads sb-access-token cookie
  Validates JWT signature with Supabase
  ✓ valid → request continues
  ✗ invalid/missing → redirect /login (API never reached)
        │
        ▼
API ROUTE (/api/import)
  const supabase = createServerClient(...)   // reads cookie
  const { data: { user } } = await supabase.auth.getUser()
  // user.id = "a1b2-c3d4"

  Parse file → transactions[]
  Stamp each row: { ...tx, user_id: "a1b2-c3d4" }
  supabase.from('transactions').insert(rows)
        │
        ▼
SUPABASE RLS CHECK
  Receives INSERT + JWT in Authorization header
  auth.uid() from JWT = "a1b2-c3d4"
  RLS policy: WITH CHECK (auth.uid() = user_id)
  "a1b2-c3d4" = "a1b2-c3d4" ✓
  INSERT succeeds
        │
        ▼
POSTGRESQL
  Rows written to transactions table
  Each row has user_id = "a1b2-c3d4"
        │
        ▼
RESPONSE
  { imported: 42, skipped: 3 } → browser
```

---

## Query Request — End to End

```
BROWSER
  Page loads, useTransactions() hook fires
  GET /api/transactions  ← cookie sent automatically
        │
        ▼
MIDDLEWARE → validates JWT → passes through
        │
        ▼
API ROUTE (/api/transactions)
  supabase.auth.getUser() → user.id = "a1b2-c3d4"
  supabase.from('transactions').select('*')
  // No WHERE clause written — RLS handles it
        │
        ▼
SUPABASE RLS
  Rewrites query internally:
  SELECT * FROM transactions
  WHERE (auth.uid() = user_id)
  → WHERE ("a1b2-c3d4" = user_id)
  Returns only Alice's 342 rows, never Bob's
        │
        ▼
API ROUTE
  Runs buildChains(), computePeriodPnl() on Alice's transactions only
  Returns { transactions, chains, weekly, monthly, ytd }
        │
        ▼
BROWSER
  Renders Alice's P&L, chains, positions
```

---

## Session Lifecycle

```
Sign in
  └─ Supabase sets access token (1hr) + refresh token (long-lived)

During use (within 1hr)
  └─ Every request uses the access token cookie — no round trip needed

Access token expires
  └─ Supabase SDK detects expiry automatically
  └─ Uses refresh token to get a new access token silently
  └─ User never sees a logout or interruption

Sign out
  └─ supabase.auth.signOut()
  └─ Refresh token invalidated on Supabase side
  └─ Cookies cleared from browser
  └─ Middleware redirects all subsequent requests to /login

Same Google account, new device
  └─ Sign in again → same UUID → same data
  └─ Previous device sessions remain valid until sign out or expiry
```

---

## Database Schema

```sql
-- Managed entirely by Supabase — you never create or alter this
auth.users
  id          UUID PRIMARY KEY    -- "a1b2-c3d4-..." permanent user identity
  email       TEXT
  provider    TEXT                -- "google"
  created_at  TIMESTAMPTZ

-- Your table — the only link is the user_id foreign key
transactions
  id          TEXT PRIMARY KEY    -- deterministic hash (deduplication)
  user_id     UUID NOT NULL
                REFERENCES auth.users(id)
                ON DELETE CASCADE  -- user deletes account → their data gone
  date        TEXT
  action      TEXT                -- STO, BTC, Expired, Assigned, Buy, Sell
  symbol      TEXT
  underlying  TEXT
  expiry      TEXT
  strike      DECIMAL
  option_type TEXT                -- P or C
  quantity    INTEGER
  price       DECIMAL
  fees        DECIMAL
  amount      DECIMAL             -- net signed cash flow
  broker      TEXT                -- schwab, robinhood, ibkr
  raw         JSONB               -- original broker record
  created_at  TIMESTAMPTZ DEFAULT now()

-- Indexes
CREATE INDEX idx_tx_user       ON transactions(user_id);
CREATE INDEX idx_tx_underlying ON transactions(underlying);
CREATE INDEX idx_tx_date       ON transactions(date);

-- RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own" ON transactions
  FOR DELETE USING (auth.uid() = user_id);
```

---

## Security Layers Summary

```
Layer               What It Does                        What It Prevents
──────────────────────────────────────────────────────────────────────────
HTTPS               Encrypts all traffic                Network interception
httpOnly cookie     JS cannot read the token            XSS token theft
Middleware          Validates JWT on every request      Unauthenticated access
getUser() in API    Re-validates JWT server-side        Middleware bypass
RLS policies        Postgres filters rows by user_id    Cross-user data access
ON DELETE CASCADE   Removes data with account           Orphaned data
```

No single point of failure — each layer independently enforces access control.
