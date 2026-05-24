import { test, expect } from './fixtures';

test('logger outputs timestamp in browser console', async ({ page }) => {
  const logMessages: string[] = [];
  
  page.on('console', msg => {
    logMessages.push(msg.text());
  });

  await page.goto('https://www.baidu.com');
  
  // Inject the logger and log a message
  await page.evaluate(async () => {
    // We can just trigger the watcher which logs on initialization
    // But since watcher is injected automatically by content scripts, we should see it.
    // Let's check the logs collected.
  });
  
  // Wait a bit to ensure content scripts have executed
  await page.waitForTimeout(1000);
  
  // Find the watcher initialization log
  const watcherLog = logMessages.find(msg => msg.includes('Watcher initialization started'));
  expect(watcherLog).toBeTruthy();
  
  // Verify it has a timestamp (e.g., matches a time pattern like HH:mm:ss or similar)
  // Consola's date format usually looks like "AM/PM" or "HH:mm:ss" or ISO string.
  // We'll do a generic check for digits that look like a timestamp.
  const hasTimestamp = /T\d{2}:\d{2}:\d{2}|\d{1,2}:\d{2}:\d{2}/.test(watcherLog!);
  
  if (!hasTimestamp) {
    console.log("ACTUAL LOG:", watcherLog);
  }
  expect(hasTimestamp).toBe(true);
});