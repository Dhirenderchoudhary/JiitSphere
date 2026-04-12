// SPDX-License-Identifier: GPL-3.0-or-later
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const s3Client = require('../config/aws');
const env = require('../config/env');
const { sanitizeKeyPart } = require('../utils/file');

const createS3Key = (payload, originalFilename) => {
  const uniquePrefix = uuidv4();
  const safeFilename = sanitizeKeyPart(originalFilename || 'file');

  return [
    'materials',
    sanitizeKeyPart(payload.degree),
    sanitizeKeyPart(payload.branch),
    `year-${payload.year}`,
    `sem-${payload.semester}`,
    sanitizeKeyPart(payload.subject),
    sanitizeKeyPart(payload.resourceType),
    `${uniquePrefix}-${safeFilename}`
  ].join('/');
};

const buildPublicUrl = (s3Key) => {
  const encoded = String(s3Key || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  if (env.storageProvider === 'local') {
    return `${env.publicBaseUrl}/local-materials/${encoded}`;
  }

  if (env.cloudFrontBaseUrl) {
    return `${env.cloudFrontBaseUrl}/${encoded}`;
  }

  return `https://${env.awsS3Bucket}.s3.${env.awsRegion}.amazonaws.com/${encoded}`;
};

const writeBufferToLocalStorage = async ({ buffer, payload, originalFilename }) => {
  if (!env.localMaterialsRoot) {
    throw new Error('LOCAL_MATERIALS_ROOT is required when STORAGE_PROVIDER=local');
  }

  const relativeKey = createS3Key(payload, originalFilename);
  const absolutePath = path.join(path.resolve(env.localMaterialsRoot), relativeKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return relativeKey;
};

const uploadBufferToS3 = async ({ buffer, mimeType, payload, originalFilename, sourceRelativePath }) => {
  if (env.storageProvider === 'local') {
    const localKey = sourceRelativePath || (await writeBufferToLocalStorage({ buffer, payload, originalFilename }));

    return {
      s3Key: localKey,
      fileUrl: buildPublicUrl(localKey)
    };
  }

  const s3Key = createS3Key(payload, originalFilename);

  const command = new PutObjectCommand({
    Bucket: env.awsS3Bucket,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType
  });

  await s3Client.send(command);

  return {
    s3Key,
    fileUrl: buildPublicUrl(s3Key)
  };
};

const deleteFromS3 = async (s3Key) => {
  if (env.storageProvider === 'local') {
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: env.awsS3Bucket,
    Key: s3Key
  });

  await s3Client.send(command);
};

module.exports = {
  uploadBufferToS3,
  deleteFromS3,
  buildPublicUrl
};
