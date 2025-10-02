export default {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'public/js/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!public/js/**/*.test.js',
    '!public/js/**/*.spec.js',
    '!public/sw.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // Support both node and jsdom environments based on test location
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: [
        '**/test/unit/**/*.test.js',
        '**/test/integration/**/*.test.js',
        '**/test/schemas/**/*.test.js',
        '**/test/utils/**/*.test.js',
        '**/test/errors/**/*.test.js',
        '**/test/meta/**/*.test.js'
      ]
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: [
        '**/test/frontend/**/*.test.js'
      ],
      setupFilesAfterEnv: ['<rootDir>/test/frontend/setup.js']
    }
  ]
};