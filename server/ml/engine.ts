import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db.ts";

const ROOT_DIR = process.cwd();
const PROC_DIR = path.join(ROOT_DIR, "data", "processed");
const CKPT_DIR = path.join(ROOT_DIR, "data", "checkpoints");

export interface SplitsData {
  num_users: number;
  num_items: number;
  rated_ml_ids: number[];
  train: number[][][]; // [user][k] = [itemIdx, rating]
  val: number[][][];
  test: number[][][];
}

export interface EpochMetric {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  reconLoss: number;
  klLoss: number;
  beta: number;
  valRecall20: number;
}

export interface MultVAEConfig {
  hiddenDim: number;
  latentDim: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
  betaMax: number;
  dropout: number;
  weightDecay: number;
}

export interface MFConfig {
  latentDim: number;
  epochs: number;
  learningRate: number;
  reg: number;
}

export interface EvalMetrics {
  modelType: "popularity" | "mf" | "multvae";
  numEvalUsers: number;
  numCatalogItems: number;
  recallAt20: number;
  ndcgAt100: number;
  catalogCoverage: number;
}

interface MultVAEModelWeights {
  config: MultVAEConfig;
  numItems: number;
  W1: Float32Array; // [numItems * H]
  b1: Float32Array; // [H]
  Wmu: Float32Array; // [H * Z]
  bmu: Float32Array; // [Z]
  Wlogvar: Float32Array; // [H * Z]
  blogvar: Float32Array; // [Z]
  W2: Float32Array; // [Z * H]
  b2: Float32Array; // [H]
  W3: Float32Array; // [H * numItems]
  b3: Float32Array; // [numItems]
}

interface MFModelWeights {
  config: MFConfig;
  numUsers: number;
  numItems: number;
  globalMean: number;
  P: Float32Array; // [numUsers * K]
  Q: Float32Array; // [numItems * K]
  bu: Float32Array; // [numUsers]
  bi: Float32Array; // [numItems]
}

interface PopularityCheckpoint {
  numItems: number;
  globalMean: number;
  minRatingsThreshold: number;
  scores: number[];
  posCounts: number[];
  totalCounts: number[];
  bayesianAvgs: number[];
}

let cachedSplits: SplitsData | null = null;
let cachedVAE: MultVAEModelWeights | null = null;
let cachedMF: MFModelWeights | null = null;
let cachedPop: PopularityCheckpoint | null = null;

// Track live async training state for frontend polling
export interface LiveTrainingState {
  running: boolean;
  modelType: "multvae" | "mf" | "popularity" | "evaluation" | null;
  runId: number | null;
  currentEpoch: number;
  totalEpochs: number;
  message: string;
  epochHistory: EpochMetric[];
  error: string | null;
}

export const trainingState: LiveTrainingState = {
  running: false,
  modelType: null,
  runId: null,
  currentEpoch: 0,
  totalEpochs: 0,
  message: "Idle",
  epochHistory: [],
  error: null,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianNoise(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export function loadSplits(): SplitsData {
  if (cachedSplits) return cachedSplits;
  const splitsPath = path.join(PROC_DIR, "splits.json");
  if (!fs.existsSync(splitsPath)) {
    throw new Error(
      "MovieLens processed splits not found. Run scripts/prepare_movielens.py first."
    );
  }
  cachedSplits = JSON.parse(fs.readFileSync(splitsPath, "utf-8")) as SplitsData;
  return cachedSplits;
}

export function getDatasetStats(): Record<string, unknown> {
  const statsPath = path.join(PROC_DIR, "dataset_stats.json");
  if (!fs.existsSync(statsPath)) {
    return { dataset_name: "MovieLens 1M", status: "not_prepared" };
  }
  return JSON.parse(fs.readFileSync(statsPath, "utf-8"));
}

// ---------- CHECKPOINT SAVE / LOAD ----------

function ensureCkptDir() {
  fs.mkdirSync(CKPT_DIR, { recursive: true });
}

function saveBinaryArrays(filePath: string, arrays: Float32Array[]) {
  const totalBytes = arrays.reduce((acc, a) => acc + a.byteLength, 0);
  const buf = Buffer.allocUnsafe(totalBytes);
  let offset = 0;
  for (const arr of arrays) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(buf, offset);
    offset += arr.byteLength;
  }
  fs.writeFileSync(filePath, buf);
}

function loadBinaryArrays(filePath: string, lengths: number[]): Float32Array[] {
  const buf = fs.readFileSync(filePath);
  const out: Float32Array[] = [];
  let offset = 0;
  for (const len of lengths) {
    const byteLen = len * 4;
    const slice = buf.subarray(offset, offset + byteLen);
    const f32 = new Float32Array(len);
    Buffer.from(f32.buffer).set(slice);
    out.push(f32);
    offset += byteLen;
  }
  return out;
}

export function loadPopularityModel(): PopularityCheckpoint | null {
  if (cachedPop) return cachedPop;
  const p = path.join(CKPT_DIR, "popularity.json");
  if (!fs.existsSync(p)) return null;
  cachedPop = JSON.parse(fs.readFileSync(p, "utf-8")) as PopularityCheckpoint;
  return cachedPop;
}

export function loadMFModel(): MFModelWeights | null {
  if (cachedMF) return cachedMF;
  const metaPath = path.join(CKPT_DIR, "mf.json");
  const binPath = path.join(CKPT_DIR, "mf_weights.bin");
  if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
    config: MFConfig;
    numUsers: number;
    numItems: number;
    globalMean: number;
  };
  const K = meta.config.latentDim;
  const [P, Q, bu, bi] = loadBinaryArrays(binPath, [
    meta.numUsers * K,
    meta.numItems * K,
    meta.numUsers,
    meta.numItems,
  ]);
  cachedMF = { ...meta, P, Q, bu, bi };
  return cachedMF;
}

export function loadMultVAEModel(): MultVAEModelWeights | null {
  if (cachedVAE) return cachedVAE;
  const metaPath = path.join(CKPT_DIR, "multvae.json");
  const binPath = path.join(CKPT_DIR, "multvae_weights.bin");
  if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
    config: MultVAEConfig;
    numItems: number;
  };
  const I = meta.numItems;
  const H = meta.config.hiddenDim;
  const Z = meta.config.latentDim;
  const [W1, b1, Wmu, bmu, Wlogvar, blogvar, W2, b2, W3, b3] = loadBinaryArrays(
    binPath,
    [I * H, H, H * Z, Z, H * Z, Z, Z * H, H, H * I, I]
  );
  cachedVAE = {
    config: meta.config,
    numItems: I,
    W1,
    b1,
    Wmu,
    bmu,
    Wlogvar,
    blogvar,
    W2,
    b2,
    W3,
    b3,
  };
  return cachedVAE;
}

// ---------- EVALUATION HELPERS ----------

function topKIndices(
  scores: Float32Array | number[],
  excludeSet: Set<number>,
  k: number
): number[] {
  // Maintain min-heap / partial selection for top-K
  const candidates: Array<{ idx: number; score: number }> = [];
  for (let i = 0; i < scores.length; i++) {
    if (excludeSet.has(i)) continue;
    candidates.push({ idx: i, score: scores[i] });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, k).map((c) => c.idx);
}

