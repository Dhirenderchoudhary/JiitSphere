const express = require('express');
const {
  getMaterials,
  getMaterialById,
  getFilterOptions,
  getBrowseOptions
} = require('../controllers/materialController');

const router = express.Router();

router.get('/', getMaterials);
router.get('/filters/options', getFilterOptions);
router.get('/filters/browse', getBrowseOptions);
router.get('/:id', getMaterialById);

module.exports = router;
