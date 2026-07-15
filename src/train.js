import {readFileSync, writeFileSync, mkdirSync} from "fs";
import {parse} from "csv-parse/sync";
import {stringify} from "csv-stringify/sync";

const IDENTIFIER_COLUMNS = new Set(["client_id", "as_of_date", "renewal_date"]);
const TARGET_COLUMNS = new Set(["churned", "renewed"]);
const DEFAULT_INPUT = "data/client_renewal_data.csv";

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function matrixMul(A, B) {
  const result = [];
  for (let i = 0; i < A.length; i++) {
    result[i] = [];
    for (let j = 0; j < B[0].length; j++) {
      let sum = 0;
      for (let k = 0; k < A[0].length; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function transpose(M) {
  const result = [];
  for (let j = 0; j < M[0].length; j++) {
    result[j] = [];
    for (let i = 0; i < M.length; i++) {
      result[j][i] = M[i][j];
    }
  }
  return result;
}

function addScalar(M, scalar) {
  const result = [];
  for (let i = 0; i < M.length; i++) {
    result[i] = [];
    for (let j = 0; j < M[0].length; j++) {
      result[i][j] = M[i][j] + scalar;
    }
  }
  return result;
}

function mulScalar(M, scalar) {
  const result = [];
  for (let i = 0; i < M.length; i++) {
    result[i] = [];
    for (let j = 0; j < M[0].length; j++) {
      result[i][j] = M[i][j] * scalar;
    }
  }
  return result;
}

function sub(M1, M2) {
  const result = [];
  for (let i = 0; i < M1.length; i++) {
    result[i] = [];
    for (let j = 0; j < M1[0].length; j++) {
      result[i][j] = M1[i][j] - M2[i][j];
    }
  }
  return result;
}

function sigmoidMatrix(M) {
  const result = [];
  for (let i = 0; i < M.length; i++) {
    result[i] = [];
    for (let j = 0; j < M[0].length; j++) {
      result[i][j] = sigmoid(M[i][j]);
    }
  }
  return result;
}

class StandardScaler {
  constructor() {
    this.means = [];
    this.stds = [];
  }

  fit(X) {
    const n = X.length;
    const m = X[0].length;
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += X[i][j];
      const mean = sum / n;
      let sqSum = 0;
      for (let i = 0; i < n; i++) sqSum += (X[i][j] - mean) ** 2;
      this.means.push(mean);
      this.stds.push(Math.sqrt(sqSum / n) || 1);
    }
  }

  transform(X) {
    return X.map(row => row.map((v, j) => (v - this.means[j]) / this.stds[j]));
  }
}

class OneHotEncoder {
  constructor() {
    this.categories = [];
  }

  fit(X) {
    const m = X[0].length;
    for (let j = 0; j < m; j++) {
      const cats = [...new Set(X.map(row => row[j]))].sort();
      this.categories.push(cats);
    }
  }

  transform(X) {
    const result = [];
    for (const row of X) {
      const encoded = [];
      for (let j = 0; j < row.length; j++) {
        for (const cat of this.categories[j]) {
          encoded.push(row[j] === cat ? 1 : 0);
        }
      }
      result.push(encoded);
    }
    return result;
  }
}

class LogisticRegression {
  constructor({maxIter = 1000, classWeight = null} = {}) {
    this.maxIter = maxIter;
    this.classWeight = classWeight;
    this.weights = null;
    this.bias = 0;
  }

  fit(X, y) {
    const n = X.length;
    const m = X[0].length;
    const lr = 0.1;

    let w = new Array(m).fill(0);
    let b = 0;

    const weight0 = this.classWeight === "balanced"
      ? n / (2 * y.filter(v => v === 0).length)
      : 1;
    const weight1 = this.classWeight === "balanced"
      ? n / (2 * y.filter(v => v === 1).length)
      : 1;

    for (let iter = 0; iter < this.maxIter; iter++) {
      let dw = new Array(m).fill(0);
      let db = 0;

      for (let i = 0; i < n; i++) {
        const z = X[i].reduce((sum, xj, j) => sum + xj * w[j], 0) + b;
        const pred = sigmoid(z);
        const sampleWeight = y[i] === 1 ? weight1 : weight0;
        const error = (pred - y[i]) * sampleWeight / n;

        for (let j = 0; j < m; j++) {
          dw[j] += X[i][j] * error;
        }
        db += error;
      }

      for (let j = 0; j < m; j++) w[j] -= lr * dw[j];
      b -= lr * db;
    }

    this.weights = w;
    this.bias = b;
  }

  predictProba(X) {
    return X.map(row => {
      const z = row.reduce((sum, xj, j) => sum + xj * this.weights[j], 0) + this.bias;
      return sigmoid(z);
    });
  }
}

function rocAucScore(yTrue, yScore) {
  const n = yTrue.length;
  const pairs = yTrue.map((v, i) => ({true: v, score: yScore[i]}));
  pairs.sort((a, b) => a.score - b.score);

  const nPos = yTrue.filter(v => v === 1).length;
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;

  let rankSum = 0;
  for (let i = 0; i < n; i++) {
    if (pairs[i].true === 1) rankSum += i + 1;
  }

  return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}

function averagePrecisionScore(yTrue, yScore) {
  const pairs = yTrue.map((v, i) => ({true: v, score: yScore[i]}));
  pairs.sort((a, b) => b.score - a.score);

  let tp = 0;
  let fp = 0;
  let prevPrecision = 1;
  let prevRecall = 0;
  let ap = 0;

  for (const p of pairs) {
    if (p.true === 1) tp++;
    else fp++;

    const precision = tp / (tp + fp);
    const recall = tp / yTrue.filter(v => v === 1).length;

    if (tp > 0 && p.true === 1) {
      ap += precision * (recall - prevRecall);
    }
    prevRecall = recall;
    prevPrecision = precision;
  }

  return ap;
}

function buildColumns(df) {
  const columns = Object.keys(df[0]);
  const numericCols = [];
  const categoricalCols = [];

  for (const col of columns) {
    if (IDENTIFIER_COLUMNS.has(col) || TARGET_COLUMNS.has(col)) continue;
    if (typeof df[0][col] === "number" || typeof df[0][col] === "boolean") {
      numericCols.push(col);
    } else {
      categoricalCols.push(col);
    }
  }

  return {numericCols, categoricalCols, featureCols: [...numericCols, ...categoricalCols]};
}

function extractMatrix(df, cols) {
  return df.map(row => cols.map(col => {
    const v = row[col];
    return v == null || v === "" ? NaN : Number(v);
  }));
}

function extractStringMatrix(df, cols) {
  return df.map(row => cols.map(col => String(row[col])));
}

function imputeNumeric(X) {
  const m = X[0].length;
  const medians = [];
  for (let j = 0; j < m; j++) {
    const values = X.map(row => row[j]).filter(v => !isNaN(v)).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    medians.push(values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]);
  }
  return X.map(row => row.map((v, j) => isNaN(v) ? medians[j] : v));
}

function imputeCategorical(X) {
  const m = X[0].length;
  const modes = [];
  for (let j = 0; j < m; j++) {
    const counts = {};
    for (const row of X) {
      counts[row[j]] = (counts[row[j]] || 0) + 1;
    }
    let maxCount = 0;
    let mode = "";
    for (const [val, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mode = val;
      }
    }
    modes.push(mode || "");
  }
  return X.map(row => row.map((v, j) => (v === "undefined" || v === "" || v == null) ? modes[j] : v));
}

function trainTestSplit(X, y, testSize, randomState) {
  const seed = randomState || 42;
  const rng = () => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  };
  const rand = rng();

  const indices = X.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const splitIdx = Math.floor(X.length * (1 - testSize));
  const trainIdx = indices.slice(0, splitIdx);
  const testIdx = indices.slice(splitIdx);

  return {
    xTrain: trainIdx.map(i => X[i]),
    xTest: testIdx.map(i => X[i]),
    yTrain: trainIdx.map(i => y[i]),
    yTest: testIdx.map(i => y[i]),
  };
}

function evaluateBinaryModel(model, XTest, yTest) {
  const proba = model.predictProba(XTest);
  const predictions = proba.map(p => p >= 0.5 ? 1 : 0);

  const rocAuc = rocAucScore(yTest, proba);
  const avgPrecision = averagePrecisionScore(yTest, proba);

  const tp = predictions.reduce((s, p, i) => s + (p === 1 && yTest[i] === 1 ? 1 : 0), 0);
  const fp = predictions.reduce((s, p, i) => s + (p === 1 && yTest[i] === 0 ? 1 : 0), 0);
  const fn = predictions.reduce((s, p, i) => s + (p === 0 && yTest[i] === 1 ? 1 : 0), 0);
  const tn = predictions.reduce((s, p, i) => s + (p === 0 && yTest[i] === 0 ? 1 : 0), 0);

  const precision0 = tn + fp > 0 ? tn / (tn + fp) : 0;
  const recall0 = tn + fp > 0 ? tn / (tn + fp) : 0;
  const f1_0 = precision0 + recall0 > 0 ? 2 * precision0 * recall0 / (precision0 + recall0) : 0;

  const precision1 = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall1 = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1_1 = precision1 + recall1 > 0 ? 2 * precision1 * recall1 / (precision1 + recall1) : 0;

  const accuracy = (tp + tn) / yTest.length;

  return {
    roc_auc: rocAuc,
    average_precision: avgPrecision,
    classification_report: {
      "0": {precision: precision0, recall: recall0, "f1-score": f1_0, support: yTest.filter(v => v === 0).length},
      "1": {precision: precision1, recall: recall1, "f1-score": f1_1, support: yTest.filter(v => v === 1).length},
      accuracy,
      "macro avg": {
        precision: (precision0 + precision1) / 2,
        recall: (recall0 + recall1) / 2,
        "f1-score": (f1_0 + f1_1) / 2,
        support: yTest.length,
      },
      "weighted avg": {
        precision: (precision0 * yTest.filter(v => v === 0).length + precision1 * yTest.filter(v => v === 1).length) / yTest.length,
        recall: (recall0 * yTest.filter(v => v === 0).length + recall1 * yTest.filter(v => v === 1).length) / yTest.length,
        "f1-score": (f1_0 * yTest.filter(v => v === 0).length + f1_1 * yTest.filter(v => v === 1).length) / yTest.length,
        support: yTest.length,
      },
    },
  };
}

function buildPreprocessor(data) {
  const {numericCols, categoricalCols} = buildColumns(data);

  return {
    numericCols,
    categoricalCols,
    numericScaler: null,
    catEncoder: null,
    fit(XNum, XCat) {
      const imputedNum = imputeNumeric(XNum);
      this.numericScaler = new StandardScaler();
      this.numericScaler.fit(imputedNum);

      const imputedCat = imputeCategorical(XCat);
      this.catEncoder = new OneHotEncoder();
      this.catEncoder.fit(imputedCat);
    },
    transform(XNum, XCat) {
      const imputedNum = imputeNumeric(XNum);
      const scaled = this.numericScaler.transform(imputedNum);

      const imputedCat = imputeCategorical(XCat);
      const encoded = this.catEncoder.transform(imputedCat);

      return scaled.map((row, i) => [...row, ...encoded[i]]);
    },
  };
}

function buildModel(data) {
  const preprocessor = buildPreprocessor(data);
  const model = new LogisticRegression({maxIter: 1000, classWeight: "balanced"});
  return {preprocessor, model};
}

function trainTargetModel(data, target) {
  const {featureCols} = buildColumns(data);
  const X = data.map(row => featureCols.map(col => row[col]));
  const y = data.map(row => row[target]);

  const {numericCols, categoricalCols} = buildColumns(data);
  const XNum = extractMatrix(data, numericCols);
  const XCat = extractStringMatrix(data, categoricalCols);

  const {xTrain, xTest, yTrain, yTest, trainIdx, testIdx} = (() => {
    const seed = 42;
    let seedState = seed;
    const rand = () => {
      seedState = (seedState * 1664525 + 1013904223) & 0xffffffff;
      return (seedState >>> 0) / 0xffffffff;
    };

    const indices = X.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const splitIdx = Math.floor(X.length * 0.75);
    const trainIdx = indices.slice(0, splitIdx);
    const testIdx = indices.slice(splitIdx);

    return {
      xTrain: XNum.filter((_, i) => trainIdx.includes(i)),
      xTest: XNum.filter((_, i) => testIdx.includes(i)),
      yTrain: y.filter((_, i) => trainIdx.includes(i)),
      yTest: y.filter((_, i) => testIdx.includes(i)),
      trainIdx,
      testIdx,
    };
  })();

  const {model, preprocessor} = buildModel(data);

  const xCatTrain = data.filter((_, i) => trainIdx.includes(i));
  const xCatTrainMatrix = extractStringMatrix(xCatTrain, categoricalCols);
  preprocessor.fit(xTrain, xCatTrainMatrix);

  const xTrainTransformed = preprocessor.transform(xTrain, xCatTrainMatrix);
  model.fit(xTrainTransformed, yTrain);

  const xTestCat = data.filter((_, i) => testIdx.includes(i));
  const xTestCatMatrix = extractStringMatrix(xTestCat, categoricalCols);
  const xTestTransformed = preprocessor.transform(xTest, xTestCatMatrix);
  const metrics = evaluateBinaryModel(model, xTestTransformed, yTest);

  const XCatAll = extractStringMatrix(data, categoricalCols);
  const XAllTransformed = preprocessor.transform(XNum, XCatAll);
  const fullProbabilities = model.predictProba(XAllTransformed);

  return {model, preprocessor, metrics, fullProbabilities};
}

function deriveRiskSegment(churnProbability, renewalProbability) {
  if (churnProbability >= 0.8) return "critical_risk";
  if (churnProbability >= 0.6) return "high_risk";
  if (churnProbability >= 0.35) return "watchlist";
  if (renewalProbability >= 0.8 && churnProbability < 0.2) return "expansion_ready";
  return "healthy";
}

function recommendAction(segment) {
  const recommendations = {
    critical_risk: "Launch executive rescue plan, fix blockers, and assign weekly renewal recovery review.",
    high_risk: "Run value review, sponsor mapping, and targeted adoption intervention within 2 weeks.",
    watchlist: "Increase monitoring cadence and resolve adoption, support, or billing friction early.",
    healthy: "Maintain standard success motion and confirm renewal timeline.",
    expansion_ready: "Pursue early renewal and expansion conversation.",
  };
  return recommendations[segment];
}

function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  const input = inputIdx >= 0 ? args[inputIdx + 1] : DEFAULT_INPUT;
  const outputDirIdx = args.indexOf("--output-dir");
  const outputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : "outputs";

  if (!input) {
    console.error(`Usage: node src/train.js [--input <csv>] [--output-dir <dir>]\nDefault input: ${DEFAULT_INPUT}`);
    process.exit(1);
  }

  mkdirSync(outputDir, {recursive: true});

  const csvData = readFileSync(input, "utf-8");
  const data = parse(csvData, {columns: true, skip_empty_lines: true, cast: (value, context) => {
    if (context.column === "client_id" || context.column === "as_of_date" || context.column === "renewal_date" || context.column === "plan_type" || context.column === "industry" || context.column === "region") return value;
    const num = Number(value);
    return isNaN(num) ? value : num;
  }});

  const requiredTargets = ["churned", "renewed"];
  const missingTargets = requiredTargets.filter(t => !data[0] || !(t in data[0]));
  if (missingTargets.length > 0) {
    console.error(`Missing required target columns: ${missingTargets}`);
    process.exit(1);
  }

  const churnResult = trainTargetModel(data, "churned");
  const renewalResult = trainTargetModel(data, "renewed");

  const writeJson = (path, obj) => {
    writeFileSync(path, JSON.stringify(obj, null, 2));
  };

  writeJson(`${outputDir}/churn_model_metrics.json`, churnResult.metrics);
  writeJson(`${outputDir}/renewal_model_metrics.json`, renewalResult.metrics);

  const idCols = ["client_id", "as_of_date", "renewal_date"].filter(c => c in data[0]);
  const scored = data.map((row, i) => {
    const base = {};
    for (const col of idCols) base[col] = row[col];
    base.churn_probability = churnResult.fullProbabilities[i];
    base.renewal_probability = renewalResult.fullProbabilities[i];
    base.risk_segment = deriveRiskSegment(base.churn_probability, base.renewal_probability);
    base.recommended_action = recommendAction(base.risk_segment);
    return base;
  });

  const csvOut = stringify(scored, {header: true});
  writeFileSync(`${outputDir}/client_risk_scores.csv`, csvOut);

  const strategyData = scored.map(r => ({
    client_id: r.client_id,
    risk_segment: r.risk_segment,
    recommended_action: r.recommended_action,
  }));
  const strategyCsv = stringify(strategyData, {header: true});
  writeFileSync(`${outputDir}/strategy_recommendations.csv`, strategyCsv);

  console.log(`Saved outputs to ${outputDir}`);
}

main();
