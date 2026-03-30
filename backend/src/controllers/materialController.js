const Material = require('../models/Material');
const asyncHandler = require('../middlewares/asyncHandler');

const normalizeOption = (value) => String(value || '').trim();

const uniqueNaturalSort = (values = []) => {
  const normalized = values.map(normalizeOption).filter(Boolean);
  const unique = [...new Set(normalized.map((item) => item.toLowerCase()))];
  const originalMap = new Map();

  normalized.forEach((item) => {
    const key = item.toLowerCase();
    if (!originalMap.has(key)) {
      originalMap.set(key, item);
    }
  });

  return unique
    .map((key) => originalMap.get(key))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
};

const getMaterials = asyncHandler(async (req, res) => {
  const {
    degree,
    branch,
    year,
    semester,
    subject,
    resourceType,
    search,
    page = 1,
    limit = 20
  } = req.query;

  const query = { isPublished: true };

  if (degree) query.degree = degree;
  if (branch) query.branch = branch;
  if (year) query.year = Number(year);
  if (semester) query.semester = Number(semester);
  if (subject) query.subject = subject;
  if (resourceType) query.resourceType = resourceType;

  if (search) {
    query.$text = { $search: search };
  }

  const pageNumber = Number(page);
  const limitNumber = Math.min(Number(limit), 100);
  const skip = (pageNumber - 1) * limitNumber;

  const [items, total] = await Promise.all([
    Material.find(query)
      .sort({ year: 1, semester: 1, subject: 1, resourceType: 1, title: 1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
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

const getMaterialById = asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id).lean();

  if (!material || !material.isPublished) {
    return res.status(404).json({ success: false, message: 'Material not found' });
  }

  return res.json({ success: true, data: material });
});

const getFilterOptions = asyncHandler(async (_req, res) => {
  const [degrees, branches, years, semesters, subjects, resourceTypes] = await Promise.all([
    Material.distinct('degree', { isPublished: true }),
    Material.distinct('branch', { isPublished: true }),
    Material.distinct('year', { isPublished: true }),
    Material.distinct('semester', { isPublished: true }),
    Material.distinct('subject', { isPublished: true }),
    Material.distinct('resourceType', { isPublished: true })
  ]);

  return res.json({
    success: true,
    data: {
      branches: uniqueNaturalSort(branches),
      years: years.sort((a, b) => a - b),
      semesters: semesters.sort((a, b) => a - b),
      subjects: uniqueNaturalSort(subjects),
      resourceTypes: uniqueNaturalSort(resourceTypes),
      degrees: uniqueNaturalSort(degrees)
    }
  });
});

const getBrowseOptions = asyncHandler(async (req, res) => {
  const query = { isPublished: true };
  if (req.query.degree) query.degree = req.query.degree;
  if (req.query.branch) query.branch = req.query.branch;
  if (req.query.year) query.year = Number(req.query.year);
  if (req.query.semester) query.semester = Number(req.query.semester);
  if (req.query.subject) query.subject = req.query.subject;

  const [branches, years, semesters, subjects, resourceTypes] = await Promise.all([
    Material.distinct('branch', query),
    Material.distinct('year', query),
    Material.distinct('semester', query),
    Material.distinct('subject', query),
    Material.distinct('resourceType', query)
  ]);

  return res.json({
    success: true,
    data: {
      branches: uniqueNaturalSort(branches),
      years: years.sort((a, b) => a - b),
      semesters: semesters.sort((a, b) => a - b),
      subjects: uniqueNaturalSort(subjects),
      resourceTypes: uniqueNaturalSort(resourceTypes)
    }
  });
});

module.exports = {
  getMaterials,
  getMaterialById,
  getFilterOptions,
  getBrowseOptions
};
