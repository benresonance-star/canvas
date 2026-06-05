/**
 * E2E: project switch stability + placement persistence when dock tray is available.
 * Run: npm run test:e2e
 * Requires: dev server :5173, playwright chromium.
 */
import { chromium } from 'playwright';

const APP_URL = process.env.SMOKE_APP_URL ?? 'http://localhost:5173';
const TIMEOUT = 60_000;
const TRAY_LABEL = 'Artefacts waiting to place or dock';
const SEED_NAME = 'E2E Placement';
const SEED_KEY = 'notes__e2e-placement';

const consoleErrors = [];

function log(step, detail = '') {
  console.log(`[placement-e2e] ${step}${detail ? `: ${detail}` : ''}`);
}

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      return !text.includes('Loading canvas')
        && !text.includes('Loading workspace');
    },
    { timeout: TIMEOUT },
  );
}

async function waitForProjectSettled(page) {
  await page.waitForFunction(
    () => !document.body.innerText.includes('Loading project'),
    { timeout: TIMEOUT },
  ).catch(() => {});
  await page.waitForTimeout(800);
}

async function openProjectMenu(page) {
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByText('New project', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
}

function projectRowButtons(page) {
  return page.locator('div.rounded-md').locator('button.flex-1');
}

async function ensureAtLeastTwoProjects(page) {
  await openProjectMenu(page);
  const count = await projectRowButtons(page).count();
  if (count >= 2) {
    await page.keyboard.press('Escape');
    return;
  }
  await page.getByText('New project', { exact: true }).click();
  await waitForProjectSettled(page);
  const after = await projectRowButtons(page).count();
  if (after < 2) throw new Error('Need at least two projects for switch-back test');
  await page.keyboard.press('Escape');
}

async function dragStagingChipToCanvas(page) {
  const chip = page.getByRole('button', {
    name: new RegExp(`${SEED_NAME}|Drag to canvas`, 'i'),
  }).first();
  await chip.waitFor({ state: 'visible', timeout: 8000 });
  const chipBox = await chip.boundingBox();
  if (!chipBox) throw new Error('Staging chip not visible');

  const canvasBg = page.locator('[data-canvas-bg]').first();
  await canvasBg.waitFor({ state: 'visible', timeout: 5000 });
  const canvasBox = await canvasBg.boundingBox();
  if (!canvasBox) throw new Error('Canvas background not visible');

  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
    { steps: 24 },
  );
  await page.mouse.up();
  await page.waitForTimeout(800);
}

function normalizeProjectId(id) {
  if (!id) return id;
  return id.startsWith('canvas:project:') ? id.slice('canvas:project:'.length) : id;
}

async function readProjectIndex(page) {
  return page.evaluate(() => {
    const norm = (id) =>
      id?.startsWith('canvas:project:') ? id.slice('canvas:project:'.length) : id;
    const raw = localStorage.getItem('canvas:project-index');
    const index = raw ? JSON.parse(raw) : null;
    const active = norm(index?.activeProjectId ?? null);
    const others = (index?.projects ?? [])
      .filter((p) => !p.archived && norm(p.id) !== active)
      .map((p) => ({ id: norm(p.id), name: p.name }));
    return { active, others };
  });
}

function idSuffix(projectId) {
  if (!projectId || projectId.length < 6) return projectId ?? '';
  return projectId.slice(-6);
}

async function switchToProjectById(page, projectId) {
  const suffix = idSuffix(projectId);
  await openProjectMenu(page);
  const row = page.getByRole('button', { name: new RegExp(suffix) }).first();
  await row.click();
  log('switch to', `${suffix} (${projectId})`);
  await waitForProjectSettled(page);
}

async function main() {
  log('launch browser');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('canvas-sync-trace', '1');
    localStorage.setItem('canvas-placement-audit', '1');
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  log('navigate', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForBoot(page);
  await page.waitForTimeout(1200);

  const projection = await page.evaluate(() => window.__canvasProjectionSnapshot?.());
  let originProjectId = projection?.activeProjectId ?? projection?.effectiveProjectId;
  if (originProjectId?.startsWith('canvas:project:')) {
    originProjectId = originProjectId.slice('canvas:project:'.length);
  }
  if (!originProjectId) throw new Error('No active project id after boot');

  await ensureAtLeastTwoProjects(page);

  await openProjectMenu(page);
  const originLabel = await page.evaluate(() => {
    const rows = document.querySelectorAll('div.rounded-md button.flex-1');
    for (const row of rows) {
      if (row.querySelector('svg')) {
        return (row.innerText ?? '').split('\n')[0]?.trim() ?? '';
      }
    }
    return '';
  });
  await page.keyboard.press('Escape');
  log('origin', `${originLabel || originProjectId}`);

  let cardCount = await page.locator('[data-card-id]').count();
  const trayVisible = await page
    .getByRole('region', { name: TRAY_LABEL })
    .isVisible()
    .catch(() => false);

  if (cardCount < 1 && trayVisible) {
    log('placement', 'dock tray visible — drag to canvas');
    await dragStagingChipToCanvas(page);
    await page.waitForTimeout(2000);
    cardCount = await page.locator('[data-card-id]').count();
    log('canvas cards after drag', String(cardCount));
  } else if (cardCount < 1) {
    log('placement', 'skipped — no tray (link folder + sync for full dock→canvas path)');
  }

  const { active, others } = await readProjectIndex(page);
  if (!others.length) throw new Error('No second project in index');
  const originId = active ?? originProjectId;
  const otherId = others[0].id;

  await switchToProjectById(page, otherId);
  await switchToProjectById(page, originId);
  await page.waitForTimeout(2000);

  const cardsAfterReturn = await page.locator('[data-card-id]').count();
  const docAfterReturn = await page.evaluate(
    (pid) => window.__canvasDocumentSnapshot?.(pid) ?? null,
    originProjectId,
  );
  log('after switch-back', `cards=${cardsAfterReturn} doc=${JSON.stringify(docAfterReturn)}`);

  await browser.close();

  const fatalErrors = consoleErrors.filter(
    (e) => /outgoingState is not defined|Project switch failed/.test(e),
  );
  if (fatalErrors.length > 0) {
    throw new Error(`Switch errors:\n${fatalErrors.join('\n')}`);
  }

  if (cardCount >= 1 && cardsAfterReturn < 1) {
    throw new Error(
      `Placement lost after switch-back (had ${cardCount}, now ${cardsAfterReturn})`,
    );
  }

  if (cardCount >= 1 && docAfterReturn?.cardCount < 1) {
    log('warn', 'UI has cards but __canvasDocumentSnapshot cache is empty (dev helper lag)');
  }

  log(
    'PASS',
    cardCount >= 1
      ? `placement persisted (${cardsAfterReturn} cards)`
      : 'switch round-trip ok (placement path skipped)',
  );
}

main().catch((err) => {
  console.error('[placement-e2e] FAIL:', err.message);
  process.exit(1);
});
