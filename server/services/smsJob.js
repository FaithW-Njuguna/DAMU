const cron = require("node-cron");
const { flushSms } = require("./notificationService");

function startSmsJob() {
  cron.schedule("*/5 * * * *", () => {
    flushSms().catch((error) =>
      console.error("SMS retry error:", error.message)
    );
  });
}

module.exports = startSmsJob;