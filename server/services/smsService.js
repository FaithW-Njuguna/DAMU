require("dotenv").config();

const AfricasTalking = require("africastalking");

const africasTalking = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const sms = africasTalking.SMS;

async function sendSMS(phoneNumber, message) {
  try {
    const response = await sms.send({
      to: [phoneNumber],
      message
    });

    console.log("SMS response:", response);

    return response;

  } catch (error) {
    console.error("SMS delivery error:", error);
    throw error;
  }
}

module.exports = sendSMS;
