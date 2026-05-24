import { test, expect } from './fixtures';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('slideshow works on local folder URL', async ({ page, background }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  // Create a path to our test folder
  const testFolderPath = path.resolve(__dirname, 'test-folder');
  const fileUrl = `file:///${testFolderPath.replace(/\\/g, '/')}`;

  console.log('Navigating to', fileUrl);
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');

  // Let's trigger the slideshow
  await background.evaluate(async () => {
    await (self as any).__triggerSlideshow();
  });

  const overlay = page.locator('#slide-overlay');
  
  // We'll wait a little bit to see if it appears or fails
  await expect(overlay).toBeVisible({ timeout: 5000 });
});