import { augmentExperimentSimulationPackageWithRq4 } from "../src/experimentSim.js";

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

try {
  const result = await augmentExperimentSimulationPackageWithRq4();

  printSection("Experiment Simulation Package");
  console.log("Workbook:", result.outputWorkbookPath);
  console.log("Report:", result.outputReportPath);
  console.log("Duplicate substantive profiles:", result.duplicateProfiles);

  printSection("RQ1");
  console.log(JSON.stringify(result.baseAnalysis.rq1, null, 2));

  printSection("RQ2 Overall");
  console.log(JSON.stringify(result.baseAnalysis.rq2Multivariate, null, 2));

  printSection("RQ2 Univariate");
  console.table(
    result.baseAnalysis.rq2Univariate.map((item) => ({
      dimension: item.label,
      p: item.pValue,
      eta_p2: item.etaSquaredPartial,
      adjusted_diff: item.adjustedMeanDiff,
    })),
  );

  printSection("RQ3");
  console.log(
    JSON.stringify(
      {
        PU_mean: result.baseAnalysis.rq3.PU_mean,
        PEU_mean: result.baseAnalysis.rq3.PEU_mean,
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
