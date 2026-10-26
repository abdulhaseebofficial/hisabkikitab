/**
 * Where the visual-QA screenshots go.
 *
 * Always written inside the repository, under test-results/, so a run produces
 * the same artefacts on every machine. Each spec used to carry its own copy of
 * this with an absolute path into one developer's home directory baked in,
 * which created that directory during collection and failed the whole run
 * anywhere else. Mirroring elsewhere is now opt-in: set VISUAL_QA_MIRROR_DIR
 * to have each screenshot copied there as well.
 */
const fs = require('node:fs');
const path = require('node:path');

const LOCAL_SCREENSHOT_DIR = path.resolve(__dirname, '../../test-results/visual-qa');
const MIRROR_DIR = process.env.VISUAL_QA_MIRROR_DIR
  ? path.resolve(process.env.VISUAL_QA_MIRROR_DIR) : null;

for (const dir of [LOCAL_SCREENSHOT_DIR, MIRROR_DIR]) {
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Screenshot `page` into the run's artefacts. Never fails a test. */
async function saveScreenshot(page, filename) {
  const localPath = path.join(LOCAL_SCREENSHOT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  if (!MIRROR_DIR) return;
  try {
    fs.copyFileSync(localPath, path.join(MIRROR_DIR, filename));
  } catch { /* a mirror is a convenience, not a result */ }
}

module.exports = { saveScreenshot };
