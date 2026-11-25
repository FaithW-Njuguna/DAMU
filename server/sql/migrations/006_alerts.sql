BEGIN;

-- A verified hospital raises an alert when it is short of a blood group. It can
-- go to matching donors, to the public, or both. Alerts expire on their own.
CREATE TABLE IF NOT EXISTS shortage_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id),
  created_by UUID NOT NULL REFERENCES users(user_id),
  blood_type blood_group NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'critical')),
  audience VARCHAR(10) NOT NULL CHECK (audience IN ('donors', 'public', 'both')),
  message TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  donors_notified INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ
);

-- A hospital can have only one active alert per blood group.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_alert
  ON shortage_alerts (hospital_id, blood_type) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_alerts_public
  ON shortage_alerts (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_alerts_hospital
  ON shortage_alerts (hospital_id, created_at DESC);

-- The blood-group analysis looks at requests inside a time window.
CREATE INDEX IF NOT EXISTS idx_requests_created
  ON blood_requests (created_at);

COMMIT;