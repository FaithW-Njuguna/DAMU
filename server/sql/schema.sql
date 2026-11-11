CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE blood_group AS ENUM (
  'A+', 'A-', 'B+', 'B-',
  'AB+', 'AB-', 'O+', 'O-'
);

CREATE TYPE availability_status AS ENUM (
  'available',
  'unavailable',
  'recently_donated'
);

CREATE TYPE urgency_level AS ENUM (
  'normal',
  'urgent',
  'critical'
);

CREATE TYPE request_status AS ENUM (
  'pending',
  'matching',
  'matched',
  'fulfilled',
  'cancelled'
);

CREATE TYPE unit_status AS ENUM (
  'collected',
  'received',
  'used',
  'flagged'
);

CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  phone_number VARCHAR(15) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (
    role IN ('donor', 'patient', 'hospital', 'regulator', 'admin')
  ),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE donors (
  donor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(user_id),
  blood_type blood_group NOT NULL,
  location VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  availability_status availability_status DEFAULT 'available',
  last_donation_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hospitals (
  hospital_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  location VARCHAR(150) NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE blood_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES users(user_id),
  hospital_id UUID REFERENCES hospitals(hospital_id),
  blood_type blood_group NOT NULL,
  units_required INTEGER NOT NULL CHECK (units_required > 0),
  urgency urgency_level DEFAULT 'normal',
  location VARCHAR(150) NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  status request_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE matches (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES blood_requests(request_id),
  donor_id UUID REFERENCES donors(donor_id),
  status VARCHAR(20) DEFAULT 'notified',
  response_at TIMESTAMPTZ,
  tracking_code VARCHAR(20) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, donor_id)
);

CREATE TABLE blood_units (
  unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id),
  donor_id UUID REFERENCES donors(donor_id),
  hospital_id UUID REFERENCES hospitals(hospital_id),
  collection_date DATE,
  status unit_status DEFAULT 'collected',
  tracking_code VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accountability_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES blood_units(unit_id),
  hospital_id UUID REFERENCES hospitals(hospital_id),
  staff_id UUID REFERENCES users(user_id),
  action VARCHAR(30) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE whistleblower_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID REFERENCES hospitals(hospital_id),
  unit_id UUID REFERENCES blood_units(unit_id),
  report_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  message TEXT NOT NULL,
  channel VARCHAR(20) DEFAULT 'in_app',
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_donor_matching
ON donors(blood_type, availability_status, location);

CREATE INDEX idx_request_status
ON blood_requests(status);

CREATE INDEX idx_unit_tracking
ON blood_units(tracking_code);

CREATE INDEX idx_accountability_unit
ON accountability_logs(unit_id);
