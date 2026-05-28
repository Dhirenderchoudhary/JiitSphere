const mongoose = require('mongoose');
const env = require('./env');

const connectDb = async () => {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is missing in environment variables');
  }

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 100,
    minPoolSize: 10,
  });

  if (env.logStartup) {
    console.log('MongoDB connected');
  }
};

module.exports = connectDb;
