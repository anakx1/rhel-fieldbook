// @ts-check
const { test, expect } = require('@playwright/test');

async function waitForCurriculum(page) {
  await page.waitForFunction(() => window.RHEL && window.RHEL.contentLoaded === true);
}

test('loads the JSON curriculum and shows both live levels', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await waitForCurriculum(page);
  await expect(page.locator('.hero-title')).toContainText('production');
  await page.goto('/#/learn');
  await expect(page.locator('h2#level-01-title')).toBeVisible();
  await expect(page.locator('h2#level-02-title')).toBeVisible();
  await expect(page.locator('a.lesson-row[href="#/lesson/storage-lvm"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('routes to a Level 02 lesson with EX200 mapping and version notes', async ({ page }) => {
  await page.goto('/#/lesson/storage-lvm');
  await waitForCurriculum(page);
  await expect(page.locator('.lesson-title h1, h1').first()).toContainText('LVM');
  await expect(page.locator('.ex200-map')).toBeVisible();
  await expect(page.locator('.ex200-map tbody tr')).toHaveCount(5);
  await expect(page.locator('.version-notes')).toContainText('RHEL 10');
  await expect(page.locator('.diagram svg').first()).toBeVisible();
});

test('persists lesson completion across a reload', async ({ page }) => {
  await page.goto('/#/lesson/storage-partitions');
  await waitForCurriculum(page);
  const button = page.locator('[data-complete-lesson="storage-partitions"]');
  await expect(button).toContainText('Mark lesson complete');
  await button.click();
  await expect(button).toContainText('Completed');
  await page.reload();
  await waitForCurriculum(page);
  await expect(page.locator('[data-complete-lesson="storage-partitions"]')).toContainText('Completed');
});

test('command palette searches lessons and commands', async ({ page }) => {
  await page.goto('/');
  await waitForCurriculum(page);
  await page.keyboard.press('Control+k');
  const palette = page.locator('#palette');
  await expect(palette).toBeVisible();
  await page.locator('#palette-input').fill('logical volume');
  await expect(page.locator('.palette-item').first()).toBeVisible();
  await expect(page.locator('.palette-item').first()).toContainText(/LVM|volume/i);
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('sandbox opens, runs a command, and keeps state', async ({ page }) => {
  await page.goto('/');
  await waitForCurriculum(page);
  await page.locator('#sandbox-toggle').click();
  await expect(page.locator('#sandbox-panel')).toHaveAttribute('aria-hidden', 'false');
  const input = page.locator('#sandbox-input');
  await input.fill('pwd');
  await input.press('Enter');
  await expect(page.locator('#sandbox-log')).toContainText('/home/student');
  await input.fill('mkdir -p /tmp/e2e-smoke && echo ok > /tmp/e2e-smoke/proof');
  await input.press('Enter');
  await input.fill('cat /tmp/e2e-smoke/proof');
  await input.press('Enter');
  await expect(page.locator('#sandbox-log')).toContainText('ok');
});

test('printable cheat sheets cover every live lesson', async ({ page }) => {
  await page.goto('/#/cheatsheets');
  await waitForCurriculum(page);
  await expect(page.locator('.cheat-lesson')).toHaveCount(25);
  await expect(page.locator('[data-print-cheatsheets]')).toBeVisible();
  await expect(page.locator('#cheat-storage-lvm')).toContainText('Commands to keep');
});
