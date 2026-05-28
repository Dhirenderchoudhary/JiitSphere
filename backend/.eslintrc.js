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
    'no-underscore-dangle': ['warn', { allow: ['_id', '_next'] }],
    'consistent-return': 'off',
    'node/no-unsupported-features/es-syntax': 'off',
    'no-param-reassign': 'warn',
    'node/no-unsupported-features/node-builtins': 'warn',
    'no-restricted-syntax': 'warn',
    'no-nested-ternary': 'warn',
    'node/no-unpublished-require': 'warn',
    'no-unused-vars': 'warn',
    'no-await-in-loop': 'warn',
    'import/no-extraneous-dependencies': 'warn',
    'guard-for-in': 'warn',
    'jest/no-conditional-expect': 'warn',
    'default-param-last': 'warn',
    'no-plusplus': 'warn',
    'no-continue': 'warn',
    'no-process-exit': 'warn',
    'no-promise-executor-return': 'warn',
    'no-useless-escape': 'warn',
    'no-use-before-define': 'warn',
    'camelcase': 'warn',
    'global-require': 'warn',
    'node/no-unsupported-features/es-builtins': 'warn',
    'no-cond-assign': 'warn',
    'no-shadow': 'warn',
    'class-methods-use-this': 'warn',
    'max-classes-per-file': 'warn'
  }
};
