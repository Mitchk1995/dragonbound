const fs = require('node:fs/promises');
const path = require('node:path');
const format = import('./save-format.mjs');

/** One writer, atomic replacement, and the previous usable save kept intact. */
function createSaveStore(directory) {
  const file = (name) => path.join(directory(), name);
  let writes = Promise.resolve();
  async function readGoodSave(name) {
    let text;
    try { text = await fs.readFile(file(name), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    return (await format).parseSave(text) ? text : null;
  }
  return {
    async read() {
      await writes;
      return await readGoodSave('save.json') ?? await readGoodSave('save.backup.json');
    },
    write(json) {
      const pending = writes.then(async () => {
        if (!(await format).parseSave(json)) throw new Error('Progress could not be saved safely.');
        await fs.mkdir(directory(), { recursive: true });
        // Refuse to downgrade a future save; malformed old primaries never replace the backup.
        if (await readGoodSave('save.json')) await fs.copyFile(file('save.json'), file('save.backup.json'));
        const tmp = file('save.json.tmp');
        try {
          await fs.writeFile(tmp, json, 'utf8');
          await fs.rename(tmp, file('save.json'));
        } finally { await fs.unlink(tmp).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
        return true;
      });
      writes = pending.catch(() => {});
      return pending;
    },
  };
}

module.exports = { createSaveStore };
