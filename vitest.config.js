export default {
  test: {
    environment: 'node',
    coverage: {
      include: ['src/**/*.js'],
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      }
    }
  }
}
