/* eslint-disable no-console */
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');
const connectDb = require('../config/db');
const env = require('../config/env');
const s3Client = require('../config/aws');
const Material = require('../models/Material');
const { getFileTypeFromName } = require('../utils/file');

const S3_PREFIX = process.argv[2] || 'StudyMaterial/';
const DRY_RUN = process.argv.includes('--dry-run');

/* ── helpers ─────────────────────────────────────────────────── */

const buildPublicUrl = (s3Key) => {
  const encoded = String(s3Key || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://${env.awsS3Bucket}.s3.${env.awsRegion}.amazonaws.com/${encoded}`;
};

const extractNumber = (str) => {
  const m = String(str || '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const guessResourceType = (folderName) => {
  const lower = String(folderName || '').toLowerCase().trim();
  // Check solutions first (before tutorials, since "tut solutions" contains both)
  if (lower.includes('solution') || lower.includes('soln')) return 'Solutions';
  if (lower.includes('pyq') || lower.includes('question')) return 'PYQs';
  if (lower.includes('lecture') || lower.includes('_lec') || lower.includes('lec_') || /\blect?\b/.test(lower) || lower.endsWith('_lec') || lower.includes('notes')) return 'Lectures';
  if (lower.includes('tutorial') || lower.includes('tut') || lower.includes('lab') || lower.includes('assignment')) return 'Tutorials';
  if (lower.includes('slide') || lower.includes('ppt')) return 'Slides';
  return 'Lectures';
};

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.ppt', '.pptx', '.pptm', '.doc', '.docx',
  '.mp4', '.zip', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png'
]);

const isSupportedFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
};

const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'pdf', '.ppt': 'ppt', '.pptx': 'pptx', '.pptm': 'ppt',
    '.doc': 'doc', '.docx': 'docx', '.mp4': 'mp4', '.zip': 'zip',
    '.xls': 'xls', '.xlsx': 'xlsx', '.txt': 'txt',
    '.jpg': 'other', '.jpeg': 'other', '.png': 'other'
  };
  return map[ext] || 'other';
};

/**
 * Parse the S3 key into structured metadata.
 * Expected structure: StudyMaterial/<year>/<semester>/<branch>/<subject>/[<resourceType>/]<filename>
 */
const parseS3Key = (s3Key, prefix) => {
  const relativePath = s3Key.startsWith(prefix) ? s3Key.slice(prefix.length) : s3Key;
  const parts = relativePath.split('/').filter(Boolean);

  // Need at least: year, semester, branch, subject, filename
  if (parts.length < 4) {
    return null;
  }

  const filename = parts[parts.length - 1];
  const title = path.parse(filename).name;

  const year = extractNumber(parts[0]);
  const semester = extractNumber(parts[1]);
  const branch = parts.length >= 3 ? parts[2].trim() : 'GENERAL';
  let subject = parts.length >= 4 ? parts[3].trim() : 'General';

  // Clean subject: remove course codes like (18B11EC315), normalize case
  subject = subject.replace(/\s*\([\w\d]+\)\s*$/, '').trim().toUpperCase();

  // Fix known typos
  const SUBJECT_TYPOS = {
    'MTHEMATICS-1': 'MATHEMATICS-1',
    'UNIVERAL HUMAN VALUES': 'UNIVERSAL HUMAN VALUES'
  };
  if (SUBJECT_TYPOS[subject]) subject = SUBJECT_TYPOS[subject];

  // If there's a folder between subject and filename, treat it as resource type
  let resourceType = 'Lectures';
  if (parts.length >= 6) {
    // e.g. .../BASIC ELECTRONICS/LECTURE/file.pdf  → parts[4] = LECTURE
    resourceType = guessResourceType(parts[4]);
  } else if (parts.length === 5) {
    // File directly under subject folder — default to Lectures
    resourceType = 'Lectures';
  }

  return {
    title,
    filename,
    degree: 'BTech',
    branch,
    year: year || 1,
    semester: semester || 1,
    subject,
    resourceType,
    fileType: getFileType(filename)
  };
};

/* ── S3 listing ──────────────────────────────────────────────── */

const listAllObjects = async (prefix) => {
  const objects = [];
  let continuationToken;

  do {
    const command = new ListObjectsV2Command({
      Bucket: env.awsS3Bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });

    const response = await s3Client.send(command);
    if (response.Contents) {
      objects.push(...response.Contents);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
};

/* ── main ────────────────────────────────────────────────────── */

const run = async () => {
  console.log(`Listing objects in s3://${env.awsS3Bucket}/${S3_PREFIX} ...`);
  const allObjects = await listAllObjects(S3_PREFIX);

  // Filter out directory markers (zero-byte keys ending with /)
  const files = allObjects.filter((obj) => obj.Size > 0 && !obj.Key.endsWith('/'));

  console.log(`Found ${files.length} files in S3\n`);

  if (!DRY_RUN) {
    await connectDb();
  }

  let imported = 0;
  let skipped = 0;
  let unsupported = 0;
  let duplicates = 0;
  const errors = [];

  for (const obj of files) {
    const s3Key = obj.Key;
    const filename = s3Key.split('/').pop();

    if (!isSupportedFile(filename)) {
      unsupported += 1;
      console.log(`  SKIP (unsupported type): ${s3Key}`);
      continue;
    }

    const meta = parseS3Key(s3Key, S3_PREFIX);
    if (!meta) {
      skipped += 1;
      console.log(`  SKIP (too few path segments): ${s3Key}`);
      continue;
    }

    const fileUrl = buildPublicUrl(s3Key);

    const doc = {
      title: meta.title,
      description: '',
      degree: meta.degree,
      branch: meta.branch,
      year: meta.year,
      semester: meta.semester,
      subject: meta.subject,
      resourceType: meta.resourceType,
      fileType: meta.fileType,
      fileSizeBytes: obj.Size,
      fileUrl,
      s3Key,
      uploadedBy: 's3-import',
      isPublished: true
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${s3Key}`);
      console.log(`         -> ${JSON.stringify({ degree: doc.degree, branch: doc.branch, year: doc.year, sem: doc.semester, subject: doc.subject, type: doc.resourceType })}`);
      imported += 1;
      continue;
    }

    try {
      const existing = await Material.findOne({ s3Key });
      if (existing) {
        duplicates += 1;
        continue;
      }
      await Material.create(doc);
      imported += 1;
      console.log(`  OK: ${s3Key}`);
    } catch (err) {
      errors.push({ s3Key, error: err.message });
      console.error(`  ERR: ${s3Key} -> ${err.message}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────');
  console.log(`  Total files:  ${files.length}`);
  console.log(`  Imported:     ${imported}`);
  console.log(`  Duplicates:   ${duplicates}`);
  console.log(`  Skipped:      ${skipped}`);
  console.log(`  Unsupported:  ${unsupported}`);
  console.log(`  Errors:       ${errors.length}`);
  if (errors.length) {
    console.log('\n── Errors ───────────────────────────────');
    errors.forEach((e) => console.log(`  ${e.s3Key}: ${e.error}`));
  }

  if (!DRY_RUN) {
    process.exit(0);
  }
};

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
