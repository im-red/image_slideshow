import { test, expect } from './fixtures';

test('options page renders correctly and can be interacted with', async ({ page, extensionId }) => {
  // Navigate to the extension's options page
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);

  // Verify the header is visible
  await expect(page.locator('h1')).toHaveText('Slideshow Settings');

  // Verify some default settings exist
  const autoPlayCheckbox = page.locator('#autoPlayOnStart');
  await expect(autoPlayCheckbox).toBeVisible();

  // Test interaction: change interval value
  const intervalInput = page.locator('#interval');
  await intervalInput.fill('5');
  await expect(intervalInput).toHaveValue('5');

  // Test saving
  // We mock the alert so the test doesn't hang on the browser dialog
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save' }).click();
});