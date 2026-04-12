// SPDX-License-Identifier: GPL-3.0-or-later
const multer = require('multer');
const path = require('path');
const env = require('../config/env');

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
]);

const allowedExtensions = new Set([
  '.pdf', '.ppt', '.pptx', '.doc', '.docx',
  '.mp4', '.zip', '.xls', '.xlsx', '.txt'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Unsupported file format'));
    }
    if (!allowedExtensions.has(ext)) {
      return cb(new Error('Unsupported file extension'));
    }
    cb(null, true);
  }
});

module.exports = upload;
