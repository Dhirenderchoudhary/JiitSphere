const Material = require('../models/Material');
const mongoose = require('mongoose');
const asyncHandler = require('../middlewares/asyncHandler');

const normalizeOption = (value) => String(value || '').trim();

const FILTER_OPTIONS_CACHE_TTL_MS = 30 * 1000;
const BROWSE_OPTIONS_CACHE_TTL_MS = 20 * 1000;
const MAX_BROWSE_CACHE_ENTRIES = 150;

let filterOptionsCache = {
  expiresAt: 0,
  data: null
};

const browseOptionsCache = new Map();

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

const now = () => Date.now();

const setBrowseCache = (key, value) => {
  browseOptionsCache.set(key, { expiresAt: now() + BROWSE_OPTIONS_CACHE_TTL_MS, data: value });
  if (browseOptionsCache.size <= MAX_BROWSE_CACHE_ENTRIES) return;

  const oldest = [...browseOptionsCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]?.[0];
  if (oldest) browseOptionsCache.delete(oldest);
};

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
  const parsedYear = parseOptionalInt(year, 'year', { min: 1, max: 5 });
  const parsedSemester = parseOptionalInt(semester, 'semester', { min: 1, max: 10 });
  if (parsedYear !== null) query.year = parsedYear;
  if (parsedSemester !== null) query.semester = parsedSemester;
  if (subject) query.subject = subject;
  if (resourceType) query.resourceType = resourceType;

  if (search) {
    const trimmedSearch = String(search).trim().slice(0, 120);
    if (trimmedSearch) {
      query.$text = { $search: trimmedSearch };
    }
  }

  const pageNumber = parsePositiveInt(page, 'page', 1, { min: 1, max: 100000 });
  const limitNumber = parsePositiveInt(limit, 'limit', 20, { min: 1, max: 100 });
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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Material not found' });
  }

  const material = await Material.findById(req.params.id).lean();

  if (!material || !material.isPublished) {
    return res.status(404).json({ success: false, message: 'Material not found' });
  }

  return res.json({ success: true, data: material });
});

const getFilterOptions = asyncHandler(async (_req, res) => {
  if (filterOptionsCache.data && filterOptionsCache.expiresAt > now()) {
    return res.json({ success: true, data: filterOptionsCache.data, cached: true });
  }

  const [degrees, branches, years, semesters, subjects, resourceTypes] = await Promise.all([
    Material.distinct('degree', { isPublished: true }),
    Material.distinct('branch', { isPublished: true }),
    Material.distinct('year', { isPublished: true }),
    Material.distinct('semester', { isPublished: true }),
    Material.distinct('subject', { isPublished: true }),
    Material.distinct('resourceType', { isPublished: true })
  ]);

  const data = {
    branches: uniqueNaturalSort(branches),
    years: years.sort((a, b) => a - b),
    semesters: semesters.sort((a, b) => a - b),
    subjects: uniqueNaturalSort(subjects),
    resourceTypes: uniqueNaturalSort(resourceTypes),
    degrees: uniqueNaturalSort(degrees)
  };

  filterOptionsCache = {
    data,
    expiresAt: now() + FILTER_OPTIONS_CACHE_TTL_MS
  };

  return res.json({ success: true, data });
});

const getBrowseOptions = asyncHandler(async (req, res) => {
  const query = { isPublished: true };
  if (req.query.degree) query.degree = req.query.degree;
  if (req.query.branch) query.branch = req.query.branch;
  const parsedYear = parseOptionalInt(req.query.year, 'year', { min: 1, max: 5 });
  const parsedSemester = parseOptionalInt(req.query.semester, 'semester', { min: 1, max: 10 });
  if (parsedYear !== null) query.year = parsedYear;
  if (parsedSemester !== null) query.semester = parsedSemester;
  if (req.query.subject) query.subject = req.query.subject;

  const cacheKey = JSON.stringify({
    degree: query.degree || '',
    branch: query.branch || '',
    year: query.year || '',
    semester: query.semester || '',
    subject: query.subject || ''
  });

  const cached = browseOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > now()) {
    return res.json({ success: true, data: cached.data, cached: true });
  }

  const [branches, years, semesters, subjects, resourceTypes] = await Promise.all([
    Material.distinct('branch', query),
    Material.distinct('year', query),
    Material.distinct('semester', query),
    Material.distinct('subject', query),
    Material.distinct('resourceType', query)
  ]);

  const data = {
    branches: uniqueNaturalSort(branches),
    years: years.sort((a, b) => a - b),
    semesters: semesters.sort((a, b) => a - b),
    subjects: uniqueNaturalSort(subjects),
    resourceTypes: uniqueNaturalSort(resourceTypes)
  };

  setBrowseCache(cacheKey, data);

  return res.json({ success: true, data });
});

module.exports = {
  getMaterials,
  getMaterialById,
  getFilterOptions,
  getBrowseOptions
};
