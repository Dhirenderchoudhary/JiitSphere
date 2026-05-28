const request = require('supertest');
const app = require('../../app');
const Material = require('../../models/Material');

jest.mock('../../services/s3Service', () => ({
  uploadFileToS3: jest.fn().mockResolvedValue({ fileUrl: 'http://mock.s3.url/file.pdf', s3Key: 'mock-s3-key.pdf' }),
  deleteFromS3: jest.fn().mockResolvedValue(true),
  safeDeleteLocalFile: jest.fn().mockResolvedValue(true)
}));

describe('Materials Integration Tests', () => {
  let sampleMaterial;

  beforeEach(async () => {
    sampleMaterial = await Material.create({
      title: 'Math Notes',
      degree: 'BTech',
      branch: 'CSE',
      year: 1,
      semester: 1,
      subject: 'Math 1',
      resourceType: 'Lectures',
      fileType: 'pdf',
      fileSizeBytes: 1024,
      fileUrl: 'http://test.com/math.pdf',
      s3Key: 'math-1-notes.pdf',
      isPublished: true
    });
  });

  describe('GET /api/v1/materials', () => {
    it('should return a list of materials with pagination', async () => {
      const res = await request(app).get('/api/v1/materials');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter materials by subject', async () => {
      const res = await request(app).get('/api/v1/materials?subject=Math 1');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);

      const emptyRes = await request(app).get('/api/v1/materials?subject=Physics');
      expect(emptyRes.body.data.length).toBe(0);
    });
  });

  describe('GET /api/v1/materials/:id', () => {
    it('should return a material by ID', async () => {
      const res = await request(app).get(`/api/v1/materials/${sampleMaterial._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Math Notes');
    });

    it('should return 404 for invalid ID', async () => {
      const res = await request(app).get('/api/v1/materials/603b22b0c3f59231f498c430');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/admin/materials', () => {
    it('should block unauthorized requests', async () => {
      const res = await request(app).post('/api/v1/admin/materials').send({});
      expect(res.status).toBe(401);
    });

    it('should return 400 for missing required fields due to Zod validation', async () => {
      const res = await request(app)
        .post('/api/v1/admin/materials')
        .set('X-Admin-Key', 'test-admin-key')
        .set('X-Admin-Email', 'admin@example.com')
        .field('title', 'Only Title provided');
      
      if (res.status === 500) console.log(res.body);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('should create a material when provided valid data', async () => {
      const res = await request(app)
        .post('/api/v1/admin/materials')
        .set('X-Admin-Key', 'test-admin-key')
        .set('X-Admin-Email', 'admin@example.com')
        .field('title', 'Physics Slides')
        .field('degree', 'BTech')
        .field('branch', 'CSE')
        .field('year', 1)
        .field('semester', 2)
        .field('subject', 'Physics')
        .field('resourceType', 'Slides')
        .attach('file', Buffer.from('dummy content'), 'dummy.pdf'); 

      // Status might be 200 or 201 depending on controller logic, usually 200/201 on success.
      if (res.status === 500) console.log(res.body);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.success).toBe(true);
      
      // Verify it was saved
      const saved = await Material.findOne({ title: 'Physics Slides' });
      expect(saved).not.toBeNull();
    });
  });

  describe('DELETE /api/v1/admin/materials/:id', () => {
    it('should delete a material', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/materials/${sampleMaterial._id}`)
        .set('X-Admin-Key', 'test-admin-key')
        .set('X-Admin-Email', 'admin@example.com');
      
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      
      const check = await Material.findById(sampleMaterial._id);
      expect(check).toBeNull();
    });
  });
});
