// SPDX-License-Identifier: GPL-3.0-or-later
const Material = require('../models/Material');
const asyncHandler = require('../middlewares/asyncHandler');
const { uploadFileToS3, deleteFromS3, safeDeleteLocalFile } = require('../services/s3Service');
const { getFileTypeFromName } = require('../utils/file');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseOptionalInt = (value, label, { min, max }) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createHttpError(400, `${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
};

const parsePositiveInt = (value, label, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createHttpError(400, `${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
};

const requiredFields = ['title', 'degree', 'branch', 'year', 'semester', 'subject', 'resourceType'];

const validateRequiredFields = (body) => {
  const missing = requiredFields.filter((field) => !body[field]);

  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
};

const listMaterialsAdmin = asyncHandler(async (req, res) => {
  const {
    degree,
    branch,
    year,
    semester,
    subject,
    resourceType,
    page = 1,
    limit = 25,
    includeUnpublished = 'true'
  } = req.query;

  const query = {};
  if (degree) query.degree = degree;
  if (branch) query.branch = branch;
  const parsedYear = parseOptionalInt(year, 'year', { min: 1, max: 5 });
  const parsedSemester = parseOptionalInt(semester, 'semester', { min: 1, max: 10 });
  if (parsedYear !== null) query.year = parsedYear;
  if (parsedSemester !== null) query.semester = parsedSemester;
  if (subject) query.subject = subject;
  if (resourceType) query.resourceType = resourceType;
  if (includeUnpublished !== 'true') query.isPublished = true;

  const pageNumber = parsePositiveInt(page, 'page', 1, { min: 1, max: 100000 });
  const limitNumber = parsePositiveInt(limit, 'limit', 25, { min: 1, max: 100 });
  const skip = (pageNumber - 1) * limitNumber;

  const [items, total] = await Promise.all([
    Material.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNumber).lean(),
    Material.countDocuments(query)
  ]);

  return res.json({
    success: true,
    data: items,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber)
    }
  });
});

const createMaterial = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'File is required' });
  }

  validateRequiredFields(req.body);

  try {
    const uploadResult = await uploadFileToS3({
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      payload: req.body,
      originalFilename: req.file.originalname
    });

    const material = await Material.create({
      ...req.body,
      year: Number(req.body.year),
      semester: Number(req.body.semester),
      fileType: getFileTypeFromName(req.file.originalname),
      fileSizeBytes: req.file.size,
      fileUrl: uploadResult.fileUrl,
      s3Key: uploadResult.s3Key,
      uploadedBy: req.adminEmail || 'admin'
    });

    return res.status(201).json({ success: true, data: material });
  } finally {
    await safeDeleteLocalFile(req.file.path);
  }
});

const updateMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id);

  if (!material) {
    return res.status(404).json({ success: false, message: 'Material not found' });
  }

  const updatableFields = [
    'title',
    'description',
    'degree',
    'branch',
    'year',
    'semester',
    'subject',
    'resourceType',
    'isPublished'
  ];

  updatableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === 'year' || field === 'semester') {
        const num = Number(req.body[field]);
        const max = field === 'year' ? 5 : 10;
        if (!Number.isInteger(num) || num < 1 || num > max) return;
        material[field] = num;
      } else if (field === 'isPublished') {
        material[field] = Boolean(req.body[field]);
      } else {
        material[field] = String(req.body[field]).trim();
      }
    }
  });

  if (req.file) {
    const oldS3Key = material.s3Key;
    try {
      const uploadResult = await uploadFileToS3({
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        payload: {
          degree: material.degree,
          branch: material.branch,
          year: material.year,
          semester: material.semester,
          subject: material.subject,
          resourceType: material.resourceType
        },
        originalFilename: req.file.originalname
      });

      material.fileType = getFileTypeFromName(req.file.originalname);
      material.fileSizeBytes = req.file.size;
      material.fileUrl = uploadResult.fileUrl;
      material.s3Key = uploadResult.s3Key;

      if (oldS3Key && oldS3Key !== material.s3Key) {
        await deleteFromS3(oldS3Key);
      }
    } finally {
      await safeDeleteLocalFile(req.file.path);
    }
  }

  await material.save();

  return res.json({ success: true, data: material });
});

const deleteMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id);

  if (!material) {
    return res.status(404).json({ success: false, message: 'Material not found' });
  }

  await deleteFromS3(material.s3Key);
  await material.deleteOne();

  return res.json({ success: true, message: 'Material deleted successfully' });
});

const deleteAllMaterials = asyncHandler(async (_req, res) => {
  const result = await Material.deleteMany({});
  return res.json({ success: true, message: `Deleted ${result.deletedCount} materials` });
});

module.exports = {
  listMaterialsAdmin,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  deleteAllMaterials
};
