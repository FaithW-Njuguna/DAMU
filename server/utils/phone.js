function toInternational(phone) {
  if (typeof phone !== "string") return null;

  const p = phone.replace(/[\s\-()]/g, "");

  if (/^\+\d{9,14}$/.test(p)) return p;
  if (/^254\d{9}$/.test(p)) return "+" + p;
  if (/^0[17]\d{8}$/.test(p)) return "+254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) return "+254" + p;

  return null;
}

module.exports = { toInternational };