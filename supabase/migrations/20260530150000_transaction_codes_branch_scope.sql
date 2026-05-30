-- Loosen transaction_codes.code uniqueness and add the logical-key index.
--
-- Before: `code` was globally UNIQUE, so every branch had to prefix its codes
-- (OSP2-PAYMENT-CASH, OSP3-PAYMENT-CASH, …) to avoid collisions. That was
-- redundant — the row's branch_id already carries that information, and the
-- runtime resolver (revenue-confirm + SOA settlement) never reads `code`
-- anyway; it looks up rows by (branch_id, transaction_type, payment_method_id)
-- and disambiguates by credit_account when needed.
--
-- After:
--   - code is unique WITHIN a branch (typos within a store still caught)
--     but can repeat across branches — when OSP3 is added we copy OSP2's
--     codes verbatim without renaming
--   - a partial unique index on (branch, type, method, credit_account)
--     WHERE active = true catches the latent bug where two active rows
--     would make the resolver's .single() throw

-- 1) Drop the over-strict global uniqueness on code.
ALTER TABLE transaction_codes
  DROP CONSTRAINT transaction_codes_code_key;

-- 2) Strip the branch-code prefix from existing rows so the canonical form
-- is the short one (OSP2-PAYMENT-CASH → PAYMENT-CASH). Only strips a prefix
-- that EQUALS the row's branch's code — codes already lacking it (or with a
-- different prefix) are left untouched.
UPDATE transaction_codes tc
SET code = regexp_replace(tc.code, '^' || b.code || '-', '')
FROM branches b
WHERE tc.branch_id = b.id
  AND tc.code LIKE b.code || '-%';

-- 3) Branch-scoped uniqueness for the display code. Same code text can now
-- exist across branches (the canonical case) but not twice within one branch.
ALTER TABLE transaction_codes
  ADD CONSTRAINT transaction_codes_branch_code_key UNIQUE (code, branch_id);

-- 4) Logical-key uniqueness. credit_account is part of the key because the
-- payment flow legitimately has two rows with the same method (e.g. PAYMAYA
-- payment vs PAYMAYA tip) that the runtime disambiguates via credit_account
-- (see [revenue-confirm/actions.ts:29-44]). NULLS NOT DISTINCT so the
-- intercompany settle row (payment_method_id = NULL) is also locked to one
-- active row per branch. Partial (WHERE active) so retired/inactive rows
-- can pile up without conflict — useful when re-doing a setup.
CREATE UNIQUE INDEX transaction_codes_logical_key
  ON transaction_codes (branch_id, transaction_type, payment_method_id, credit_account)
  NULLS NOT DISTINCT
  WHERE active = true;
