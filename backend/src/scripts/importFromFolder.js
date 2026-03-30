/* eslint-disable no-console */
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const connectDb = require('../config/db');
const env = require('../config/env');
const Material = require('../models/Material');
const { uploadBufferToS3, buildPublicUrl } = require('../services/s3Service');
const { getFileTypeFromName, isSupportedFileType } = require('../utils/file');
const { inferMaterialMetadata } = require('../utils/materialMetadata');

const ROOT_FOLDER = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
const METADATA_ONLY = process.argv.includes('--metadata-only');
const REPORT_PATH = process.argv.includes('--report')
  ? path.resolve(process.argv[process.argv.indexOf('--report') + 1] || 'import-report.json')
  : path.resolve('import-report.json');

if (!ROOT_FOLDER) {
  console.error('Usage: npm run import:folder -- <materials_folder> [--dry-run] [--metadata-only] [--report ./import-report.json]');
  process.exit(1);
}

const getExistingS3Key = (relativePath) => {
  const normalized = String(relativePath || '').split(path.sep).join('/');
  const prefix = String(env.s3ExistingPrefix || '').trim().replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${normalized}` : normalized;
};

const getAllFiles = async (dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolvedPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return getAllFiles(resolvedPath);
      }
      return resolvedPath;
    })
  );

  return files.flat();
};

const importMaterials = async () => {
  const absoluteRoot = path.resolve(ROOT_FOLDER);
  const files = await getAllFiles(absoluteRoot);

  console.log(`Discovered ${files.length} files in ${absoluteRoot}`);

  if (!DRY_RUN) {
    await connectDb();
  }

  let imported = 0;
  let skipped = 0;
  let unsupported = 0;

  const report = {
    sourceFolder: absoluteRoot,
    dryRun: DRY_RUN,
    metadataOnly: METADATA_ONLY,
    imported: 0,
    skipped: 0,
    unsupported: 0,
    unresolvedMetadata: []
  };

  for (const filePath of files) {
    const relativePath = path.relative(absoluteRoot, filePath);
    const fileType = getFileTypeFromName(relativePath);

    if (!isSupportedFileType(relativePath)) {
      unsupported += 1;
      report.unsupported += 1;
      continue;
    }

    const metadata = inferMaterialMetadata({ relativePath, fileType });

    if (!metadata.year || !metadata.semester) {
      skipped += 1;
      report.skipped += 1;
      report.unresolvedMetadata.push({
        relativePath,
        reason: 'Could not infer year/semester automatically',
        inferred: metadata
      });
      continue;
    }

    if (!DRY_RUN) {
      const existing = await Material.findOne({
        title: metadata.title,
        degree: metadata.degree,
        branch: metadata.branch,
        year: metadata.year,
        semester: metadata.semester,
        subject: metadata.subject,
        resourceType: metadata.resourceType
      }).lean();

      if (existing) {
        skipped += 1;
        report.skipped += 1;
        continue;
      }

      const fileStats = await fs.stat(filePath);
      let uploadResult;

      if (METADATA_ONLY) {
        const existingS3Key = getExistingS3Key(relativePath);
        uploadResult = {
          s3Key: existingS3Key,
          fileUrl: buildPublicUrl(existingS3Key)
        };
      } else {
        const buffer = env.storageProvider === 'local' ? null : await fs.readFile(filePath);
        uploadResult = await uploadBufferToS3({
          buffer,
          mimeType: 'application/octet-stream',
          payload: metadata,
          originalFilename: metadata.filename,
          sourceRelativePath: relativePath
        });
      }

      await Material.create({
        title: metadata.title,
        degree: metadata.degree,
        branch: metadata.branch,
        year: metadata.year,
        semester: metadata.semester,
        subject: metadata.subject,
        resourceType: metadata.resourceType,
        fileType,
        fileSizeBytes: fileStats.size,
        fileUrl: uploadResult.fileUrl,
        s3Key: uploadResult.s3Key,
        uploadedBy: env.importUploadedBy
      });
    }

    imported += 1;
    report.imported += 1;
    if (imported % 200 === 0) {
      console.log(`Progress: imported ${imported} files`);
    }
  }

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}, Unsupported: ${unsupported}`);
  console.log(`Report saved at: ${REPORT_PATH}`);

  if (!DRY_RUN) {
    await mongoose.connection.close();
  }
};

importMaterials().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
