module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'airbnb-base',
    'plugin:node/recommended',
    'plugin:jest/recommended',
    'plugin:prettier/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022
  },
  rules: {
    'no-console': 'warn',
    'no-underscore-dangle': ['error', { allow: ['_id', '_next'] }],
    'consistent-return': 'off',
    'node/no-unsupported-features/es-syntax': 'off' // We use modern syntax
  }
};
