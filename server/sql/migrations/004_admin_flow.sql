BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(user_id);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS verification_notes TEXT;

UPDATE hospitals SET verified = FALSE WHERE verified IS NULL;
ALTER TABLE hospitals ALTER COLUMN verified SET NOT NULL;


CREATE TABLE IF NOT EXISTS admin_audit_log (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(user_id),
  action VARCHAR(40) NOT NULL,
  target_type VARCHAR(20) NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log (created_at DESC);

UPDATE users u
SET phone_number = '+254' || substr(u.phone_number, 2)
WHERE u.phone_number ~ '^0[17][0-9]{8}$'
  AND NOT EXISTS (
    SELECT 1 FROM users x
    WHERE x.phone_number = '+254' || substr(u.phone_number, 2)
  );

UPDATE users u
SET phone_number = '+' || u.phone_number
WHERE u.phone_number ~ '^254[0-9]{9}$'
  AND NOT EXISTS (
    SELECT 1 FROM users x WHERE x.phone_number = '+' || u.phone_number
  );

COMMIT;