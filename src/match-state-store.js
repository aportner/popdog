const fs = require('node:fs/promises');
const path = require('node:path');

class MatchStateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporaryPath, this.filePath);
  }

  async clear() {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { MatchStateStore };
