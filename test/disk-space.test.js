const assert = require('node:assert/strict');
const test = require('node:test');
const { formatBytes } = require('../src/disk-space');

test('formats disk space using binary units', () => {
  assert.equal(formatBytes(512n), '512 B');
  assert.equal(formatBytes(10n * 1024n ** 3n), '10 GiB');
  assert.equal(formatBytes((42n * 10n + 5n) * 1024n ** 3n / 10n), '42.5 GiB');
});
