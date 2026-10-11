/* eslint-disable no-console */
// Points every material's fileUrl at the current storage. Run it after moving
// the files to a new bucket or CDN with the same keys (S3 to R2, say).
const mongoose = require('mongoose');
const connectDb = require('../config/db');
const Material = require('../models/Material');
const { buildPublicUrl } = require('../services/s3Service');

const APPLY = process.argv.includes('--apply');

const run = async () => {
  await connectDb();

  let scanned = 0;
  let changed = 0;
  const sampleChanges = [];

  for await (const doc of Material.find(
    { s3Key: { $nin: [null, ''] } },
    { s3Key: 1, fileUrl: 1 }
  )) {
    scanned += 1;
    const fileUrl = buildPublicUrl(doc.s3Key);
    if (fileUrl === doc.fileUrl) continue;

    changed += 1;
    if (sampleChanges.length < 10) sampleChanges.push({ from: doc.fileUrl, to: fileUrl });
    if (APPLY) await Material.updateOne({ _id: doc._id }, { $set: { fileUrl } });
  }

  console.log(
    JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', scanned, changed, sampleChanges }, null, 2)
  );
  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.connection.close();
  process.exit(1);
});
