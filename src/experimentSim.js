import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import jstatPackage from "jstat";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { Matrix, inverse } from "ml-matrix";

const { jStat } = jstatPackage;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const userHome = process.env.USERPROFILE || "C:\\Users\\Administrator";

export const EXPERIMENT_SIM_CONFIG = {
  formAPath:
    process.env.MTE_FORM_A_PATH ||
    path.join(userHome, "Downloads", "MTE_50_Questions_Exam.xlsx"),
  formBPath:
    process.env.MTE_FORM_B_PATH ||
    path.join(userHome, "Downloads", "MTE_Form_B_Parallel.xlsx"),
  questionnairePath:
    process.env.IMMS_TAM_PATH ||
    path.join(userHome, "Documents", "ai乐理", "IMMS_TAM_Questionnaire_and_SPSS_Criteria.xlsx"),
  outputDir: path.join(repoRoot, "data", "experiment-sim"),
  outputWorkbook: "experiment-sim-package.xlsx",
  outputReport: "experiment-sim-report.docx",
  controlCount: 150,
  experimentalCount: 150,
  maxIterations: 180,
  rq4MaxIterations: 240,
  baseSeed: 20260418,
};

const MTE_DIFFICULTY_THRESHOLD = {
  易: -0.55,
  中: 0.0,
  难: 0.6,
};

const LESSON_DOMAIN = {
  L1: "theory",
  L2: "theory",
  L3: "notation",
  L4: "notation",
  L5: "symbols",
  L6: "symbols",
  L7: "symbols",
  L8: "terms",
  L9: "rhythm",
  L10: "rhythm",
  L11: "rhythm",
  L12: "composite",
};

const CRITERIA_SUMMARY = [
  ["RQ1", "MTE ANCOVA", "Adjusted mean diff > 5, p < .05, .06 <= eta_p^2 < .14"],
  ["RQ2", "IMMS MANCOVA", "Overall p < .05; >=2 dimensions significant with eta_p^2 >= .06; >=1 dimension with .12 <= eta_p^2 < .14"],
  ["RQ3", "TAM t tests", "PU and PEU both p < .05 and Cohen's d >= 0.5"],
  ["RQ4", "Experimental-group deep use", "150 experimental students only; behavior means meet thresholds; >=3 Pearson correlations r >= .30 and p < .05; logical checks pass; hierarchical regression Delta R^2 >= .05 and p < .05"],
];

function normalizeText(value) {
  return String(value ?? "").replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetOutputDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function toSheetRows(sheet) {
  return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values, sample = true) {
  if (values.length < (sample ? 2 : 1)) return 0;
  const avg = mean(values);
  const denominator = sample ? values.length - 1 : values.length;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / denominator;
}

function sd(values, sample = true) {
  return Math.sqrt(variance(values, sample));
}

function covariance(a, b, sample = true) {
  if (a.length !== b.length || a.length < (sample ? 2 : 1)) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  const denominator = sample ? a.length - 1 : a.length;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    sum += (a[index] - meanA) * (b[index] - meanB);
  }
  return sum / denominator;
}

function correlation(a, b) {
  const denom = sd(a) * sd(b);
  return denom ? covariance(a, b) / denom : 0;
}

function skewness(values) {
  const n = values.length;
  if (n < 3) return 0;
  const avg = mean(values);
  const s = sd(values, true);
  if (!s) return 0;
  let sum = 0;
  for (const value of values) {
    sum += ((value - avg) / s) ** 3;
  }
  return (n / ((n - 1) * (n - 2))) * sum;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function matrixFromRows(rows) {
  return new Matrix(rows);
}

function columnVector(values) {
  return Matrix.columnVector(values);
}

function ols(designRows, yValues) {
  const X = matrixFromRows(designRows);
  const y = Array.isArray(yValues[0]) ? matrixFromRows(yValues) : columnVector(yValues);
  const Xt = X.transpose();
  const XtX = Xt.mmul(X);
  const beta = inverse(XtX).mmul(Xt).mmul(y);
  const fitted = X.mmul(beta);
  const residuals = y.clone().sub(fitted);
  const sse = residuals.transpose().mmul(residuals);
  const dfError = X.rows - X.columns;
  return { X, y, beta, fitted, residuals, sse, dfError };
}

function ancovaSingle({
  dependent,
  group,
  covariates,
  covariateNames,
  label,
  interactionCovariateIndex = 0,
}) {
  const centeredCovariates = covariates.map((series) => {
    const avg = mean(series);
    return series.map((value) => value - avg);
  });

  const fullDesign = dependent.map((_, rowIndex) => [
    1,
    group[rowIndex],
    ...centeredCovariates.map((series) => series[rowIndex]),
  ]);
  const reducedDesign = dependent.map((_, rowIndex) => [
    1,
    ...centeredCovariates.map((series) => series[rowIndex]),
  ]);

  const full = ols(fullDesign, dependent);
  const reduced = ols(reducedDesign, dependent);
  const ssEffect = reduced.sse.get(0, 0) - full.sse.get(0, 0);
  const fValue = (ssEffect / 1) / (full.sse.get(0, 0) / full.dfError);
  const pValue = 1 - jStat.centralF.cdf(fValue, 1, full.dfError);
  const etaSquaredPartial = ssEffect / (ssEffect + full.sse.get(0, 0));
  const adjustedMeanDiff = full.beta.get(1, 0);

  const interactionDesign = dependent.map((_, rowIndex) => [
    1,
    group[rowIndex],
    centeredCovariates[interactionCovariateIndex]?.[rowIndex] ?? 0,
    group[rowIndex] * (centeredCovariates[interactionCovariateIndex]?.[rowIndex] ?? 0),
  ]);
  const interactionReducedDesign = dependent.map((_, rowIndex) => [
    1,
    group[rowIndex],
    centeredCovariates[interactionCovariateIndex]?.[rowIndex] ?? 0,
  ]);
  const interactionFull = ols(interactionDesign, dependent);
  const interactionReduced = ols(interactionReducedDesign, dependent);
  const ssInteraction =
    interactionReduced.sse.get(0, 0) - interactionFull.sse.get(0, 0);
  const slopeF = (ssInteraction / 1) / (interactionFull.sse.get(0, 0) / interactionFull.dfError);
  const slopeP = 1 - jStat.centralF.cdf(slopeF, 1, interactionFull.dfError);

  const residualValues = full.residuals.to1DArray();

  return {
    label,
    dependentName: label,
    covariateNames,
    adjustedMeanDiff: roundTo(adjustedMeanDiff, 4),
    fValue: roundTo(fValue, 4),
    pValue: roundTo(pValue, 6),
    etaSquaredPartial: roundTo(etaSquaredPartial, 4),
    dfEffect: 1,
    dfError: full.dfError,
    slopeHomogeneityP: roundTo(slopeP, 6),
    residualSkewness: roundTo(skewness(residualValues), 4),
  };
}

function mancova({
  dependentMatrix,
  group,
  covariateMatrix,
}) {
  const centeredCovariates = covariateMatrix.map((series) => {
    const avg = mean(series);
    return series.map((value) => value - avg);
  });
  const fullDesign = dependentMatrix.map((_, rowIndex) => [
    1,
    group[rowIndex],
    ...centeredCovariates.map((series) => series[rowIndex]),
  ]);
  const reducedDesign = dependentMatrix.map((_, rowIndex) => [
    1,
    ...centeredCovariates.map((series) => series[rowIndex]),
  ]);
  const full = ols(fullDesign, dependentMatrix);
  const reduced = ols(reducedDesign, dependentMatrix);
  const E = full.sse;
  const H = reduced.sse.clone().sub(full.sse);
  const HEInv = inverse(H.clone().add(E));
  const pillai = H.mmul(HEInv).trace();
  const p = dependentMatrix[0].length;
  const v = 1;
  const s = Math.min(p, v);
  const m = (Math.abs(p - v) - 1) / 2;
  const n = (full.dfError - p - 1) / 2;
  const fValue = ((2 * n + s + 1) / (2 * m + s + 1)) * (pillai / (s - pillai));
  const df1 = s * (2 * m + s + 1);
  const df2 = s * (2 * n + s + 1);
  const pValue = 1 - jStat.centralF.cdf(fValue, df1, df2);
  return {
    pillaiTrace: roundTo(pillai, 4),
    fValue: roundTo(fValue, 4),
    df1,
    df2,
    pValue: roundTo(pValue, 6),
  };
}

function leveneTest(values, groups) {
  const uniqueGroups = [...new Set(groups)];
  const groupMeans = new Map(
    uniqueGroups.map((group) => [
      group,
      mean(values.filter((_, index) => groups[index] === group)),
    ]),
  );
  const deviations = values.map((value, index) => Math.abs(value - groupMeans.get(groups[index])));
  const overallMean = mean(deviations);
  const groupStats = uniqueGroups.map((group) => {
    const groupValues = deviations.filter((_, index) => groups[index] === group);
    return {
      group,
      count: groupValues.length,
      mean: mean(groupValues),
      values: groupValues,
    };
  });

  const k = uniqueGroups.length;
  const n = values.length;
  const ssBetween = groupStats.reduce(
    (sum, item) => sum + item.count * (item.mean - overallMean) ** 2,
    0,
  );
  const ssWithin = groupStats.reduce(
    (sum, item) =>
      sum +
      item.values.reduce((groupSum, value) => groupSum + (value - item.mean) ** 2, 0),
    0,
  );
  const df1 = k - 1;
  const df2 = n - k;
  const fValue = (ssBetween / df1) / (ssWithin / df2);
  const pValue = 1 - jStat.centralF.cdf(fValue, df1, df2);

  return {
    fValue: roundTo(fValue, 4),
    df1,
    df2,
    pValue: roundTo(pValue, 6),
  };
}

function independentTTest(values, groups) {
  const sampleA = values.filter((_, index) => groups[index] === 0);
  const sampleB = values.filter((_, index) => groups[index] === 1);
  const meanA = mean(sampleA);
  const meanB = mean(sampleB);
  const sdA = sd(sampleA, true);
  const sdB = sd(sampleB, true);
  const nA = sampleA.length;
  const nB = sampleB.length;
  const levene = leveneTest(values, groups);
  const pooledVariance = (((nA - 1) * sdA ** 2) + ((nB - 1) * sdB ** 2)) / (nA + nB - 2);
  const pooledSd = Math.sqrt((sdA ** 2 + sdB ** 2) / 2);

  const equalT = (meanB - meanA) / Math.sqrt(pooledVariance * (1 / nA + 1 / nB));
  const equalDf = nA + nB - 2;
  const equalP = 2 * (1 - jStat.studentt.cdf(Math.abs(equalT), equalDf));

  const unequalSe = Math.sqrt(sdA ** 2 / nA + sdB ** 2 / nB);
  const unequalT = (meanB - meanA) / unequalSe;
  const unequalDf =
    (sdA ** 2 / nA + sdB ** 2 / nB) ** 2 /
    ((sdA ** 2 / nA) ** 2 / (nA - 1) + (sdB ** 2 / nB) ** 2 / (nB - 1));
  const unequalP = 2 * (1 - jStat.studentt.cdf(Math.abs(unequalT), unequalDf));

  const useWelch = levene.pValue < 0.05;

  return {
    group0Mean: roundTo(meanA, 4),
    group1Mean: roundTo(meanB, 4),
    group0Sd: roundTo(sdA, 4),
    group1Sd: roundTo(sdB, 4),
    levene,
    chosenRow: useWelch ? "welch" : "equal_variance",
    tValue: roundTo(useWelch ? unequalT : equalT, 4),
    df: roundTo(useWelch ? unequalDf : equalDf, 4),
    pValue: roundTo(useWelch ? unequalP : equalP, 6),
    cohensD: roundTo((meanB - meanA) / pooledSd, 4),
  };
}

function cronbachAlpha(itemMatrix) {
  if (!itemMatrix.length || itemMatrix[0].length < 2) return 0;
  const k = itemMatrix[0].length;
  const columns = itemMatrix[0].map((_, columnIndex) => itemMatrix.map((row) => row[columnIndex]));
  const itemVarianceSum = columns.reduce((sum, column) => sum + variance(column, true), 0);
  const totalScores = itemMatrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const totalVariance = variance(totalScores, true);
  if (!totalVariance) return 0;
  return (k / (k - 1)) * (1 - itemVarianceSum / totalVariance);
}

function kr20(itemMatrix) {
  if (!itemMatrix.length || itemMatrix[0].length < 2) return 0;
  const k = itemMatrix[0].length;
  const totalScores = itemMatrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const totalVariance = variance(totalScores, true);
  if (!totalVariance) return 0;
  const pqSum = itemMatrix[0].reduce((sum, _, columnIndex) => {
    const column = itemMatrix.map((row) => row[columnIndex]);
    const p = mean(column);
    return sum + p * (1 - p);
  }, 0);
  return (k / (k - 1)) * (1 - pqSum / totalVariance);
}

function toWorkbookRows(defs, rows) {
  return rows.map((row) => defs.map((key) => row[key]));
}

function safeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readSheetJson(workbook, sheetName, defval = null) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Workbook is missing required sheet: ${sheetName}`);
  }
  return xlsx.utils.sheet_to_json(sheet, { defval });
}

function readSheetAoa(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Workbook is missing required sheet: ${sheetName}`);
  }
  return toSheetRows(sheet);
}

function parseRq1Sheet(rows) {
  const metrics = new Map(rows.map((row) => [row.metric, row.value]));
  return {
    adjustedMeanDiff: safeNumber(metrics.get("adjusted_mean_difference"), 0),
    fValue: safeNumber(metrics.get("F"), 0),
    pValue: safeNumber(metrics.get("p"), 1),
    etaSquaredPartial: safeNumber(metrics.get("partial_eta_squared"), 0),
    dfEffect: safeNumber(metrics.get("df_effect"), 0),
    dfError: safeNumber(metrics.get("df_error"), 0),
  };
}

function parseRq2Sheet(aoa) {
  const overall = {
    pillaiTrace: 0,
    fValue: 0,
    df1: 0,
    df2: 0,
    pValue: 1,
  };
  const univariate = [];
  let inOverall = false;
  let inUnivariate = false;
  for (const row of aoa) {
    const first = normalizeText(row[0]);
    if (first === "overall_metric") {
      inOverall = true;
      inUnivariate = false;
      continue;
    }
    if (first === "dimension") {
      inOverall = false;
      inUnivariate = true;
      continue;
    }
    if (!row.some((cell) => normalizeText(cell))) continue;
    if (inOverall) {
      const value = safeNumber(row[1], row[1]);
      if (first === "Pillai_trace") overall.pillaiTrace = safeNumber(value, 0);
      if (first === "F") overall.fValue = safeNumber(value, 0);
      if (first === "df1") overall.df1 = safeNumber(value, 0);
      if (first === "df2") overall.df2 = safeNumber(value, 0);
      if (first === "p") overall.pValue = safeNumber(value, 1);
    } else if (inUnivariate) {
      univariate.push({
        label: first,
        adjustedMeanDiff: safeNumber(row[1], 0),
        fValue: safeNumber(row[2], 0),
        pValue: safeNumber(row[3], 1),
        etaSquaredPartial: safeNumber(row[4], 0),
        slopeHomogeneityP: safeNumber(row[5], 1),
      });
    }
  }
  return { overall, univariate };
}

function parseRq3Sheet(rows) {
  const result = {};
  for (const row of rows) {
    result[row.variable] = {
      chosenRow: row.chosen_row,
      group0Mean: safeNumber(row.group0_mean, 0),
      group1Mean: safeNumber(row.group1_mean, 0),
      group0Sd: safeNumber(row.group0_sd, 0),
      group1Sd: safeNumber(row.group1_sd, 0),
      levene: { pValue: safeNumber(row.Levene_p, 1) },
      tValue: safeNumber(row.t, 0),
      df: safeNumber(row.df, 0),
      pValue: safeNumber(row.p, 1),
      cohensD: safeNumber(row.Cohens_d, 0),
    };
  }
  return result;
}

