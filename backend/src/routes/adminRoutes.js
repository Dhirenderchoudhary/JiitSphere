const express = require('express');
const authAdmin = require('../middlewares/authAdmin');
const upload = require('../middlewares/upload');
const validateRequest = require('../middlewares/validateRequest');
const { createMaterialSchema, updateMaterialSchema } = require('../validators/materialSchema');
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
router.post('/materials', upload.single('file'), validateRequest(createMaterialSchema), createMaterial);
router.put('/materials/:id', upload.single('file'), validateRequest(updateMaterialSchema), updateMaterial);
router.delete('/materials/:id', deleteMaterial);
router.delete('/materials', deleteAllMaterials);

module.exports = router;
