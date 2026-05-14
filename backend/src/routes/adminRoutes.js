
const express = require('express');
const authAdmin = require('../middlewares/authAdmin');
const upload = require('../middlewares/upload');
const {
  listMaterialsAdmin,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  deleteAllMaterials
} = require('../controllers/adminController');

const router = express.Router();

router.use(authAdmin);

router.get('/materials', listMaterialsAdmin);
router.post('/materials', upload.single('file'), createMaterial);
router.put('/materials/:id', upload.single('file'), updateMaterial);
router.delete('/materials/:id', deleteMaterial);
router.delete('/materials', deleteAllMaterials);

module.exports = router;
