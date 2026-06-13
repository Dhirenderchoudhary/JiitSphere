const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Increase timeout to allow MongoDB binary download
jest.setTimeout(60000);

beforeAll(async () => {
  // Prevent env validation from crashing
  process.env.NODE_ENV = 'test';
  process.env.AUTH_SECRET = 'test-secret-that-is-long-enough-for-zod';
  process.env.ADMIN_API_KEY = 'test-admin-key';
  process.env.USER_PASSWORD_HASH = 'test-hash';
  process.env.MONGOMS_MD5_CHECK = '0';

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Set env var so our app uses the memory db
  process.env.MONGODB_URI = uri;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
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
    const { collections } = mongoose.connection;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});
