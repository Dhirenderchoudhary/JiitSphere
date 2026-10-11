const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

const s3Client = new S3Client({
  region: env.awsRegion,
  ...(env.s3Endpoint ? { endpoint: env.s3Endpoint, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
  },
});

module.exports = s3Client;
