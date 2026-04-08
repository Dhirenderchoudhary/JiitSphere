const Material = require('../models/Material');
const asyncHandler = require('../middlewares/asyncHandler');
const { uploadBufferToS3, deleteFromS3 } = require('../services/s3Service');
const { getFileTypeFromName } = require('../utils/file');

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
  if (year) query.year = Number(year);
  if (semester) query.semester = Number(semester);
  if (subject) query.subject = subject;
  if (resourceType) query.resourceType = resourceType;
  if (includeUnpublished !== 'true') query.isPublished = true;

  const pageNumber = Number(page);
  const limitNumber = Math.min(Number(limit), 100);
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

  const uploadResult = await uploadBufferToS3({
    buffer: req.file.buffer,
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
        if (!Number.isInteger(num) || num < 1 || num > 10) return;
        material[field] = num;
      } else if (field === 'isPublished') {
        material[field] = Boolean(req.body[field]);
      } else {
        material[field] = String(req.body[field]).trim();
      }
    }
  });

  if (req.file) {
    await deleteFromS3(material.s3Key);

    const uploadResult = await uploadBufferToS3({
      buffer: req.file.buffer,
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
