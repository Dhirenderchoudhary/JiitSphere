// SPDX-License-Identifier: GPL-3.0-or-later
const path = require('path');

const extensionToType = {
  '.pdf': 'pdf',
  '.ppt': 'ppt',
  '.pptx': 'pptx',
  '.doc': 'doc',
  '.docx': 'docx',
  '.mp4': 'mp4',
  '.zip': 'zip',
  '.xls': 'xls',
  '.xlsx': 'xlsx',
  '.txt': 'txt'
};

const getFileTypeFromName = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return extensionToType[ext] || 'other';
};

const isSupportedFileType = (filename) => getFileTypeFromName(filename) !== 'other';

const sanitizeKeyPart = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase();

module.exports = {
  getFileTypeFromName,
  isSupportedFileType,
  sanitizeKeyPart
};
