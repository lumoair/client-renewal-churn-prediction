import {writeFileSync, mkdirSync} from "fs";
import {stringify} from "csv-stringify/sync";
import {randomInt, randomFloat, randomBool} from "./util.js";

const PLAN_TYPES = ["basic", "pro", "enterprise"];
const INDUSTRIES = ["saas", "fintech", "healthcare", "retail", "manufacturing"];
const REGIONS = ["north_america", "europe", "middle_east", "apac"];

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function buildRow(clientNumber) {
  const today = new Date().toISOString().slice(0, 10);
  const renewalOffset = randomInt(15, 180);
  const renewalDate = new Date();
  renewalDate.setDate(renewalDate.getDate() + renewalOffset);
  const renewalDateStr = renewalDate.toISOString().slice(0, 10);

  const tenure = randomInt(3, 60);
  const arr = randomInt(5_000, 250_000);
  const usageHealth = randomInt(20, 100);
  const relationshipHealth = randomInt(20, 100);
  const adoption = randomInt(10, 100);
  const advancedAdoption = Math.max(0, Math.min(100, adoption - randomInt(-15, 25)));
  const paymentDelay = randomInt(0, 45);
  const escalations = randomInt(0, 5);
  const openCritical = randomInt(0, 3);
  const csmTouchDays = randomInt(2, 90);
  const qbrCompleted = randomBool(0.65);
  const execSponsor = randomBool(0.6);

  const churnSignal =
    0.30 * (1 - usageHealth / 100) +
    0.20 * (1 - relationshipHealth / 100) +
    0.15 * Math.min(paymentDelay / 45, 1) +
    0.15 * Math.min(escalations / 5, 1) +
    0.10 * Math.min(openCritical / 3, 1) +
    0.10 * Math.min(csmTouchDays / 90, 1);

  const churned = churnSignal > 0.48 ? 1 : 0;
  const renewed = 1 - churned;

  return {
    client_id: `C${String(clientNumber).padStart(5, "0")}`,
    as_of_date: today,
    renewal_date: renewalDateStr,
    tenure_months: tenure,
    annual_recurring_revenue: arr,
    plan_type: pick(PLAN_TYPES),
    industry: pick(INDUSTRIES),
    region: pick(REGIONS),
    active_users_30d: randomInt(3, 1000),
    active_users_trend_pct: randomInt(-35, 40),
    core_feature_adoption_pct: adoption,
    advanced_feature_adoption_pct: advancedAdoption,
    logins_per_user_30d: randomFloat(1.0, 28.0),
    onboarding_completed: randomBool(0.8),
    qbr_completed: qbrCompleted,
    last_csm_touch_days: csmTouchDays,
    ticket_count_90d: randomInt(0, 30),
    escalation_count_90d: escalations,
    csat_score: randomFloat(2.0, 5.0),
    open_critical_issues: openCritical,
    payment_delay_days_avg: paymentDelay,
    payment_failures_12m: randomInt(0, 4),
    discount_pct: randomInt(0, 35),
    nps_score: randomInt(-50, 100),
    executive_sponsor_present: execSponsor,
    product_integration_live: randomBool(0.75),
    usage_health_score: usageHealth,
    relationship_health_score: relationshipHealth,
    churned,
    renewed,
  };
}

function main() {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf("--output");
  const output = outputIdx >= 0 ? args[outputIdx + 1] : "data/client_renewal_data.csv";
  const rowsIdx = args.indexOf("--rows");
  const rows = rowsIdx >= 0 ? parseInt(args[rowsIdx + 1], 10) : 500;

  const outputPath = output;
  const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
  if (dir) mkdirSync(dir, {recursive: true});

  const data = Array.from({length: rows}, (_, i) => buildRow(i + 1));
  const csv = stringify(data, {header: true});
  writeFileSync(outputPath, csv);

  console.log(`Wrote ${rows} rows to ${outputPath}`);
}

main();
