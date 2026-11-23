require("dotenv").config();

const app = require("./app");
const startAccountabilityJob = require("./services/accountabilityJob");
const startSmsJob = require("./services/smsJob");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`DAMU API running on port ${PORT}`);

  startAccountabilityJob();
  startSmsJob();
});