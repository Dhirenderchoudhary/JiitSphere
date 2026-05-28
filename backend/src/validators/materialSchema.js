const { z } = require('zod');

const createMaterialSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  degree: z.enum(['BTech', 'MTech', 'BCA', 'MCA'], {
    invalid_type_error: 'Invalid degree',
    required_error: 'Invalid degree'
  }),
  branch: z.string().trim().min(1, 'Branch is required'),
  // For multipart/form-data, numbers might come as strings, so we coerce them
  year: z.coerce.number().int().min(1).max(5),
  semester: z.coerce.number().int().min(1).max(10),
  subject: z.string().trim().min(1, 'Subject is required'),
  resourceType: z.enum(['Slides', 'Lectures', 'Tutorials', 'PYQs', 'Solutions'], {
    invalid_type_error: 'Invalid resource type',
    required_error: 'Invalid resource type'
  }),
  isPublished: z.coerce.boolean().optional().default(true)
  // fileUrl, s3Key, fileSizeBytes, fileType are determined in controller/service
});

const updateMaterialSchema = createMaterialSchema.partial();

module.exports = {
  createMaterialSchema,
  updateMaterialSchema
};
