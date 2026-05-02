import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildExperimentSimulationPackageV2 } from "../src/experimentSim.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const RQ4_SEED_PATH = path.join(ROOT_DIR, "seed", "experiment-rq4.seed.json");

async function writeTeacherRq4Seed(result) {
  const metricTargets = {
    total_time_min: ">= 800",
    total_exercises: ">= 400",
    overall_accuracy: ">= 0.55",
    avg_pL: ">= 0.65",
    mastered_count: ">= 11",
    tutor_queries: ">= 15",
    error_count: ">= 20",
  };
  const payload = {
    summaryRows: result.rq4.summaryMetrics.map((item) => ({
      metric: item.variable,
      mean: item.mean,
      sd: item.sd,
      target: metricTargets[item.variable] || "",
      pass:
        (item.variable === "total_time_min" && item.mean >= 800) ||
        (item.variable === "total_exercises" && item.mean >= 400) ||
        (item.variable === "overall_accuracy" && item.mean >= 0.55) ||
        (item.variable === "avg_pL" && item.mean >= 0.65) ||
        (item.variable === "mastered_count" && item.mean >= 11) ||
        (item.variable === "tutor_queries" && item.mean >= 15) ||
        (item.variable === "error_count" && item.mean >= 20),
    })),
    correlationRows: result.rq4.correlations.map((item) => ({
      variable_x: item.variableX,
      variable_y: item.variableY,
      n: item.n,
      r: item.r,
      p: item.pValue,
      threshold: item.targetLabel,
      pass: item.passes,
    })),
    logicRows: result.rq4.logicChecks.map((item) => ({
      check: item.check,
      variable_x: item.variableX,
      variable_y: item.variableY,
      r: item.r,
      p: item.pValue,
      threshold: item.targetLabel,
      pass: item.passes,
    })),
    regressionRows: [
      {
        block: "block1",
        r_squared: result.rq4.regression.block1.rSquared,
        adjusted_r_squared: result.rq4.regression.block1.adjustedRSquared,
        f_value: result.rq4.regression.block1.fValue,
        model_p: result.rq4.regression.block1.modelP,
      },
      {
        block: "block2",
        r_squared: result.rq4.regression.block2.rSquared,
        adjusted_r_squared: result.rq4.regression.block2.adjustedRSquared,
        f_value: result.rq4.regression.block2.fValue,
        model_p: result.rq4.regression.block2.modelP,
        delta_r_squared: result.rq4.regression.deltaRSquared,
        f_change: result.rq4.regression.fChange,
        p_change: result.rq4.regression.pChange,
      },
      {
        block: "predictor",
        r_squared: "unstandardized_b",
        adjusted_r_squared: "standardized_beta",
        f_value: "standard_error",
        model_p: "t",
        delta_r_squared: "p",
        f_change: "tolerance",
        p_change: "vif",
      },
      ...result.rq4.regression.block2.coefficients.map((item) => ({
        block: item.predictor,
        r_squared: item.unstandardizedB,
        adjusted_r_squared: item.standardizedBeta,
        f_value: item.standardError,
        model_p: item.tValue,
        delta_r_squared: item.pValue,
        f_change: item.tolerance,
        p_change: item.vif,
      })),
    ],
    studentRows: result.scaleScores.filter((row) => row.groupLabel === "experimental" || Number(row.group) === 1),
  };
  payload.summaryRows.push(
    { metric: "low_participation_count", mean: result.rq4.lowParticipationCount, sd: "", target: "<= 15", pass: result.rq4.targets.lowParticipationPass },
    { metric: "significant_pearsons", mean: result.rq4.significantPearsons, sd: "", target: ">= 3", pass: result.rq4.targets.pearsonPass },
    { metric: "strong_predictors", mean: result.rq4.targets.strongPredictorCount, sd: "", target: ">= 2", pass: result.rq4.targets.regressionPass },
    { metric: "overall_pass", mean: result.rq4.pass ? "PASS" : "FAIL", sd: "", target: "", pass: result.rq4.pass },
  );
  await fs.mkdir(path.dirname(RQ4_SEED_PATH), { recursive: true });
  await fs.writeFile(RQ4_SEED_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

try {
  const result = await buildExperimentSimulationPackageV2();
  await writeTeacherRq4Seed(result);

  printSection("Experiment Simulation Package v2");
  console.log("Workbook:", result.outputWorkbookPath);
  console.log("Report:", result.outputReportPath);
  console.log("Teacher RQ4 seed:", RQ4_SEED_PATH);
  console.log("Duplicate substantive profiles:", result.duplicateProfiles);

  printSection("RQ1");
  console.log(JSON.stringify(result.analysis.rq1, null, 2));

  printSection("RQ2 Overall");
  console.log(JSON.stringify(result.analysis.rq2Multivariate, null, 2));

  printSection("RQ2 Univariate");
  console.table(
    result.analysis.rq2Univariate.map((item) => ({
      dimension: item.label,
      p: item.pValue,
      eta_p2: item.etaSquaredPartial,
      adjusted_diff: item.adjustedMeanDiff,
      slope_p: item.slopeHomogeneityP,
    })),
  );

  printSection("RQ3");
  console.log(
    JSON.stringify(
      {
        PU_mean: result.analysis.rq3.PU_mean,
        PEU_mean: result.analysis.rq3.PEU_mean,
      },
      null,
      2,
    ),
  );

  printSection("RQ4 Summary");
  console.table(
    result.rq4.summaryMetrics.map((item) => ({
      variable: item.variable,
      mean: item.mean,
      sd: item.sd,
    })),
  );
  console.log("Low participation count:", result.rq4.lowParticipationCount);
  console.log("Pearson pass count:", result.rq4.significantPearsons);

  printSection("RQ4 Logic Checks");
  console.table(
    result.rq4.logicChecks.map((item) => ({
      check: item.check,
      r: item.r,
      p: item.pValue,
      pass: item.passes,
    })),
  );

  printSection("RQ4 Hierarchical Regression");
  console.log(
    JSON.stringify(
      {
        block1_r2: result.rq4.regression.block1.rSquared,
        block2_r2: result.rq4.regression.block2.rSquared,
        delta_r2: result.rq4.regression.deltaRSquared,
        f_change: result.rq4.regression.fChange,
        p_change: result.rq4.regression.pChange,
      },
      null,
      2,
    ),
  );
  console.table(
    result.rq4.regression.block2.coefficients.map((item) => ({
      predictor: item.predictor,
      beta: item.unstandardizedB,
      std_beta: item.standardizedBeta,
      p: item.pValue,
      vif: item.vif,
    })),
  );

  printSection("Targets");
  console.log(JSON.stringify(result.summary, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
