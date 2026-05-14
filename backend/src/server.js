
const app = require('./app');
const connectDb = require('./config/db');
const env = require('./config/env');

let server;
let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (env.logStartup) {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
  }

  if (!server) {
    process.exit(0);
    return;
  }

  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, env.gracefulShutdownTimeoutMs);

  server.close((error) => {
    clearTimeout(timeout);
    if (error) {
      console.error('Server close failed:', error);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
};

const startServer = async () => {
  try {
    try {
      await connectDb();
    } catch (dbError) {
      if (!env.allowStartWithoutDb) {
        throw dbError;
      }
      console.warn('MongoDB connection failed; starting without DB because ALLOW_START_WITHOUT_DB=true');
      console.warn(dbError?.message || dbError);
    }

    server = app.listen(env.port, () => {
      if (env.logStartup) {
        console.log(`Server running on port ${env.port}`);
      }
    });

    server.keepAliveTimeout = env.serverKeepAliveTimeoutMs;
    server.headersTimeout = env.serverHeadersTimeoutMs;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

startServer();
