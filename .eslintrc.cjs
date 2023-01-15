module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {},
  settings: {},
  env: {
    browser: true,
    amd: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // Make sure this is always the last element in the array.
  ],
  plugins: ['simple-import-sort'],
  rules: {
    "prefer-const": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "no-case-declarations": "off",
    "no-async-promise-executor": "off"
  },
};