export default {
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage'
    }
  }
}
