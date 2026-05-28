module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/tests/setEnv.js'],
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/src/tests/setup.js'],
  verbose: true,
  collectCoverageFrom: ['src/**/*.js', '!src/tests/**/*.js'],
  coverageThreshold: {
    global: {
      lines: 80
    }
  },
  // Ensure tests run sequentially to avoid port/db conflicts if needed
  maxWorkers: 1
};
