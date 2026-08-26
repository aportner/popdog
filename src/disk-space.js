const { statfs } = require('node:fs/promises');

const UNITS = [
  { bytes: 1024n ** 4n, label: 'TiB' },
  { bytes: 1024n ** 3n, label: 'GiB' },
  { bytes: 1024n ** 2n, label: 'MiB' },
  { bytes: 1024n, label: 'KiB' },
];

async function availableBytes(path) {
  const stats = await statfs(path, { bigint: true });
  return stats.bsize * stats.bavail;
}

function formatBytes(bytes) {
  const value = BigInt(bytes);
  const unit = UNITS.find((candidate) => value >= candidate.bytes);
  if (!unit) return `${value} B`;

  const tenths = (value * 10n) / unit.bytes;
  const fraction = tenths % 10n;
  return fraction === 0n
    ? `${tenths / 10n} ${unit.label}`
    : `${tenths / 10n}.${fraction} ${unit.label}`;
}

module.exports = { availableBytes, formatBytes };