function computeRecallAndNDCG(
  rankedItems: number[],
  relevantSet: Set<number>
): { recall20: number; ndcg100: number } {
  if (relevantSet.size === 0) return { recall20: 0, ndcg100: 0 };

  let hits20 = 0;
  for (let r = 0; r < Math.min(20, rankedItems.length); r++) {
    if (relevantSet.has(rankedItems[r])) hits20++;
  }
  const recall20 = hits20 / Math.min(20, relevantSet.size);

  let dcg = 0;
  for (let r = 0; r < Math.min(100, rankedItems.length); r++) {
    if (relevantSet.has(rankedItems[r])) {
      dcg += 1.0 / Math.log2(r + 2);
    }
  }
  let idcg = 0;
  const idealHits = Math.min(100, relevantSet.size);
  for (let r = 0; r < idealHits; r++) {
    idcg += 1.0 / Math.log2(r + 2);
  }
  const ndcg100 = idcg > 0 ? dcg / idcg : 0;
  return { recall20, ndcg100 };
}

// ---------- 1. POPULARITY BASELINE ----------

export function trainPopularity(): PopularityCheckpoint {
  ensureCkptDir();
  const splits = loadSplits();
  const I = splits.num_items;
  const counts = new Int32Array(I);
  const posCounts = new Int32Array(I);
  const sums = new Float64Array(I);
  let totalSum = 0;
  let totalCount = 0;

  for (let u = 0; u < splits.num_users; u++) {
    for (const [itemIdx, rating] of splits.train[u]) {
      counts[itemIdx]++;
      sums[itemIdx] += rating;
      totalSum += rating;
      totalCount++;
      if (rating >= 4.0) posCounts[itemIdx]++;
    }
  }

  const globalMean = totalCount > 0 ? totalSum / totalCount : 3.5;
  const m = 25;
  const scores: number[] = new Array(I);
  const bayesianAvgs: number[] = new Array(I);
  const posArr: number[] = new Array(I);
  const totArr: number[] = new Array(I);

  for (let i = 0; i < I; i++) {
    const n = counts[i];
    const bAvg = (sums[i] + m * globalMean) / (n + m);
    bayesianAvgs[i] = Number(bAvg.toFixed(4));
    posArr[i] = posCounts[i];
    totArr[i] = n;
    // Popularity baseline ranks by training positive interaction count with Bayesian tie-break,
    // penalizing items below minimum rating threshold
    scores[i] = n >= 20 ? posCounts[i] + 0.01 * bAvg : posCounts[i] * 0.1;
  }

  const ckpt: PopularityCheckpoint = {
    numItems: I,
    globalMean: Number(globalMean.toFixed(4)),
    minRatingsThreshold: 20,
    scores,
    posCounts: posArr,
    totalCounts: totArr,
    bayesianAvgs,
  };

  const ckptPath = path.join(CKPT_DIR, "popularity.json");
  fs.writeFileSync(ckptPath, JSON.stringify(ckpt));
  cachedPop = ckpt;

  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO training_runs (
        model_type, status, dataset_name, hyperparameters, epochs_planned, epochs_completed,
        checkpoint_path, completed_at
      ) VALUES ('popularity', 'completed', 'MovieLens 1M', ?, 1, 1, ?, datetime('now'))`
    )
    .run(JSON.stringify({ minRatingsThreshold: 20, dampingM: m }), ckptPath);
  void res;

  return ckpt;
}

// ---------- 2. MATRIX FACTORIZATION (R ≈ P * Q^T + biases) ----------

export async function trainMatrixFactorization(
  partialCfg: Partial<MFConfig> = {},
  onEpoch?: (m: EpochMetric) => void
): Promise<{ weights: MFModelWeights; history: EpochMetric[]; runId: number }> {
  ensureCkptDir();
  const splits = loadSplits();
  const config: MFConfig = {
    latentDim: partialCfg.latentDim ?? 32,
    epochs: partialCfg.epochs ?? 12,
    learningRate: partialCfg.learningRate ?? 0.012,
    reg: partialCfg.reg ?? 0.05,
  };

  const U = splits.num_users;
  const I = splits.num_items;
  const K = config.latentDim;
  const rng = mulberry32(42);

  // Flatten training triplets
  const trainCount = splits.train.reduce((acc, u) => acc + u.length, 0);
  const trUsers = new Int32Array(trainCount);
  const trItems = new Int32Array(trainCount);
  const trRatings = new Float32Array(trainCount);
  const order = new Int32Array(trainCount);

  let idx = 0;
  let sumR = 0;
  for (let u = 0; u < U; u++) {
    for (const [i, r] of splits.train[u]) {
      trUsers[idx] = u;
      trItems[idx] = i;
      trRatings[idx] = r;
      order[idx] = idx;
      sumR += r;
      idx++;
    }
  }
  const globalMean = sumR / trainCount;

  const P = new Float32Array(U * K);
  const Q = new Float32Array(I * K);
  const bu = new Float32Array(U);
  const bi = new Float32Array(I);

  const initScale = 0.1 / Math.sqrt(K);
  for (let i = 0; i < P.length; i++) P[i] = gaussianNoise(rng) * initScale;
  for (let i = 0; i < Q.length; i++) Q[i] = gaussianNoise(rng) * initScale;

  const db = getDb();
  const runRow = db
    .prepare(
      `INSERT INTO training_runs (
        model_type, status, dataset_name, hyperparameters, epochs_planned, epochs_completed
      ) VALUES ('mf', 'running', 'MovieLens 1M', ?, ?, 0)`
    )
    .run(JSON.stringify(config), config.epochs);
  const runId = Number(runRow.lastInsertRowid);

  // Subsample 400 validation users for fast per-epoch val Recall@20 monitoring
  const valEvalUsers: Array<{
    u: number;
    seen: Set<number>;
    rel: Set<number>;
  }> = [];
  for (let u = 0; u < U && valEvalUsers.length < 400; u += Math.max(1, Math.floor(U / 400))) {
    const rel = new Set(splits.val[u].filter(([, r]) => r >= 4.0).map(([it]) => it));
    if (rel.size === 0) continue;
    const seen = new Set(splits.train[u].map(([it]) => it));
    valEvalUsers.push({ u, seen, rel });
  }

  const history: EpochMetric[] = [];
  const lr = config.learningRate;
  const reg = config.reg;

  try {
    for (let epoch = 1; epoch <= config.epochs; epoch++) {
      // Fisher-Yates shuffle
      for (let i = trainCount - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }

      let sqErr = 0;
      for (let t = 0; t < trainCount; t++) {
        const pIdx = order[t];
        const u = trUsers[pIdx];
        const item = trItems[pIdx];
        const r = trRatings[pIdx];
        const uOff = u * K;
        const iOff = item * K;

        let dot = 0;
        for (let k = 0; k < K; k++) {
          dot += P[uOff + k] * Q[iOff + k];
        }
        const pred = globalMean + bu[u] + bi[item] + dot;
        const err = r - pred;
        sqErr += err * err;

        bu[u] += lr * (err - reg * bu[u]);
        bi[item] += lr * (err - reg * bi[item]);

        for (let k = 0; k < K; k++) {
          const pVal = P[uOff + k];
          const qVal = Q[iOff + k];
          P[uOff + k] = pVal + lr * (err * qVal - reg * pVal);
          Q[iOff + k] = qVal + lr * (err * pVal - reg * qVal);
        }
      }

      const trainRmse = Math.sqrt(sqErr / trainCount);

      // Validation RMSE & Recall@20
      let valSqErr = 0;
      let valCnt = 0;
      for (let u = 0; u < U; u++) {
        const uOff = u * K;
        for (const [item, r] of splits.val[u]) {
          const iOff = item * K;
          let dot = 0;
          for (let k = 0; k < K; k++) dot += P[uOff + k] * Q[iOff + k];
          const pred = globalMean + bu[u] + bi[item] + dot;
          const err = r - pred;
          valSqErr += err * err;
          valCnt++;
        }
      }
      const valRmse = Math.sqrt(valSqErr / Math.max(1, valCnt));

      let recallSum = 0;
      const scores = new Float32Array(I);
      for (const vu of valEvalUsers) {
        const uOff = vu.u * K;
        for (let i = 0; i < I; i++) {
          const iOff = i * K;
          let dot = 0;
          for (let k = 0; k < K; k++) dot += P[uOff + k] * Q[iOff + k];
          scores[i] = globalMean + bu[vu.u] + bi[i] + dot;
        }
        const top20 = topKIndices(scores, vu.seen, 20);
        recallSum += computeRecallAndNDCG(top20, vu.rel).recall20;
      }
      const valRecall20 = valEvalUsers.length > 0 ? recallSum / valEvalUsers.length : 0;

      const metric: EpochMetric = {
        epoch,
        trainLoss: Number(trainRmse.toFixed(4)),
        valLoss: Number(valRmse.toFixed(4)),
        reconLoss: Number(trainRmse.toFixed(4)),
        klLoss: 0,
        beta: 0,
        valRecall20: Number(valRecall20.toFixed(4)),
      };
      history.push(metric);
      onEpoch?.(metric);

      db.prepare(
        "UPDATE training_runs SET epochs_completed = ?, epoch_history = ? WHERE id = ?"
      ).run(epoch, JSON.stringify(history), runId);

      // Yield event loop so HTTP polling stays responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    const metaPath = path.join(CKPT_DIR, "mf.json");
    const binPath = path.join(CKPT_DIR, "mf_weights.bin");
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ config, numUsers: U, numItems: I, globalMean }, null, 2)
    );
    saveBinaryArrays(binPath, [P, Q, bu, bi]);

    const weights: MFModelWeights = { config, numUsers: U, numItems: I, globalMean, P, Q, bu, bi };
    cachedMF = weights;

    const last = history[history.length - 1];
    db.prepare(
      `UPDATE training_runs SET
        status = 'completed',
        final_train_loss = ?,
        final_val_loss = ?,
        checkpoint_path = ?,
        completed_at = datetime('now')
      WHERE id = ?`
    ).run(last.trainLoss, last.valLoss, metaPath, runId);

    return { weights, history, runId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      "UPDATE training_runs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(msg, runId);
    throw err;
  }
}

// Fold-in ridge regression for new/custom user latent vector: p_u = (Q_Iu^T Q_Iu + reg*I)^(-1) Q_Iu^T (r - mu - bi)
export function predictMFForRatings(
  model: MFModelWeights,
  userRatings: Array<{ itemIdx: number; rating: number }>
): Float32Array {
  const { numItems: I, config, globalMean, Q, bi } = model;
  const K = config.latentDim;
  const scores = new Float32Array(I);

  if (userRatings.length === 0) {
    for (let i = 0; i < I; i++) scores[i] = globalMean + bi[i];
    return scores;
  }

  // Build K x K matrix A and K-vector rhs
  const A = new Float64Array(K * K);
  const rhs = new Float64Array(K);
  const lambdaFold = 1.5;

  for (let k = 0; k < K; k++) A[k * K + k] = lambdaFold;

  for (const { itemIdx, rating } of userRatings) {
    if (itemIdx < 0 || itemIdx >= I) continue;
    const iOff = itemIdx * K;
    const target = rating - globalMean - bi[itemIdx];
    for (let r = 0; r < K; r++) {
      const qr = Q[iOff + r];
      rhs[r] += qr * target;
      for (let c = 0; c < K; c++) {
        A[r * K + c] += qr * Q[iOff + c];
      }
    }
  }

  // Gaussian elimination with partial pivoting
  const aug = new Float64Array(K * (K + 1));
  for (let r = 0; r < K; r++) {
    for (let c = 0; c < K; c++) aug[r * (K + 1) + c] = A[r * K + c];
    aug[r * (K + 1) + K] = rhs[r];
  }

  for (let col = 0; col < K; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(aug[col * (K + 1) + col]);
    for (let row = col + 1; row < K; row++) {
      const v = Math.abs(aug[row * (K + 1) + col]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = row;
      }
    }
    if (pivotRow !== col) {
      for (let c = col; c <= K; c++) {
        const tmp = aug[col * (K + 1) + c];
        aug[col * (K + 1) + c] = aug[pivotRow * (K + 1) + c];
        aug[pivotRow * (K + 1) + c] = tmp;
      }
    }
    const diag = aug[col * (K + 1) + col] || 1e-8;
    for (let c = col; c <= K; c++) aug[col * (K + 1) + c] /= diag;
    for (let row = 0; row < K; row++) {
      if (row === col) continue;
      const factor = aug[row * (K + 1) + col];
      for (let c = col; c <= K; c++) {
        aug[row * (K + 1) + c] -= factor * aug[col * (K + 1) + c];
      }
    }
  }

  const pu = new Float32Array(K);
  for (let k = 0; k < K; k++) pu[k] = aug[k * (K + 1) + K];

  for (let i = 0; i < I; i++) {
    const iOff = i * K;
    let dot = 0;
    for (let k = 0; k < K; k++) dot += pu[k] * Q[iOff + k];
    scores[i] = globalMean + bi[i] + dot;
  }
  return scores;
}

// ---------- 3. MULTINOMIAL VARIATIONAL AUTOENCODER (Mult-VAE) ----------

class AdamBuffer {
  m: Float32Array;
  v: Float32Array;
  constructor(len: number) {
    this.m = new Float32Array(len);
    this.v = new Float32Array(len);
  }
}

function adamStep(
  param: Float32Array,
  grad: Float32Array,
  buf: AdamBuffer,
  lr: number,
  step: number,
  weightDecay: number
) {
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const bc1 = 1 - Math.pow(beta1, step);
  const bc2 = 1 - Math.pow(beta2, step);
  const { m, v } = buf;

  for (let i = 0; i < param.length; i++) {
    const g = grad[i] + weightDecay * param[i];
    const mi = beta1 * m[i] + (1 - beta1) * g;
    const vi = beta2 * v[i] + (1 - beta2) * g * g;
    m[i] = mi;
    v[i] = vi;
    const mHat = mi / bc1;
    const vHat = vi / bc2;
    param[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
  }
}

export async function trainMultVAE(
  partialCfg: Partial<MultVAEConfig> = {},
  onEpoch?: (m: EpochMetric) => void
): Promise<{ weights: MultVAEModelWeights; history: EpochMetric[]; runId: number }> {
  ensureCkptDir();
  const splits = loadSplits();
  const config: MultVAEConfig = {
    hiddenDim: partialCfg.hiddenDim ?? 160,
    latentDim: partialCfg.latentDim ?? 48,
    epochs: partialCfg.epochs ?? 12,
    batchSize: partialCfg.batchSize ?? 256,
    learningRate: partialCfg.learningRate ?? 0.0025,
    betaMax: partialCfg.betaMax ?? 0.2,
    dropout: partialCfg.dropout ?? 0.5,
    weightDecay: partialCfg.weightDecay ?? 1e-5,
  };

  const U = splits.num_users;
  const I = splits.num_items;
  const H = config.hiddenDim;
  const Z = config.latentDim;
  const Bmax = config.batchSize;
  const rng = mulberry32(42);

  // Build implicit positive training lists (ratings >= 4.0)
  const userPosTrain: number[][] = new Array(U);
  const activeUsers: number[] = [];
  for (let u = 0; u < U; u++) {
    const pos = splits.train[u].filter(([, r]) => r >= 4.0).map(([it]) => it);
    userPosTrain[u] = pos;
    if (pos.length > 0) activeUsers.push(u);
  }

  // Xavier initialization
  const xavier = (fanIn: number, fanOut: number) =>
    Math.sqrt(6.0 / (fanIn + fanOut));

  const initArr = (len: number, scale: number) => {
    const a = new Float32Array(len);
    for (let i = 0; i < len; i++) a[i] = (rng() * 2 - 1) * scale;
    return a;
  };

  const W1 = initArr(I * H, xavier(I, H));
  const b1 = new Float32Array(H);
  const Wmu = initArr(H * Z, xavier(H, Z));
  const bmu = new Float32Array(Z);
  const Wlogvar = initArr(H * Z, xavier(H, Z));
  const blogvar = new Float32Array(Z);
  const W2 = initArr(Z * H, xavier(Z, H));
  const b2 = new Float32Array(H);
  const W3 = initArr(H * I, xavier(H, I));
  const b3 = new Float32Array(I);

  // Gradients
  const gW1 = new Float32Array(I * H);
  const gb1 = new Float32Array(H);
  const gWmu = new Float32Array(H * Z);
  const gbmu = new Float32Array(Z);
  const gWlogvar = new Float32Array(H * Z);
  const gblogvar = new Float32Array(Z);
  const gW2 = new Float32Array(Z * H);
  const gb2 = new Float32Array(H);
  const gW3 = new Float32Array(H * I);
  const gb3 = new Float32Array(I);

  // Adam state
  const aW1 = new AdamBuffer(W1.length);
  const ab1 = new AdamBuffer(b1.length);
  const aWmu = new AdamBuffer(Wmu.length);
  const abmu = new AdamBuffer(bmu.length);
  const aWlv = new AdamBuffer(Wlogvar.length);
  const ablv = new AdamBuffer(blogvar.length);
  const aW2 = new AdamBuffer(W2.length);
  const ab2 = new AdamBuffer(b2.length);
  const aW3 = new AdamBuffer(W3.length);
  const ab3 = new AdamBuffer(b3.length);

  // Scratch buffers for mini-batch forward/backward
  const h1 = new Float32Array(Bmax * H);
  const mu = new Float32Array(Bmax * Z);
  const logvar = new Float32Array(Bmax * Z);
  const std = new Float32Array(Bmax * Z);
  const eps = new Float32Array(Bmax * Z);
  const z = new Float32Array(Bmax * Z);
  const h2 = new Float32Array(Bmax * H);
  const logits = new Float32Array(Bmax * I);
  const dLogits = new Float32Array(Bmax * I);
  const dh2 = new Float32Array(Bmax * H);
  const dz = new Float32Array(Bmax * Z);
  const dmu = new Float32Array(Bmax * Z);
  const dlogvar = new Float32Array(Bmax * Z);
  const dh1 = new Float32Array(Bmax * H);

  const db = getDb();
  const runRow = db
    .prepare(
      `INSERT INTO training_runs (
        model_type, status, dataset_name, hyperparameters, epochs_planned, epochs_completed
      ) VALUES ('multvae', 'running', 'MovieLens 1M', ?, ?, 0)`
    )
    .run(JSON.stringify(config), config.epochs);
  const runId = Number(runRow.lastInsertRowid);

  // Validation users for ELBO & Recall@20 tracking (500 deterministic users)
  const valEvalUsers: Array<{
    u: number;
    posTrain: number[];
    seen: Set<number>;
    relVal: Set<number>;
  }> = [];
  for (let u = 0; u < U && valEvalUsers.length < 500; u += Math.max(1, Math.floor(U / 500))) {
    const relVal = new Set(splits.val[u].filter(([, r]) => r >= 4.0).map(([it]) => it));
    if (relVal.size === 0 || userPosTrain[u].length === 0) continue;
    const seen = new Set(splits.train[u].map(([it]) => it));
    valEvalUsers.push({ u, posTrain: userPosTrain[u], seen, relVal });
  }

  let bestValRecall = -1;
  let bestWeightsSnapshot: Float32Array[] | null = null;
  const history: EpochMetric[] = [];
  let adamStepCount = 0;
  const userOrder = [...activeUsers];
  const annealEpochs = Math.max(1, Math.floor(config.epochs * 0.7));

  try {
    for (let epoch = 1; epoch <= config.epochs; epoch++) {
      // Shuffle users
      for (let i = userOrder.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = userOrder[i];
        userOrder[i] = userOrder[j];
        userOrder[j] = tmp;
      }

      const beta = config.betaMax * Math.min(1.0, epoch / annealEpochs);
      let epochReconSum = 0;
      let epochKlSum = 0;
      let epochLossSum = 0;
      let epochUsers = 0;

      for (let start = 0; start < userOrder.length; start += Bmax) {
        const B = Math.min(Bmax, userOrder.length - start);
        const invB = 1.0 / B;

        // Reset batch gradients
        gW1.fill(0);
        gb1.fill(0);
        gWmu.fill(0);
        gbmu.fill(0);
        gWlogvar.fill(0);
        gblogvar.fill(0);
        gW2.fill(0);
        gb2.fill(0);
        gW3.fill(0);
        gb3.fill(0);

        // Sparse input vectors with L2 norm + dropout
        const batchSparseInputs: Array<{ idx: number; val: number }[]> = new Array(B);
        const batchTargets: number[][] = new Array(B);

        for (let b = 0; b < B; b++) {
          const u = userOrder[start + b];
          const items = userPosTrain[u];
          batchTargets[b] = items;

          // Compute L2 norm of binary vector = sqrt(items.length)
          const l2 = Math.sqrt(items.length);
          const dropScale = 1.0 / (1.0 - config.dropout);
          const sp: Array<{ idx: number; val: number }> = [];
          for (let k = 0; k < items.length; k++) {
            if (rng() >= config.dropout) {
              sp.push({ idx: items[k], val: dropScale / l2 });
            }
          }
          if (sp.length === 0 && items.length > 0) {
            sp.push({ idx: items[0], val: 1.0 / l2 });
          }
          batchSparseInputs[b] = sp;
        }

        // 1. Encoder layer 1: h1 = tanh(X_sp * W1 + b1)
        for (let b = 0; b < B; b++) {
          const hOff = b * H;
          for (let h = 0; h < H; h++) h1[hOff + h] = b1[h];
          const sp = batchSparseInputs[b];
          for (let k = 0; k < sp.length; k++) {
            const { idx: iIdx, val } = sp[k];
            const wOff = iIdx * H;
            for (let h = 0; h < H; h++) {
              h1[hOff + h] += val * W1[wOff + h];
            }
          }
          for (let h = 0; h < H; h++) {
            h1[hOff + h] = Math.tanh(h1[hOff + h]);
          }
        }

        // 2. Latent layers: mu, logvar, reparameterize z
        for (let b = 0; b < B; b++) {
          const hOff = b * H;
          const zOff = b * Z;
          for (let j = 0; j < Z; j++) {
            let mAcc = bmu[j];
            let lAcc = blogvar[j];
            for (let h = 0; h < H; h++) {
              const hv = h1[hOff + h];
              mAcc += hv * Wmu[h * Z + j];
              lAcc += hv * Wlogvar[h * Z + j];
            }
            if (lAcc > 10) lAcc = 10;
            if (lAcc < -10) lAcc = -10;
            mu[zOff + j] = mAcc;
            logvar[zOff + j] = lAcc;
            const s = Math.exp(0.5 * lAcc);
            std[zOff + j] = s;
            const e = gaussianNoise(rng);
            eps[zOff + j] = e;
            z[zOff + j] = mAcc + e * s;
          }
        }

        // 3. Decoder layer 1: h2 = tanh(z * W2 + b2)
        for (let b = 0; b < B; b++) {
          const zOff = b * Z;
          const hOff = b * H;
          for (let h = 0; h < H; h++) {
            let acc = b2[h];
            for (let j = 0; j < Z; j++) {
              acc += z[zOff + j] * W2[j * H + h];
            }
            h2[hOff + h] = Math.tanh(acc);
          }
        }

        // 4. Decoder output logits = h2 * W3 + b3 & Multinomial Log-Likelihood + KL
        let batchRecon = 0;
        let batchKl = 0;

        for (let b = 0; b < B; b++) {
          const hOff = b * H;
          const oOff = b * I;
          let maxLogit = -1e30;
          for (let i = 0; i < I; i++) {
            let acc = b3[i];
            for (let h = 0; h < H; h++) {
              acc += h2[hOff + h] * W3[h * I + i];
            }
            logits[oOff + i] = acc;
            if (acc > maxLogit) maxLogit = acc;
          }

          let sumExp = 0;
          for (let i = 0; i < I; i++) {
            const ex = Math.exp(logits[oOff + i] - maxLogit);
            dLogits[oOff + i] = ex;
            sumExp += ex;
          }
          const logSumExp = maxLogit + Math.log(sumExp);

          const targets = batchTargets[b];
          const targetSum = targets.length;
          let nll = 0;
          for (let k = 0; k < targetSum; k++) {
            const ti = targets[k];
            nll -= logits[oOff + ti] - logSumExp;
          }
          batchRecon += nll;

          // Exact Multinomial NLL gradient: (sum_y * softmax(o) - y) / B
          const invSumExp = 1.0 / sumExp;
          for (let i = 0; i < I; i++) {
            const prob = dLogits[oOff + i] * invSumExp;
            dLogits[oOff + i] = targetSum * prob * invB;
          }
          for (let k = 0; k < targetSum; k++) {
            dLogits[oOff + targets[k]] -= invB;
          }

          // KL divergence
          const zOff = b * Z;
          let kl = 0;
          for (let j = 0; j < Z; j++) {
            const mj = mu[zOff + j];
            const lvj = logvar[zOff + j];
            const varj = Math.exp(lvj);
            kl += -0.5 * (1 + lvj - mj * mj - varj);
          }
          batchKl += kl;
        }

        epochReconSum += batchRecon;
        epochKlSum += batchKl;
        epochLossSum += batchRecon + beta * batchKl;
        epochUsers += B;

        // 5. Backprop: Decoder Output (h2 -> logits)
        dh2.fill(0);
        for (let b = 0; b < B; b++) {
          const oOff = b * I;
          const hOff = b * H;
          for (let i = 0; i < I; i++) {
            const g = dLogits[oOff + i];
            gb3[i] += g;
          }
          for (let h = 0; h < H; h++) {
            const hv = h2[hOff + h];
            let gradH = 0;
            const wOff = h * I;
            for (let i = 0; i < I; i++) {
              const g = dLogits[oOff + i];
              gW3[wOff + i] += hv * g;
              gradH += g * W3[wOff + i];
            }
            // Backprop through tanh
            dh2[hOff + h] = gradH * (1 - hv * hv);
          }
        }

        // 6. Backprop: Decoder Hidden (z -> h2)
        dz.fill(0);
        for (let b = 0; b < B; b++) {
          const hOff = b * H;
          const zOff = b * Z;
          for (let h = 0; h < H; h++) {
            const dh = dh2[hOff + h];
            gb2[h] += dh;
            for (let j = 0; j < Z; j++) {
              gW2[j * H + h] += z[zOff + j] * dh;
              dz[zOff + j] += dh * W2[j * H + h];
            }
          }
        }

        // 7. Backprop: Reparameterization + KL divergence
        for (let b = 0; b < B; b++) {
          const zOff = b * Z;
          for (let j = 0; j < Z; j++) {
            const dzv = dz[zOff + j];
            const mj = mu[zOff + j];
            const lvj = logvar[zOff + j];
            const sj = std[zOff + j];
            const ej = eps[zOff + j];
            dmu[zOff + j] = dzv + beta * invB * mj;
            dlogvar[zOff + j] =
              dzv * ej * 0.5 * sj + beta * invB * 0.5 * (Math.exp(lvj) - 1);
          }
        }

        // 8. Backprop: Latent projections (h1 -> mu, logvar)
        dh1.fill(0);
        for (let b = 0; b < B; b++) {
          const hOff = b * H;
          const zOff = b * Z;
          for (let j = 0; j < Z; j++) {
            const dm = dmu[zOff + j];
            const dl = dlogvar[zOff + j];
            gbmu[j] += dm;
            gblogvar[j] += dl;
            for (let h = 0; h < H; h++) {
              const hv = h1[hOff + h];
              gWmu[h * Z + j] += hv * dm;
              gWlogvar[h * Z + j] += hv * dl;
              dh1[hOff + h] += dm * Wmu[h * Z + j] + dl * Wlogvar[h * Z + j];
            }
          }
          for (let h = 0; h < H; h++) {
            const hv = h1[hOff + h];
            dh1[hOff + h] *= 1 - hv * hv;
          }
        }

        // 9. Backprop: Sparse Encoder (X_sp -> h1)
        const touchedItems = new Set<number>();
        for (let b = 0; b < B; b++) {
          const hOff = b * H;
          for (let h = 0; h < H; h++) gb1[h] += dh1[hOff + h];
          const sp = batchSparseInputs[b];
          for (let k = 0; k < sp.length; k++) {
            const { idx: iIdx, val } = sp[k];
            touchedItems.add(iIdx);
            const wOff = iIdx * H;
            for (let h = 0; h < H; h++) {
              gW1[wOff + h] += val * dh1[hOff + h];
            }
          }
        }

        // 10. Adam optimizer update
        adamStepCount++;
        const lr = config.learningRate;
        const wd = config.weightDecay;

        // Update W1 only for touched rows + weight decay on all
        adamStep(W1, gW1, aW1, lr, adamStepCount, wd);
        adamStep(b1, gb1, ab1, lr, adamStepCount, 0);
        adamStep(Wmu, gWmu, aWmu, lr, adamStepCount, wd);
        adamStep(bmu, gbmu, abmu, lr, adamStepCount, 0);
        adamStep(Wlogvar, gWlogvar, aWlv, lr, adamStepCount, wd);
        adamStep(blogvar, gblogvar, ablv, lr, adamStepCount, 0);
        adamStep(W2, gW2, aW2, lr, adamStepCount, wd);
        adamStep(b2, gb2, ab2, lr, adamStepCount, 0);
        adamStep(W3, gW3, aW3, lr, adamStepCount, wd);
        adamStep(b3, gb3, ab3, lr, adamStepCount, 0);
        void touchedItems;
      }

      // Compute Validation ELBO and Validation Recall@20
      const currentModel: MultVAEModelWeights = {
        config,
        numItems: I,
        W1,
        b1,
        Wmu,
        bmu,
        Wlogvar,
        blogvar,
        W2,
        b2,
        W3,
        b3,
      };

      let valLossSum = 0;
      let valRecallSum = 0;
      for (const vu of valEvalUsers) {
        const { logits: vLogits, kl } = forwardMultVAEUser(
          currentModel,
          vu.posTrain
        );
        // Compute validation NLL over held-out val positives
        let maxL = -1e30;
        for (let i = 0; i < I; i++) if (vLogits[i] > maxL) maxL = vLogits[i];
        let sExp = 0;
        for (let i = 0; i < I; i++) sExp += Math.exp(vLogits[i] - maxL);
        const lse = maxL + Math.log(sExp);
        let nll = 0;
        for (const vi of vu.relVal) nll -= vLogits[vi] - lse;
        valLossSum += nll + beta * kl;

        const top20 = topKIndices(vLogits, vu.seen, 20);
        valRecallSum += computeRecallAndNDCG(top20, vu.relVal).recall20;
      }

      const avgTrainLoss = epochLossSum / Math.max(1, epochUsers);
      const avgRecon = epochReconSum / Math.max(1, epochUsers);
      const avgKl = epochKlSum / Math.max(1, epochUsers);
      const avgValLoss = valLossSum / Math.max(1, valEvalUsers.length);
      const avgValRecall = valRecallSum / Math.max(1, valEvalUsers.length);

      if (avgValRecall > bestValRecall) {
        bestValRecall = avgValRecall;
        bestWeightsSnapshot = [
          new Float32Array(W1),
          new Float32Array(b1),
          new Float32Array(Wmu),
          new Float32Array(bmu),
          new Float32Array(Wlogvar),
          new Float32Array(blogvar),
          new Float32Array(W2),
          new Float32Array(b2),
          new Float32Array(W3),
          new Float32Array(b3),
        ];
      }

      const metric: EpochMetric = {
        epoch,
        trainLoss: Number(avgTrainLoss.toFixed(4)),
        valLoss: Number(avgValLoss.toFixed(4)),
        reconLoss: Number(avgRecon.toFixed(4)),
        klLoss: Number(avgKl.toFixed(4)),
        beta: Number(beta.toFixed(4)),
        valRecall20: Number(avgValRecall.toFixed(4)),
      };
      history.push(metric);
      onEpoch?.(metric);

      db.prepare(
        "UPDATE training_runs SET epochs_completed = ?, epoch_history = ? WHERE id = ?"
      ).run(epoch, JSON.stringify(history), runId);

      await new Promise((r) => setTimeout(r, 0));
    }

    // Restore best validation checkpoint weights
    const finalArrs = bestWeightsSnapshot ?? [
      W1,
      b1,
      Wmu,
      bmu,
      Wlogvar,
      blogvar,
      W2,
      b2,
      W3,
      b3,
    ];

    const metaPath = path.join(CKPT_DIR, "multvae.json");
    const binPath = path.join(CKPT_DIR, "multvae_weights.bin");
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ config, numItems: I, bestValRecall20: bestValRecall }, null, 2)
    );
    saveBinaryArrays(binPath, finalArrs);

    const weights: MultVAEModelWeights = {
      config,
      numItems: I,
      W1: finalArrs[0],
      b1: finalArrs[1],
      Wmu: finalArrs[2],
      bmu: finalArrs[3],
      Wlogvar: finalArrs[4],
      blogvar: finalArrs[5],
      W2: finalArrs[6],
      b2: finalArrs[7],
      W3: finalArrs[8],
      b3: finalArrs[9],
    };
    cachedVAE = weights;

    const last = history[history.length - 1];
    db.prepare(
      `UPDATE training_runs SET
        status = 'completed',
        final_train_loss = ?,
        final_val_loss = ?,
        final_recon_loss = ?,
        final_kl_loss = ?,
        checkpoint_path = ?,
        completed_at = datetime('now')
      WHERE id = ?`
    ).run(last.trainLoss, last.valLoss, last.reconLoss, last.klLoss, metaPath, runId);

    return { weights, history, runId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      "UPDATE training_runs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(msg, runId);
    throw err;
  }
}

export function forwardMultVAEUser(
  model: MultVAEModelWeights,
  positiveItemIndices: number[],
  weightedItems?: Array<{ itemIdx: number; weight: number }>
): { logits: Float32Array; probs: Float32Array; kl: number; mu: Float32Array } {
  const { numItems: I, config, W1, b1, Wmu, bmu, Wlogvar, blogvar, W2, b2, W3, b3 } =
    model;
  const H = config.hiddenDim;
  const Z = config.latentDim;

  const h1 = new Float32Array(H);
  for (let h = 0; h < H; h++) h1[h] = b1[h];

  if (weightedItems && weightedItems.length > 0) {
    let normSq = 0;
    for (const w of weightedItems) normSq += w.weight * w.weight;
    const norm = Math.sqrt(Math.max(1e-8, normSq));
    for (const { itemIdx, weight } of weightedItems) {
      if (itemIdx < 0 || itemIdx >= I) continue;
      const v = weight / norm;
      const wOff = itemIdx * H;
      for (let h = 0; h < H; h++) h1[h] += v * W1[wOff + h];
    }
  } else if (positiveItemIndices.length > 0) {
    const invNorm = 1.0 / Math.sqrt(positiveItemIndices.length);
    for (const itemIdx of positiveItemIndices) {
      if (itemIdx < 0 || itemIdx >= I) continue;
      const wOff = itemIdx * H;
      for (let h = 0; h < H; h++) h1[h] += invNorm * W1[wOff + h];
    }
  }

  for (let h = 0; h < H; h++) h1[h] = Math.tanh(h1[h]);

  const mu = new Float32Array(Z);
  let kl = 0;
  for (let j = 0; j < Z; j++) {
    let mAcc = bmu[j];
    let lAcc = blogvar[j];
    for (let h = 0; h < H; h++) {
      mAcc += h1[h] * Wmu[h * Z + j];
      lAcc += h1[h] * Wlogvar[h * Z + j];
    }
    if (lAcc > 10) lAcc = 10;
    if (lAcc < -10) lAcc = -10;
    mu[j] = mAcc;
    kl += -0.5 * (1 + lAcc - mAcc * mAcc - Math.exp(lAcc));
  }

  // Deterministic latent mean mu at inference time
  const h2 = new Float32Array(H);
  for (let h = 0; h < H; h++) {
    let acc = b2[h];
    for (let j = 0; j < Z; j++) acc += mu[j] * W2[j * H + h];
    h2[h] = Math.tanh(acc);
  }

  const logits = new Float32Array(I);
  let maxL = -1e30;
  for (let i = 0; i < I; i++) {
    let acc = b3[i];
    for (let h = 0; h < H; h++) acc += h2[h] * W3[h * I + i];
    logits[i] = acc;
    if (acc > maxL) maxL = acc;
  }

  const probs = new Float32Array(I);
  let sumExp = 0;
  for (let i = 0; i < I; i++) {
    const e = Math.exp(logits[i] - maxL);
    probs[i] = e;
    sumExp += e;
  }
  const invSum = 1.0 / sumExp;
  for (let i = 0; i < I; i++) probs[i] *= invSum;

  return { logits, probs, kl, mu };
}

// ---------- UNIFIED TEST EVALUATION (SAME HELD-OUT TEST SET FOR ALL 3 MODELS) ----------

export async function evaluateAllModels(): Promise<EvalMetrics[]> {
  const splits = loadSplits();
  const pop = loadPopularityModel();
  const mf = loadMFModel();
  const vae = loadMultVAEModel();

  if (!pop || !mf || !vae) {
    throw new Error(
      "All three models (Popularity, Matrix Factorization, Mult-VAE) must be trained before evaluation."
    );
  }

  const U = splits.num_users;
  const I = splits.num_items;

  // Deterministic evaluation cohort of 1,000 users with held-out positive test interactions
  // Identical evaluation users, identical held-out test interactions, identical eligible catalog for all 3 models!
  const evalCohort: Array<{
    u: number;
    posTrain: number[];
    seen: Set<number>;
    relTest: Set<number>;
  }> = [];

  for (let u = 0; u < U && evalCohort.length < 1000; u += Math.max(1, Math.floor(U / 1100))) {
    const relTest = new Set(
      splits.test[u].filter(([, r]) => r >= 4.0).map(([it]) => it)
    );
    if (relTest.size === 0) continue;
    const seen = new Set<number>([
      ...splits.train[u].map(([it]) => it),
      ...splits.val[u].map(([it]) => it),
    ]);
    const posTrain = splits.train[u]
      .filter(([, r]) => r >= 4.0)
      .map(([it]) => it);
    if (posTrain.length === 0) continue;
    evalCohort.push({ u, posTrain, seen, relTest });
  }

  const results: EvalMetrics[] = [];

  // 1. Popularity
  {
    let rSum = 0;
    let nSum = 0;
    const covered = new Set<number>();
    const scores = new Float32Array(pop.scores);
    for (const eu of evalCohort) {
      const top100 = topKIndices(scores, eu.seen, 100);
      for (let k = 0; k < Math.min(20, top100.length); k++) covered.add(top100[k]);
      const { recall20, ndcg100 } = computeRecallAndNDCG(top100, eu.relTest);
      rSum += recall20;
      nSum += ndcg100;
    }
    results.push({
      modelType: "popularity",
      numEvalUsers: evalCohort.length,
      numCatalogItems: I,
      recallAt20: Number((rSum / evalCohort.length).toFixed(4)),
      ndcgAt100: Number((nSum / evalCohort.length).toFixed(4)),
      catalogCoverage: Number(((covered.size / I) * 100).toFixed(2)),
    });
  }

  // 2. Matrix Factorization
  {
    let rSum = 0;
    let nSum = 0;
    const covered = new Set<number>();
    const scores = new Float32Array(I);
    const K = mf.config.latentDim;
    for (const eu of evalCohort) {
      const uOff = eu.u * K;
      for (let i = 0; i < I; i++) {
        const iOff = i * K;
        let dot = 0;
        for (let k = 0; k < K; k++) dot += mf.P[uOff + k] * mf.Q[iOff + k];
        scores[i] = mf.globalMean + mf.bu[eu.u] + mf.bi[i] + dot;
      }
      const top100 = topKIndices(scores, eu.seen, 100);
      for (let k = 0; k < Math.min(20, top100.length); k++) covered.add(top100[k]);
      const { recall20, ndcg100 } = computeRecallAndNDCG(top100, eu.relTest);
      rSum += recall20;
      nSum += ndcg100;
    }
    results.push({
      modelType: "mf",
      numEvalUsers: evalCohort.length,
      numCatalogItems: I,
      recallAt20: Number((rSum / evalCohort.length).toFixed(4)),
      ndcgAt100: Number((nSum / evalCohort.length).toFixed(4)),
      catalogCoverage: Number(((covered.size / I) * 100).toFixed(2)),
    });
  }

  // 3. Mult-VAE
  {
    let rSum = 0;
    let nSum = 0;
    const covered = new Set<number>();
    for (let idx = 0; idx < evalCohort.length; idx++) {
      const eu = evalCohort[idx];
      const { logits } = forwardMultVAEUser(vae, eu.posTrain);
      const top100 = topKIndices(logits, eu.seen, 100);
      for (let k = 0; k < Math.min(20, top100.length); k++) covered.add(top100[k]);
      const { recall20, ndcg100 } = computeRecallAndNDCG(top100, eu.relTest);
      rSum += recall20;
      nSum += ndcg100;
      if (idx % 100 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    results.push({
      modelType: "multvae",
      numEvalUsers: evalCohort.length,
      numCatalogItems: I,
      recallAt20: Number((rSum / evalCohort.length).toFixed(4)),
      ndcgAt100: Number((nSum / evalCohort.length).toFixed(4)),
      catalogCoverage: Number(((covered.size / I) * 100).toFixed(2)),
    });
  }

  // Persist genuine evaluation results to SQLite
  const db = getDb();
  const insertEval = db.prepare(`
    INSERT INTO evaluation_results (
      run_id, model_type, dataset_name, num_eval_users, num_catalog_items,
      recall_at_20, ndcg_at_100, catalog_coverage
    ) VALUES (?, ?, 'MovieLens 1M', ?, ?, ?, ?, ?)
  `);

  for (const m of results) {
    const latestRun = db
      .prepare(
        "SELECT id FROM training_runs WHERE model_type = ? AND status = 'completed' ORDER BY id DESC LIMIT 1"
      )
      .get(m.modelType) as { id: number } | undefined;
    insertEval.run(
      latestRun?.id ?? null,
      m.modelType,
      m.numEvalUsers,
      m.numCatalogItems,
      m.recallAt20,
      m.ndcgAt100,
      m.catalogCoverage
    );
  }

  return results;
}

// ---------- PERSONALIZED INFERENCE FOR WEB APP USERS ----------

export type DiscoveryMode = "top_ranked" | "hidden_gems";

let cachedItemCounts: Int32Array | null = null;

function getItemInteractionCounts(splits: SplitsData): Int32Array {
  if (cachedItemCounts) return cachedItemCounts;
  const counts = new Int32Array(splits.num_items);
  for (let u = 0; u < splits.num_users; u++) {
    for (const [it] of splits.train[u]) counts[it]++;
    for (const [it] of splits.val[u]) counts[it]++;
    for (const [it] of splits.test[u]) counts[it]++;
  }
  cachedItemCounts = counts;
  return counts;
}

export interface InferenceItem {
  itemIdx: number;
  movielensId: number;
  score: number;
  normalizedScore: number;
  similarToTitle: string | null;
  anchorMovieTitle: string | null;
  anchorMovieRating: number | null;
  anchorSimilarity: number | null;
  itemRatingCount: number;
}

export function generateUserRecommendations(
  algorithm: "multvae" | "mf" | "popularity",
  userRatings: Array<{ movielensId: number; itemIdx: number; rating: number; title: string }>,
  topK = 20,
  discoveryMode: DiscoveryMode = "top_ranked"
): InferenceItem[] {
  const splits = loadSplits();
  const I = splits.num_items;
  const itemCounts = getItemInteractionCounts(splits);
  const ratedItemSet = new Set(
    userRatings.filter((r) => r.itemIdx >= 0).map((r) => r.itemIdx)
  );

  let rawScores: Float32Array;

  if (algorithm === "popularity") {
    const pop = loadPopularityModel();
    if (!pop) throw new Error("Popularity model not trained yet.");
    rawScores = new Float32Array(pop.scores);
  } else if (algorithm === "mf") {
    const mf = loadMFModel();
    if (!mf) throw new Error("Matrix Factorization model not trained yet.");
    rawScores = predictMFForRatings(
      mf,
      userRatings
        .filter((r) => r.itemIdx >= 0)
        .map((r) => ({ itemIdx: r.itemIdx, rating: r.rating }))
    );
  } else {
    const vae = loadMultVAEModel();
    if (!vae) throw new Error("Mult-VAE model not trained yet.");
    const posWeighted = userRatings
      .filter((r) => r.itemIdx >= 0 && r.rating >= 3.5)
      .map((r) => ({
        itemIdx: r.itemIdx,
        weight: r.rating >= 5 ? 1.0 : r.rating >= 4 ? 0.8 : 0.4,
      }));
    const inputs =
      posWeighted.length > 0
        ? posWeighted
        : userRatings
            .filter((r) => r.itemIdx >= 0)
            .map((r) => ({ itemIdx: r.itemIdx, weight: r.rating / 5.0 }));

    const { probs } = forwardMultVAEUser(
      vae,
      inputs.map((x) => x.itemIdx),
      inputs
    );
    rawScores = probs;
  }

  let rankedIndices: number[];
  if (discoveryMode === "hidden_gems") {
    const popModel = loadPopularityModel();
    const candidates: Array<{ idx: number; gemScore: number }> = [];
    let minRaw = Infinity;
    let maxRaw = -Infinity;
    for (let i = 0; i < I; i++) {
      if (ratedItemSet.has(i)) continue;
      const cnt = itemCounts[i];
      if (cnt < 25 || cnt > 600) continue;
      const s = rawScores[i];
      if (s < minRaw) minRaw = s;
      if (s > maxRaw) maxRaw = s;
    }
    const rawSpan = Math.max(1e-8, maxRaw - minRaw);

    for (let i = 0; i < I; i++) {
      if (ratedItemSet.has(i)) continue;
      const cnt = itemCounts[i];
      if (cnt < 25 || cnt > 600) continue;
      const normModel = (rawScores[i] - minRaw) / rawSpan;
      const noveltyBoost = 1.0 / Math.log2(cnt + 8);
      const gemScore =
        algorithm === "popularity" && popModel
          ? popModel.bayesianAvgs[i] * (0.75 + noveltyBoost)
          : normModel * (0.65 + 1.8 * noveltyBoost);
      candidates.push({ idx: i, gemScore });
    }
    candidates.sort((a, b) => b.gemScore - a.gemScore);
    rankedIndices = candidates.slice(0, topK).map((c) => c.idx);
  } else {
    rankedIndices = topKIndices(rawScores, ratedItemSet, topK);
  }

  // Normalize top scores into [0, 1] relative preference confidence for display
  let minS = Infinity;
  let maxS = -Infinity;
  for (const idx of rankedIndices) {
    if (rawScores[idx] < minS) minS = rawScores[idx];
    if (rawScores[idx] > maxS) maxS = rawScores[idx];
  }
  const span = Math.max(1e-8, maxS - minS);

  // Compute genuine item-embedding cosine similarity to user's highest-rated movies
  const vaeModel = loadMultVAEModel();
  const mfModel = loadMFModel();
  const sortedAnchors = [...userRatings]
    .filter((r) => r.itemIdx >= 0)
    .sort((a, b) => b.rating - a.rating);
  const preferredAnchors = sortedAnchors.filter((r) => r.rating >= 3.5);
  const topLiked = (preferredAnchors.length > 0 ? preferredAnchors : sortedAnchors).slice(0, 8);

  const findMostSimilarRatedMovie = (
    candIdx: number
  ): { title: string | null; rating: number | null; similarity: number | null } => {
    if (topLiked.length === 0) {
      return { title: null, rating: null, similarity: null };
    }
    if (algorithm === "mf" && mfModel) {
      const K = mfModel.config.latentDim;
      let bestAnchor: (typeof topLiked)[number] | null = null;
      let bestSim = -Infinity;
      for (const liked of topLiked) {
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let k = 0; k < K; k++) {
          const a = mfModel.Q[candIdx * K + k];
          const b = mfModel.Q[liked.itemIdx * K + k];
          dot += a * b;
          na += a * a;
          nb += b * b;
        }
        const sim = dot / (Math.sqrt(na * nb) + 1e-8);
        const weightedSim = sim * (0.85 + 0.03 * liked.rating);
        if (weightedSim > bestSim) {
          bestSim = weightedSim;
          bestAnchor = liked;
        }
      }
      if (!bestAnchor) return { title: null, rating: null, similarity: null };
      return {
        title: bestAnchor.title,
        rating: bestAnchor.rating,
        similarity: Number(Math.max(0, Math.min(0.99, bestSim)).toFixed(4)),
      };
    }
    if (vaeModel) {
      const H = vaeModel.config.hiddenDim;
      let bestAnchor: (typeof topLiked)[number] | null = null;
      let bestSim = -Infinity;
      let bestRawSim = 0;
      for (const liked of topLiked) {
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let h = 0; h < H; h++) {
          const a = vaeModel.W3[h * vaeModel.numItems + candIdx];
          const b = vaeModel.W3[h * vaeModel.numItems + liked.itemIdx];
          dot += a * b;
          na += a * a;
          nb += b * b;
        }
        const sim = dot / (Math.sqrt(na * nb) + 1e-8);
        const weightedSim = sim * (0.85 + 0.03 * liked.rating);
        if (weightedSim > bestSim) {
          bestSim = weightedSim;
          bestRawSim = sim;
          bestAnchor = liked;
        }
      }
      if (!bestAnchor) return { title: null, rating: null, similarity: null };
      return {
        title: bestAnchor.title,
        rating: bestAnchor.rating,
        similarity: Number(Math.max(0, Math.min(0.99, bestRawSim)).toFixed(4)),
      };
    }
    return { title: null, rating: null, similarity: null };
  };

  return rankedIndices.map((idx) => {
    const anchor =
      algorithm === "popularity"
        ? { title: null, rating: null, similarity: null }
        : findMostSimilarRatedMovie(idx);
    return {
      itemIdx: idx,
      movielensId: splits.rated_ml_ids[idx],
      score: Number(rawScores[idx].toFixed(6)),
      normalizedScore: Number(((rawScores[idx] - minS) / span * 0.35 + 0.65).toFixed(4)),
      similarToTitle: anchor.title,
      anchorMovieTitle: anchor.title,
      anchorMovieRating: anchor.rating,
      anchorSimilarity: anchor.similarity,
      itemRatingCount: itemCounts[idx],
    };
  });
}

export function getSimilarMoviesByLatent(
  itemIdx: number,
  topK = 6
): Array<{ movielensId: number; similarity: number }> {
  const splits = loadSplits();
  const vae = loadMultVAEModel();
  if (!vae || itemIdx < 0 || itemIdx >= vae.numItems) return [];

  const H = vae.config.hiddenDim;
  const I = vae.numItems;

  // Target decoder column norm
  let normTarget = 0;
  for (let h = 0; h < H; h++) {
    const v = vae.W3[h * I + itemIdx];
    normTarget += v * v;
  }
  normTarget = Math.sqrt(Math.max(1e-8, normTarget));

  const sims: Array<{ idx: number; sim: number }> = [];
  for (let i = 0; i < I; i++) {
    if (i === itemIdx) continue;
    let dot = 0;
    let normI = 0;
    for (let h = 0; h < H; h++) {
      const a = vae.W3[h * I + itemIdx];
      const b = vae.W3[h * I + i];
      dot += a * b;
      normI += b * b;
    }
    const sim = dot / (normTarget * Math.sqrt(Math.max(1e-8, normI)));
    sims.push({ idx: i, sim });
  }
  sims.sort((a, b) => b.sim - a.sim);

  return sims.slice(0, topK).map((s) => ({
    movielensId: splits.rated_ml_ids[s.idx],
    similarity: Number(s.sim.toFixed(4)),
  }));
}
