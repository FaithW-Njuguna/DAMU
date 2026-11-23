ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

UPDATE notifications
SET status = 'delivered'
WHERE channel = 'in_app' AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notifications_sms_queue
  ON notifications (channel, status) WHERE channel = 'sms';