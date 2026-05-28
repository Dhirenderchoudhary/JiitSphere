const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  // Prevent env validation from crashing
  process.env.NODE_ENV = 'test';
  process.env.AUTH_SECRET = 'test-secret-that-is-long-enough-for-zod';
  process.env.ADMIN_API_KEY = 'test-admin-key';
  process.env.USER_PASSWORD_HASH = 'test-hash';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  // Set env var so our app uses the memory db
  process.env.MONGODB_URI = uri;
  
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 1
    });
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  // Clear all data after every individual test
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});
