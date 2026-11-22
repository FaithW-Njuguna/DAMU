const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUUID = (value) => typeof value === "string" && UUID_RE.test(value);

// Latitude and longitude must arrive together. Both missing is fine.
const parseCoords = (body = {}) => {
  const { latitude, longitude } = body;
  const empty = (v) => v === undefined || v === null || v === "";

  if (empty(latitude) && empty(longitude)) {
    return { latitude: null, longitude: null };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    empty(latitude) || empty(longitude) ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return { error: "Location coordinates are invalid" };
  }

  return { latitude: lat, longitude: lng };
};

module.exports = { isUUID, parseCoords };