function readExistingExperimentSimulationPackage(workbookPath) {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Existing experiment workbook not found: ${workbookPath}`);
  }
  const workbook = xlsx.readFile(workbookPath);
  const rawRows = readSheetJson(workbook, "raw_item_data", null).map((row) => ({ ...row }));
  const scaleRows = readSheetJson(workbook, "scale_scores", null).map((row) => ({ ...row }));
  const rq1Rows = readSheetJson(workbook, "rq1_ancova", null);
  const rq1Aoa = readSheetAoa(workbook, "rq1_ancova");
  const rq2Aoa = readSheetAoa(workbook, "rq2_mancova");
  const rq3Rows = readSheetJson(workbook, "rq3_ttests", null);
  const rq3Aoa = readSheetAoa(workbook, "rq3_ttests");
  const reliabilityRows = readSheetJson(workbook, "reliability", null);
  const reliabilityAoa = readSheetAoa(workbook, "reliability");
  const assumptionRows = readSheetJson(workbook, "assumption_checks", null);
  const codebookRows = readSheetJson(workbook, "codebook", null);
  const criteriaAoa = readSheetAoa(workbook, "criteria");

  return {
    workbookPath,
    workbook,
    rawRows,
    scaleRows,
    rq1Rows,
    rq1Aoa,
    rq2Aoa,
    rq3Rows,
    rq3Aoa,
    reliabilityRows,
    reliabilityAoa,
    assumptionRows,
    codebookRows,
    criteriaAoa,
    analysis: {
      rq1: parseRq1Sheet(rq1Rows),
      rq2Multivariate: parseRq2Sheet(rq2Aoa).overall,
      rq2Univariate: parseRq2Sheet(rq2Aoa).univariate,
      rq3: parseRq3Sheet(rq3Rows),
    },
  };
}

function pearsonTest(a, b, labelX, labelY) {
  const n = a.length;
  const r = correlation(a, b);
  const safeR = clamp(r, -0.999999, 0.999999);
  const tValue = safeR * Math.sqrt((n - 2) / (1 - safeR ** 2));
  const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tValue), n - 2));
  return {
    labelX,
    labelY,
    n,
    r: roundTo(r, 4),
    tValue: roundTo(tValue, 4),
    pValue: roundTo(pValue, 6),
  };
}

function olsDetailed(designRows, yValues) {
  const X = matrixFromRows(designRows);
  const y = columnVector(yValues);
  const Xt = X.transpose();
  const XtX = Xt.mmul(X);
  const XtXinv = inverse(XtX);
  const beta = XtXinv.mmul(Xt).mmul(y);
  const fitted = X.mmul(beta);
  const residuals = y.clone().sub(fitted);
  const sse = residuals.transpose().mmul(residuals).get(0, 0);
  const yMean = mean(yValues);
  const tss = yValues.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const rSquared = tss ? 1 - sse / tss : 0;
  const predictorCount = X.columns - 1;
  const dfError = X.rows - X.columns;
  const adjustedRSquared =
    dfError > 0 ? 1 - (1 - rSquared) * ((X.rows - 1) / dfError) : rSquared;
  const mse = dfError > 0 ? sse / dfError : 0;
  const standardErrors = [];
  for (let index = 0; index < XtXinv.rows; index += 1) {
    standardErrors.push(Math.sqrt(Math.max(0, mse * XtXinv.get(index, index))));
  }
  const betaValues = beta.to1DArray();
  const tValues = betaValues.map((value, index) =>
    standardErrors[index] ? value / standardErrors[index] : 0,
  );
  const pValues = tValues.map((value) =>
    roundTo(2 * (1 - jStat.studentt.cdf(Math.abs(value), dfError)), 6),
  );
  const fValue =
    predictorCount > 0 && dfError > 0
      ? (rSquared / predictorCount) / ((1 - rSquared) / dfError)
      : 0;
  const modelPValue =
    predictorCount > 0 && dfError > 0
      ? roundTo(1 - jStat.centralF.cdf(fValue, predictorCount, dfError), 6)
      : 1;
  return {
    betaValues,
    standardErrors,
    tValues: tValues.map((value) => roundTo(value, 4)),
    pValues,
    sse,
    tss,
    rSquared: roundTo(rSquared, 4),
    adjustedRSquared: roundTo(adjustedRSquared, 4),
    predictorCount,
    dfError,
    mse,
    fValue: roundTo(fValue, 4),
    modelPValue,
  };
}

function regressionAnalysis(rows, dependentKey, predictorKeys) {
  const y = rows.map((row) => safeNumber(row[dependentKey], 0));
  const predictors = predictorKeys.map((key) => rows.map((row) => safeNumber(row[key], 0)));
  const design = y.map((_, index) => [
    1,
    ...predictors.map((series) => series[index]),
  ]);
  const fit = olsDetailed(design, y);
  const ySd = sd(y);

  const coefficients = predictorKeys.map((predictorKey, predictorIndex) => {
    const column = predictors[predictorIndex];
    const columnSd = sd(column);
    const betaIndex = predictorIndex + 1;
    const standardizedBeta =
      ySd && columnSd
        ? (fit.betaValues[betaIndex] * columnSd) / ySd
        : 0;

    const otherPredictors = predictorKeys.filter((_, index) => index !== predictorIndex);
    let tolerance = 1;
    let vif = 1;
    if (otherPredictors.length) {
      const predictorRows = rows.map((row) => {
        const values = [1];
        for (const key of otherPredictors) {
          values.push(safeNumber(row[key], 0));
        }
        return values;
      });
      const predictorFit = olsDetailed(predictorRows, column);
      tolerance = clamp(1 - predictorFit.rSquared, 0.000001, 1);
      vif = 1 / tolerance;
    }

    return {
      predictor: predictorKey,
      unstandardizedB: roundTo(fit.betaValues[betaIndex], 4),
      standardizedBeta: roundTo(standardizedBeta, 4),
      standardError: roundTo(fit.standardErrors[betaIndex], 4),
      tValue: fit.tValues[betaIndex],
      pValue: fit.pValues[betaIndex],
      tolerance: roundTo(tolerance, 4),
      vif: roundTo(vif, 4),
    };
  });

  return {
    dependentKey,
    predictorKeys,
    predictorCount: predictorKeys.length,
    intercept: roundTo(fit.betaValues[0], 4),
    interceptPValue: fit.pValues[0],
    rSquared: fit.rSquared,
    adjustedRSquared: fit.adjustedRSquared,
    fValue: fit.fValue,
    modelPValue: fit.modelPValue,
    sse: fit.sse,
    dfError: fit.dfError,
    coefficients,
  };
}

function hierarchicalRegression(rows) {
  const dependentKey = "post_MTE_formB";
  const block1Predictors = ["pre_MTE_formA"];
  const block2Predictors = [
    "pre_MTE_formA",
    "total_time_min",
    "overall_accuracy",
    "avg_pL",
    "mastered_count",
    "tutor_queries",
    "error_count",
  ];
  const block1 = regressionAnalysis(rows, dependentKey, block1Predictors);
  const block2 = regressionAnalysis(rows, dependentKey, block2Predictors);
  const dfChange = block2.predictorCount - block1.predictorCount;
  const ssChange = block1.sse - block2.sse;
  const fChange =
    dfChange > 0 && block2.dfError > 0
      ? (ssChange / dfChange) / (block2.sse / block2.dfError)
      : 0;
  const pChange =
    dfChange > 0 && block2.dfError > 0
      ? roundTo(1 - jStat.centralF.cdf(fChange, dfChange, block2.dfError), 6)
      : 1;

  return {
    dependentKey,
    block1,
    block2,
    deltaRSquared: roundTo(block2.rSquared - block1.rSquared, 4),
    fChange: roundTo(fChange, 4),
    pChange,
  };
}

function experimentalBehaviorColumns() {
  return [
    "total_time_min",
    "total_exercises",
    "overall_accuracy",
    "avg_pL",
    "mastered_count",
    "tutor_queries",
    "error_count",
  ];
}

function buildRq4ParamCandidate(iteration, baseSeed = EXPERIMENT_SIM_CONFIG.baseSeed) {
  const rng = mulberry32(baseSeed + 7001 + iteration * 313);
  const between = (min, max) => min + (max - min) * rng();
  return {
    engagementPostWeight: between(0.08, 0.28),
    engagementPreWeight: between(0.04, 0.14),
    engagementNoise: between(0.78, 1.0),
    selfPostWeight: between(0.04, 0.16),
    selfPreWeight: between(0.12, 0.24),
    selfNoise: between(0.65, 0.85),
    skillPostWeight: between(0.44, 0.58),
    skillPreWeight: between(0.05, 0.14),
    skillNoise: between(0.45, 0.65),
    progressResidualWeight: between(0.68, 0.84),
    progressSkillWeight: between(0.22, 0.36),
    progressNoise: between(0.36, 0.54),
    helpResidualWeight: between(0.32, 0.48),
    helpEngagementWeight: between(0.12, 0.24),
    helpNoise: between(0.58, 0.8),
    timeBase: between(960, 1030),
    timeEngagementWeight: between(125, 170),
    timeSelfWeight: between(50, 80),
    timeNoise: between(90, 120),
    exerciseBase: between(305, 335),
    exerciseTimeWeight: between(0.115, 0.14),
    exerciseSelfWeight: between(8, 16),
    exerciseSkillWeight: between(5, 10),
    exerciseProgressWeight: between(4, 9),
    exerciseNoise: between(26, 34),
    accuracyBase: between(0.535, 0.565),
    accuracySkillWeight: between(0.038, 0.055),
    accuracyProgressWeight: between(0.048, 0.065),
    accuracyExerciseWeight: between(0.00004, 0.00007),
    accuracyNoise: between(0.024, 0.036),
    masteredBase: between(12.8, 14.0),
    masteredProgressWeight: between(2.4, 3.2),
    masteredAccuracyWeight: between(5.2, 7.4),
    masteredNoise: between(1.1, 1.5),
    pLBase: between(0.42, 0.48),
    pLAccuracyWeight: between(0.29, 0.34),
    pLMasteredWeight: between(0.013, 0.018),
    pLSkillWeight: between(0, 0.01),
    pLNoise: between(0.018, 0.028),
    tutorBase: between(14.8, 16.8),
    tutorHelpWeight: between(2.1, 2.8),
    tutorTimeWeight: between(0.0014, 0.0023),
    tutorProgressWeight: between(0.25, 0.45),
    tutorNoise: between(1.8, 2.5),
    errorBase: between(6, 10),
    errorExerciseWeight: between(0.058, 0.073),
    errorAccuracyWeight: between(24, 34),
    errorNoise: between(4, 5.6),
  };
}

function simulateExperimentalBehavior(scaleRows, params) {
  const experimentalRows = scaleRows.filter((row) => safeNumber(row.group, 0) === 1);
  const preScores = experimentalRows.map((row) => safeNumber(row.pre_MTE_formA, 0));
  const postScores = experimentalRows.map((row) => safeNumber(row.post_MTE_formB, 0));
  const preMean = mean(preScores);
  const preSd = sd(preScores) || 1;
  const postMean = mean(postScores);
  const postSd = sd(postScores) || 1;
  const prePostCorrelation = correlation(preScores, postScores);
  const residualScale = Math.sqrt(Math.max(0.0001, 1 - prePostCorrelation ** 2));

  const behaviorRows = [];
  for (const row of experimentalRows) {
    const preZ = (safeNumber(row.pre_MTE_formA, 0) - preMean) / preSd;
    const postZ = (safeNumber(row.post_MTE_formB, 0) - postMean) / postSd;
    const postResidualZ = (postZ - prePostCorrelation * preZ) / residualScale;
    const seed = hashString(`${row.studentId}-${params.timeBase}`);
    const rng = mulberry32(seed);

    const engagement =
      params.engagementPostWeight * postZ +
      params.engagementPreWeight * preZ +
      randomNormal(rng) * params.engagementNoise;
    const selfRegulation =
      params.selfPostWeight * postZ +
      params.selfPreWeight * preZ +
      randomNormal(rng) * params.selfNoise;
    const skill =
      params.skillPostWeight * postZ +
      params.skillPreWeight * preZ +
      randomNormal(rng) * params.skillNoise;
    const progress =
      params.progressResidualWeight * postResidualZ +
      params.progressSkillWeight * skill +
      randomNormal(rng) * params.progressNoise;
    const helpSeeking =
      params.helpResidualWeight * postResidualZ +
      params.helpEngagementWeight * engagement +
      randomNormal(rng) * params.helpNoise;

    const totalTimeMin = Math.round(
      clamp(
        params.timeBase +
          params.timeEngagementWeight * engagement +
          params.timeSelfWeight * selfRegulation +
          randomNormal(rng) * params.timeNoise,
        420,
        1800,
      ),
    );
    const totalExercises = Math.round(
      clamp(
        params.exerciseBase +
          params.exerciseTimeWeight * totalTimeMin +
          params.exerciseSelfWeight * selfRegulation +
          params.exerciseSkillWeight * skill +
          params.exerciseProgressWeight * progress +
          randomNormal(rng) * params.exerciseNoise,
        220,
        900,
      ),
    );
    const overallAccuracy = roundTo(
      clamp(
        params.accuracyBase +
          params.accuracySkillWeight * skill +
          params.accuracyProgressWeight * progress +
          params.accuracyExerciseWeight * totalExercises +
          randomNormal(rng) * params.accuracyNoise,
        0.35,
        0.92,
      ),
      3,
    );
    const masteredCount = Math.round(
      clamp(
        params.masteredBase +
          params.masteredProgressWeight * progress +
          params.masteredAccuracyWeight * (overallAccuracy - 0.55) +
          randomNormal(rng) * params.masteredNoise,
        4,
        24,
      ),
    );
    const avgPL = roundTo(
      clamp(
        params.pLBase +
          params.pLAccuracyWeight * overallAccuracy +
          params.pLMasteredWeight * masteredCount +
          params.pLSkillWeight * skill +
          randomNormal(rng) * params.pLNoise,
        0.35,
        0.96,
      ),
      3,
    );
    const tutorQueries = Math.round(
      clamp(
        params.tutorBase +
          params.tutorHelpWeight * helpSeeking +
          params.tutorTimeWeight * totalTimeMin +
          params.tutorProgressWeight * progress +
          randomNormal(rng) * params.tutorNoise,
        4,
        45,
      ),
    );
    const errorCount = Math.round(
      clamp(
        params.errorBase +
          params.errorExerciseWeight * totalExercises +
          params.errorAccuracyWeight * (0.72 - overallAccuracy) +
          randomNormal(rng) * params.errorNoise,
        5,
        90,
      ),
    );

    behaviorRows.push({
      studentId: row.studentId,
      total_time_min: totalTimeMin,
      total_exercises: totalExercises,
      overall_accuracy: overallAccuracy,
      avg_pL: avgPL,
      mastered_count: masteredCount,
      tutor_queries: tutorQueries,
      error_count: errorCount,
    });
  }
  return behaviorRows;
}

function buildRq4Analysis(scaleRowsWithBehavior) {
  const experimentalRows = scaleRowsWithBehavior.filter(
    (row) => safeNumber(row.group, 0) === 1 && safeNumber(row.total_time_min, null) !== null,
  );
  const behaviorKeys = experimentalBehaviorColumns();
  const behaviorLabels = {
    total_time_min: "total_time_min",
    total_exercises: "total_exercises",
    overall_accuracy: "overall_accuracy",
    avg_pL: "avg_pL",
    mastered_count: "mastered_count",
    tutor_queries: "tutor_queries",
    error_count: "error_count",
  };
  const postScores = experimentalRows.map((row) => safeNumber(row.post_MTE_formB, 0));
  const correlations = behaviorKeys.map((key) =>
    pearsonTest(
      postScores,
      experimentalRows.map((row) => safeNumber(row[key], 0)),
      "post_MTE_formB",
      behaviorLabels[key],
    ),
  );
  const logicChecks = [
    {
      check: "time_vs_exercises",
      threshold: "r >= .60",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.total_time_min, 0)),
        experimentalRows.map((row) => safeNumber(row.total_exercises, 0)),
        "total_time_min",
        "total_exercises",
      ),
    },
    {
      check: "exercises_vs_accuracy",
      threshold: "r >= .20",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.total_exercises, 0)),
        experimentalRows.map((row) => safeNumber(row.overall_accuracy, 0)),
        "total_exercises",
        "overall_accuracy",
      ),
    },
    {
      check: "accuracy_vs_avg_pL",
      threshold: "r >= .50",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.overall_accuracy, 0)),
        experimentalRows.map((row) => safeNumber(row.avg_pL, 0)),
        "overall_accuracy",
        "avg_pL",
      ),
    },
    {
      check: "avg_pL_vs_mastered_count",
      threshold: "r >= .70",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.avg_pL, 0)),
        experimentalRows.map((row) => safeNumber(row.mastered_count, 0)),
        "avg_pL",
        "mastered_count",
      ),
    },
    {
      check: "avg_pL_vs_post_MTE_formB",
      threshold: "r >= .40",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.avg_pL, 0)),
        experimentalRows.map((row) => safeNumber(row.post_MTE_formB, 0)),
        "avg_pL",
        "post_MTE_formB",
      ),
    },
  ].map((item) => ({
    ...item,
    passes:
      (item.check === "time_vs_exercises" && item.r >= 0.6) ||
      (item.check === "exercises_vs_accuracy" && item.r >= 0.2) ||
      (item.check === "accuracy_vs_avg_pL" && item.r >= 0.5) ||
      (item.check === "avg_pL_vs_mastered_count" && item.r >= 0.7) ||
      (item.check === "avg_pL_vs_post_MTE_formB" && item.r >= 0.4),
  }));

  const summaryMetrics = behaviorKeys.map((key) => {
    const values = experimentalRows.map((row) => safeNumber(row[key], 0));
    return {
      variable: key,
      mean: roundTo(mean(values), 4),
      sd: roundTo(sd(values), 4),
    };
  });
  const lowParticipationCount = experimentalRows.filter(
    (row) => safeNumber(row.total_time_min, 0) < 600,
  ).length;
  const significantPearsons = correlations.filter(
    (item) => item.r >= 0.3 && item.pValue < 0.05,
  ).length;
  const regression = hierarchicalRegression(experimentalRows);

  const means = Object.fromEntries(summaryMetrics.map((item) => [item.variable, item.mean]));
  const targets = {
    meansPass:
      means.total_time_min >= 900 &&
      means.total_exercises >= 400 &&
      means.overall_accuracy >= 0.55 &&
      means.avg_pL >= 0.65 &&
      means.mastered_count >= 13 &&
      means.tutor_queries >= 15 &&
      means.error_count >= 20,
    lowParticipationPass: lowParticipationCount <= 15,
    pearsonPass: significantPearsons >= 3,
    logicPass: logicChecks.every((item) => item.passes),
    regressionPass: regression.deltaRSquared >= 0.05 && regression.pChange < 0.05,
  };

  return {
    experimentalCount: experimentalRows.length,
    summaryMetrics,
    lowParticipationCount,
    significantPearsons,
    correlations,
    logicChecks,
    regression,
    targets,
    pass:
      targets.meansPass &&
      targets.lowParticipationPass &&
      targets.pearsonPass &&
      targets.logicPass &&
      targets.regressionPass,
  };
}

function countDuplicateBehaviorProfiles(rows) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const signature = JSON.stringify(experimentalBehaviorColumns().map((key) => row[key]));
    if (seen.has(signature)) {
      duplicates += 1;
    } else {
      seen.add(signature);
    }
  }
  return duplicates;
}

function rq4TargetPenalty(rq4) {
  const metrics = Object.fromEntries(rq4.summaryMetrics.map((item) => [item.variable, item]));
  let penalty = 0;
  const meanThresholds = {
    total_time_min: 900,
    total_exercises: 400,
    overall_accuracy: 0.55,
    avg_pL: 0.65,
    mastered_count: 13,
    tutor_queries: 15,
    error_count: 20,
  };
  for (const [key, threshold] of Object.entries(meanThresholds)) {
    const diff = threshold - (metrics[key]?.mean ?? 0);
    if (diff > 0) {
      penalty += diff * (key.includes("accuracy") || key.includes("pL") ? 800 : 20);
    }
  }
  if (rq4.lowParticipationCount > 15) {
    penalty += (rq4.lowParticipationCount - 15) * 200;
  }
  if (rq4.significantPearsons < 3) {
    penalty += (3 - rq4.significantPearsons) * 400;
  }
  for (const check of rq4.logicChecks) {
    if (!check.passes) {
      const target =
        check.check === "time_vs_exercises"
          ? 0.6
          : check.check === "exercises_vs_accuracy"
            ? 0.2
            : check.check === "accuracy_vs_avg_pL"
              ? 0.5
              : check.check === "avg_pL_vs_mastered_count"
                ? 0.7
                : 0.4;
      penalty += (target - check.r) * 1000;
    }
  }
  const regression = rq4.regression;
  if (regression.deltaRSquared < 0.05) {
    penalty += (0.05 - regression.deltaRSquared) * 5000;
  }
  if (regression.pChange >= 0.05) {
    penalty += (regression.pChange - 0.05) * 5000 + 500;
  }
  const coefficientMap = new Map(
    regression.block2.coefficients.map((item) => [item.predictor, item]),
  );
  const coefficientRules = [
    ["pre_MTE_formA", "positive_sig"],
    ["mastered_count", "positive_sig"],
    ["overall_accuracy", "positive_sig"],
    ["tutor_queries", "positive_sig"],
    ["total_time_min", "non_sig"],
    ["avg_pL", "non_sig"],
    ["error_count", "non_sig"],
  ];
  for (const [predictor, rule] of coefficientRules) {
    const coefficient = coefficientMap.get(predictor);
    if (!coefficient) {
      penalty += 1000;
      continue;
    }
    if (rule === "positive_sig") {
      if (coefficient.standardizedBeta <= 0) penalty += 1200;
      if (coefficient.pValue >= 0.05) penalty += 800;
    } else if (rule === "non_sig") {
      if (coefficient.pValue < 0.05) penalty += 800;
    }
  }
  return penalty;
}

function buildRq4BehaviorDataset(scaleRows, config) {
  let best = null;
  for (let iteration = 0; iteration < config.rq4MaxIterations; iteration += 1) {
    const params = buildRq4ParamCandidate(iteration, config.baseSeed);
    const behaviorRows = simulateExperimentalBehavior(scaleRows, params);
    const duplicateProfiles = countDuplicateBehaviorProfiles(behaviorRows);
    const behaviorById = new Map(behaviorRows.map((row) => [row.studentId, row]));
    const mergedScaleRows = scaleRows.map((row) => {
      const behavior = behaviorById.get(row.studentId);
      return {
        ...row,
        total_time_min: behavior ? behavior.total_time_min : null,
        total_exercises: behavior ? behavior.total_exercises : null,
        overall_accuracy: behavior ? behavior.overall_accuracy : null,
        avg_pL: behavior ? behavior.avg_pL : null,
        mastered_count: behavior ? behavior.mastered_count : null,
        tutor_queries: behavior ? behavior.tutor_queries : null,
        error_count: behavior ? behavior.error_count : null,
      };
    });
    const analysis = buildRq4Analysis(mergedScaleRows);
    const candidate = {
      params,
      behaviorRows,
      mergedScaleRows,
      analysis,
      duplicateProfiles,
      penalty: rq4TargetPenalty(analysis) + duplicateProfiles * 1000,
    };
    if (!best || candidate.penalty < best.penalty) {
      best = candidate;
    }
    if (analysis.pass && duplicateProfiles === 0) {
      best = candidate;
      break;
    }
  }
  if (!best) {
    throw new Error("Failed to build any RQ4 behavior simulation candidate.");
  }
  return best;
}

function buildMergedRawRowsWithRq4(rawRows, behaviorRows) {
  const behaviorById = new Map(behaviorRows.map((row) => [row.studentId, row]));
  return rawRows.map((row) => {
    const behavior = behaviorById.get(row.studentId);
    return {
      ...row,
      total_time_min: behavior ? behavior.total_time_min : null,
      total_exercises: behavior ? behavior.total_exercises : null,
      overall_accuracy: behavior ? behavior.overall_accuracy : null,
      avg_pL: behavior ? behavior.avg_pL : null,
      mastered_count: behavior ? behavior.mastered_count : null,
      tutor_queries: behavior ? behavior.tutor_queries : null,
      error_count: behavior ? behavior.error_count : null,
    };
  });
}

function buildUpdatedCodebook(existingCodebookRows) {
  const nextRows = [...existingCodebookRows];
  const existing = new Set(existingCodebookRows.map((row) => normalizeText(row.variable)));
  const additions = [
    ["total_time_min", "RQ4 behavior", "deep_use_time", "minutes", "No", "Total deep-use time in minutes for experimental-group students only"],
    ["total_exercises", "RQ4 behavior", "deep_use_exercises", "count", "No", "Total completed exercises for experimental-group students only"],
    ["overall_accuracy", "RQ4 behavior", "deep_use_accuracy", "0-1 proportion", "No", "Overall accuracy rate for experimental-group students only"],
    ["avg_pL", "RQ4 behavior", "deep_use_bkt", "0-1 proportion", "No", "Average knowledge mastery probability across 24 points for experimental-group students only"],
    ["mastered_count", "RQ4 behavior", "deep_use_mastered", "count", "No", "Number of mastered knowledge points out of 24 for experimental-group students only"],
    ["tutor_queries", "RQ4 behavior", "deep_use_tutor", "count", "No", "Number of AI tutor queries for experimental-group students only"],
    ["error_count", "RQ4 behavior", "deep_use_errors", "count", "No", "Number of incorrect items for experimental-group students only"],
  ];
  for (const [variable, source, role, scale, reverse, description] of additions) {
    if (!existing.has(variable)) {
      nextRows.push({ variable, source, role, scale, reverse, description });
    }
  }
  return nextRows;
}

function buildUpdatedCriteriaAoa(existingCriteriaAoa) {
  const detailAnchor = existingCriteriaAoa.findIndex(
    (row) => normalizeText(row[0]) === "SPSS Analysis — What to Test & What Results Mean 'Valid'",
  );
  const detailRows =
    detailAnchor >= 0 ? existingCriteriaAoa.slice(detailAnchor) : [];
  return [
    ...CRITERIA_SUMMARY,
    [],
    ...detailRows,
    [],
    ["RQ4 Variables", "Meaning", "Target", "Computation", "Pass If"],
    ["total_time_min", "Deep-use time", ">= 900", "Experimental group mean", "mean >= 900"],
    ["total_exercises", "Exercises completed", ">= 400", "Experimental group mean", "mean >= 400"],
    ["overall_accuracy", "Accuracy", ">= 0.55", "Experimental group mean", "mean >= 0.55"],
    ["avg_pL", "Average mastery probability", ">= 0.65", "Experimental group mean", "mean >= 0.65"],
    ["mastered_count", "Mastered knowledge points", ">= 13", "Experimental group mean", "mean >= 13"],
    ["tutor_queries", "Tutor usage count", ">= 15", "Experimental group mean", "mean >= 15"],
    ["error_count", "Incorrect item count", ">= 20", "Experimental group mean", "mean >= 20"],
    ["low_participation", "time < 600", "<= 15 students", "Experimental group count", "count <= 15"],
    ["Pearson with post_MTE_formB", ">= 3 variables", "r >= .30 and p < .05", "Experimental group only", "count >= 3"],
    ["Hierarchical regression", "Delta R^2", ">= .05 and p < .05", "Block2 over Block1", "both satisfied"],
  ];
}

function buildUpdatedAssumptionRows(existingAssumptionRows, rq4Analysis, duplicateProfiles) {
  return [
    ...existingAssumptionRows,
    {
      analysis: "RQ4 Deep Use",
      check: "Experimental-group sample size",
      value: rq4Analysis.experimentalCount,
      rule: "n = 150",
    },
    {
      analysis: "RQ4 Deep Use",
      check: "Low participation count (time < 600)",
      value: rq4Analysis.lowParticipationCount,
      rule: "<= 15",
    },
    {
      analysis: "RQ4 Hierarchical Regression",
      check: "Delta R squared",
      value: rq4Analysis.regression.deltaRSquared,
      rule: ">= .05",
    },
    {
      analysis: "RQ4 Hierarchical Regression",
      check: "F change p",
      value: rq4Analysis.regression.pChange,
      rule: "p < .05",
    },
    {
      analysis: "RQ4 Hierarchical Regression",
      check: "Maximum VIF",
      value: roundTo(
        Math.max(...rq4Analysis.regression.block2.coefficients.map((item) => item.vif)),
        4,
      ),
      rule: "< 10 preferred",
    },
    {
      analysis: "RQ4 Deep Use",
      check: "Duplicate experimental behavior profiles",
      value: duplicateProfiles,
      rule: "0 preferred",
    },
  ];
}

function buildRq4Workbook(workbookPath, basePackage, rawRows, scaleRows, rq4Result) {
  const workbook = xlsx.utils.book_new();
  const append = (name, rows) => {
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, sheet, name);
  };

  const rawHeaders = Object.keys(rawRows[0]);
  const scaleHeaders = Object.keys(scaleRows[0]);
  append("raw_item_data", [rawHeaders, ...toWorkbookRows(rawHeaders, rawRows)]);
  append("scale_scores", [scaleHeaders, ...toWorkbookRows(scaleHeaders, scaleRows)]);
  append("rq1_ancova", basePackage.rq1Aoa);
  append("rq2_mancova", basePackage.rq2Aoa);
  append("rq3_ttests", basePackage.rq3Aoa);
  append("reliability", basePackage.reliabilityAoa);
  append("assumption_checks", [
    ["analysis", "check", "value", "rule"],
    ...buildUpdatedAssumptionRows(
      basePackage.assumptionRows,
      rq4Result.analysis,
      rq4Result.duplicateProfiles,
    ).map((row) => [row.analysis, row.check, row.value, row.rule]),
  ]);
  append("rq4_summary", [
    ["metric", "mean", "sd", "target", "pass"],
    ...rq4Result.analysis.summaryMetrics.map((item) => [
      item.variable,
      item.mean,
      item.sd,
      item.variable === "total_time_min"
        ? ">= 900"
        : item.variable === "total_exercises"
          ? ">= 400"
          : item.variable === "overall_accuracy"
            ? ">= 0.55"
            : item.variable === "avg_pL"
              ? ">= 0.65"
              : item.variable === "mastered_count"
                ? ">= 13"
                : item.variable === "tutor_queries"
                  ? ">= 15"
                  : ">= 20",
      item.variable === "total_time_min"
        ? item.mean >= 900
        : item.variable === "total_exercises"
          ? item.mean >= 400
          : item.variable === "overall_accuracy"
            ? item.mean >= 0.55
            : item.variable === "avg_pL"
              ? item.mean >= 0.65
              : item.variable === "mastered_count"
                ? item.mean >= 13
                : item.variable === "tutor_queries"
                  ? item.mean >= 15
                  : item.mean >= 20,
    ]),
    [],
    ["low_participation_count", rq4Result.analysis.lowParticipationCount, "", "<= 15", rq4Result.analysis.lowParticipationCount <= 15],
    ["significant_pearsons", rq4Result.analysis.significantPearsons, "", ">= 3", rq4Result.analysis.significantPearsons >= 3],
    ["overall_pass", rq4Result.analysis.pass ? "PASS" : "NOT FULLY PASS", "", "", rq4Result.analysis.pass],
  ]);
  append("rq4_correlations", [
    ["variable_x", "variable_y", "n", "r", "t", "p", "threshold", "pass"],
    ...rq4Result.analysis.correlations.map((item) => [
      item.labelX,
      item.labelY,
      item.n,
      item.r,
      item.tValue,
      item.pValue,
      "r >= .30 and p < .05",
      item.r >= 0.3 && item.pValue < 0.05,
    ]),
  ]);
  append("rq4_logic_checks", [
    ["check", "variable_x", "variable_y", "r", "p", "threshold", "pass"],
    ...rq4Result.analysis.logicChecks.map((item) => [
      item.check,
      item.labelX,
      item.labelY,
      item.r,
      item.pValue,
      item.threshold,
      item.passes,
    ]),
  ]);
  append("rq4_hierarchical_regression", [
    ["block", "r_squared", "adjusted_r_squared", "f_value", "model_p", "delta_r_squared", "f_change", "p_change"],
    [
      "block1",
      rq4Result.analysis.regression.block1.rSquared,
      rq4Result.analysis.regression.block1.adjustedRSquared,
      rq4Result.analysis.regression.block1.fValue,
      rq4Result.analysis.regression.block1.modelPValue,
      "",
      "",
      "",
    ],
    [
      "block2",
      rq4Result.analysis.regression.block2.rSquared,
      rq4Result.analysis.regression.block2.adjustedRSquared,
      rq4Result.analysis.regression.block2.fValue,
      rq4Result.analysis.regression.block2.modelPValue,
      rq4Result.analysis.regression.deltaRSquared,
      rq4Result.analysis.regression.fChange,
      rq4Result.analysis.regression.pChange,
    ],
    [],
    ["predictor", "unstandardized_b", "standardized_beta", "standard_error", "t", "p", "tolerance", "vif"],
    ...rq4Result.analysis.regression.block2.coefficients.map((item) => [
      item.predictor,
      item.unstandardizedB,
      item.standardizedBeta,
      item.standardError,
      item.tValue,
      item.pValue,
      item.tolerance,
      item.vif,
    ]),
  ]);
  append("codebook", [
    ["variable", "source", "role", "scale", "reverse", "description"],
    ...buildUpdatedCodebook(basePackage.codebookRows).map((item) => [
      item.variable,
      item.source,
      item.role,
      item.scale,
      item.reverse,
      item.description,
    ]),
  ]);
  append("criteria", buildUpdatedCriteriaAoa(basePackage.criteriaAoa));

  xlsx.writeFile(workbook, workbookPath, { bookType: "xlsx", compression: true });
}

function parseWorkbookTableRows(aoa, startLabel) {
  const startIndex = aoa.findIndex((row) => normalizeText(row[0]) === startLabel);
  return startIndex >= 0 ? aoa.slice(startIndex) : [];
}

async function buildRq4Report(basePackage, rq4Result, outputPath) {
  const reliabilityRows = basePackage.reliabilityRows;
  const assumptionRows = buildUpdatedAssumptionRows(
    basePackage.assumptionRows,
    rq4Result.analysis,
    rq4Result.duplicateProfiles,
  );
  const rq1 = basePackage.analysis.rq1;
  const rq2Overall = basePackage.analysis.rq2Multivariate;
  const rq2Univariate = basePackage.analysis.rq2Univariate;
  const rq3 = basePackage.analysis.rq3;
  const rq4 = rq4Result.analysis;

  const doc = new Document({
    sections: [
      {
        children: [
          paragraph("300 人虚拟实验数据整合报告", { heading: HeadingLevel.TITLE }),
          paragraph("本报告在既有 300 人实验包基础上，为 150 名实验组学生并入 RQ4 深度使用行为变量，并保持对照组对应变量为空值。"),
          paragraph("样本结构", { heading: HeadingLevel.HEADING_1 }),
          paragraph("总样本 300 人：150 名对照组，150 名实验组。RQ4 的相关、逻辑一致性与层级回归仅基于实验组 150 人。"),
          paragraph("数据来源", { heading: HeadingLevel.HEADING_1 }),
          paragraph(`前测 MTE：${EXPERIMENT_SIM_CONFIG.formAPath}`),
          paragraph(`后测 MTE Form B：${EXPERIMENT_SIM_CONFIG.formBPath}`),
          paragraph(`IMMS / TAM：${EXPERIMENT_SIM_CONFIG.questionnairePath}`),
          paragraph("信度结果", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Measure", "Metric", "Value"],
            reliabilityRows.map((item) => [item.measure, item.metric, item.value]),
          ),
          paragraph("前置假设检验", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Analysis", "Check", "Value", "Rule"],
            assumptionRows.map((item) => [item.analysis, item.check, item.value, item.rule]),
          ),
          paragraph("RQ1 · MTE 学习成绩", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Metric", "Value"],
            [
              ["Adjusted mean difference", rq1.adjustedMeanDiff],
              ["F", rq1.fValue],
              ["p", rq1.pValue],
              ["Partial eta squared", rq1.etaSquaredPartial],
            ],
          ),
          paragraph("RQ2 · IMMS 学习动机", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Overall metric", "Value"],
            [
              ["Pillai's Trace", rq2Overall.pillaiTrace],
              ["F", rq2Overall.fValue],
              ["p", rq2Overall.pValue],
            ],
          ),
          simpleTable(
            ["Dimension", "Adj. diff", "F", "p", "Partial eta squared"],
            rq2Univariate.map((item) => [
              item.label,
              item.adjustedMeanDiff,
              item.fValue,
              item.pValue,
              item.etaSquaredPartial,
            ]),
          ),
          paragraph("RQ3 · TAM 技术接受度", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Variable", "Chosen row", "t", "df", "p", "Cohen's d"],
            [
              ["PU_mean", rq3.PU_mean.chosenRow, rq3.PU_mean.tValue, rq3.PU_mean.df, rq3.PU_mean.pValue, rq3.PU_mean.cohensD],
              ["PEU_mean", rq3.PEU_mean.chosenRow, rq3.PEU_mean.tValue, rq3.PEU_mean.df, rq3.PEU_mean.pValue, rq3.PEU_mean.cohensD],
            ],
          ),
          paragraph("RQ4 · 深度使用与学习表现", { heading: HeadingLevel.HEADING_1 }),
          paragraph("样本说明：仅实验组 150 人参与 RQ4 分析；对照组行为变量在总表中保留为空。"),
          simpleTable(
            ["Metric", "Mean", "SD", "Target"],
            rq4.summaryMetrics.map((item) => [
              item.variable,
              item.mean,
              item.sd,
              item.variable === "total_time_min"
                ? ">= 900"
                : item.variable === "total_exercises"
                  ? ">= 400"
                  : item.variable === "overall_accuracy"
                    ? ">= 0.55"
                    : item.variable === "avg_pL"
                      ? ">= 0.65"
                      : item.variable === "mastered_count"
                        ? ">= 13"
                        : item.variable === "tutor_queries"
                          ? ">= 15"
                          : ">= 20",
            ]),
          ),
          paragraph(`低参与学生（time < 600）人数：${rq4.lowParticipationCount}`),
          paragraph(`与 post_MTE_formB 显著相关且 r >= .30 的行为变量数量：${rq4.significantPearsons}`),
          paragraph("RQ4 Pearson 相关", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Variable", "r", "p", "Threshold", "Pass"],
            rq4.correlations.map((item) => [
              item.labelY,
              item.r,
              item.pValue,
              "r >= .30 and p < .05",
              item.r >= 0.3 && item.pValue < 0.05 ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 逻辑一致性检查", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Check", "r", "p", "Threshold", "Pass"],
            rq4.logicChecks.map((item) => [
              item.check,
              item.r,
              item.pValue,
              item.threshold,
              item.passes ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 层级回归", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Block", "R²", "Adjusted R²", "ΔR²", "F change", "p change"],
            [
              [
                "Block 1",
                rq4.regression.block1.rSquared,
                rq4.regression.block1.adjustedRSquared,
                "",
                "",
                "",
              ],
              [
                "Block 2",
                rq4.regression.block2.rSquared,
                rq4.regression.block2.adjustedRSquared,
                rq4.regression.deltaRSquared,
                rq4.regression.fChange,
                rq4.regression.pChange,
              ],
            ],
          ),
          simpleTable(
            ["Predictor", "Beta", "Std. Beta", "t", "p", "Tolerance", "VIF"],
            rq4.regression.block2.coefficients.map((item) => [
              item.predictor,
              item.unstandardizedB,
              item.standardizedBeta,
              item.tValue,
              item.pValue,
              item.tolerance,
              item.vif,
            ]),
          ),
          paragraph("最终判定", { heading: HeadingLevel.HEADING_1 }),
          paragraph(`RQ1: ${rq1.adjustedMeanDiff > 5 && rq1.pValue < 0.05 && rq1.etaSquaredPartial >= 0.06 && rq1.etaSquaredPartial < 0.14 ? "达标" : "未完全达标"}`),
          paragraph(`RQ2: ${rq2Overall.pValue < 0.05 && rq2Univariate.filter((item) => item.pValue < 0.05 && item.etaSquaredPartial >= 0.06).length >= 2 && rq2Univariate.some((item) => item.etaSquaredPartial >= 0.12 && item.etaSquaredPartial < 0.14) ? "达标" : "未完全达标"}`),
          paragraph(`RQ3: ${["PU_mean", "PEU_mean"].every((key) => rq3[key].pValue < 0.05 && rq3[key].cohensD >= 0.5) ? "达标" : "未完全达标"}`),
          paragraph(`RQ4: ${rq4.pass ? "达标" : "未完全达标"}`),
          paragraph("Excel 工作表说明", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Sheet", "Purpose"],
            [
              ["raw_item_data", "300 行题项级原始数据，实验组附加 RQ4 行为列"],
              ["scale_scores", "MTE、IMMS、TAM 聚合得分，并附加 RQ4 行为列"],
              ["rq1_ancova", "RQ1 ANCOVA 结果"],
              ["rq2_mancova", "RQ2 MANCOVA 与单变量 ANCOVA 结果"],
              ["rq3_ttests", "RQ3 的 Levene 与 t 检验结果"],
              ["rq4_summary", "实验组 150 人 RQ4 描述统计与低参与人数"],
              ["rq4_correlations", "实验组 150 人 RQ4 Pearson 相关结果"],
              ["rq4_logic_checks", "RQ4 逻辑一致性检查"],
              ["rq4_hierarchical_regression", "RQ4 Block 1 / Block 2 层级回归结果"],
              ["reliability", "MTE KR-20 与 IMMS/TAM alpha"],
              ["assumption_checks", "前置假设检验与 RQ4 辅助说明"],
              ["codebook", "变量字典"],
              ["criteria", "判定标准与 RQ4 目标摘要"],
            ],
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

function parseMteWorkbook(filePath, formPrefix, preferredSheetName) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = preferredSheetName || workbook.SheetNames[0];
  const rows = toSheetRows(workbook.Sheets[sheetName]);
  const items = [];
  for (const row of rows) {
    if (!Number.isFinite(Number(row[0]))) continue;
    const itemNumber = Number(row[0]);
    const lessonId = normalizeText(row[1]);
    const knowledgePointTitle = normalizeText(row[2]);
    const prompt = normalizeText(row[3]);
    const options = [normalizeText(row[4]), normalizeText(row[5]), normalizeText(row[6]), normalizeText(row[7])];
    const answer = normalizeText(row[8]).toUpperCase();
    const difficultyLabel = normalizeText(row[9]);
    const answerIndex = "ABCD".indexOf(answer);
    if (!lessonId || !prompt || answerIndex < 0) continue;
    items.push({
      itemId: `${formPrefix}_Q${String(itemNumber).padStart(2, "0")}`,
      form: formPrefix,
      itemNumber,
      lessonId,
      knowledgePointTitle,
      prompt,
      options,
      answer,
      answerIndex,
      difficultyLabel,
      threshold: MTE_DIFFICULTY_THRESHOLD[difficultyLabel] ?? 0,
    });
  }
  if (items.length !== 50) {
    throw new Error(`${formPrefix} item count is ${items.length}, expected 50.`);
  }
  return {
    filePath,
    workbook,
    sheetName,
    items,
  };
}

function parseImmsTamWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath);
  const immsRows = toSheetRows(workbook.Sheets["IMMS 36 Items"]);
  const tamRows = toSheetRows(workbook.Sheets["TAM 13 Items"]);
  const criteriaRows = toSheetRows(workbook.Sheets["SPSS Validity Criteria"]);

  const parseScaleRows = (rows) => {
    const items = [];
    for (const row of rows) {
      if (!Number.isFinite(Number(row[0]))) continue;
      const variable = normalizeText(row[5]);
      const dimension = normalizeText(row[1]).toLowerCase();
      if (!variable || !dimension) continue;
      items.push({
        itemNumber: Number(row[0]),
        dimension,
        englishText: normalizeText(row[2]),
        chineseText: normalizeText(row[3]),
        reverse: normalizeText(row[4]).toLowerCase().includes("yes"),
        variable,
      });
    }
    return items;
  };

  const immsItems = parseScaleRows(immsRows).map((item) => ({
    ...item,
    dimensionKey: item.dimension,
  }));
  const tamItems = parseScaleRows(tamRows).map((item) => ({
    ...item,
    dimensionKey: item.dimension,
  }));

  return {
    filePath,
    workbook,
    immsItems,
    tamItems,
    criteriaRows,
  };
}

function buildBaseStudents(config) {
  const students = [];
  const total = config.controlCount + config.experimentalCount;
  for (let index = 0; index < total; index += 1) {
    const rng = mulberry32(config.baseSeed + index * 97);
    const group = index < config.controlCount ? 0 : 1;
    const groupLabel = group === 0 ? "control" : "experimental";
    const general = randomNormal(rng);
    const theory = 0.65 * general + randomNormal(rng) * 0.65;
    const notation = 0.7 * general + randomNormal(rng) * 0.65;
    const symbols = 0.6 * general + randomNormal(rng) * 0.7;
    const terms = 0.55 * general + randomNormal(rng) * 0.75;
    const rhythm = 0.72 * general + randomNormal(rng) * 0.65;
    const composite = mean([theory, notation, symbols, terms, rhythm]) + randomNormal(rng) * 0.25;
    const motivation = 0.35 * general + randomNormal(rng) * 0.8;
    const tech = 0.25 * general + randomNormal(rng) * 0.75;
    students.push({
      studentId: `${group === 0 ? "CTRL" : "EXP"}${String(group === 0 ? index + 1 : index - config.controlCount + 1).padStart(3, "0")}`,
      group,
      groupLabel,
      seed: config.baseSeed + index * 97,
      traits: { general, theory, notation, symbols, terms, rhythm, composite, motivation, tech },
    });
  }
  return students;
}

function lessonAbility(student, lessonId) {
  const domain = LESSON_DOMAIN[lessonId] || "theory";
  return student.traits[domain];
}

function itemBias(itemId, scale = 0.16) {
  const rng = mulberry32(hashString(itemId));
  return (rng() * 2 - 1) * scale;
}

function simulateMteResponses(formItems, students, params, formType) {
  const rows = [];
  const scoreRows = [];
  for (const student of students) {
    const rng = mulberry32(student.seed + (formType === "pre" ? 11 : 23));
    const itemRow = {};
    let totalCorrect = 0;
    for (const item of formItems) {
      const baseAbility = lessonAbility(student, item.lessonId);
      const lessonComplexityBoost =
        student.group === 1 && formType === "post"
          ? (params.lessonBoost[item.lessonId] || 0)
          : 0;
      const gain =
        formType === "pre"
          ? params.preMteShift
          : params.controlMteGain + (student.group === 1 ? params.experimentalMteBoost : 0) + lessonComplexityBoost;
      const ability = baseAbility + gain + randomNormal(rng) * params.mteLatentNoise;
      const linear =
        params.mteSlope * (ability - item.threshold + itemBias(item.itemId, 0.12)) +
        randomNormal(rng) * params.mteProbabilityNoise;
      const probability = clamp(sigmoid(linear), 0.02, 0.98);
      const correct = rng() < probability ? 1 : 0;
      itemRow[item.itemId] = correct;
      totalCorrect += correct;
    }
    rows.push({
      studentId: student.studentId,
      group: student.group,
      groupLabel: student.groupLabel,
      ...itemRow,
    });
    scoreRows.push({
      studentId: student.studentId,
      group: student.group,
      totalBinary: totalCorrect,
      totalScore: totalCorrect * 2,
    });
  }
  return { rows, scoreRows };
}

function simulateImmsTAM(questionnaire, students, params) {
  const immsByDimension = {
    attention: questionnaire.immsItems.filter((item) => item.dimensionKey === "attention"),
    relevance: questionnaire.immsItems.filter((item) => item.dimensionKey === "relevance"),
    confidence: questionnaire.immsItems.filter((item) => item.dimensionKey === "confidence"),
    satisfaction: questionnaire.immsItems.filter((item) => item.dimensionKey === "satisfaction"),
  };
  const tamByDimension = {
    pu: questionnaire.tamItems.filter((item) => item.dimensionKey === "pu"),
    peu: questionnaire.tamItems.filter((item) => item.dimensionKey === "peu"),
  };

  const rawRows = [];
  const scaleRows = [];

  for (const student of students) {
    const rng = mulberry32(student.seed + 131);
    const preLatent = {
      attention: clamp(3.0 + 0.35 * student.traits.motivation + 0.18 * student.traits.terms + randomNormal(rng) * 0.5, 1.2, 4.8),
      relevance: clamp(3.05 + 0.3 * student.traits.motivation + 0.15 * student.traits.theory + randomNormal(rng) * 0.45, 1.2, 4.8),
      confidence: clamp(2.95 + 0.32 * student.traits.motivation + 0.2 * student.traits.general + randomNormal(rng) * 0.48, 1.2, 4.8),
      satisfaction: clamp(3.0 + 0.28 * student.traits.motivation + 0.12 * student.traits.tech + randomNormal(rng) * 0.5, 1.2, 4.8),
    };

    const postLatent = {
      attention: clamp(
        0.72 * preLatent.attention +
          params.immsIntercept.attention +
          params.immsControlGain.attention +
          (student.group === 1 ? params.immsExperimentalBoost.attention : 0) +
          randomNormal(rng) *
            (params.immsPostNoise.attention +
              (student.group === 1 ? params.immsExperimentalExtraNoise.attention : 0)),
        1,
        5,
      ),
      relevance: clamp(
        0.72 * preLatent.relevance +
          params.immsIntercept.relevance +
          params.immsControlGain.relevance +
          (student.group === 1 ? params.immsExperimentalBoost.relevance : 0) +
          randomNormal(rng) *
            (params.immsPostNoise.relevance +
              (student.group === 1 ? params.immsExperimentalExtraNoise.relevance : 0)),
        1,
        5,
      ),
      confidence: clamp(
        0.7 * preLatent.confidence +
          params.immsIntercept.confidence +
          params.immsControlGain.confidence +
          (student.group === 1 ? params.immsExperimentalBoost.confidence : 0) +
          randomNormal(rng) *
            (params.immsPostNoise.confidence +
              (student.group === 1 ? params.immsExperimentalExtraNoise.confidence : 0)),
        1,
        5,
      ),
      satisfaction: clamp(
        0.71 * preLatent.satisfaction +
          params.immsIntercept.satisfaction +
          params.immsControlGain.satisfaction +
          (student.group === 1 ? params.immsExperimentalBoost.satisfaction : 0) +
          randomNormal(rng) *
            (params.immsPostNoise.satisfaction +
              (student.group === 1 ? params.immsExperimentalExtraNoise.satisfaction : 0)),
        1,
        5,
      ),
    };

    const preCorrected = {};
    const postCorrected = {};
    const rawRow = {
      studentId: student.studentId,
      group: student.group,
      groupLabel: student.groupLabel,
    };

    for (const [dimensionKey, items] of Object.entries(immsByDimension)) {
      for (const item of items) {
        const bias = itemBias(item.variable, 0.22);
        const preDirect = clamp(preLatent[dimensionKey] + bias + randomNormal(rng) * params.immsItemNoise, 1, 5);
        const postDirect = clamp(postLatent[dimensionKey] + bias + randomNormal(rng) * params.immsItemNoise, 1, 5);
        const preObserved = clamp(Math.round(item.reverse ? 6 - preDirect : preDirect), 1, 5);
        const postObserved = clamp(Math.round(item.reverse ? 6 - postDirect : postDirect), 1, 5);
        rawRow[`PRE_${item.variable}`] = preObserved;
        rawRow[`POST_${item.variable}`] = postObserved;
        preCorrected[item.variable] = item.reverse ? 6 - preObserved : preObserved;
        postCorrected[item.variable] = item.reverse ? 6 - postObserved : postObserved;
      }
    }

    const tamLatent = {
      pu: clamp(
        3.05 +
          0.22 * student.traits.tech +
          0.18 * (postLatent.confidence - 3) +
          0.12 * (postLatent.attention - 3) +
          params.tamControlGain.pu +
          (student.group === 1 ? params.tamExperimentalBoost.pu : 0) +
          randomNormal(rng) * params.tamLatentNoise.pu,
        1,
        5,
      ),
      peu: clamp(
        3.1 +
          0.28 * student.traits.tech +
          0.1 * (postLatent.satisfaction - 3) +
          params.tamControlGain.peu +
          (student.group === 1 ? params.tamExperimentalBoost.peu : 0) +
          randomNormal(rng) * params.tamLatentNoise.peu,
        1,
        5,
      ),
    };

    const tamObserved = {};
    for (const [dimensionKey, items] of Object.entries(tamByDimension)) {
      for (const item of items) {
        const bias = itemBias(item.variable, 0.18);
        const observed = clamp(
          Math.round(clamp(tamLatent[dimensionKey] + bias + randomNormal(rng) * params.tamItemNoise, 1, 5)),
          1,
          5,
        );
        rawRow[`POST_${item.variable}`] = observed;
        tamObserved[item.variable] = observed;
      }
    }

    const scaleRow = {
      studentId: student.studentId,
      group: student.group,
      groupLabel: student.groupLabel,
      pre_attention: mean(immsByDimension.attention.map((item) => preCorrected[item.variable])),
      pre_relevance: mean(immsByDimension.relevance.map((item) => preCorrected[item.variable])),
      pre_confidence: mean(immsByDimension.confidence.map((item) => preCorrected[item.variable])),
      pre_satisfaction: mean(immsByDimension.satisfaction.map((item) => preCorrected[item.variable])),
      post_attention: mean(immsByDimension.attention.map((item) => postCorrected[item.variable])),
      post_relevance: mean(immsByDimension.relevance.map((item) => postCorrected[item.variable])),
      post_confidence: mean(immsByDimension.confidence.map((item) => postCorrected[item.variable])),
      post_satisfaction: mean(immsByDimension.satisfaction.map((item) => postCorrected[item.variable])),
      pre_imms_total: mean(Object.values(preCorrected)),
      post_imms_total: mean(Object.values(postCorrected)),
      PU_mean: mean(tamByDimension.pu.map((item) => tamObserved[item.variable])),
      PEU_mean: mean(tamByDimension.peu.map((item) => tamObserved[item.variable])),
    };

    rawRows.push(rawRow);
    scaleRows.push(scaleRow);
  }

  return { rawRows, scaleRows, immsByDimension, tamByDimension };
}

function mergeRawRows(baseRows, additions) {
  const byId = new Map(baseRows.map((row) => [row.studentId, { ...row }]));
  for (const row of additions) {
    const current = byId.get(row.studentId) || {};
    byId.set(row.studentId, { ...current, ...row });
  }
  return [...byId.values()];
}

function buildCodebook(formA, formB, questionnaire) {
  const rows = [
    {
      variable: "student_id",
      source: "system",
      role: "identifier",
      scale: "string",
      reverse: "No",
      description: "Unique student identifier",
    },
    {
      variable: "group",
      source: "system",
      role: "group",
      scale: "0=control,1=experimental",
      reverse: "No",
      description: "Experimental condition code",
    },
    {
      variable: "group_label",
      source: "system",
      role: "group",
      scale: "string",
      reverse: "No",
      description: "Experimental condition label",
    },
  ];

  for (const item of formA.items) {
    rows.push({
      variable: item.itemId,
      source: "MTE Form A",
      role: "pretest item",
      scale: "0/1",
      reverse: "No",
      description: `${item.lessonId} | ${item.knowledgePointTitle}`,
    });
  }
  for (const item of formB.items) {
    rows.push({
      variable: item.itemId,
      source: "MTE Form B",
      role: "posttest item",
      scale: "0/1",
      reverse: "No",
      description: `${item.lessonId} | ${item.knowledgePointTitle}`,
    });
  }
  for (const item of questionnaire.immsItems) {
    rows.push({
      variable: `PRE_${item.variable}`,
      source: "IMMS",
      role: `pre_${item.dimensionKey}`,
      scale: "1-5",
      reverse: item.reverse ? "Yes" : "No",
      description: item.chineseText || item.englishText,
    });
    rows.push({
      variable: `POST_${item.variable}`,
      source: "IMMS",
      role: `post_${item.dimensionKey}`,
      scale: "1-5",
      reverse: item.reverse ? "Yes" : "No",
      description: item.chineseText || item.englishText,
    });
  }
  for (const item of questionnaire.tamItems) {
    rows.push({
      variable: `POST_${item.variable}`,
      source: "TAM",
      role: `post_${item.dimensionKey}`,
      scale: "1-5",
      reverse: "No",
      description: item.chineseText || item.englishText,
    });
  }
  return rows;
}

function computeReliability(formA, formB, rawRows, questionnaire) {
  const formAMatrix = rawRows.map((row) => formA.items.map((item) => row[item.itemId]));
  const formBMatrix = rawRows.map((row) => formB.items.map((item) => row[item.itemId]));
  const immsPreMatrix = rawRows.map((row) =>
    questionnaire.immsItems.map((item) => {
      const value = row[`PRE_${item.variable}`];
      return item.reverse ? 6 - value : value;
    }),
  );
  const immsPostMatrix = rawRows.map((row) =>
    questionnaire.immsItems.map((item) => {
      const value = row[`POST_${item.variable}`];
      return item.reverse ? 6 - value : value;
    }),
  );

  const subscaleAlpha = (dimensionKey, phase) => {
    const items = questionnaire.immsItems.filter((item) => item.dimensionKey === dimensionKey);
    const matrix = rawRows.map((row) =>
      items.map((item) => {
        const value = row[`${phase}_${item.variable}`];
        return item.reverse ? 6 - value : value;
      }),
    );
    return cronbachAlpha(matrix);
  };

  const tamAlpha = (dimensionKey) => {
    const items = questionnaire.tamItems.filter((item) => item.dimensionKey === dimensionKey);
    const matrix = rawRows.map((row) => items.map((item) => row[`POST_${item.variable}`]));
    return cronbachAlpha(matrix);
  };

  return [
    { measure: "MTE Form A", metric: "KR-20", value: roundTo(kr20(formAMatrix), 4) },
    { measure: "MTE Form B", metric: "KR-20", value: roundTo(kr20(formBMatrix), 4) },
    { measure: "IMMS Pre", metric: "Cronbach alpha", value: roundTo(cronbachAlpha(immsPreMatrix), 4) },
    { measure: "IMMS Post", metric: "Cronbach alpha", value: roundTo(cronbachAlpha(immsPostMatrix), 4) },
    { measure: "IMMS Attention Post", metric: "Cronbach alpha", value: roundTo(subscaleAlpha("attention", "POST"), 4) },
    { measure: "IMMS Relevance Post", metric: "Cronbach alpha", value: roundTo(subscaleAlpha("relevance", "POST"), 4) },
    { measure: "IMMS Confidence Post", metric: "Cronbach alpha", value: roundTo(subscaleAlpha("confidence", "POST"), 4) },
    { measure: "IMMS Satisfaction Post", metric: "Cronbach alpha", value: roundTo(subscaleAlpha("satisfaction", "POST"), 4) },
    { measure: "TAM PU", metric: "Cronbach alpha", value: roundTo(tamAlpha("pu"), 4) },
    { measure: "TAM PEU", metric: "Cronbach alpha", value: roundTo(tamAlpha("peu"), 4) },
  ];
}

function checkDuplicateProfiles(rawRows) {
  const signatures = new Map();
  let duplicates = 0;
  for (const row of rawRows) {
    const clone = { ...row };
    delete clone.studentId;
    delete clone.group;
    delete clone.groupLabel;
    const signature = JSON.stringify(clone);
    if (signatures.has(signature)) {
      duplicates += 1;
    } else {
      signatures.set(signature, row.studentId);
    }
  }
  return duplicates;
}

function buildDerivedScaleRows(mtePreScores, mtePostScores, motivationRows) {
  const byId = new Map();
  for (const row of mtePreScores) {
    byId.set(row.studentId, {
      studentId: row.studentId,
      group: row.group,
      groupLabel: row.group === 0 ? "control" : "experimental",
      pre_MTE_formA: row.totalScore,
    });
  }
  for (const row of mtePostScores) {
    const current = byId.get(row.studentId) || {
      studentId: row.studentId,
      group: row.group,
      groupLabel: row.group === 0 ? "control" : "experimental",
    };
    current.post_MTE_formB = row.totalScore;
    byId.set(row.studentId, current);
  }
  for (const row of motivationRows) {
    const current = byId.get(row.studentId) || {
      studentId: row.studentId,
      group: row.group,
      groupLabel: row.groupLabel,
    };
    Object.assign(current, row);
    byId.set(row.studentId, current);
  }
  return [...byId.values()].sort((a, b) => a.studentId.localeCompare(b.studentId));
}

function buildAnalysis(scaleRows) {
  const group = scaleRows.map((row) => row.group);
  const preMte = scaleRows.map((row) => row.pre_MTE_formA);
  const postMte = scaleRows.map((row) => row.post_MTE_formB);
  const rq1 = ancovaSingle({
    dependent: postMte,
    group,
    covariates: [preMte],
    covariateNames: ["pre_MTE_formA"],
    label: "post_MTE_formB",
    interactionCovariateIndex: 0,
  });

  const covariateMatrix = [
    scaleRows.map((row) => row.pre_attention),
    scaleRows.map((row) => row.pre_relevance),
    scaleRows.map((row) => row.pre_confidence),
    scaleRows.map((row) => row.pre_satisfaction),
  ];
  const dependentMatrix = scaleRows.map((row) => [
    row.post_attention,
    row.post_relevance,
    row.post_confidence,
    row.post_satisfaction,
  ]);
  const rq2Multivariate = mancova({
    dependentMatrix,
    group,
    covariateMatrix,
  });
  const rq2Univariate = [
    ancovaSingle({
      dependent: scaleRows.map((row) => row.post_attention),
      group,
      covariates: covariateMatrix,
      covariateNames: ["pre_attention", "pre_relevance", "pre_confidence", "pre_satisfaction"],
      label: "post_attention",
      interactionCovariateIndex: 0,
    }),
    ancovaSingle({
      dependent: scaleRows.map((row) => row.post_relevance),
      group,
      covariates: covariateMatrix,
      covariateNames: ["pre_attention", "pre_relevance", "pre_confidence", "pre_satisfaction"],
      label: "post_relevance",
      interactionCovariateIndex: 1,
    }),
    ancovaSingle({
      dependent: scaleRows.map((row) => row.post_confidence),
      group,
      covariates: covariateMatrix,
      covariateNames: ["pre_attention", "pre_relevance", "pre_confidence", "pre_satisfaction"],
      label: "post_confidence",
      interactionCovariateIndex: 2,
    }),
    ancovaSingle({
      dependent: scaleRows.map((row) => row.post_satisfaction),
      group,
      covariates: covariateMatrix,
      covariateNames: ["pre_attention", "pre_relevance", "pre_confidence", "pre_satisfaction"],
      label: "post_satisfaction",
      interactionCovariateIndex: 3,
    }),
  ];

  const rq3Pu = independentTTest(
    scaleRows.map((row) => row.PU_mean),
    group,
  );
  const rq3Peu = independentTTest(
    scaleRows.map((row) => row.PEU_mean),
    group,
  );

  return {
    rq1,
    rq2Multivariate,
    rq2Univariate,
    rq3: {
      PU_mean: rq3Pu,
      PEU_mean: rq3Peu,
    },
  };
}

function buildAssumptionChecks(scaleRows, analysis) {
  const group = scaleRows.map((row) => row.group);
  return [
    {
      analysis: "RQ1 ANCOVA",
      check: "Levene on post_MTE_formB",
      value: roundTo(leveneTest(scaleRows.map((row) => row.post_MTE_formB), group).pValue, 6),
      rule: "p > .05 preferred",
    },
    {
      analysis: "RQ1 ANCOVA",
      check: "Homogeneity of regression slopes",
      value: analysis.rq1.slopeHomogeneityP,
      rule: "p > .05",
    },
    ...analysis.rq2Univariate.flatMap((item) => [
      {
        analysis: item.label,
        check: `Levene on ${item.label}`,
        value: roundTo(
          leveneTest(scaleRows.map((row) => row[item.label]), group).pValue,
          6,
        ),
        rule: "p > .05 preferred",
      },
      {
        analysis: item.label,
        check: "Homogeneity of regression slopes",
        value: item.slopeHomogeneityP,
        rule: "p > .05",
      },
    ]),
    {
      analysis: "Normality note",
      check: "Large-sample robustness",
      value: "N=150 per group; parametric tests treated as robust under moderate non-normality",
      rule: "Documented",
    },
  ];
}

function targetScore(result) {
  let penalty = 0;
  const { rq1, rq2Multivariate, rq2Univariate, rq3 } = result.analysis;
  const diffGap = Math.max(0, 5.0001 - rq1.adjustedMeanDiff);
  penalty += diffGap * 200;
  penalty += rq1.pValue >= 0.05 ? 200 : 0;
  penalty += rq1.etaSquaredPartial < 0.06 ? (0.06 - rq1.etaSquaredPartial) * 500 : 0;
  penalty += rq1.etaSquaredPartial >= 0.14 ? (rq1.etaSquaredPartial - 0.1399) * 500 : 0;

  penalty += rq2Multivariate.pValue >= 0.05 ? 200 : 0;
  const sigDims = rq2Univariate.filter((item) => item.pValue < 0.05 && item.etaSquaredPartial >= 0.06);
  penalty += sigDims.length >= 2 ? 0 : (2 - sigDims.length) * 120;
  const strongDimCount = rq2Univariate.filter(
    (item) => item.etaSquaredPartial >= 0.12 && item.etaSquaredPartial < 0.14,
  ).length;
  penalty += strongDimCount >= 1 ? 0 : 120;
  for (const item of rq2Univariate) {
    penalty += item.slopeHomogeneityP < 0.05 ? (0.05 - item.slopeHomogeneityP) * 2000 : 0;
    if (item.etaSquaredPartial >= 0.14) {
      penalty += (item.etaSquaredPartial - 0.1399) * 300;
    }
  }
  penalty += rq1.slopeHomogeneityP < 0.05 ? (0.05 - rq1.slopeHomogeneityP) * 2000 : 0;
  for (const check of result.assumptionChecks) {
    if (typeof check.value === "number" && check.check.startsWith("Levene") && check.value < 0.05) {
      penalty += (0.05 - check.value) * 5000;
    }
  }

  for (const key of ["PU_mean", "PEU_mean"]) {
    penalty += rq3[key].pValue >= 0.05 ? 150 : 0;
    penalty += rq3[key].cohensD < 0.5 ? (0.5 - rq3[key].cohensD) * 250 : 0;
  }

  penalty += result.duplicateProfiles > 0 ? result.duplicateProfiles * 1000 : 0;
  return penalty;
}

function buildParamCandidate(iteration) {
  const rng = mulberry32(EXPERIMENT_SIM_CONFIG.baseSeed + iteration * 991);
  const between = (min, max) => min + (max - min) * rng();
  return {
    preMteShift: between(-0.08, 0.08),
    controlMteGain: between(0.08, 0.16),
    experimentalMteBoost: between(0.16, 0.25),
    mteSlope: between(0.92, 1.2),
    mteLatentNoise: between(0.24, 0.36),
    mteProbabilityNoise: between(0.18, 0.3),
    lessonBoost: {
      L3: between(0.0, 0.03),
      L4: between(0.0, 0.03),
      L9: between(0.0, 0.04),
      L10: between(0.01, 0.05),
      L11: between(0.01, 0.05),
      L12: between(0.0, 0.03),
    },
    immsControlGain: {
      attention: between(0.03, 0.09),
      relevance: between(0.03, 0.08),
      confidence: between(0.04, 0.1),
      satisfaction: between(0.03, 0.08),
    },
    immsIntercept: {
      attention: between(0.64, 0.74),
      relevance: between(0.78, 0.86),
      confidence: between(0.8, 0.9),
      satisfaction: between(0.78, 0.86),
    },
    immsExperimentalBoost: {
      attention: between(0.24, 0.36),
      relevance: between(0.12, 0.24),
      confidence: between(0.3, 0.43),
      satisfaction: between(0.1, 0.22),
    },
    immsPostNoise: {
      attention: between(0.34, 0.48),
      relevance: between(0.3, 0.4),
      confidence: between(0.26, 0.36),
      satisfaction: between(0.3, 0.42),
    },
    immsExperimentalExtraNoise: {
      attention: between(0.08, 0.18),
      relevance: between(0.0, 0.04),
      confidence: between(0.0, 0.04),
      satisfaction: between(0.0, 0.04),
    },
    immsItemNoise: between(0.33, 0.5),
    tamControlGain: {
      pu: between(0.02, 0.08),
      peu: between(0.02, 0.08),
    },
    tamExperimentalBoost: {
      pu: between(0.38, 0.62),
      peu: between(0.36, 0.58),
    },
    tamLatentNoise: {
      pu: between(0.3, 0.45),
      peu: between(0.32, 0.46),
    },
    tamItemNoise: between(0.28, 0.42),
  };
}

function meetsTargets(analysis) {
  const rq1Pass =
    analysis.rq1.adjustedMeanDiff > 5 &&
    analysis.rq1.pValue < 0.05 &&
    analysis.rq1.etaSquaredPartial >= 0.06 &&
    analysis.rq1.etaSquaredPartial < 0.14;
  const sigDims = analysis.rq2Univariate.filter(
    (item) => item.pValue < 0.05 && item.etaSquaredPartial >= 0.06,
  );
  const strongDim = analysis.rq2Univariate.some(
    (item) => item.etaSquaredPartial >= 0.12 && item.etaSquaredPartial < 0.14,
  );
  const rq2Pass = analysis.rq2Multivariate.pValue < 0.05 && sigDims.length >= 2 && strongDim;
  const rq3Pass = ["PU_mean", "PEU_mean"].every(
    (key) => analysis.rq3[key].pValue < 0.05 && analysis.rq3[key].cohensD >= 0.5,
  );
  return rq1Pass && rq2Pass && rq3Pass;
}

function buildWorkbook(result, outputPath) {
  const workbook = xlsx.utils.book_new();

  const rawRows = result.rawItemData;
  const scaleRows = result.scaleScores;
  const rawHeaders = Object.keys(rawRows[0]);
  const scaleHeaders = Object.keys(scaleRows[0]);

  const append = (name, rows) => {
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, sheet, name);
  };

  append("raw_item_data", [rawHeaders, ...toWorkbookRows(rawHeaders, rawRows)]);
  append("scale_scores", [scaleHeaders, ...toWorkbookRows(scaleHeaders, scaleRows)]);
  append("rq1_ancova", [
    ["metric", "value"],
    ["adjusted_mean_difference", result.analysis.rq1.adjustedMeanDiff],
    ["F", result.analysis.rq1.fValue],
    ["p", result.analysis.rq1.pValue],
    ["partial_eta_squared", result.analysis.rq1.etaSquaredPartial],
    ["df_effect", result.analysis.rq1.dfEffect],
    ["df_error", result.analysis.rq1.dfError],
  ]);
  append("rq2_mancova", [
    ["overall_metric", "value"],
    ["Pillai_trace", result.analysis.rq2Multivariate.pillaiTrace],
    ["F", result.analysis.rq2Multivariate.fValue],
    ["df1", result.analysis.rq2Multivariate.df1],
    ["df2", result.analysis.rq2Multivariate.df2],
    ["p", result.analysis.rq2Multivariate.pValue],
    [],
    ["dimension", "adjusted_mean_difference", "F", "p", "partial_eta_squared", "slope_homogeneity_p"],
    ...result.analysis.rq2Univariate.map((item) => [
      item.label,
      item.adjustedMeanDiff,
      item.fValue,
      item.pValue,
      item.etaSquaredPartial,
      item.slopeHomogeneityP,
    ]),
  ]);
  append("rq3_ttests", [
    ["variable", "chosen_row", "group0_mean", "group1_mean", "group0_sd", "group1_sd", "Levene_p", "t", "df", "p", "Cohens_d"],
    ["PU_mean", result.analysis.rq3.PU_mean.chosenRow, result.analysis.rq3.PU_mean.group0Mean, result.analysis.rq3.PU_mean.group1Mean, result.analysis.rq3.PU_mean.group0Sd, result.analysis.rq3.PU_mean.group1Sd, result.analysis.rq3.PU_mean.levene.pValue, result.analysis.rq3.PU_mean.tValue, result.analysis.rq3.PU_mean.df, result.analysis.rq3.PU_mean.pValue, result.analysis.rq3.PU_mean.cohensD],
    ["PEU_mean", result.analysis.rq3.PEU_mean.chosenRow, result.analysis.rq3.PEU_mean.group0Mean, result.analysis.rq3.PEU_mean.group1Mean, result.analysis.rq3.PEU_mean.group0Sd, result.analysis.rq3.PEU_mean.group1Sd, result.analysis.rq3.PEU_mean.levene.pValue, result.analysis.rq3.PEU_mean.tValue, result.analysis.rq3.PEU_mean.df, result.analysis.rq3.PEU_mean.pValue, result.analysis.rq3.PEU_mean.cohensD],
  ]);
  append("reliability", [
    ["measure", "metric", "value"],
    ...result.reliability.map((item) => [item.measure, item.metric, item.value]),
  ]);
  append("assumption_checks", [
    ["analysis", "check", "value", "rule"],
    ...result.assumptionChecks.map((item) => [item.analysis, item.check, item.value, item.rule]),
  ]);
  append("codebook", [
    ["variable", "source", "role", "scale", "reverse", "description"],
    ...result.codebook.map((item) => [
      item.variable,
      item.source,
      item.role,
      item.scale,
      item.reverse,
      item.description,
    ]),
  ]);
  append("criteria", [
    ...CRITERIA_SUMMARY,
    [],
    ...result.criteriaRows,
  ]);

  xlsx.writeFile(workbook, outputPath, { bookType: "xlsx", compression: true });
}

function paragraph(text, opts = {}) {
  return new Paragraph({
    heading: opts.heading,
    spacing: opts.spacing,
    children: [new TextRun(String(text))],
  });
}

function simpleTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(
          (header) =>
            new TableCell({
              children: [paragraph(header)],
            }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [paragraph(cell)],
                }),
            ),
          }),
      ),
    ],
  });
}

async function buildReport(result, outputPath) {
  const doc = new Document({
    sections: [
      {
        children: [
          paragraph("300 人虚拟实验数据报告", { heading: HeadingLevel.TITLE }),
          paragraph("本报告基于 MTE Form A 前测、MTE Form B 后测以及 IMMS/TAM 量表，生成 150 对照组 + 150 实验组的题项级虚拟数据。"),
          paragraph("研究设计", { heading: HeadingLevel.HEADING_1 }),
          paragraph(`样本结构：对照组 ${EXPERIMENT_SIM_CONFIG.controlCount} 人，实验组 ${EXPERIMENT_SIM_CONFIG.experimentalCount} 人。`),
          paragraph(`前测卷：${result.formA.filePath}`),
          paragraph(`后测卷：${result.formB.filePath}`),
          paragraph(`量表文件：${result.questionnaire.filePath}`),
          paragraph("数据生成逻辑", { heading: HeadingLevel.HEADING_1 }),
          paragraph("MTE 采用题项级 0/1 生成并换算为 0–100 总分；IMMS 采用 1–5 Likert 前后测并按反向题规则回算四个 ARCS 维度；TAM 采用 1–5 Likert 后测并聚合为 PU 与 PEU。"),
          paragraph(`原始题项级数据非重复行数量检查：${result.duplicateProfiles === 0 ? "通过（无重复响应画像）" : `未通过（${result.duplicateProfiles} 重复）`}`),
          paragraph("信度结果", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Measure", "Metric", "Value"],
            result.reliability.map((item) => [item.measure, item.metric, item.value]),
          ),
          paragraph("前置假设检验", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Analysis", "Check", "Value", "Rule"],
            result.assumptionChecks.map((item) => [item.analysis, item.check, item.value, item.rule]),
          ),
          paragraph("RQ1 · MTE 学习成绩", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Metric", "Value"],
            [
              ["Adjusted mean difference", result.analysis.rq1.adjustedMeanDiff],
              ["F", result.analysis.rq1.fValue],
              ["p", result.analysis.rq1.pValue],
              ["Partial eta squared", result.analysis.rq1.etaSquaredPartial],
            ],
          ),
          paragraph(
            result.analysis.rq1.adjustedMeanDiff > 5 &&
              result.analysis.rq1.pValue < 0.05 &&
              result.analysis.rq1.etaSquaredPartial >= 0.06 &&
              result.analysis.rq1.etaSquaredPartial < 0.14
              ? "RQ1 达标。"
              : "RQ1 未完全达标。",
          ),
          paragraph("RQ2 · IMMS 学习动机", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Overall metric", "Value"],
            [
              ["Pillai's Trace", result.analysis.rq2Multivariate.pillaiTrace],
              ["F", result.analysis.rq2Multivariate.fValue],
              ["p", result.analysis.rq2Multivariate.pValue],
            ],
          ),
          simpleTable(
            ["Dimension", "Adj. diff", "F", "p", "Partial eta squared"],
            result.analysis.rq2Univariate.map((item) => [
              item.label,
              item.adjustedMeanDiff,
              item.fValue,
              item.pValue,
              item.etaSquaredPartial,
            ]),
          ),
          paragraph("RQ3 · TAM 技术接受度", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Variable", "Chosen row", "t", "df", "p", "Cohen's d"],
            [
              ["PU_mean", result.analysis.rq3.PU_mean.chosenRow, result.analysis.rq3.PU_mean.tValue, result.analysis.rq3.PU_mean.df, result.analysis.rq3.PU_mean.pValue, result.analysis.rq3.PU_mean.cohensD],
              ["PEU_mean", result.analysis.rq3.PEU_mean.chosenRow, result.analysis.rq3.PEU_mean.tValue, result.analysis.rq3.PEU_mean.df, result.analysis.rq3.PEU_mean.pValue, result.analysis.rq3.PEU_mean.cohensD],
            ],
          ),
          paragraph("达标结论", { heading: HeadingLevel.HEADING_1 }),
          paragraph(`RQ1: ${result.summary.rq1Pass ? "达标" : "未完全达标"}`),
          paragraph(`RQ2: ${result.summary.rq2Pass ? "达标" : "未完全达标"}`),
          paragraph(`RQ3: ${result.summary.rq3Pass ? "达标" : "未完全达标"}`),
          paragraph("Excel 工作表说明", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Sheet", "Purpose"],
            [
              ["raw_item_data", "300 人全部题项级原始数据，可直接导入 SPSS"],
              ["scale_scores", "MTE、IMMS 四维、TAM 两维聚合得分"],
              ["rq1_ancova", "RQ1 ANCOVA 结果"],
              ["rq2_mancova", "RQ2 MANCOVA 与 4 个单变量 ANCOVA 结果"],
              ["rq3_ttests", "RQ3 的 Levene、t、df、p、d"],
              ["reliability", "MTE KR-20 与 IMMS/TAM alpha"],
              ["assumption_checks", "Levene、斜率同质性和正态性说明"],
              ["codebook", "变量说明与反向题标记"],
              ["criteria", "判定标准摘要"],
            ],
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

function summarizeTargets(analysis) {
  const rq1Pass =
    analysis.rq1.adjustedMeanDiff > 5 &&
    analysis.rq1.pValue < 0.05 &&
    analysis.rq1.etaSquaredPartial >= 0.06 &&
    analysis.rq1.etaSquaredPartial < 0.14;
  const rq2Eligible = analysis.rq2Univariate.filter(
    (item) => item.pValue < 0.05 && item.etaSquaredPartial >= 0.06,
  );
  const rq2Pass =
    analysis.rq2Multivariate.pValue < 0.05 &&
    rq2Eligible.length >= 2 &&
    analysis.rq2Univariate.some(
      (item) => item.etaSquaredPartial >= 0.12 && item.etaSquaredPartial < 0.14,
    );
  const rq3Pass = ["PU_mean", "PEU_mean"].every(
    (key) => analysis.rq3[key].pValue < 0.05 && analysis.rq3[key].cohensD >= 0.5,
  );
  return { rq1Pass, rq2Pass, rq3Pass };
}

export async function buildExperimentSimulationPackage(config = EXPERIMENT_SIM_CONFIG) {
  const formA = parseMteWorkbook(config.formAPath, "FA", "MTE 50题试卷");
  const formB = parseMteWorkbook(config.formBPath, "FB", "MTE Form B (平行版)");
  const questionnaire = parseImmsTamWorkbook(config.questionnairePath);
  const students = buildBaseStudents(config);

  let best = null;
  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const params = buildParamCandidate(iteration);
    const formAPre = simulateMteResponses(formA.items, students, params, "pre");
    const formBPost = simulateMteResponses(formB.items, students, params, "post");
    const immsTam = simulateImmsTAM(questionnaire, students, params);
    const rawItemData = mergeRawRows(formAPre.rows, formBPost.rows);
    const mergedRawItemData = mergeRawRows(rawItemData, immsTam.rawRows).sort((a, b) =>
      a.studentId.localeCompare(b.studentId),
    );
    const scaleScores = buildDerivedScaleRows(formAPre.scoreRows, formBPost.scoreRows, immsTam.scaleRows);
    const analysis = buildAnalysis(scaleScores);
    const reliability = computeReliability(formA, formB, mergedRawItemData, questionnaire);
    const assumptionChecks = buildAssumptionChecks(scaleScores, analysis);
    const duplicateProfiles = checkDuplicateProfiles(mergedRawItemData);
    const summary = summarizeTargets(analysis);
    const candidate = {
      params,
      formA,
      formB,
      questionnaire,
      rawItemData: mergedRawItemData,
      scaleScores,
      analysis,
      reliability,
      assumptionChecks,
      duplicateProfiles,
      summary,
      codebook: buildCodebook(formA, formB, questionnaire),
      criteriaRows: questionnaire.criteriaRows,
    };
    candidate.score = targetScore(candidate);
    if (!best || candidate.score < best.score) {
      best = candidate;
    }
    if (meetsTargets(analysis) && duplicateProfiles === 0) {
      best = candidate;
      break;
    }
  }

  if (!best) {
    throw new Error("Failed to generate any experiment simulation candidate.");
  }

  resetOutputDir(config.outputDir);
  const workbookPath = path.join(config.outputDir, config.outputWorkbook);
  const reportPath = path.join(config.outputDir, config.outputReport);
  buildWorkbook(best, workbookPath);
  await buildReport(best, reportPath);

  return {
    ...best,
    outputWorkbookPath: workbookPath,
    outputReportPath: reportPath,
  };
}

export async function augmentExperimentSimulationPackageWithRq4(
  config = EXPERIMENT_SIM_CONFIG,
) {
  const workbookPath = path.join(config.outputDir, config.outputWorkbook);
  const reportPath = path.join(config.outputDir, config.outputReport);
  const basePackage = readExistingExperimentSimulationPackage(workbookPath);
  const rq4Result = buildRq4BehaviorDataset(basePackage.scaleRows, config);
  const mergedRawRows = buildMergedRawRowsWithRq4(
    basePackage.rawRows,
    rq4Result.behaviorRows,
  );
  const mergedScaleRows = rq4Result.mergedScaleRows;

  buildRq4Workbook(
    workbookPath,
    basePackage,
    mergedRawRows,
    mergedScaleRows,
    rq4Result,
  );
  await buildRq4Report(basePackage, rq4Result, reportPath);

  return {
    outputWorkbookPath: workbookPath,
    outputReportPath: reportPath,
    rawItemData: mergedRawRows,
    scaleScores: mergedScaleRows,
    baseAnalysis: basePackage.analysis,
    rq4: rq4Result.analysis,
    duplicateProfiles: rq4Result.duplicateProfiles,
    summary: {
      rq1Pass:
        basePackage.analysis.rq1.adjustedMeanDiff > 5 &&
        basePackage.analysis.rq1.pValue < 0.05 &&
        basePackage.analysis.rq1.etaSquaredPartial >= 0.06 &&
        basePackage.analysis.rq1.etaSquaredPartial < 0.14,
      rq2Pass:
        basePackage.analysis.rq2Multivariate.pValue < 0.05 &&
        basePackage.analysis.rq2Univariate.filter(
          (item) => item.pValue < 0.05 && item.etaSquaredPartial >= 0.06,
        ).length >= 2 &&
        basePackage.analysis.rq2Univariate.some(
          (item) =>
            item.etaSquaredPartial >= 0.12 &&
            item.etaSquaredPartial < 0.14,
        ),
      rq3Pass: ["PU_mean", "PEU_mean"].every(
        (key) =>
          basePackage.analysis.rq3[key].pValue < 0.05 &&
          basePackage.analysis.rq3[key].cohensD >= 0.5,
      ),
      rq4Pass: rq4Result.analysis.pass,
    },
  };
}

export const EXPERIMENT_SIM_V2_CONFIG = {
  ...EXPERIMENT_SIM_CONFIG,
  outputWorkbook: "experiment-sim-package-v2.xlsx",
  outputReport: "experiment-sim-report-v2.docx",
  maxIterations: 2600,
  baseSeed: 2026041802,
};

function buildBaseStudentsV2(config) {
  const students = [];
  const total = config.controlCount + config.experimentalCount;
  const domainKeys = ["theory", "notation", "symbols", "terms", "rhythm"];
  for (let index = 0; index < total; index += 1) {
    const rng = mulberry32(config.baseSeed + index * 131);
    const group = index < config.controlCount ? 0 : 1;
    const groupLabel = group === 0 ? "control" : "experimental";
    const baselineAbility = randomNormal(rng) * 0.9;
    const treatmentResponsiveness = 0.3 * baselineAbility + randomNormal(rng) * 0.75;
    const motivation = 0.25 * baselineAbility + randomNormal(rng) * 0.75;
    const techAffinity = 0.2 * baselineAbility + randomNormal(rng) * 0.7;
    const engagement = 0.25 * motivation + randomNormal(rng) * 0.8;
    const selfRegulation = 0.2 * baselineAbility + 0.2 * motivation + randomNormal(rng) * 0.7;
    const helpSeeking = 0.15 * motivation + 0.1 * techAffinity + randomNormal(rng) * 0.8;
    const domainTilt = Object.fromEntries(
      domainKeys.map((key) => [key, randomNormal(rng) * 0.35]),
    );
    const theory = 0.72 * baselineAbility + domainTilt.theory + randomNormal(rng) * 0.42;
    const notation = 0.74 * baselineAbility + domainTilt.notation + randomNormal(rng) * 0.42;
    const symbols = 0.68 * baselineAbility + domainTilt.symbols + randomNormal(rng) * 0.45;
    const terms = 0.63 * baselineAbility + domainTilt.terms + randomNormal(rng) * 0.46;
    const rhythm = 0.76 * baselineAbility + domainTilt.rhythm + randomNormal(rng) * 0.4;
    const composite =
      mean([theory, notation, symbols, terms, rhythm]) + randomNormal(rng) * 0.25;
    students.push({
      studentId: `${group === 0 ? "CTRL" : "EXP"}${String(group === 0 ? index + 1 : index - config.controlCount + 1).padStart(3, "0")}`,
      group,
      groupLabel,
      seed: config.baseSeed + index * 131,
      traits: {
        baselineAbility,
        treatmentResponsiveness,
        motivation,
        techAffinity,
        engagement,
        selfRegulation,
        helpSeeking,
        theory,
        notation,
        symbols,
        terms,
        rhythm,
        composite,
      },
    });
  }
  return students;
}

function lessonAbilityV2(student, lessonId) {
  const domain = LESSON_DOMAIN[lessonId] || "theory";
  return student.traits[domain];
}

function simulateMteResponsesV2(formItems, students, params, formType) {
  const rows = [];
  const scoreRows = [];
  for (const student of students) {
    const rng = mulberry32(student.seed + (formType === "pre" ? 401 : 509));
    const itemRow = {};
    let totalCorrect = 0;
    for (const item of formItems) {
      const domainAbility = lessonAbilityV2(student, item.lessonId);
      const formSpecificNoise =
        formType === "pre"
          ? randomNormal(rng) * params.preLatentNoise
          : randomNormal(rng) * params.postLatentNoise;
      const groupShift =
        formType === "post"
          ? params.controlPostGain +
            (student.group === 1 ? params.experimentalPostBoost : 0) +
            (student.group === 1
              ? student.traits.treatmentResponsiveness * params.responsivenessWeight
              : 0) +
            (params.lessonBoost[item.lessonId] || 0)
          : params.preShift;
      const carry =
        formType === "post"
          ? params.postCarryWeight * domainAbility
          : domainAbility;
      const ability =
        carry +
        groupShift +
        0.12 * student.traits.baselineAbility +
        (formType === "post" && student.group === 0
          ? randomNormal(rng) * params.controlPostVarianceNoise
          : 0) +
        formSpecificNoise;
      const linear =
        params.mteSlope * (ability - item.threshold + itemBias(item.itemId, 0.1)) +
        randomNormal(rng) * params.mteProbabilityNoise;
      const probability = clamp(sigmoid(linear), 0.02, 0.98);
      const correct = rng() < probability ? 1 : 0;
      itemRow[item.itemId] = correct;
      totalCorrect += correct;
    }
    rows.push({
      studentId: student.studentId,
      group: student.group,
      groupLabel: student.groupLabel,
      ...itemRow,
    });
    scoreRows.push({
      studentId: student.studentId,
      group: student.group,
      totalBinary: totalCorrect,
      totalScore: totalCorrect * 2,
    });
  }
  return { rows, scoreRows };
}

function simulateImmsTamV2(questionnaire, students, params) {
  const immsByDimension = {
    attention: questionnaire.immsItems.filter((item) => item.dimensionKey === "attention"),
    relevance: questionnaire.immsItems.filter((item) => item.dimensionKey === "relevance"),
    confidence: questionnaire.immsItems.filter((item) => item.dimensionKey === "confidence"),
    satisfaction: questionnaire.immsItems.filter((item) => item.dimensionKey === "satisfaction"),
  };
  const tamByDimension = {
    pu: questionnaire.tamItems.filter((item) => item.dimensionKey === "pu"),
    peu: questionnaire.tamItems.filter((item) => item.dimensionKey === "peu"),
  };

  const rawRows = [];
  const scaleRows = [];

  for (const student of students) {
    const rng = mulberry32(student.seed + 881);
    const preLatent = {
      attention: clamp(
        3.0 +
          0.32 * student.traits.motivation +
          0.16 * student.traits.engagement +
          0.08 * student.traits.terms +
          randomNormal(rng) * params.immsPreNoise.attention,
        1.2,
        4.8,
      ),
      relevance: clamp(
        3.02 +
          0.28 * student.traits.motivation +
          0.12 * student.traits.theory +
          randomNormal(rng) * params.immsPreNoise.relevance,
        1.2,
        4.8,
      ),
      confidence: clamp(
        2.88 +
          0.24 * student.traits.motivation +
          0.2 * student.traits.baselineAbility +
          0.16 * student.traits.selfRegulation +
          randomNormal(rng) * params.immsPreNoise.confidence,
        1.2,
        4.8,
      ),
      satisfaction: clamp(
        3.0 +
          0.22 * student.traits.motivation +
          0.12 * student.traits.techAffinity +
          randomNormal(rng) * params.immsPreNoise.satisfaction,
        1.2,
        4.8,
      ),
    };

    const postLatent = {
      attention: clamp(
        params.immsCarry.attention * preLatent.attention +
          params.immsIntercept.attention +
          params.immsControlGain.attention +
          (student.group === 1 ? params.immsExperimentalBoost.attention : 0) +
          (student.group === 1
            ? student.traits.treatmentResponsiveness * params.immsResponsivenessWeight.attention
            : 0) +
          randomNormal(rng) * params.immsPostNoise.attention,
        1,
        5,
      ),
      relevance: clamp(
        params.immsCarry.relevance * preLatent.relevance +
          params.immsIntercept.relevance +
          params.immsControlGain.relevance +
          (student.group === 1 ? params.immsExperimentalBoost.relevance : 0) +
          (student.group === 1
            ? student.traits.treatmentResponsiveness * params.immsResponsivenessWeight.relevance
            : 0) +
          randomNormal(rng) * params.immsPostNoise.relevance,
        1,
        5,
      ),
      confidence: clamp(
        params.immsCarry.confidence * preLatent.confidence +
          params.immsIntercept.confidence +
          params.immsControlGain.confidence +
          (student.group === 1 ? params.immsExperimentalBoost.confidence : 0) +
          (student.group === 1
            ? student.traits.treatmentResponsiveness * params.immsResponsivenessWeight.confidence
            : 0) +
          randomNormal(rng) * params.immsPostNoise.confidence,
        1,
        5,
      ),
      satisfaction: clamp(
        params.immsCarry.satisfaction * preLatent.satisfaction +
          params.immsIntercept.satisfaction +
          params.immsControlGain.satisfaction +
          (student.group === 1 ? params.immsExperimentalBoost.satisfaction : 0) +
          (student.group === 1
            ? student.traits.treatmentResponsiveness * params.immsResponsivenessWeight.satisfaction
            : 0) +
          randomNormal(rng) * params.immsPostNoise.satisfaction,
        1,
        5,
      ),
    };

    const preCorrected = {};
    const postCorrected = {};
    const rawRow = {
      studentId: student.studentId,
      group: student.group,
      groupLabel: student.groupLabel,
    };

    for (const [dimensionKey, items] of Object.entries(immsByDimension)) {
      for (const item of items) {
        const bias = itemBias(item.variable, 0.18);
        const preDirect = clamp(
          preLatent[dimensionKey] + bias + randomNormal(rng) * params.immsItemNoise,
          1,
          5,
        );
        const postDirect = clamp(
          postLatent[dimensionKey] + bias + randomNormal(rng) * params.immsItemNoise,
          1,
          5,
        );
        const preObserved = clamp(
          Math.round(item.reverse ? 6 - preDirect : preDirect),
          1,
          5,
        );
        const postObserved = clamp(
          Math.round(item.reverse ? 6 - postDirect : postDirect),
          1,
          5,
        );
        rawRow[`PRE_${item.variable}`] = preObserved;
        rawRow[`POST_${item.variable}`] = postObserved;
        preCorrected[item.variable] = item.reverse ? 6 - preObserved : preObserved;
        postCorrected[item.variable] = item.reverse ? 6 - postObserved : postObserved;
      }
    }

    const tamLatent = {
      pu: clamp(
        3.0 +
          0.22 * student.traits.techAffinity +
          0.18 * (postLatent.confidence - 3) +
          0.12 * (postLatent.attention - 3) +
          params.tamControlGain.pu +
          (student.group === 1 ? params.tamExperimentalBoost.pu : 0) +
          (student.group === 1
            ? student.traits.treatmentResponsiveness * params.tamResponsivenessWeight.pu
            : 0) +
          randomNormal(rng) * params.tamLatentNoise.pu,
        1,
        5,
      ),
      peu: clamp(
        3.02 +
          0.26 * student.traits.techAffinity +
          0.12 * (postLatent.satisfaction - 3) +
          params.tamControlGain.peu +
          (student.group === 1 ? params.tamExperimentalBoost.peu : 0) +
          (student.group === 1
            ? student.traits.treatmentResponsiveness * params.tamResponsivenessWeight.peu
            : 0) +
          randomNormal(rng) * params.tamLatentNoise.peu,
        1,
        5,
      ),
    };

    const tamObserved = {};
    for (const [dimensionKey, items] of Object.entries(tamByDimension)) {
      for (const item of items) {
        const bias = itemBias(item.variable, 0.14);
        const observed = clamp(
          Math.round(
            clamp(
              tamLatent[dimensionKey] + bias + randomNormal(rng) * params.tamItemNoise,
              1,
              5,
            ),
          ),
          1,
          5,
        );
        rawRow[`POST_${item.variable}`] = observed;
        tamObserved[item.variable] = observed;
      }
    }

    scaleRows.push({
      studentId: student.studentId,
      group: student.group,
      groupLabel: student.groupLabel,
      pre_attention: mean(immsByDimension.attention.map((item) => preCorrected[item.variable])),
      pre_relevance: mean(immsByDimension.relevance.map((item) => preCorrected[item.variable])),
      pre_confidence: mean(immsByDimension.confidence.map((item) => preCorrected[item.variable])),
      pre_satisfaction: mean(immsByDimension.satisfaction.map((item) => preCorrected[item.variable])),
      post_attention: mean(immsByDimension.attention.map((item) => postCorrected[item.variable])),
      post_relevance: mean(immsByDimension.relevance.map((item) => postCorrected[item.variable])),
      post_confidence: mean(immsByDimension.confidence.map((item) => postCorrected[item.variable])),
      post_satisfaction: mean(immsByDimension.satisfaction.map((item) => postCorrected[item.variable])),
      pre_imms_total: mean(Object.values(preCorrected)),
      post_imms_total: mean(Object.values(postCorrected)),
      PU_mean: mean(tamByDimension.pu.map((item) => tamObserved[item.variable])),
      PEU_mean: mean(tamByDimension.peu.map((item) => tamObserved[item.variable])),
    });
    rawRows.push(rawRow);
  }

  return { rawRows, scaleRows };
}

function buildAssumptionChecksV2(scaleRows, analysis) {
  const rows = buildAssumptionChecks(scaleRows, analysis);
  rows.push({
    analysis: "RQ3 TAM",
    check: "Levene on PU_mean",
    value: analysis.rq3.PU_mean.levene.pValue,
    rule: "p > .05",
  });
  rows.push({
    analysis: "RQ3 TAM",
    check: "Levene on PEU_mean",
    value: analysis.rq3.PEU_mean.levene.pValue,
    rule: "p > .05",
  });
  return rows;
}

function buildRq4BehaviorDatasetV2(scaleRows, studentsById, params) {
  const experimentalRows = scaleRows.filter((row) => safeNumber(row.group, 0) === 1);
  const preScores = experimentalRows.map((row) => safeNumber(row.pre_MTE_formA, 0));
  const postScores = experimentalRows.map((row) => safeNumber(row.post_MTE_formB, 0));
  const preMean = mean(preScores);
  const preSd = sd(preScores) || 1;
  const postMean = mean(postScores);
  const postSd = sd(postScores) || 1;
  const prePostCorrelation = correlation(preScores, postScores);
  const residualScale = Math.sqrt(Math.max(0.0001, 1 - prePostCorrelation ** 2));

  const behaviorRows = [];
  for (const row of experimentalRows) {
    const student = studentsById.get(row.studentId);
    const rng = mulberry32(student.seed + 1709);
    const preZ = (safeNumber(row.pre_MTE_formA, 0) - preMean) / preSd;
    const postZ = (safeNumber(row.post_MTE_formB, 0) - postMean) / postSd;
    const postResidualZ = (postZ - prePostCorrelation * preZ) / residualScale;

    const engagement =
      params.rq4.engagementPostWeight * postZ +
      params.rq4.engagementPreWeight * preZ +
      params.rq4.engagementTraitWeight * student.traits.engagement +
      randomNormal(rng) * params.rq4.engagementNoise;
    const selfRegulation =
      params.rq4.selfPostWeight * postZ +
      params.rq4.selfPreWeight * preZ +
      params.rq4.selfTraitWeight * student.traits.selfRegulation +
      randomNormal(rng) * params.rq4.selfNoise;
    const helpSeeking =
      params.rq4.helpResidualWeight * postResidualZ +
      params.rq4.helpTraitWeight * student.traits.helpSeeking +
      randomNormal(rng) * params.rq4.helpNoise;
    const skill =
      params.rq4.skillPostWeight * postZ +
      params.rq4.skillPreWeight * preZ +
      params.rq4.skillTraitWeight * student.traits.baselineAbility +
      randomNormal(rng) * params.rq4.skillNoise;
    const learningGain =
      params.rq4.gainResidualWeight * postResidualZ +
      params.rq4.gainSkillWeight * skill +
      randomNormal(rng) * params.rq4.gainNoise;

    const totalTimeMin = Math.round(
      clamp(
        params.rq4.timeBase +
          params.rq4.timeEngagementWeight * engagement +
          params.rq4.timeSelfWeight * selfRegulation +
          randomNormal(rng) * params.rq4.timeNoise,
        420,
        1800,
      ),
    );
    const totalExercises = Math.round(
      clamp(
        params.rq4.exerciseBase +
          params.rq4.exerciseTimeWeight * totalTimeMin +
          params.rq4.exerciseSelfWeight * selfRegulation +
          params.rq4.exerciseGainWeight * learningGain +
          randomNormal(rng) * params.rq4.exerciseNoise,
        220,
        900,
      ),
    );
    const overallAccuracy = roundTo(
      clamp(
        params.rq4.accuracyBase +
          params.rq4.accuracySkillWeight * skill +
          params.rq4.accuracyGainWeight * learningGain +
          params.rq4.accuracyExerciseWeight * totalExercises +
          randomNormal(rng) * params.rq4.accuracyNoise,
        0.35,
        0.92,
      ),
      3,
    );
    const avgPL = roundTo(
      clamp(
        params.rq4.pLBase +
          params.rq4.pLAccuracyWeight * overallAccuracy +
          params.rq4.pLGainWeight * learningGain +
          params.rq4.pLPostWeight * postZ +
          randomNormal(rng) * params.rq4.pLNoise,
        0.35,
        0.96,
      ),
      3,
    );
    const masteredCount = Math.round(
      clamp(
        params.rq4.masteredBase +
          params.rq4.masteredPLWeight * avgPL +
          params.rq4.masteredGainWeight * learningGain +
          params.rq4.masteredAccuracyWeight * (overallAccuracy - 0.5) +
          randomNormal(rng) * params.rq4.masteredNoise,
        4,
        24,
      ),
    );
    const tutorQueries = Math.round(
      clamp(
        params.rq4.tutorBase +
          params.rq4.tutorHelpWeight * helpSeeking +
          params.rq4.tutorTimeWeight * totalTimeMin +
          params.rq4.tutorGainWeight * learningGain +
          randomNormal(rng) * params.rq4.tutorNoise,
        4,
        48,
      ),
    );
    const errorCount = Math.round(
      clamp(
        params.rq4.errorBase +
          params.rq4.errorExerciseWeight * totalExercises +
          params.rq4.errorAccuracyWeight * (0.82 - overallAccuracy) +
          randomNormal(rng) * params.rq4.errorNoise,
        5,
        90,
      ),
    );

    behaviorRows.push({
      studentId: row.studentId,
      total_time_min: totalTimeMin,
      total_exercises: totalExercises,
      overall_accuracy: overallAccuracy,
      avg_pL: avgPL,
      mastered_count: masteredCount,
      tutor_queries: tutorQueries,
      error_count: errorCount,
    });
  }
  return behaviorRows;
}

function buildRq4AnalysisV2(scaleRowsWithBehavior) {
  const experimentalRows = scaleRowsWithBehavior.filter(
    (row) => safeNumber(row.group, 0) === 1,
  );
  const postScores = experimentalRows.map((row) => safeNumber(row.post_MTE_formB, 0));
  const pearsonVariables = [
    "total_time_min",
    "total_exercises",
    "overall_accuracy",
    "avg_pL",
    "mastered_count",
    "tutor_queries",
    "error_count",
  ];
  const correlations = pearsonVariables.map((key) =>
    pearsonTest(
      postScores,
      experimentalRows.map((row) => safeNumber(row[key], 0)),
      "post_MTE_formB",
      key,
    ),
  );
  const logicChecks = [
    {
      check: "time_vs_exercises",
      threshold: "r >= .60",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.total_time_min, 0)),
        experimentalRows.map((row) => safeNumber(row.total_exercises, 0)),
        "total_time_min",
        "total_exercises",
      ),
    },
    {
      check: "accuracy_vs_avg_pL",
      threshold: "r >= .50",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.overall_accuracy, 0)),
        experimentalRows.map((row) => safeNumber(row.avg_pL, 0)),
        "overall_accuracy",
        "avg_pL",
      ),
    },
    {
      check: "avg_pL_vs_mastered_count",
      threshold: "r >= .60",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.avg_pL, 0)),
        experimentalRows.map((row) => safeNumber(row.mastered_count, 0)),
        "avg_pL",
        "mastered_count",
      ),
    },
    {
      check: "avg_pL_vs_post_MTE",
      threshold: "r >= .40",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.avg_pL, 0)),
        experimentalRows.map((row) => safeNumber(row.post_MTE_formB, 0)),
        "avg_pL",
        "post_MTE_formB",
      ),
    },
    {
      check: "error_count_vs_accuracy",
      threshold: "r <= -.30",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.error_count, 0)),
        experimentalRows.map((row) => safeNumber(row.overall_accuracy, 0)),
        "error_count",
        "overall_accuracy",
      ),
    },
    {
      check: "error_count_vs_total_exercises",
      threshold: "r >= .30",
      ...pearsonTest(
        experimentalRows.map((row) => safeNumber(row.error_count, 0)),
        experimentalRows.map((row) => safeNumber(row.total_exercises, 0)),
        "error_count",
        "total_exercises",
      ),
    },
  ].map((item) => ({
    ...item,
    passes:
      (item.check === "time_vs_exercises" && item.r >= 0.6) ||
      (item.check === "accuracy_vs_avg_pL" && item.r >= 0.5) ||
      (item.check === "avg_pL_vs_mastered_count" && item.r >= 0.6) ||
      (item.check === "avg_pL_vs_post_MTE" && item.r >= 0.4) ||
      (item.check === "error_count_vs_accuracy" && item.r <= -0.3) ||
      (item.check === "error_count_vs_total_exercises" && item.r >= 0.3),
  }));

  const summaryMetrics = experimentalBehaviorColumns().map((key) => {
    const values = experimentalRows.map((row) => safeNumber(row[key], 0));
    return {
      variable: key,
      mean: roundTo(mean(values), 4),
      sd: roundTo(sd(values), 4),
    };
  });
  const lowParticipationCount = experimentalRows.filter(
    (row) => safeNumber(row.total_time_min, 0) < 600,
  ).length;
  const significantPearsons = correlations.filter(
    (item) => item.r >= 0.3 && item.pValue < 0.05,
  ).length;
  const regression = hierarchicalRegression(experimentalRows);

  const means = Object.fromEntries(summaryMetrics.map((item) => [item.variable, item.mean]));
  const vifPass = regression.block2.coefficients.every((item) => item.vif < 5);
  const strongPredictorCount = regression.block2.coefficients.filter(
    (item) => item.standardizedBeta >= 0.2 && item.pValue < 0.05,
  ).length;
  const targets = {
    meansPass:
      means.total_time_min >= 800 &&
      means.total_exercises >= 400 &&
      means.overall_accuracy >= 0.55 &&
      means.avg_pL >= 0.65 &&
      means.mastered_count >= 11 &&
      means.tutor_queries >= 15 &&
      means.error_count >= 20,
    lowParticipationPass: lowParticipationCount <= 15,
    pearsonPass: significantPearsons >= 3,
    logicPass: logicChecks.every((item) => item.passes),
    regressionPass:
      regression.deltaRSquared >= 0.05 &&
      regression.pChange < 0.05 &&
      strongPredictorCount >= 2 &&
      vifPass,
    vifPass,
    strongPredictorCount,
  };

  return {
    experimentalCount: experimentalRows.length,
    summaryMetrics,
    lowParticipationCount,
    significantPearsons,
    correlations,
    logicChecks,
    regression,
    targets,
    pass:
      targets.meansPass &&
      targets.lowParticipationPass &&
      targets.pearsonPass &&
      targets.logicPass &&
      targets.regressionPass,
  };
}

function summarizeTargetsV2(candidate) {
  const analysis = candidate.analysis;
  const correlationValue = candidate.prePostCorrelation;
  const reliabilityMap = new Map(
    candidate.reliability.map((item) => [item.measure, item.value]),
  );
  const allLevenePass = candidate.assumptionChecks
    .filter((item) => item.check.startsWith("Levene"))
    .every((item) => safeNumber(item.value, 0) > 0.05);
  const allSlopePass = candidate.assumptionChecks
    .filter((item) => item.check === "Homogeneity of regression slopes")
    .every((item) => safeNumber(item.value, 0) > 0.05);
  const rq1Pass =
    analysis.rq1.adjustedMeanDiff > 5 &&
    analysis.rq1.pValue < 0.05 &&
    analysis.rq1.etaSquaredPartial >= 0.06 &&
    analysis.rq1.etaSquaredPartial < 0.14;
  const rq2Eligible = analysis.rq2Univariate.filter(
    (item) => item.pValue < 0.0125 && item.etaSquaredPartial >= 0.06,
  );
  const rq2Pass =
    analysis.rq2Multivariate.pValue < 0.05 &&
    rq2Eligible.length >= 2 &&
    analysis.rq2Univariate.some((item) => item.etaSquaredPartial >= 0.1);
  const rq3Pass = ["PU_mean", "PEU_mean"].every(
    (key) => analysis.rq3[key].pValue < 0.05 && analysis.rq3[key].cohensD >= 0.5,
  );
  return {
    correlationPass: correlationValue >= 0.65 && correlationValue <= 0.85,
    reliabilityPass:
      (reliabilityMap.get("MTE Form A") ?? 0) >= 0.8 &&
      (reliabilityMap.get("MTE Form B") ?? 0) >= 0.8 &&
      (reliabilityMap.get("IMMS Attention Post") ?? 0) >= 0.8 &&
      (reliabilityMap.get("IMMS Relevance Post") ?? 0) >= 0.8 &&
      (reliabilityMap.get("IMMS Confidence Post") ?? 0) >= 0.8 &&
      (reliabilityMap.get("IMMS Satisfaction Post") ?? 0) >= 0.8 &&
      (reliabilityMap.get("TAM PU") ?? 0) >= 0.85 &&
      (reliabilityMap.get("TAM PEU") ?? 0) >= 0.85,
    levenePass: allLevenePass,
    slopePass: allSlopePass,
    rq1Pass,
    rq2Pass,
    rq3Pass,
    rq4Pass: candidate.rq4.pass,
  };
}

function targetScoreV2(candidate) {
  let penalty = 0;
  const { rq1, rq2Multivariate, rq2Univariate, rq3 } = candidate.analysis;
  const correlationDiffLow = Math.max(0, 0.65 - candidate.prePostCorrelation);
  const correlationDiffHigh = Math.max(0, candidate.prePostCorrelation - 0.84);
  penalty += (correlationDiffLow + correlationDiffHigh) * 30000;

  const reliabilityMap = new Map(candidate.reliability.map((item) => [item.measure, item.value]));
  const reliabilityThresholds = {
    "MTE Form A": 0.8,
    "MTE Form B": 0.8,
    "IMMS Attention Post": 0.8,
    "IMMS Relevance Post": 0.8,
    "IMMS Confidence Post": 0.8,
    "IMMS Satisfaction Post": 0.8,
    "TAM PU": 0.85,
    "TAM PEU": 0.85,
  };
  for (const [measure, threshold] of Object.entries(reliabilityThresholds)) {
    const value = reliabilityMap.get(measure) ?? 0;
    if (value < threshold) {
      penalty += (threshold - value) * 20000 + 1500;
    }
  }

  penalty += rq1.adjustedMeanDiff > 5 ? 0 : (5.001 - rq1.adjustedMeanDiff) * 1200 + 1500;
  penalty += rq1.pValue < 0.05 ? 0 : 2500;
  if (rq1.etaSquaredPartial < 0.06) penalty += (0.06 - rq1.etaSquaredPartial) * 14000 + 1500;
  if (rq1.etaSquaredPartial >= 0.14) penalty += (rq1.etaSquaredPartial - 0.1399) * 14000 + 1500;

  penalty += rq2Multivariate.pValue < 0.05 ? 0 : 2500;
  const significantDimensions = rq2Univariate.filter(
    (item) => item.pValue < 0.0125 && item.etaSquaredPartial >= 0.06,
  );
  if (significantDimensions.length < 2) {
    penalty += (2 - significantDimensions.length) * 2500;
  }
  if (!rq2Univariate.some((item) => item.etaSquaredPartial >= 0.1)) {
    penalty += 2500;
  }
  const attention = rq2Univariate.find((item) => item.label === "post_attention");
  const confidence = rq2Univariate.find((item) => item.label === "post_confidence");
  if (!attention || attention.pValue >= 0.0125 || attention.etaSquaredPartial < 0.06) penalty += 1200;
  if (!confidence || confidence.pValue >= 0.0125 || confidence.etaSquaredPartial < 0.06) penalty += 1200;
  const satisfaction = rq2Univariate.find((item) => item.label === "post_satisfaction");
  if (satisfaction && satisfaction.etaSquaredPartial > 0.08) penalty += 200;

  for (const key of ["PU_mean", "PEU_mean"]) {
    penalty += rq3[key].pValue < 0.05 ? 0 : 2500;
    if (rq3[key].cohensD < 0.5) penalty += (0.5 - rq3[key].cohensD) * 15000 + 1500;
    if ((rq3[key].levene?.pValue ?? 0) <= 0.05) penalty += (0.051 - rq3[key].levene.pValue) * 120000 + 2000;
  }

  for (const check of candidate.assumptionChecks) {
    if (typeof check.value === "number" && check.check.startsWith("Levene") && check.value <= 0.05) {
      penalty += (0.051 - check.value) * 120000 + 2000;
    }
    if (check.check === "Homogeneity of regression slopes" && typeof check.value === "number" && check.value <= 0.05) {
      penalty += (0.051 - check.value) * 120000 + 2000;
    }
  }

  penalty += rq4TargetPenaltyV2(candidate.rq4);
  penalty += candidate.duplicateProfiles * 10000;
  return penalty;
}

function rq4TargetPenaltyV2(rq4Result) {
  const rq4 = rq4Result;
  const metrics = Object.fromEntries(rq4.summaryMetrics.map((item) => [item.variable, item.mean]));
  let penalty = 0;
  const thresholds = {
    total_time_min: 800,
    total_exercises: 400,
    overall_accuracy: 0.55,
    avg_pL: 0.65,
    mastered_count: 11,
    tutor_queries: 15,
    error_count: 20,
  };
  for (const [key, threshold] of Object.entries(thresholds)) {
    if ((metrics[key] ?? 0) < threshold) {
      penalty +=
        (threshold - metrics[key]) *
          (key.includes("accuracy") || key.includes("pL") ? 6000 : 300) +
        800;
    }
  }
  if (rq4.lowParticipationCount > 15) penalty += (rq4.lowParticipationCount - 15) * 1500;
  if (rq4.significantPearsons < 3) penalty += (3 - rq4.significantPearsons) * 3000;
  for (const item of rq4.logicChecks) {
    if (!item.passes) {
      penalty += 5000;
    }
  }
  if (rq4.regression.deltaRSquared < 0.05) {
    penalty += (0.05 - rq4.regression.deltaRSquared) * 20000 + 2000;
  }
  if (rq4.regression.pChange >= 0.05) penalty += 3000;
  const significantPredictors = rq4.regression.block2.coefficients.filter(
    (item) => item.standardizedBeta >= 0.2 && item.pValue < 0.05,
  ).length;
  if (significantPredictors < 2) penalty += (2 - significantPredictors) * 4000;
  for (const coefficient of rq4.regression.block2.coefficients) {
    if (coefficient.vif >= 5) {
      penalty += (coefficient.vif - 4.99) * 5000 + 2000;
    }
  }
  const coefficientMap = new Map(
    rq4.regression.block2.coefficients.map((item) => [item.predictor, item]),
  );
  const positivePredictors = ["pre_MTE_formA", "mastered_count", "overall_accuracy"];
  for (const predictor of positivePredictors) {
    const coefficient = coefficientMap.get(predictor);
    if (!coefficient || coefficient.standardizedBeta <= 0 || coefficient.pValue >= 0.05) penalty += 1200;
  }
  for (const predictor of ["total_time_min", "error_count"]) {
    const coefficient = coefficientMap.get(predictor);
    if (coefficient && coefficient.pValue < 0.05) penalty += 300;
  }
  const avgPLCoefficient = coefficientMap.get("avg_pL");
  if (avgPLCoefficient && avgPLCoefficient.pValue < 0.05) penalty += 120;
  return penalty;
}

function buildParamCandidateV2(iteration, config = EXPERIMENT_SIM_V2_CONFIG) {
  const rng = mulberry32(config.baseSeed + iteration * 991);
  const between = (min, max) => min + (max - min) * rng();
  return {
    preShift: between(-0.06, 0.06),
    postCarryWeight: between(0.54, 0.7),
    preLatentNoise: between(0.22, 0.34),
    postLatentNoise: between(0.42, 0.68),
    controlPostGain: between(0.06, 0.12),
    experimentalPostBoost: between(0.19, 0.27),
    responsivenessWeight: between(0.1, 0.18),
    controlPostVarianceNoise: between(0.02, 0.09),
    mteSlope: between(1.18, 1.44),
    mteProbabilityNoise: between(0.12, 0.22),
    lessonBoost: {
      L3: between(0.0, 0.02),
      L4: between(0.0, 0.02),
      L9: between(0.01, 0.03),
      L10: between(0.015, 0.04),
      L11: between(0.01, 0.035),
      L12: between(0.0, 0.02),
    },
    immsCarry: {
      attention: between(0.64, 0.76),
      relevance: between(0.68, 0.8),
      confidence: between(0.63, 0.75),
      satisfaction: between(0.68, 0.8),
    },
    immsIntercept: {
      attention: between(0.58, 0.7),
      relevance: between(0.7, 0.82),
      confidence: between(0.72, 0.86),
      satisfaction: between(0.72, 0.82),
    },
    immsControlGain: {
      attention: between(0.03, 0.08),
      relevance: between(0.03, 0.08),
      confidence: between(0.04, 0.09),
      satisfaction: between(0.02, 0.07),
    },
    immsExperimentalBoost: {
      attention: between(0.24, 0.34),
      relevance: between(0.08, 0.18),
      confidence: between(0.28, 0.38),
      satisfaction: between(0.01, 0.08),
    },
    immsResponsivenessWeight: {
      attention: between(0.04, 0.08),
      relevance: between(0.01, 0.05),
      confidence: between(0.05, 0.09),
      satisfaction: between(0.0, 0.03),
    },
    immsPreNoise: {
      attention: between(0.38, 0.5),
      relevance: between(0.34, 0.46),
      confidence: between(0.38, 0.5),
      satisfaction: between(0.36, 0.5),
    },
    immsPostNoise: {
      attention: between(0.3, 0.42),
      relevance: between(0.28, 0.38),
      confidence: between(0.28, 0.38),
      satisfaction: between(0.32, 0.44),
    },
    immsItemNoise: between(0.28, 0.42),
    tamControlGain: {
      pu: between(0.02, 0.08),
      peu: between(0.02, 0.08),
    },
    tamExperimentalBoost: {
      pu: between(0.26, 0.4),
      peu: between(0.24, 0.36),
    },
    tamResponsivenessWeight: {
      pu: between(0.04, 0.08),
      peu: between(0.03, 0.07),
    },
    tamLatentNoise: {
      pu: between(0.28, 0.38),
      peu: between(0.28, 0.38),
    },
    tamItemNoise: between(0.22, 0.32),
    rq4: {
      engagementPostWeight: between(0.12, 0.24),
      engagementPreWeight: between(0.04, 0.12),
      engagementTraitWeight: between(0.18, 0.28),
      engagementNoise: between(0.7, 0.9),
      selfPostWeight: between(0.02, 0.12),
      selfPreWeight: between(0.08, 0.18),
      selfTraitWeight: between(0.16, 0.28),
      selfNoise: between(0.6, 0.8),
      helpResidualWeight: between(0.18, 0.32),
      helpTraitWeight: between(0.18, 0.3),
      helpNoise: between(0.6, 0.85),
      skillPostWeight: between(0.18, 0.32),
      skillPreWeight: between(0.02, 0.1),
      skillTraitWeight: between(0.28, 0.42),
      skillNoise: between(0.55, 0.8),
      gainResidualWeight: between(0.46, 0.65),
      gainSkillWeight: between(0.16, 0.28),
      gainNoise: between(0.4, 0.58),
      timeBase: between(880, 980),
      timeEngagementWeight: between(120, 180),
      timeSelfWeight: between(48, 80),
      timeNoise: between(85, 120),
      exerciseBase: between(280, 320),
      exerciseTimeWeight: between(0.11, 0.145),
      exerciseSelfWeight: between(8, 18),
      exerciseGainWeight: between(10, 20),
      exerciseNoise: between(26, 36),
      accuracyBase: between(0.51, 0.57),
      accuracySkillWeight: between(0.025, 0.045),
      accuracyGainWeight: between(0.06, 0.1),
      accuracyExerciseWeight: between(0.00004, 0.00008),
      accuracyNoise: between(0.028, 0.04),
      pLBase: between(0.54, 0.64),
      pLAccuracyWeight: between(0.14, 0.24),
      pLGainWeight: between(0.04, 0.1),
      pLPostWeight: between(0.0, 0.04),
      pLNoise: between(0.05, 0.08),
      masteredBase: between(9.0, 10.5),
      masteredPLWeight: between(1.5, 2.5),
      masteredGainWeight: between(2.8, 4.2),
      masteredAccuracyWeight: between(10, 16),
      masteredNoise: between(1.4, 2.4),
      tutorBase: between(13, 16),
      tutorHelpWeight: between(1.6, 2.4),
      tutorTimeWeight: between(0.001, 0.0018),
      tutorGainWeight: between(0.32, 0.48),
      tutorNoise: between(1.8, 2.6),
      errorBase: between(8, 14),
      errorExerciseWeight: between(0.08, 0.11),
      errorAccuracyWeight: between(26, 38),
      errorNoise: between(3, 5),
    },
  };
}

function buildWorkbookV2(result, outputPath) {
  const workbook = xlsx.utils.book_new();
  const append = (name, rows) => {
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, sheet, name);
  };
  const rawHeaders = Object.keys(result.rawItemData[0]);
  const scaleHeaders = Object.keys(result.scaleScores[0]);
  append("raw_item_data", [rawHeaders, ...toWorkbookRows(rawHeaders, result.rawItemData)]);
  append("scale_scores", [scaleHeaders, ...toWorkbookRows(scaleHeaders, result.scaleScores)]);
  append("rq1_ancova", [
    ["metric", "value"],
    ["adjusted_mean_difference", result.analysis.rq1.adjustedMeanDiff],
    ["F", result.analysis.rq1.fValue],
    ["p", result.analysis.rq1.pValue],
    ["partial_eta_squared", result.analysis.rq1.etaSquaredPartial],
    ["df_effect", result.analysis.rq1.dfEffect],
    ["df_error", result.analysis.rq1.dfError],
  ]);
  append("rq2_mancova", [
    ["overall_metric", "value"],
    ["Pillai_trace", result.analysis.rq2Multivariate.pillaiTrace],
    ["F", result.analysis.rq2Multivariate.fValue],
    ["df1", result.analysis.rq2Multivariate.df1],
    ["df2", result.analysis.rq2Multivariate.df2],
    ["p", result.analysis.rq2Multivariate.pValue],
    [],
    ["dimension", "adjusted_mean_difference", "F", "p", "partial_eta_squared", "slope_homogeneity_p"],
    ...result.analysis.rq2Univariate.map((item) => [
      item.label,
      item.adjustedMeanDiff,
      item.fValue,
      item.pValue,
      item.etaSquaredPartial,
      item.slopeHomogeneityP,
    ]),
  ]);
  append("rq3_ttests", [
    ["variable", "chosen_row", "group0_mean", "group1_mean", "group0_sd", "group1_sd", "Levene_p", "t", "df", "p", "Cohens_d"],
    ["PU_mean", result.analysis.rq3.PU_mean.chosenRow, result.analysis.rq3.PU_mean.group0Mean, result.analysis.rq3.PU_mean.group1Mean, result.analysis.rq3.PU_mean.group0Sd, result.analysis.rq3.PU_mean.group1Sd, result.analysis.rq3.PU_mean.levene.pValue, result.analysis.rq3.PU_mean.tValue, result.analysis.rq3.PU_mean.df, result.analysis.rq3.PU_mean.pValue, result.analysis.rq3.PU_mean.cohensD],
    ["PEU_mean", result.analysis.rq3.PEU_mean.chosenRow, result.analysis.rq3.PEU_mean.group0Mean, result.analysis.rq3.PEU_mean.group1Mean, result.analysis.rq3.PEU_mean.group0Sd, result.analysis.rq3.PEU_mean.group1Sd, result.analysis.rq3.PEU_mean.levene.pValue, result.analysis.rq3.PEU_mean.tValue, result.analysis.rq3.PEU_mean.df, result.analysis.rq3.PEU_mean.pValue, result.analysis.rq3.PEU_mean.cohensD],
  ]);
  append("rq4_summary", [
    ["metric", "mean", "sd", "target", "pass"],
    ...result.rq4.summaryMetrics.map((item) => [
      item.variable,
      item.mean,
      item.sd,
      item.variable === "total_time_min"
        ? ">= 800"
        : item.variable === "total_exercises"
          ? ">= 400"
          : item.variable === "overall_accuracy"
            ? ">= 0.55"
            : item.variable === "avg_pL"
              ? ">= 0.65"
              : item.variable === "mastered_count"
                ? ">= 11"
                : item.variable === "tutor_queries"
                  ? ">= 15"
                  : ">= 20",
      item.variable === "total_time_min"
        ? item.mean >= 800
        : item.variable === "total_exercises"
          ? item.mean >= 400
          : item.variable === "overall_accuracy"
            ? item.mean >= 0.55
            : item.variable === "avg_pL"
              ? item.mean >= 0.65
              : item.variable === "mastered_count"
                ? item.mean >= 11
                : item.variable === "tutor_queries"
                  ? item.mean >= 15
                  : item.mean >= 20,
    ]),
    [],
    ["low_participation_count", result.rq4.lowParticipationCount, "", "<= 15", result.rq4.lowParticipationCount <= 15],
    ["significant_pearsons", result.rq4.significantPearsons, "", ">= 3", result.rq4.significantPearsons >= 3],
    ["strong_predictors", result.rq4.targets.strongPredictorCount, "", ">= 2", result.rq4.targets.strongPredictorCount >= 2],
    ["overall_pass", result.rq4.pass ? "PASS" : "NOT FULLY PASS", "", "", result.rq4.pass],
  ]);
  append("rq4_correlations", [
    ["variable_x", "variable_y", "n", "r", "t", "p", "threshold", "pass"],
    ...result.rq4.correlations.map((item) => [
      item.labelX,
      item.labelY,
      item.n,
      item.r,
      item.tValue,
      item.pValue,
      "r >= .30 and p < .05",
      item.r >= 0.3 && item.pValue < 0.05,
    ]),
  ]);
  append("rq4_logic_checks", [
    ["check", "variable_x", "variable_y", "r", "p", "threshold", "pass"],
    ...result.rq4.logicChecks.map((item) => [
      item.check,
      item.labelX,
      item.labelY,
      item.r,
      item.pValue,
      item.threshold,
      item.passes,
    ]),
  ]);
  append("rq4_hierarchical_regression", [
    ["block", "r_squared", "adjusted_r_squared", "f_value", "model_p", "delta_r_squared", "f_change", "p_change"],
    ["block1", result.rq4.regression.block1.rSquared, result.rq4.regression.block1.adjustedRSquared, result.rq4.regression.block1.fValue, result.rq4.regression.block1.modelPValue, "", "", ""],
    ["block2", result.rq4.regression.block2.rSquared, result.rq4.regression.block2.adjustedRSquared, result.rq4.regression.block2.fValue, result.rq4.regression.block2.modelPValue, result.rq4.regression.deltaRSquared, result.rq4.regression.fChange, result.rq4.regression.pChange],
    [],
    ["predictor", "unstandardized_b", "standardized_beta", "standard_error", "t", "p", "tolerance", "vif"],
    ...result.rq4.regression.block2.coefficients.map((item) => [
      item.predictor,
      item.unstandardizedB,
      item.standardizedBeta,
      item.standardError,
      item.tValue,
      item.pValue,
      item.tolerance,
      item.vif,
    ]),
  ]);
  append("reliability", [
    ["measure", "metric", "value"],
    ...result.reliability.map((item) => [item.measure, item.metric, item.value]),
  ]);
  append("assumption_checks", [
    ["analysis", "check", "value", "rule"],
    ...result.assumptionChecks.map((item) => [item.analysis, item.check, item.value, item.rule]),
  ]);
  append("codebook", [
    ["variable", "source", "role", "scale", "reverse", "description"],
    ...buildUpdatedCodebook(buildCodebook(result.formA, result.formB, result.questionnaire)).map((item) => [
      item.variable,
      item.source,
      item.role,
      item.scale,
      item.reverse,
      item.description,
    ]),
  ]);
  append("criteria", [
    ["RQ1", "MTE ANCOVA", "Adjusted mean diff > 5, p < .05, .06 <= eta_p^2 < .14"],
    ["RQ2", "IMMS MANCOVA", "Overall p < .05; >=2 dimensions p < .0125 and eta_p^2 >= .06; >=1 dimension eta_p^2 >= .10"],
    ["RQ3", "TAM t tests", "PU and PEU both p < .05 and Cohen's d >= 0.5"],
    ["RQ4", "Experimental-group deep use", "Means pass; <=15 low-participation students; >=3 Pearson r >= .30; logic checks pass; Delta R^2 >= .05; >=2 predictors beta >= .20 and p < .05; VIF < 5"],
    [],
    ["Global", "Constraint", "Threshold"],
    ["MTE pre-post correlation", "0.65 <= r <= 0.85"],
    ["MTE KR-20", "Form A >= .80; Form B >= .80"],
    ["IMMS alpha", "All subscales >= .80"],
    ["TAM alpha", "PU/PEU >= .85"],
    ["Levene", "All p > .05"],
    ["Slope homogeneity", "All p > .05"],
    [],
    ["RQ4 Variables", "Meaning", "Target"],
    ["total_time_min", "Deep-use time", ">= 800"],
    ["total_exercises", "Exercises completed", ">= 400"],
    ["overall_accuracy", "Accuracy", ">= 0.55"],
    ["avg_pL", "Average mastery probability", ">= 0.65"],
    ["mastered_count", "Mastered knowledge points", ">= 11"],
    ["tutor_queries", "Tutor usage count", ">= 15"],
    ["error_count", "Incorrect item count", ">= 20"],
  ]);
  xlsx.writeFile(workbook, outputPath, { bookType: "xlsx", compression: true });
}

async function buildReportV2Clean(result, outputPath) {
  const summaryRows = [
    `全局相关约束：${result.summary.correlationPass ? "达标" : "未完全达标"}`,
    `全局信度约束：${result.summary.reliabilityPass ? "达标" : "未完全达标"}`,
    `全局 Levene：${result.summary.levenePass ? "达标" : "未完全达标"}`,
    `全局斜率同质性：${result.summary.slopePass ? "达标" : "未完全达标"}`,
    `RQ1：${result.summary.rq1Pass ? "达标" : "未完全达标"}`,
    `RQ2：${result.summary.rq2Pass ? "达标" : "未完全达标"}`,
    `RQ3：${result.summary.rq3Pass ? "达标" : "未完全达标"}`,
    `RQ4：${result.summary.rq4Pass ? "达标" : "未完全达标"}`,
  ];

  const targetLabelForRq4Metric = (variable) => {
    if (variable === "total_time_min") return ">= 800";
    if (variable === "total_exercises") return ">= 400";
    if (variable === "overall_accuracy") return ">= 0.55";
    if (variable === "avg_pL") return ">= 0.65";
    if (variable === "mastered_count") return ">= 11";
    if (variable === "tutor_queries") return ">= 15";
    return ">= 20";
  };

  const doc = new Document({
    sections: [
      {
        children: [
          paragraph("300 人虚拟实验数据报告（v2）", { heading: HeadingLevel.TITLE }),
          paragraph(
            "本报告基于 Form A、Form B 和 IMMS/TAM 量表，重建 150 名对照组与 150 名实验组的题项级虚拟实验数据，并在同一套数据上同时检验 RQ1–RQ4。",
          ),
          paragraph("研究设计与样本结构", { heading: HeadingLevel.HEADING_1 }),
          paragraph("样本量：300 人；对照组 150 人，实验组 150 人。"),
          paragraph(`前测卷来源：${result.formA.filePath}`),
          paragraph(`后测卷来源：${result.formB.filePath}`),
          paragraph(`量表来源：${result.questionnaire.filePath}`),
          paragraph("信度结果", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Measure", "Metric", "Value"],
            result.reliability.map((item) => [item.measure, item.metric, item.value]),
          ),
          paragraph("前置假设检验", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Analysis", "Check", "Value", "Rule"],
            result.assumptionChecks.map((item) => [
              item.analysis,
              item.check,
              item.value,
              item.rule,
            ]),
          ),
          paragraph("RQ1：MTE 学习成绩", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Metric", "Value"],
            [
              ["Adjusted mean difference", result.analysis.rq1.adjustedMeanDiff],
              ["F", result.analysis.rq1.fValue],
              ["p", result.analysis.rq1.pValue],
              ["Partial eta squared", result.analysis.rq1.etaSquaredPartial],
            ],
          ),
          paragraph("RQ2：IMMS 学习动机", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Overall metric", "Value"],
            [
              ["Pillai's Trace", result.analysis.rq2Multivariate.pillaiTrace],
              ["F", result.analysis.rq2Multivariate.fValue],
              ["p", result.analysis.rq2Multivariate.pValue],
            ],
          ),
          simpleTable(
            ["Dimension", "Adj. diff", "F", "p", "Partial eta squared"],
            result.analysis.rq2Univariate.map((item) => [
              item.label,
              item.adjustedMeanDiff,
              item.fValue,
              item.pValue,
              item.etaSquaredPartial,
            ]),
          ),
          paragraph("RQ3：TAM 技术接受度", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Variable", "Chosen row", "t", "df", "p", "Cohen's d"],
            [
              [
                "PU_mean",
                result.analysis.rq3.PU_mean.chosenRow,
                result.analysis.rq3.PU_mean.tValue,
                result.analysis.rq3.PU_mean.df,
                result.analysis.rq3.PU_mean.pValue,
                result.analysis.rq3.PU_mean.cohensD,
              ],
              [
                "PEU_mean",
                result.analysis.rq3.PEU_mean.chosenRow,
                result.analysis.rq3.PEU_mean.tValue,
                result.analysis.rq3.PEU_mean.df,
                result.analysis.rq3.PEU_mean.pValue,
                result.analysis.rq3.PEU_mean.cohensD,
              ],
            ],
          ),
          paragraph("RQ4：实验组深度使用与学习表现", { heading: HeadingLevel.HEADING_1 }),
          paragraph("RQ4 仅基于实验组 150 人分析；对照组行为变量在总表中保留为空。"),
          simpleTable(
            ["Metric", "Mean", "SD", "Target"],
            result.rq4.summaryMetrics.map((item) => [
              item.variable,
              item.mean,
              item.sd,
              targetLabelForRq4Metric(item.variable),
            ]),
          ),
          paragraph(`低参与学生（time < 600）人数：${result.rq4.lowParticipationCount}`),
          paragraph(
            `与 post_MTE_formB 显著相关且 r >= .30 的行为变量数量：${result.rq4.significantPearsons}`,
          ),
          paragraph("RQ4 Pearson 相关", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Variable", "r", "p", "Pass"],
            result.rq4.correlations.map((item) => [
              item.labelY,
              item.r,
              item.pValue,
              item.r >= 0.3 && item.pValue < 0.05 ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 逻辑一致性检查", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Check", "r", "p", "Threshold", "Pass"],
            result.rq4.logicChecks.map((item) => [
              item.check,
              item.r,
              item.pValue,
              item.threshold,
              item.passes ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 层级回归", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Block", "R²", "Adjusted R²", "ΔR²", "F change", "p change"],
            [
              [
                "Block 1",
                result.rq4.regression.block1.rSquared,
                result.rq4.regression.block1.adjustedRSquared,
                "",
                "",
                "",
              ],
              [
                "Block 2",
                result.rq4.regression.block2.rSquared,
                result.rq4.regression.block2.adjustedRSquared,
                result.rq4.regression.deltaRSquared,
                result.rq4.regression.fChange,
                result.rq4.regression.pChange,
              ],
            ],
          ),
          simpleTable(
            ["Predictor", "Beta", "Std. Beta", "t", "p", "VIF"],
            result.rq4.regression.block2.coefficients.map((item) => [
              item.predictor,
              item.unstandardizedB,
              item.standardizedBeta,
              item.tValue,
              item.pValue,
              item.vif,
            ]),
          ),
          paragraph("最终结论", { heading: HeadingLevel.HEADING_1 }),
          ...summaryRows.map((text) => paragraph(text)),
          paragraph("Excel 工作表说明", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Sheet", "Purpose"],
            [
              ["raw_item_data", "300 行题项级原始数据"],
              ["scale_scores", "MTE、IMMS、TAM 聚合得分与实验组行为变量"],
              ["rq1_ancova", "RQ1 ANCOVA 结果"],
              ["rq2_mancova", "RQ2 MANCOVA 与单变量 ANCOVA 结果"],
              ["rq3_ttests", "RQ3 的 Levene 与 t 检验结果"],
              ["rq4_summary", "实验组 150 人 RQ4 描述统计"],
              ["rq4_correlations", "实验组 150 人 RQ4 Pearson 相关"],
              ["rq4_logic_checks", "RQ4 逻辑一致性检查"],
              ["rq4_hierarchical_regression", "RQ4 层级回归结果"],
              ["reliability", "MTE KR-20 与 IMMS/TAM alpha"],
              ["assumption_checks", "Levene、斜率同质性与 VIF 摘要"],
              ["codebook", "变量字典"],
              ["criteria", "判定标准摘要"],
            ],
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

async function buildReportV2Ascii(result, outputPath) {
  const doc = new Document({
    sections: [
      {
        children: [
          paragraph("300-Participant Virtual Experiment Report (v2)", {
            heading: HeadingLevel.TITLE,
          }),
          paragraph(
            "This report rebuilds item-level virtual data for 150 control and 150 experimental participants using Form A, Form B, and the IMMS/TAM questionnaire.",
          ),
          paragraph("Design Summary", { heading: HeadingLevel.HEADING_1 }),
          paragraph("Sample: 300 participants; 150 control, 150 experimental."),
          paragraph(`Form A source: ${result.formA.filePath}`),
          paragraph(`Form B source: ${result.formB.filePath}`),
          paragraph(`Questionnaire source: ${result.questionnaire.filePath}`),
          paragraph("Reliability", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Measure", "Metric", "Value"],
            result.reliability.map((item) => [item.measure, item.metric, item.value]),
          ),
          paragraph("Assumption Checks", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Analysis", "Check", "Value", "Rule"],
            result.assumptionChecks.map((item) => [
              item.analysis,
              item.check,
              item.value,
              item.rule,
            ]),
          ),
          paragraph("RQ1: MTE Achievement", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Metric", "Value"],
            [
              ["Adjusted mean difference", result.analysis.rq1.adjustedMeanDiff],
              ["F", result.analysis.rq1.fValue],
              ["p", result.analysis.rq1.pValue],
              ["Partial eta squared", result.analysis.rq1.etaSquaredPartial],
            ],
          ),
          paragraph("RQ2: IMMS Motivation", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Overall metric", "Value"],
            [
              ["Pillai's Trace", result.analysis.rq2Multivariate.pillaiTrace],
              ["F", result.analysis.rq2Multivariate.fValue],
              ["p", result.analysis.rq2Multivariate.pValue],
            ],
          ),
          simpleTable(
            ["Dimension", "Adj. diff", "F", "p", "Partial eta squared"],
            result.analysis.rq2Univariate.map((item) => [
              item.label,
              item.adjustedMeanDiff,
              item.fValue,
              item.pValue,
              item.etaSquaredPartial,
            ]),
          ),
          paragraph("RQ3: TAM Acceptance", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Variable", "Chosen row", "t", "df", "p", "Cohen's d"],
            [
              [
                "PU_mean",
                result.analysis.rq3.PU_mean.chosenRow,
                result.analysis.rq3.PU_mean.tValue,
                result.analysis.rq3.PU_mean.df,
                result.analysis.rq3.PU_mean.pValue,
                result.analysis.rq3.PU_mean.cohensD,
              ],
              [
                "PEU_mean",
                result.analysis.rq3.PEU_mean.chosenRow,
                result.analysis.rq3.PEU_mean.tValue,
                result.analysis.rq3.PEU_mean.df,
                result.analysis.rq3.PEU_mean.pValue,
                result.analysis.rq3.PEU_mean.cohensD,
              ],
            ],
          ),
          paragraph("RQ4: Deep Use and Performance", { heading: HeadingLevel.HEADING_1 }),
          paragraph("RQ4 is evaluated only on the 150 experimental participants."),
          simpleTable(
            ["Metric", "Mean", "SD"],
            result.rq4.summaryMetrics.map((item) => [
              item.variable,
              item.mean,
              item.sd,
            ]),
          ),
          paragraph(`Low-participation count (time < 600): ${result.rq4.lowParticipationCount}`),
          paragraph(`Significant Pearson count (r >= .30): ${result.rq4.significantPearsons}`),
          paragraph("RQ4 Correlations", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Variable", "r", "p", "Pass"],
            result.rq4.correlations.map((item) => [
              item.labelY,
              item.r,
              item.pValue,
              item.r >= 0.3 && item.pValue < 0.05 ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 Logic Checks", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Check", "r", "p", "Threshold", "Pass"],
            result.rq4.logicChecks.map((item) => [
              item.check,
              item.r,
              item.pValue,
              item.threshold,
              item.passes ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 Hierarchical Regression", {
            heading: HeadingLevel.HEADING_2,
          }),
          simpleTable(
            ["Block", "R2", "Adj. R2", "Delta R2", "F change", "p change"],
            [
              [
                "Block 1",
                result.rq4.regression.block1.rSquared,
                result.rq4.regression.block1.adjustedRSquared,
                "",
                "",
                "",
              ],
              [
                "Block 2",
                result.rq4.regression.block2.rSquared,
                result.rq4.regression.block2.adjustedRSquared,
                result.rq4.regression.deltaRSquared,
                result.rq4.regression.fChange,
                result.rq4.regression.pChange,
              ],
            ],
          ),
          simpleTable(
            ["Predictor", "B", "Std. Beta", "t", "p", "VIF"],
            result.rq4.regression.block2.coefficients.map((item) => [
              item.predictor,
              item.unstandardizedB,
              item.standardizedBeta,
              item.tValue,
              item.pValue,
              item.vif,
            ]),
          ),
          paragraph("Final Status", { heading: HeadingLevel.HEADING_1 }),
          paragraph(`Global correlation: ${result.summary.correlationPass ? "pass" : "not pass"}`),
          paragraph(`Global reliability: ${result.summary.reliabilityPass ? "pass" : "not pass"}`),
          paragraph(`Global Levene: ${result.summary.levenePass ? "pass" : "not pass"}`),
          paragraph(`Global slope checks: ${result.summary.slopePass ? "pass" : "not pass"}`),
          paragraph(`RQ1: ${result.summary.rq1Pass ? "pass" : "not pass"}`),
          paragraph(`RQ2: ${result.summary.rq2Pass ? "pass" : "not pass"}`),
          paragraph(`RQ3: ${result.summary.rq3Pass ? "pass" : "not pass"}`),
          paragraph(`RQ4: ${result.summary.rq4Pass ? "pass" : "not pass"}`),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

function recomputeMteScoresFromRaw(rawRows, formAItems, formBItems) {
  const byId = new Map();
  for (const row of rawRows) {
    byId.set(row.studentId, {
      pre_MTE_formA:
        formAItems.reduce((sum, item) => sum + safeNumber(row[item.itemId], 0), 0) * 2,
      post_MTE_formB:
        formBItems.reduce((sum, item) => sum + safeNumber(row[item.itemId], 0), 0) * 2,
    });
  }
  return byId;
}

function refreshCandidateAfterRawUpdate(candidate, rawItemData) {
  const mteScoreById = recomputeMteScoresFromRaw(
    rawItemData,
    candidate.formA.items,
    candidate.formB.items,
  );
  const scaleScores = candidate.scaleScores.map((row) => {
    const mte = mteScoreById.get(row.studentId);
    return {
      ...row,
      pre_MTE_formA: mte.pre_MTE_formA,
      post_MTE_formB: mte.post_MTE_formB,
    };
  });
  const analysis = buildAnalysis(scaleScores);
  const reliability = computeReliability(
    candidate.formA,
    candidate.formB,
    rawItemData,
    candidate.questionnaire,
  );
  const assumptionChecks = buildAssumptionChecksV2(scaleScores, analysis);
  const duplicateProfiles = checkDuplicateProfiles(rawItemData);
  const prePostCorrelation = correlation(
    scaleScores.map((row) => row.pre_MTE_formA),
    scaleScores.map((row) => row.post_MTE_formB),
  );
  const rq4 = buildRq4AnalysisV2(scaleScores);
  const next = {
    ...candidate,
    rawItemData,
    scaleScores,
    analysis,
    reliability,
    assumptionChecks,
    duplicateProfiles,
    prePostCorrelation: roundTo(prePostCorrelation, 4),
    rq4,
  };
  next.summary = summarizeTargetsV2(next);
  next.score = targetScoreV2(next);
  return next;
}

function softenCorrelationIfNeeded(candidate) {
  const hardPassesExceptCorrelation =
    candidate.summary.reliabilityPass &&
    candidate.summary.levenePass &&
    candidate.summary.slopePass &&
    candidate.summary.rq1Pass &&
    candidate.summary.rq2Pass &&
    candidate.summary.rq3Pass &&
    candidate.summary.rq4Pass &&
    candidate.duplicateProfiles === 0;

  if (!hardPassesExceptCorrelation || candidate.prePostCorrelation <= 0.85) {
    return candidate;
  }

  const orderedFormAItems = [...candidate.formA.items].sort(
    (a, b) => Math.abs(a.threshold) - Math.abs(b.threshold),
  );
  let working = candidate;

  for (let round = 0; round < 8; round += 1) {
    if (working.prePostCorrelation <= 0.85) {
      break;
    }

    const rawRows = working.rawItemData.map((row) => ({ ...row }));
    const mteScores = recomputeMteScoresFromRaw(
      rawRows,
      working.formA.items,
      working.formB.items,
    );
    const scoreRows = rawRows.map((row) => ({
      studentId: row.studentId,
      group: safeNumber(row.group, 0),
      pre: mteScores.get(row.studentId).pre_MTE_formA,
      post: mteScores.get(row.studentId).post_MTE_formB,
    }));
    const preScores = scoreRows.map((row) => row.pre);
    const postScores = scoreRows.map((row) => row.post);
    const preMean = mean(preScores);
    const preSd = sd(preScores) || 1;
    const postMean = mean(postScores);
    const postSd = sd(postScores) || 1;

    const annotated = scoreRows.map((row) => ({
      ...row,
      preZ: (row.pre - preMean) / preSd,
      postZ: (row.post - postMean) / postSd,
    }));

    const highByGroup = [0, 1].flatMap((group) =>
      annotated
        .filter((row) => row.group === group && row.preZ > 0.5 && row.postZ > 0.5)
        .sort((a, b) => b.preZ + b.postZ - (a.preZ + a.postZ))
        .slice(0, 3)
        .map((row) => ({ ...row, action: "decrease" })),
    );
    const lowByGroup = [0, 1].flatMap((group) =>
      annotated
        .filter((row) => row.group === group && row.preZ < -0.5 && row.postZ < -0.5)
        .sort((a, b) => a.preZ + a.postZ - (b.preZ + b.postZ))
        .slice(0, 3)
        .map((row) => ({ ...row, action: "increase" })),
    );

    const targets = [...highByGroup, ...lowByGroup];
    if (targets.length === 0) {
      break;
    }

    for (const target of targets) {
      const rawRow = rawRows.find((row) => row.studentId === target.studentId);
      if (!rawRow) continue;
      if (target.action === "decrease") {
        const item = orderedFormAItems.find((formItem) => safeNumber(rawRow[formItem.itemId], 0) === 1);
        if (item) rawRow[item.itemId] = 0;
      } else {
        const item = orderedFormAItems.find((formItem) => safeNumber(rawRow[formItem.itemId], 0) === 0);
        if (item) rawRow[item.itemId] = 1;
      }
    }

    const adjusted = refreshCandidateAfterRawUpdate(working, rawRows);
    const adjustedHardPasses =
      adjusted.summary.reliabilityPass &&
      adjusted.summary.levenePass &&
      adjusted.summary.slopePass &&
      adjusted.summary.rq1Pass &&
      adjusted.summary.rq2Pass &&
      adjusted.summary.rq3Pass &&
      adjusted.summary.rq4Pass &&
      adjusted.duplicateProfiles === 0;

    if (
      adjustedHardPasses &&
      adjusted.prePostCorrelation < working.prePostCorrelation
    ) {
      working = adjusted;
    } else {
      break;
    }
  }

  return working;
}

async function buildReportV2(result, outputPath) {
  const doc = new Document({
    sections: [
      {
        children: [
          paragraph("300 人虚拟实验数据报告（v2）", { heading: HeadingLevel.TITLE }),
          paragraph("本报告基于 Form A、Form B 与 IMMS/TAM 量表，重建 150 名对照组和 150 名实验组的题项级虚拟实验数据，并在同一套数据上同时满足 RQ1–RQ4 的统计目标。"),
          paragraph("研究设计与样本结构", { heading: HeadingLevel.HEADING_1 }),
          paragraph("样本量：300 人；对照组 150 人，实验组 150 人。"),
          paragraph(`前测卷来源：${result.formA.filePath}`),
          paragraph(`后测卷来源：${result.formB.filePath}`),
          paragraph(`量表来源：${result.questionnaire.filePath}`),
          paragraph("信度结果", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Measure", "Metric", "Value"],
            result.reliability.map((item) => [item.measure, item.metric, item.value]),
          ),
          paragraph("前置假设检验", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Analysis", "Check", "Value", "Rule"],
            result.assumptionChecks.map((item) => [item.analysis, item.check, item.value, item.rule]),
          ),
          paragraph("RQ1 · MTE 学习成绩", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Metric", "Value"],
            [
              ["Adjusted mean difference", result.analysis.rq1.adjustedMeanDiff],
              ["F", result.analysis.rq1.fValue],
              ["p", result.analysis.rq1.pValue],
              ["Partial eta squared", result.analysis.rq1.etaSquaredPartial],
            ],
          ),
          paragraph("RQ2 · IMMS 学习动机", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Overall metric", "Value"],
            [
              ["Pillai's Trace", result.analysis.rq2Multivariate.pillaiTrace],
              ["F", result.analysis.rq2Multivariate.fValue],
              ["p", result.analysis.rq2Multivariate.pValue],
            ],
          ),
          simpleTable(
            ["Dimension", "Adj. diff", "F", "p", "Partial eta squared"],
            result.analysis.rq2Univariate.map((item) => [
              item.label,
              item.adjustedMeanDiff,
              item.fValue,
              item.pValue,
              item.etaSquaredPartial,
            ]),
          ),
          paragraph("RQ3 · TAM 技术接受度", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Variable", "Chosen row", "t", "df", "p", "Cohen's d"],
            [
              ["PU_mean", result.analysis.rq3.PU_mean.chosenRow, result.analysis.rq3.PU_mean.tValue, result.analysis.rq3.PU_mean.df, result.analysis.rq3.PU_mean.pValue, result.analysis.rq3.PU_mean.cohensD],
              ["PEU_mean", result.analysis.rq3.PEU_mean.chosenRow, result.analysis.rq3.PEU_mean.tValue, result.analysis.rq3.PEU_mean.df, result.analysis.rq3.PEU_mean.pValue, result.analysis.rq3.PEU_mean.cohensD],
            ],
          ),
          paragraph("RQ4 · 实验组深度使用与学习表现", { heading: HeadingLevel.HEADING_1 }),
          paragraph("RQ4 仅基于实验组 150 人分析；对照组行为变量在总表中保留为空。"),
          simpleTable(
            ["Metric", "Mean", "SD", "Target"],
            result.rq4.summaryMetrics.map((item) => [
              item.variable,
              item.mean,
              item.sd,
              item.variable === "total_time_min"
                ? ">= 800"
                : item.variable === "total_exercises"
                  ? ">= 400"
                  : item.variable === "overall_accuracy"
                    ? ">= 0.55"
                    : item.variable === "avg_pL"
                      ? ">= 0.65"
                      : item.variable === "mastered_count"
                        ? ">= 11"
                        : item.variable === "tutor_queries"
                          ? ">= 15"
                          : ">= 20",
            ]),
          ),
          paragraph(`低参与学生（time < 600）人数：${result.rq4.lowParticipationCount}`),
          paragraph(`与 post_MTE_formB 显著相关且 r >= .30 的行为变量数量：${result.rq4.significantPearsons}`),
          paragraph("RQ4 Pearson 相关", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Variable", "r", "p", "Pass"],
            result.rq4.correlations.map((item) => [
              item.labelY,
              item.r,
              item.pValue,
              item.r >= 0.3 && item.pValue < 0.05 ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 逻辑一致性检查", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Check", "r", "p", "Threshold", "Pass"],
            result.rq4.logicChecks.map((item) => [
              item.check,
              item.r,
              item.pValue,
              item.threshold,
              item.passes ? "Yes" : "No",
            ]),
          ),
          paragraph("RQ4 层级回归", { heading: HeadingLevel.HEADING_2 }),
          simpleTable(
            ["Block", "R²", "Adjusted R²", "ΔR²", "F change", "p change"],
            [
              ["Block 1", result.rq4.regression.block1.rSquared, result.rq4.regression.block1.adjustedRSquared, "", "", ""],
              ["Block 2", result.rq4.regression.block2.rSquared, result.rq4.regression.block2.adjustedRSquared, result.rq4.regression.deltaRSquared, result.rq4.regression.fChange, result.rq4.regression.pChange],
            ],
          ),
          simpleTable(
            ["Predictor", "Beta", "Std. Beta", "t", "p", "VIF"],
            result.rq4.regression.block2.coefficients.map((item) => [
              item.predictor,
              item.unstandardizedB,
              item.standardizedBeta,
              item.tValue,
              item.pValue,
              item.vif,
            ]),
          ),
          paragraph("最终结论", { heading: HeadingLevel.HEADING_1 }),
          paragraph(`全局相关约束：${result.summary.correlationPass ? "达标" : "未完全达标"}`),
          paragraph(`全局信度约束：${result.summary.reliabilityPass ? "达标" : "未完全达标"}`),
          paragraph(`全局 Levene：${result.summary.levenePass ? "达标" : "未完全达标"}`),
          paragraph(`全局斜率同质性：${result.summary.slopePass ? "达标" : "未完全达标"}`),
          paragraph(`RQ1：${result.summary.rq1Pass ? "达标" : "未完全达标"}`),
          paragraph(`RQ2：${result.summary.rq2Pass ? "达标" : "未完全达标"}`),
          paragraph(`RQ3：${result.summary.rq3Pass ? "达标" : "未完全达标"}`),
          paragraph(`RQ4：${result.summary.rq4Pass ? "达标" : "未完全达标"}`),
          paragraph("Excel 工作表说明", { heading: HeadingLevel.HEADING_1 }),
          simpleTable(
            ["Sheet", "Purpose"],
            [
              ["raw_item_data", "300 行题项级原始数据"],
              ["scale_scores", "MTE、IMMS、TAM 聚合得分与实验组行为变量"],
              ["rq1_ancova", "RQ1 ANCOVA 结果"],
              ["rq2_mancova", "RQ2 MANCOVA 与单变量 ANCOVA 结果"],
              ["rq3_ttests", "RQ3 的 Levene 与 t 检验结果"],
              ["rq4_summary", "实验组 150 人 RQ4 描述统计"],
              ["rq4_correlations", "实验组 150 人 RQ4 Pearson 相关"],
              ["rq4_logic_checks", "RQ4 逻辑一致性检查"],
              ["rq4_hierarchical_regression", "RQ4 层级回归结果"],
              ["reliability", "MTE KR-20 与 IMMS/TAM alpha"],
              ["assumption_checks", "Levene、斜率同质性与 VIF 摘要"],
              ["codebook", "变量字典"],
              ["criteria", "判定标准摘要"],
            ],
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

export async function buildExperimentSimulationPackageV2(
  config = EXPERIMENT_SIM_V2_CONFIG,
) {
  const formA = parseMteWorkbook(config.formAPath, "FA", "MTE 50题试卷");
  const formB = parseMteWorkbook(config.formBPath, "FB", "MTE Form B (平行版)");
  const questionnaire = parseImmsTamWorkbook(config.questionnairePath);
  const students = buildBaseStudentsV2(config);
  const studentsById = new Map(students.map((student) => [student.studentId, student]));

  let best = null;
  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const params = buildParamCandidateV2(iteration, config);
    const formAPre = simulateMteResponsesV2(formA.items, students, params, "pre");
    const formBPost = simulateMteResponsesV2(formB.items, students, params, "post");
    const immsTam = simulateImmsTamV2(questionnaire, students, params);
    const rawItemData = mergeRawRows(formAPre.rows, formBPost.rows);
    const mergedRawItemData = mergeRawRows(rawItemData, immsTam.rawRows)
      .sort((a, b) => a.studentId.localeCompare(b.studentId));
    const scaleScoresBase = buildDerivedScaleRows(
      formAPre.scoreRows,
      formBPost.scoreRows,
      immsTam.scaleRows,
    );
    const behaviorRows = buildRq4BehaviorDatasetV2(scaleScoresBase, studentsById, params);
    const behaviorById = new Map(behaviorRows.map((row) => [row.studentId, row]));
    const scaleScores = scaleScoresBase.map((row) => {
      const behavior = behaviorById.get(row.studentId);
      return {
        ...row,
        total_time_min: behavior ? behavior.total_time_min : null,
        total_exercises: behavior ? behavior.total_exercises : null,
        overall_accuracy: behavior ? behavior.overall_accuracy : null,
        avg_pL: behavior ? behavior.avg_pL : null,
        mastered_count: behavior ? behavior.mastered_count : null,
        tutor_queries: behavior ? behavior.tutor_queries : null,
        error_count: behavior ? behavior.error_count : null,
      };
    });
    const rawWithBehavior = mergedRawItemData.map((row) => {
      const behavior = behaviorById.get(row.studentId);
      return {
        ...row,
        total_time_min: behavior ? behavior.total_time_min : null,
        total_exercises: behavior ? behavior.total_exercises : null,
        overall_accuracy: behavior ? behavior.overall_accuracy : null,
        avg_pL: behavior ? behavior.avg_pL : null,
        mastered_count: behavior ? behavior.mastered_count : null,
        tutor_queries: behavior ? behavior.tutor_queries : null,
        error_count: behavior ? behavior.error_count : null,
      };
    });

    const analysis = buildAnalysis(scaleScores);
    const reliability = computeReliability(formA, formB, mergedRawItemData, questionnaire);
    const assumptionChecks = buildAssumptionChecksV2(scaleScores, analysis);
    const duplicateProfiles = checkDuplicateProfiles(mergedRawItemData);
    const prePostCorrelation = correlation(
      scaleScores.map((row) => row.pre_MTE_formA),
      scaleScores.map((row) => row.post_MTE_formB),
    );
    const rq4 = buildRq4AnalysisV2(scaleScores);
    const candidate = {
      params,
      formA,
      formB,
      questionnaire,
      rawItemData: rawWithBehavior,
      scaleScores,
      analysis,
      reliability,
      assumptionChecks,
      duplicateProfiles,
      prePostCorrelation: roundTo(prePostCorrelation, 4),
      rq4,
    };
    candidate.summary = summarizeTargetsV2(candidate);
    candidate.score = targetScoreV2(candidate);
    if (!best || candidate.score < best.score) {
      best = candidate;
    }
    if (
      candidate.summary.correlationPass &&
      candidate.summary.reliabilityPass &&
      candidate.summary.levenePass &&
      candidate.summary.slopePass &&
      candidate.summary.rq1Pass &&
      candidate.summary.rq2Pass &&
      candidate.summary.rq3Pass &&
      candidate.summary.rq4Pass &&
      duplicateProfiles === 0
    ) {
      best = candidate;
      break;
    }
  }

  if (!best) {
    throw new Error("Failed to generate a v2 experiment simulation candidate.");
  }

  best = softenCorrelationIfNeeded(best);

  ensureDir(config.outputDir);
  const workbookPath = path.join(config.outputDir, config.outputWorkbook);
  const reportPath = path.join(config.outputDir, config.outputReport);
  buildWorkbookV2(best, workbookPath);
  await buildReportV2Ascii(best, reportPath);
  return {
    ...best,
    outputWorkbookPath: workbookPath,
    outputReportPath: reportPath,
  };
}
