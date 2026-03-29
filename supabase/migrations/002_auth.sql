-- Sprint 5: Enable auth + RLS on transactions table
-- Run this in the Supabase SQL editor after enabling Google OAuth in the dashboard.
--
-- IMPORTANT: Before running, backfill your own user_id on existing rows:
--   UPDATE transactions SET user_id = '<your-uuid-from-auth.users>' WHERE user_id IS NULL;
-- Then run this migration.

-- 1. Make user_id non-nullable (after backfill above)
ALTER TABLE transactions
  ALTER COLUMN user_id SET NOT NULL;

-- 2. Add foreign key to Supabase's managed auth.users table
--    ON DELETE CASCADE: deleting a user account removes all their transactions
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_user
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- 3. Enable Row Level Security — blocks all access until policies are added
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — auth.uid() reads the user's UUID from their JWT automatically

-- Users can only read their own rows
CREATE POLICY "select_own" ON transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert rows tagged with their own user_id
CREATE POLICY "insert_own" ON transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own rows
CREATE POLICY "delete_own" ON transactions
  FOR DELETE
  USING (auth.uid() = user_id);
