BEGIN;

ALTER TABLE blood_units ALTER COLUMN tracking_code TYPE VARCHAR(30);
ALTER TABLE matches     ALTER COLUMN tracking_code TYPE VARCHAR(30);

ALTER TABLE users ALTER COLUMN phone_number TYPE VARCHAR(16);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_match
  ON blood_units (match_id) WHERE match_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON users (LOWER(email)) WHERE email IS NOT NULL;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('notified', 'confirmed', 'declined', 'expired', 'cancelled'));

ALTER TABLE whistleblower_reports DROP CONSTRAINT IF EXISTS whistleblower_status_check;
ALTER TABLE whistleblower_reports ADD CONSTRAINT whistleblower_status_check
  CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('in_app', 'sms'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('pending', 'delivered', 'sending', 'sent', 'failed'));

ALTER TABLE donors DROP CONSTRAINT IF EXISTS donors_coords_check;
ALTER TABLE donors ADD CONSTRAINT donors_coords_check CHECK (
  (latitude IS NULL) = (longitude IS NULL) AND
  (latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)));

ALTER TABLE blood_requests DROP CONSTRAINT IF EXISTS requests_coords_check;
ALTER TABLE blood_requests ADD CONSTRAINT requests_coords_check CHECK (
  (latitude IS NULL) = (longitude IS NULL) AND
  (latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)));

CREATE INDEX IF NOT EXISTS idx_matches_donor          ON matches (donor_id);
CREATE INDEX IF NOT EXISTS idx_matches_request_status ON matches (request_id, status);
CREATE INDEX IF NOT EXISTS idx_units_hospital         ON blood_units (hospital_id);
CREATE INDEX IF NOT EXISTS idx_units_status_date      ON blood_units (status, collection_date);
CREATE INDEX IF NOT EXISTS idx_requests_requester     ON blood_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_hospital      ON blood_requests (hospital_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_hospital         ON users (hospital_id) WHERE hospital_id IS NOT NULL;

DROP INDEX IF EXISTS idx_unit_tracking;

COMMIT;