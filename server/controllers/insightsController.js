const pool = require("../config/db");
const { getCompatibleBloodTypes } = require("../services/matchingService");

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const WINDOWS = [30, 90, 365];

const round1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);
const round2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100);
const keyed = (rows) => Object.fromEntries(rows.map((r) => [r.blood_type, r]));

const top = (groups, field, direction, size = 3) =>
  groups
    .filter((g) => g[field] != null && g[field] > 0)
    .sort((a, b) => direction * (b[field] - a[field]))
    .slice(0, size)
    .map((g) => g.blood_type);

// Public. Totals by blood group only: no names, phone numbers or locations.
//
//  needed          units requested (cancelled requests left out)
//  hard to find    units requested per compatible donor who is available now
//  collect more    demand a donor group could serve, per available donor of that group
const getBloodGroupInsights = async (req, res) => {
  const requested = Number(req.query.days);
  const days = WINDOWS.includes(requested) ? requested : 90;

  const [demand, speed, donors, alerts] = await Promise.all([
    pool.query(
      `SELECT blood_type::text AS blood_type,
              COUNT(*)::int AS requests,
              COALESCE(SUM(units_required), 0)::int AS units_requested,
              COUNT(*) FILTER (WHERE urgency IN ('urgent', 'critical'))::int AS urgent_requests,
              COUNT(*) FILTER (WHERE status IN ('matched', 'fulfilled'))::int AS filled
       FROM blood_requests
       WHERE created_at >= NOW() - $1::int * INTERVAL '1 day'
         AND status <> 'cancelled'
       GROUP BY blood_type`,
      [days]
    ),
    pool.query(
      `SELECT r.blood_type::text AS blood_type,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (first.at - r.created_at)) / 3600.0
              ) AS median_hours
       FROM blood_requests r
       JOIN (
         SELECT request_id, MIN(response_at) AS at
         FROM matches
         WHERE status = 'confirmed' AND response_at IS NOT NULL
         GROUP BY request_id
       ) first ON first.request_id = r.request_id
       WHERE r.created_at >= NOW() - $1::int * INTERVAL '1 day'
         AND r.status <> 'cancelled'
       GROUP BY r.blood_type`,
      [days]
    ),
    pool.query(
      `SELECT d.blood_type::text AS blood_type,
              COUNT(*)::int AS registered,
              COUNT(*) FILTER (
                WHERE d.availability_status = 'available'
                  AND (d.last_donation_date IS NULL
                       OR d.last_donation_date <= CURRENT_DATE - 56)
              )::int AS available
       FROM donors d
       JOIN users u ON u.user_id = d.user_id
       WHERE u.is_active
       GROUP BY d.blood_type`
    ),
    pool.query(
      `SELECT blood_type::text AS blood_type, COUNT(*)::int AS n
       FROM shortage_alerts
       WHERE created_at >= NOW() - $1::int * INTERVAL '1 day'
       GROUP BY blood_type`,
      [days]
    )
  ]);

  const demandBy = keyed(demand.rows);
  const speedBy = keyed(speed.rows);
  const donorsBy = keyed(donors.rows);
  const alertsBy = keyed(alerts.rows);

  const unitsBy = Object.fromEntries(
    BLOOD_TYPES.map((bt) => [bt, demandBy[bt]?.units_requested || 0])
  );

  const groups = BLOOD_TYPES.map((bt) => {
    const d = demandBy[bt] || {};
    const requests = d.requests || 0;
    const units = d.units_requested || 0;

    // Everyone who could give blood to a patient of this group.
    const compatibleAvailable = getCompatibleBloodTypes(bt).reduce(
      (sum, giver) => sum + (donorsBy[giver]?.available || 0),
      0
    );

    // Patients of these groups could all receive this group's blood.
    const servable = BLOOD_TYPES
      .filter((patient) => getCompatibleBloodTypes(patient).includes(bt))
      .reduce((sum, patient) => sum + unitsBy[patient], 0);

    const available = donorsBy[bt]?.available || 0;

    return {
      blood_type: bt,
      requests,
      units_requested: units,
      urgent_requests: d.urgent_requests || 0,
      filled_rate: requests ? Math.round((d.filled / requests) * 100) : null,
      median_hours_to_confirm: round1(speedBy[bt]?.median_hours),
      donors_registered: donorsBy[bt]?.registered || 0,
      donors_available: available,
      compatible_donors_available: compatibleAvailable,
      difficulty: units ? round2(units / (compatibleAvailable + 1)) : null,
      units_it_could_serve: servable,
      collect_pressure: servable ? round2(servable / (available + 1)) : null,
      alerts_issued: alertsBy[bt]?.n || 0
    };
  });

  const totalRequests = groups.reduce((s, g) => s + g.requests, 0);

  res.json({
    days,
    generated_at: new Date().toISOString(),
    total_requests: totalRequests,
    enough_data: totalRequests >= 10,
    groups,
    most_needed: top(groups, "units_requested", 1),
    hardest_to_find: top(groups, "difficulty", 1),
    collect_more: top(groups, "collect_pressure", 1)
  });
};

module.exports = { getBloodGroupInsights };