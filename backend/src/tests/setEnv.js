process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'test-secret-that-is-long-enough-for-zod';
process.env.ADMIN_API_KEY = 'test-admin-key';
process.env.ADMIN_ALLOWED_EMAILS = 'admin@example.com';
process.env.USER_PASSWORD_HASH = 'test-hash'; // Will be overridden in auth.test.js ? Wait, auth.test.js requires app before overriding.
// I will just use a fixed hash for tests!
const crypto = require('crypto');
process.env.USER_PASSWORD_HASH = crypto.createHash('sha256').update('password123').digest('hex');
process.env.USER_ALLOWED_IDENTIFIERS = 'student1,student2';
process.env.PORTAL_PUBLIC_DEMO_ENABLED = 'true';
process.env.MONGODB_URI = 'mongodb://localhost:27017/dummy';
