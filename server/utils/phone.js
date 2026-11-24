function toInternational(phone) {
  if (typeof phone !== "string") return null;

  const p = phone.replace(/[\s\-()]/g, "");

  if (/^\+\d{9,14}$/.test(p)) return p;
  if (/^254\d{9}$/.test(p)) return "+" + p;
  if (/^0[17]\d{8}$/.test(p)) return "+254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) return "+254" + p;

  return null;
}

function phoneVariants(phone) {
  const raw = typeof phone === "string" ? phone.trim() : "";
  const standard = toInternational(raw);

  return [...new Set([raw, standard].filter(Boolean))];
}

module.exports = {
  toInternational,
  normalizePhone: toInternational,
  phoneVariants
};