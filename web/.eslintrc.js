module.exports = {
  env: {
    browser: true,
    node: true,
    jest: true
  },
  extends: [
    'next/core-web-vitals',
    'airbnb',
    'plugin:react/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:testing-library/react',
    'plugin:jest-dom/recommended',
    'plugin:prettier/recommended'
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'import/prefer-default-export': 'off',
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'no-undef': 'warn',
    'no-unused-vars': 'warn',
    'import/extensions': 'warn',
    'no-underscore-dangle': 'warn',
    'no-plusplus': 'warn',
    'no-nested-ternary': 'warn',
    'react/no-array-index-key': 'warn',
    'react/jsx-props-no-spreading': 'warn',
    'jsx-a11y/heading-has-content': 'warn',
    'no-promise-executor-return': 'warn',
    'no-constant-condition': 'warn',
    'no-await-in-loop': 'warn',
    'no-use-before-define': 'warn',
    'camelcase': 'warn',
    'no-restricted-syntax': 'warn',
    'import/no-extraneous-dependencies': 'warn',
    'no-console': 'warn',
    'react/jsx-filename-extension': 'warn',
    'react/button-has-type': 'warn',
    'jsx-a11y/label-has-associated-control': 'warn',
    'no-continue': 'warn'
  }
};
