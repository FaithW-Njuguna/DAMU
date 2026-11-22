const { notify } = require("./notificationService");

const MATCH_RADIUS_KM = 50;
const MATCH_BATCH_SIZE = 10;

const compatibility = {
  "A+": ["A+", "A-", "O+", "O-"],
  "A-": ["A-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "AB+": [
    "A+", "A-", "B+", "B-",
    "AB+", "AB-", "O+", "O-"
  ],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "O+": ["O+", "O-"],
  "O-": ["O-"]
};

function getCompatibleBloodTypes(recipientType) {
  return compatibility[recipientType] || [];
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (value) => value * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Donors who could answer this request: compatible group, available, past the
// 56-day gap, and not already asked about this same request.
async function findCandidates(db, request, limit = MATCH_BATCH_SIZE) {
  const compatibleTypes = getCompatibleBloodTypes(request.blood_type);

  if (!compatibleTypes.length) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT d.donor_id, d.user_id, d.latitude, d.longitude
     FROM donors d
     WHERE d.blood_type = ANY($1::blood_group[])
       AND d.availability_status = 'available'
       AND (
         d.last_donation_date IS NULL
         OR d.last_donation_date <= CURRENT_DATE - 56
       )
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE m.request_id = $2 AND m.donor_id = d.donor_id
       )`,
    [compatibleTypes, request.request_id]
  );

  let candidates = rows;

  if (request.latitude != null && request.longitude != null) {
    candidates = candidates
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => ({
        ...d,
        distance: distanceKm(
          Number(request.latitude),
          Number(request.longitude),
          Number(d.latitude),
          Number(d.longitude)
        )
      }))
      .filter((d) => d.distance <= MATCH_RADIUS_KM)
      .sort((a, b) => a.distance - b.distance);
  }

  return candidates.slice(0, limit);
}

// Asks up to `limit` more donors and returns how many were asked.
async function matchRequest(db, request, limit = MATCH_BATCH_SIZE) {
  const donors = await findCandidates(db, request, limit);

  for (const donor of donors) {
    await db.query(
      `INSERT INTO matches (request_id, donor_id, status)
       VALUES ($1, $2, 'notified')
       ON CONFLICT (request_id, donor_id) DO NOTHING`,
      [request.request_id, donor.donor_id]
    );

    await notify(
      db,
      donor.user_id,
      `A ${request.blood_type} blood request (${request.urgency}) near ${request.location} matches your blood group. Open DAMU to confirm or decline.`
    );
  }

  return donors.length;
}

module.exports = {
  getCompatibleBloodTypes,
  findCandidates,
  matchRequest,
  distanceKm
};