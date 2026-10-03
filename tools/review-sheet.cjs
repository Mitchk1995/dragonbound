// Builds labelled JPG review sheets from captures; run by tools/review.mjs as an Electron app:
//   electron tools/review-sheet.cjs <job.json>
// The job names the output folder, a title, optional before/after column labels and the views,
// each with a before and an after capture path (either may be null). Every picture is scaled to
// CELL wide; ROWS rows go on a sheet, more spill onto the next sheet.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const CELL = 800;
const ROWS = 3;
const GAP = 12;

/** One sheet drawn on a canvas in a hidden page, returned as a JPEG data URL. */
function draw(sheet) {
  const { title, columns, rows, cell, gap } = sheet;
  const load = (src) => new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return Promise.all(rows.flatMap((r) => r.cells.map((c) => load(c.src)))).then((imgs) => {
    const cols = rows[0].cells.length;
    const cellH = Math.max(...imgs.map((i) => (i ? Math.round((i.height * cell) / i.width) : 0)), Math.round(cell * 0.5625));
    const head = 44, colHead = columns ? 30 : 0, label = 26;
    const W = gap + cols * (cell + gap);
    const H = head + colHead + rows.length * (label + cellH + gap) + gap;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#1c1a1e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2e6c9';
    g.font = '600 22px "Segoe UI", sans-serif';
    g.textBaseline = 'middle';
    g.fillText(title, gap, head / 2 + 2);
    g.font = '600 18px "Segoe UI", sans-serif';
    if (columns) columns.forEach((c, i) => { g.fillStyle = i ? '#9fd18b' : '#d8b98a'; g.fillText(c, gap + i * (cell + gap), head + colHead / 2); });
    let y = head + colHead, k = 0;
    for (const r of rows) {
      g.fillStyle = '#cfc6b8';
      g.font = '500 16px "Segoe UI", sans-serif';
      g.fillText(r.label, gap, y + label / 2);
      y += label;
      r.cells.forEach((c, i) => {
        const img = imgs[k++], x = gap + i * (cell + gap);
        if (img) {
          const h = Math.round((img.height * cell) / img.width);
          g.drawImage(img, x, y + (cellH - h) / 2, cell, h);
        } else {
          g.fillStyle = '#2a262c';
          g.fillRect(x, y, cell, cellH);
          g.fillStyle = '#8a8290';
          g.fillText(c.missing, x + 16, y + cellH / 2);
        }
      });
      y += cellH + gap;
    }
    return cv.toDataURL('image/jpeg', 0.86);
  });
}

/** The job's views as sheets of ROWS rows: before and after side by side, or two views to a row. */
function sheets(job) {
  const small = (p) => (p ? nativeImage.createFromPath(p).resize({ width: CELL, quality: 'best' }).toDataURL() : null);
  const rows = [];
  if (job.columns) {
    for (const v of job.views) {
      rows.push({ label: v.name, cells: [
        { src: small(v.before), missing: 'not in this version' },
        { src: small(v.after), missing: 'not in this version' },
      ] });
    }
  } else {
    for (let i = 0; i < job.views.length; i += 2) {
      const pair = job.views.slice(i, i + 2);
      rows.push({ label: pair.map((v) => v.name).join('    |    '), cells: pair.map((v) => ({ src: small(v.after), missing: 'no capture' })) });
    }
    const last = rows[rows.length - 1];
    if (last && last.cells.length === 1) last.cells.push({ src: null, missing: '' });
  }
  const out = [];
  for (let i = 0; i < rows.length; i += ROWS) out.push(rows.slice(i, i + ROWS));
  return out;
}

app.whenReady().then(async () => {
  let code = 0;
  try {
    const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
    const win = new BrowserWindow({ show: false });
    await win.loadURL('about:blank');
    const pages = sheets(job);
    for (let i = 0; i < pages.length; i++) {
      const title = `${job.title}  ·  ${job.date}  ·  ${i + 1}/${pages.length}`;
      const sheet = { title, columns: job.columns, rows: pages[i], cell: CELL, gap: GAP };
      const url = await win.webContents.executeJavaScript(`(${draw})(${JSON.stringify(sheet)})`);
      fs.writeFileSync(path.join(job.out, `sheet-${i + 1}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    }
  } catch (e) {
    console.error(e);
    code = 1;
  }
  app.exit(code);
});
