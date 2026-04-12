// SPDX-License-Identifier: GPL-3.0-or-later
const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

const s3Client = new S3Client({
  region: env.awsRegion,
  credentials: {
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey
  }
});

module.exports = s3Client;
