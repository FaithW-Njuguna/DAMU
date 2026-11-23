require("dotenv").config();

let smsClient;

const smsEnabled = () =>
  process.env.SMS_ENABLED === "true" &&
  !!process.env.AT_API_KEY &&
  !!process.env.AT_USERNAME;

function getClient() {
  if (!smsClient) {
    const AfricasTalking = require("africastalking");

    smsClient = AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    }).SMS;
  }

  return smsClient;
}

async function sendSMS(phoneNumber, message) {
  const options = { to: [phoneNumber], message };

  if (process.env.AT_SENDER_ID) {
    options.from = process.env.AT_SENDER_ID;
  }

  const response = await getClient().send(options);
  const recipient = response?.SMSMessageData?.Recipients?.[0];

  const accepted =
    recipient &&
    (
      [100, 101, 102].includes(Number(recipient.statusCode)) ||
      recipient.status === "Success"
    );

  if (!accepted) {
    throw new Error(
      `SMS not accepted: ${recipient?.status || "no recipient status"}`
    );
  }

  return response;
}

module.exports = sendSMS;
module.exports.smsEnabled = smsEnabled;