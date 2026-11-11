const pool = require("../config/db");

const needHospital = (req, res) => {
  if (!req.user.hospital_id) {
    res.status(400).json({ message: "Your account is not linked to a hospital" });
    return false;
  }
  return true;
};

const getMyDonorProfile = async (req, res) => {
  const r = await pool.query("SELECT * FROM donors WHERE user_id = $1", [req.user.user_id]);
  res.json({ donor: r.rows[0] || null });
};

// No patient identity is returned to donors (SRS NFR-5).
const getMyMatches = async (req, res) => {
  const r = await pool.query(
    `SELECT m.match_id, m.status, m.tracking_code, m.created_at,
            r.blood_type, r.units_required, r.urgency, r.location, h.name AS hospital_name
     FROM matches m
     JOIN donors d ON d.donor_id = m.donor_id
     JOIN blood_requests r ON r.request_id = m.request_id
     LEFT JOIN hospitals h ON h.hospital_id = r.hospital_id
     WHERE d.user_id = $1
     ORDER BY m.created_at DESC`,
    [req.user.user_id]
  );
  res.json({ matches: r.rows });
};

const getMyRequests = async (req, res) => {
  const r = await pool.query(
    `SELECT r.request_id, r.blood_type, r.units_required, r.urgency, r.location, r.status, r.created_at,
            h.name AS hospital_name,
            (SELECT COUNT(*)::int FROM matches m WHERE m.request_id = r.request_id) AS donors_notified,
            (SELECT COUNT(*)::int FROM matches m WHERE m.request_id = r.request_id AND m.status = 'confirmed') AS donors_confirmed
     FROM blood_requests r
     LEFT JOIN hospitals h ON h.hospital_id = r.hospital_id
     WHERE r.requester_id = $1
     ORDER BY r.created_at DESC`,
    [req.user.user_id]
  );
  res.json({ requests: r.rows });
};

const listHospitals = async (req, res) => {
  const r = await pool.query("SELECT hospital_id, name, location FROM hospitals ORDER BY name");
  res.json({ hospitals: r.rows });
};

const listHospitalUnits = async (req, res) => {
  if (!needHospital(req, res)) return;
  const r = await pool.query(
    `SELECT unit_id, tracking_code, status, collection_date
     FROM blood_units WHERE hospital_id = $1 ORDER BY created_at DESC`,
    [req.user.hospital_id]
  );
  res.json({ units: r.rows });
};

const listConfirmedMatches = async (req, res) => {
  if (!needHospital(req, res)) return;
  const r = await pool.query(
    `SELECT m.match_id, m.tracking_code, m.response_at, r.blood_type, r.location
     FROM matches m JOIN blood_requests r ON r.request_id = m.request_id
     WHERE m.status = 'confirmed'
       AND (r.hospital_id IS NULL OR r.hospital_id = $1)
       AND NOT EXISTS (SELECT 1 FROM blood_units u WHERE u.match_id = m.match_id)
     ORDER BY m.response_at DESC`,
    [req.user.hospital_id]
  );
  res.json({ matches: r.rows });
};

const listFlaggedUnits = async (req, res) => {
  const r = await pool.query(
    `SELECT u.unit_id, u.tracking_code, u.status, u.collection_date, h.name AS hospital_name
     FROM blood_units u LEFT JOIN hospitals h ON h.hospital_id = u.hospital_id
     WHERE u.status = 'flagged' ORDER BY u.collection_date`
  );
  res.json({ units: r.rows });
};

// Anonymous: stores only the text and an optional hospital (SRS REQ-16).
const submitWhistleblower = async (req, res) => {
  const { report_text, hospital_id } = req.body;
  if (!report_text || report_text.trim().length < 20) {
    return res.status(400).json({ message: "Please describe the concern in at least 20 characters" });
  }
  await pool.query(
    "INSERT INTO whistleblower_reports (hospital_id, report_text) VALUES ($1, $2)",
    [hospital_id || null, report_text.trim()]
  );
  res.status(201).json({ message: "Report received" });
};

const listWhistleblower = async (req, res) => {
  const r = await pool.query(
    `SELECT w.report_id, w.report_text, w.status, w.created_at, h.name AS hospital_name
     FROM whistleblower_reports w LEFT JOIN hospitals h ON h.hospital_id = w.hospital_id
     ORDER BY w.created_at DESC`
  );
  res.json({ reports: r.rows });
};

module.exports = {
  getMyDonorProfile, getMyMatches, getMyRequests, listHospitals,
  listHospitalUnits, listConfirmedMatches, listFlaggedUnits,
  submitWhistleblower, listWhistleblower
};