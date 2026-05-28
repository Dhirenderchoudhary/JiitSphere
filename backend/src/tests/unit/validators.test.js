const { createMaterialSchema, updateMaterialSchema } = require('../../validators/materialSchema');

describe('Material Zod Schemas', () => {
  describe('createMaterialSchema', () => {
    it('should validate a correct payload and apply coercion and defaults', () => {
      const valid = {
        title: 'Test Material',
        degree: 'BTech',
        branch: 'CSE',
        year: '1', // coercion check
        semester: 2,
        subject: 'Math',
        resourceType: 'Slides'
      };
      const result = createMaterialSchema.safeParse(valid);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.year).toBe(1);
        expect(result.data.isPublished).toBe(true);
        expect(result.data.description).toBe('');
      }
    });

    it('should fail when required fields are missing', () => {
      const invalid = { title: 'Missing everything else' };
      const result = createMaterialSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorPaths = result.error.issues.map(i => i.path[0]);
        expect(errorPaths).toContain('degree');
        expect(errorPaths).toContain('branch');
        expect(errorPaths).toContain('year');
        expect(errorPaths).toContain('semester');
        expect(errorPaths).toContain('subject');
        expect(errorPaths).toContain('resourceType');
      }
    });

    it('should fail on invalid enums', () => {
      const invalidEnum = {
        title: 'Test', degree: 'Phd', branch: 'CSE', year: 1, semester: 1, subject: 'Math',
        resourceType: 'InvalidType'
      };
      const result = createMaterialSchema.safeParse(invalidEnum);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMsgs = result.error.issues.map(i => i.message);
        expect(errorMsgs.some(msg => msg.includes('Invalid option') || msg.includes('Invalid degree'))).toBe(true);
        expect(errorMsgs.some(msg => msg.includes('Invalid option') || msg.includes('Invalid resource type'))).toBe(true);
      }
    });

    it('should fail on invalid number ranges', () => {
      const outOfRange = {
        title: 'Test', degree: 'BTech', branch: 'CSE', year: 6, semester: 11, subject: 'Math',
        resourceType: 'Slides'
      };
      const result = createMaterialSchema.safeParse(outOfRange);
      expect(result.success).toBe(false);
    });

    it('should fail on empty strings for required string fields', () => {
      const emptyStrings = {
        title: '   ', degree: 'BTech', branch: '   ', year: 1, semester: 1, subject: 'Math',
        resourceType: 'Slides'
      };
      const result = createMaterialSchema.safeParse(emptyStrings);
      expect(result.success).toBe(false);
    });
  });

  describe('updateMaterialSchema', () => {
    it('should allow partial updates', () => {
      const partial = { title: 'Updated Title' };
      const result = updateMaterialSchema.safeParse(partial);
      expect(result.success).toBe(true);
    });
  });
});
