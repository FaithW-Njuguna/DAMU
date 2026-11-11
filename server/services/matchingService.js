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

module.exports = {
  getCompatibleBloodTypes
};
