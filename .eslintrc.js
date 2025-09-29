module.exports = {
  env: {
    node: true,
    es2022: true
  },
  globals: {
    URL: 'readonly',
    Intl: 'readonly'
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Disable some rules that might be too strict for this project
    'no-unused-vars': ['error', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }],
    'no-console': 'off', // Allow console.log in this project
    'no-undef': 'error'
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'docs/',
    'test/'  // Don't lint test files for now
  ]
};