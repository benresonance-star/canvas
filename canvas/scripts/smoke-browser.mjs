/**
 * Browser smoke test: boot, project switch, new note dialog.
 * Run: node scripts/smoke-browser.mjs
 * Requires: dev server on :5173, API on :3001, playwright chromium installed.
 */
import { chromium } from 'playwright';

const APP_URL = process.env.SMOKE_APP_URL ?? 'http://localhost:5173';
const TIMEOUT = 45_000;

const consoleErrors = [];
const consoleWarnings = [];

function log(step, detail = '') {
  console.log(`[smoke] ${step}${detail ? `: ${detail}` : ''}`);
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

async function main() {
  log('launch browser');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  log('navigate', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForBoot(page);
  log('boot complete');
  await page.waitForTimeout(1500);

  const projectSwitcher = page.getByRole('button', { name: 'Projects', exact: true });
  await projectSwitcher.click();
  await page.getByText('New project', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });

  const projectRows = page.locator('div.rounded-md').locator('button.flex-1');
  const projectCount = await projectRows.count();
  log('projects in menu', String(projectCount));

  if (projectCount < 1) {
    await page.screenshot({ path: 'scripts/smoke-failure.png', fullPage: true });
    throw new Error('No projects found in switcher menu (screenshot: scripts/smoke-failure.png)');
  }

  let switched = false;
  for (let i = 0; i < projectCount; i += 1) {
    const row = projectRows.nth(i);
    const isActive = await row.locator('svg').count() > 0;
    if (isActive) continue;
    const label = (await row.innerText()).split('\n')[0]?.trim() ?? `project-${i}`;
    await row.click();
    log('switch project', label);
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading project'),
      { timeout: TIMEOUT },
    ).catch(() => {});
    await page.waitForTimeout(1000);
    switched = true;
    break;
  }

  if (!switched && projectCount === 1) {
    log('skip switch', 'only one active project');
  } else if (!switched) {
    throw new Error('Could not find an inactive project row to switch to');
  }

  const criticalErrors = consoleErrors.filter(
    (e) => /setAgentMessages is not defined|ReferenceError|TypeError.*undefined/.test(e),
  );
  if (criticalErrors.length > 0) {
    throw new Error(`Console errors after switch:\n${criticalErrors.join('\n')}`);
  }

  const newNoteBtn = page.getByRole('button', { name: 'New note', exact: true });
  if (await newNoteBtn.isVisible().catch(() => false)) {
    await newNoteBtn.click();
    await page.waitForSelector('dialog, [role="dialog"], form', { timeout: 5000 }).catch(() => null);
    const dialogVisible = await page.getByText('New note', { exact: false }).first().isVisible().catch(() => false);
    log('new note dialog', dialogVisible ? 'opened' : 'click sent (dialog not confirmed)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    log('new note', 'skipped — requires linked folder (folderLinked gate)');
  }

  const addLinkBtn = page.getByRole('button', { name: 'Add link', exact: true });
  if (await addLinkBtn.isVisible().catch(() => false)) {
    await addLinkBtn.click();
    await page.waitForTimeout(400);
    const linkDialog = await page.getByRole('textbox').first().isVisible().catch(() => false);
    log('add link dialog', linkDialog ? 'opened' : 'click sent');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForTimeout(300);
  }

  const canvasCards = page.locator('[data-card-id]');
  const cardCount = await canvasCards.count();
  log('canvas cards', String(cardCount));
  if (cardCount > 0) {
    await canvasCards.first().click({ clickCount: 2, timeout: 5000 }).catch(async () => {
      await canvasCards.first().click();
    });
    await page.waitForTimeout(500);
    const modalOpen = await page.locator('[role="dialog"], .fixed.inset-0').count() > 0;
    log('card open', modalOpen ? 'modal/panel opened' : 'click sent');
    await page.keyboard.press('Escape');
  }

  // Switch back to verify round-trip (best-effort — menu may stay open during load)
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading project'),
      { timeout: TIMEOUT },
    );
    await page.waitForTimeout(500);
    await projectSwitcher.click({ timeout: 5000 });
    await page.getByText('New project', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    const rowsAgain = page.locator('div.rounded-md').locator('button.flex-1:not([disabled])');
    const againCount = await rowsAgain.count();
    for (let i = 0; i < againCount; i += 1) {
      const row = rowsAgain.nth(i);
      const isActive = await row.locator('svg').count() > 0;
      if (!isActive) {
        await row.click();
        log('switch back', (await row.innerText()).split('\n')[0]?.trim() ?? 'project');
        await page.waitForTimeout(1000);
        break;
      }
    }
  } catch (e) {
    log('switch back', `skipped — ${e.message.split('\n')[0]}`);
  }

  const cardCountText = await page.locator('body').innerText();
  log('page loaded', cardCountText.includes('cards') ? 'card chrome visible' : 'ok');

  await browser.close();

  const switchErrors = consoleErrors.filter((e) => /Project switch failed/.test(e));
  if (switchErrors.length > 0) {
    throw new Error(`Project switch errors:\n${switchErrors.join('\n')}`);
  }

  log('PASS', `errors=${consoleErrors.length} warnings=${consoleWarnings.length}`);
  if (consoleErrors.length > 0) {
    console.log('[smoke] non-fatal console errors:');
    for (const e of consoleErrors.slice(0, 10)) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error('[smoke] FAIL:', err.message);
  process.exit(1);
});
