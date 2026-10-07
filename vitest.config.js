import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: './tests/globalSetup.js',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: { NODE_ENV: 'test' },
  },
});
