BEGIN;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS donation_date DATE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS donor_reported_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS requester_confirmed_at TIMESTAMPTZ;

ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS expiry_date DATE;

UPDATE blood_units
SET expiry_date = collection_date + 35
WHERE expiry_date IS NULL AND collection_date IS NOT NULL;

ALTER TABLE blood_units DROP CONSTRAINT IF EXISTS blood_units_expiry_check;
ALTER TABLE blood_units ADD CONSTRAINT blood_units_expiry_check
  CHECK (expiry_date IS NULL OR collection_date IS NULL OR expiry_date >= collection_date);

CREATE INDEX IF NOT EXISTS idx_units_expiry
  ON blood_units (expiry_date) WHERE status IN ('collected', 'received');

CREATE INDEX IF NOT EXISTS idx_donors_cooldown
  ON donors (availability_status, last_donation_date);

COMMIT;