const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'tests', 'electron', 'tools', 'index.html', 'package.json', 'AGENTS.md', 'README.md'];
const source = /\.(?:[cm]?ts|css|py|cjs|mjs|html|json|md)$/;
const ignored = new Set(['previews', '__pycache__', 'node_modules']);
const mojibake = /\u00e2\u20ac|\u00e2\u201d|\u00e2\u02c6|\u00c3[\u00a9\u00a8\u00aa]/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const bad = [];
function visit(file) {
  const stat = fs.lstatSync(file);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(file)) if (!ignored.has(name)) visit(path.join(file, name));
  } else if (stat.isFile() && source.test(file)) {
    const bytes = fs.readFileSync(file);
    try {
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bad.push(`${file}: BOM`);
      else if (mojibake.test(decoder.decode(bytes))) bad.push(`${file}: mojibake`);
    } catch { bad.push(`${file}: invalid UTF-8`); }
  }
}
for (const file of roots) visit(file);
if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1; }
else console.log('Source encoding is clean.');
