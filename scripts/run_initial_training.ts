import { getDb, seedCatalogIfNeeded } from "../server/db.ts";
import {
  evaluateAllModels,
  trainMatrixFactorization,
  trainMultVAE,
  trainPopularity,
} from "../server/ml/engine.ts";

async function main() {
  getDb();
  const seeded = seedCatalogIfNeeded();
  console.log(`SQLite catalog seeded: ${seeded} movies`);

  console.log("1. Training Popularity baseline...");
  const t0 = Date.now();
  const pop = trainPopularity();
  console.log(
    `Popularity trained in ${((Date.now() - t0) / 1000).toFixed(2)}s (globalMean=${pop.globalMean}, items=${pop.numItems})`
  );

  console.log("2. Training Matrix Factorization (K=32, 10 epochs)...");
  const t1 = Date.now();
  await trainMatrixFactorization({ latentDim: 32, epochs: 10 }, (m) => {
    console.log(
      `  MF Epoch ${m.epoch}: trainRMSE=${m.trainLoss} valRMSE=${m.valLoss} valRecall@20=${m.valRecall20}`
    );
  });
  console.log(`MF trained in ${((Date.now() - t1) / 1000).toFixed(2)}s`);

  console.log("3. Training Mult-VAE (H=160, Z=48, 10 epochs)...");
  const t2 = Date.now();
  await trainMultVAE(
    { hiddenDim: 160, latentDim: 48, epochs: 10, batchSize: 256, betaMax: 0.2 },
    (m) => {
      console.log(
        `  VAE Epoch ${m.epoch}: ELBO=${m.trainLoss} recon=${m.reconLoss} KL=${m.klLoss} beta=${m.beta} valLoss=${m.valLoss} valRecall@20=${m.valRecall20}`
      );
    }
  );
  console.log(`Mult-VAE trained in ${((Date.now() - t2) / 1000).toFixed(2)}s`);

  console.log("4. Evaluating all 3 models on identical held-out test set...");
  const metrics = await evaluateAllModels();
  console.table(metrics);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
