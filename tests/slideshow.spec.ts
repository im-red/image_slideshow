import { test, expect } from './fixtures';

test('slideshow overlay works on baidu.com', async ({ page, background }) => {
  // Navigate to baidu.com
  await page.goto('https://www.baidu.com');

  // Wait for the network to be idle to ensure scripts can be injected properly
  await page.waitForLoadState('networkidle');

  // Trigger the slideshow via our exposed background test hook
  await background.evaluate(() => {
    (self as any).__triggerSlideshow();
  });

  // Verify the slideshow overlay appears
  const overlay = page.locator('#slide-overlay');
  await expect(overlay).toBeVisible();

  // Verify that images are collected and at least one image is shown in the overlay
  // The main image in slideshow mode
  const mainImage = overlay.locator('img').first();
  await expect(mainImage).toBeVisible();

  // Verify the close button works
  const closeButton = overlay.locator('button[title="Close"]');
  await closeButton.click();

  // Verify the overlay is removed
  await expect(page.locator('#slide-overlay-container')).toBeHidden();

  // Clean up previous attempts to test re-triggering and do it correctly
  await page.waitForTimeout(500);
  
  // Re-trigger the slideshow
  // Because Vite/ES Modules only execute a script once when dynamically injected via executeScript,
  // we updated the extension code to expose `__initSlideshow` and the background script to explicitly call it.
  // Triggering the slideshow now should properly re-initialize the UI.
  await background.evaluate(async () => {
    await (self as any).__triggerSlideshow();
  });

  // Verify the slideshow overlay appears again. We need to query for a new locator because the old one was unmounted.
  const newOverlay = page.locator('#slide-overlay');
  await expect(newOverlay).toBeVisible();
  
  // Close it again
  const newCloseButton = newOverlay.locator('button[title="Close"]');
  await newCloseButton.click();
  await expect(page.locator('#slide-overlay-container')).toBeHidden();
});

test('slideshow respects autoPlayOnStart option', async ({ page, background, extensionId }) => {
  await page.goto('https://www.baidu.com');
  await page.waitForLoadState('networkidle');

  // Open the slideshow
  await background.evaluate(() => {
    (self as any).__triggerSlideshow();
  });

  const overlay = page.locator('#slide-overlay');
  await expect(overlay).toBeVisible();

  // Since autoPlayOnStart is true by default, the Pause button should be visible
  const pauseButton = overlay.locator('button[title="Pause"]');
  await expect(pauseButton).toBeVisible();

  // The Play button should not be visible
  const playButton = overlay.locator('button[title="Play Normal"]');
  await expect(playButton).toBeHidden();

  // Close the slideshow
  const closeButton = overlay.locator('button[title="Close"]');
  await closeButton.click();

  // Now change the option to false via the options page
  const optionsPage = await page.context().newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  const autoPlayCheckbox = optionsPage.locator('#autoPlayOnStart');
  await autoPlayCheckbox.uncheck();
  
  // Handle the save alert
  optionsPage.on('dialog', async dialog => {
    await dialog.accept();
  });
  await optionsPage.locator('button', { hasText: 'Save' }).click();
  await optionsPage.close();

  // Re-open the slideshow
  await background.evaluate(async () => {
    await (self as any).__triggerSlideshow();
  });

  const newOverlay = page.locator('#slide-overlay');
  await expect(newOverlay).toBeVisible();

  // This time, autoPlayOnStart is false, so Play Normal should be visible
  const newPlayButton = newOverlay.locator('button[title="Play Normal"]');
  await expect(newPlayButton).toBeVisible();

  // And Pause should be hidden
  const newPauseButton = newOverlay.locator('button[title="Pause"]');
  await expect(newPauseButton).toBeHidden();
});

test('slideshow images have title attributes for hover URL display', async ({ page, background }) => {
  await page.goto('https://www.baidu.com');
  await page.waitForLoadState('networkidle');

  // Trigger the slideshow
  await background.evaluate(() => {
    (self as any).__triggerSlideshow();
  });

  const overlay = page.locator('#slide-overlay');
  await expect(overlay).toBeVisible();

  // Wait for the main image to appear
  const mainImage = overlay.locator('.slideshow-main-img');
  await expect(mainImage).toBeVisible();

  // Verify the main image has a title attribute (URL)
  const titleAttr = await mainImage.getAttribute('title');
  expect(titleAttr).toBeTruthy();
  expect(titleAttr?.startsWith('http')).toBe(true);

  // Switch to gallery mode
  const switchModeBtn = overlay.locator('button[title="Switch View"]');
  await switchModeBtn.click();

  // Verify gallery images have title attributes
  const galleryWrapper = overlay.locator('.slideshow-gallery-wrapper').first();
  await expect(galleryWrapper).toBeVisible();
  const galleryTitleAttr = await galleryWrapper.getAttribute('title');
  expect(galleryTitleAttr).toBeTruthy();
  expect(galleryTitleAttr?.startsWith('http')).toBe(true);

  // Switch back to slideshow mode by clicking the gallery image
  await galleryWrapper.click();

  // Expand thumbs if collapsed
  const thumbBar = overlay.locator('.slideshow-thumb-bar-container');
  if (await thumbBar.isHidden()) {
    await overlay.locator('.slideshow-thumb-toggle').click();
  }

  // Verify thumb wrappers have title attributes
  const thumbWrapper = overlay.locator('.slideshow-thumb-wrapper').first();
  await expect(thumbWrapper).toBeVisible();
  const thumbTitleAttr = await thumbWrapper.getAttribute('title');
  expect(thumbTitleAttr).toBeTruthy();
  expect(thumbTitleAttr?.startsWith('http')).toBe(true);
});

test('slideshow thumbnail bar UI requirements', async ({ page, background }) => {
  await page.goto('https://www.baidu.com');
  await page.waitForLoadState('networkidle');

  // Open the slideshow
  await background.evaluate(() => {
    (self as any).__triggerSlideshow();
  });

  const overlay = page.locator('#slide-overlay');
  await expect(overlay).toBeVisible();

  // 1. thumb bar toggle button has a fixed width instead of filling the width of screen
  const toggleButton = overlay.locator('.slideshow-thumb-toggle');
  await expect(toggleButton).toBeVisible();
  
  const toggleBox = await toggleButton.boundingBox();
  expect(toggleBox).not.toBeNull();
  const screenWidth = await page.evaluate(() => window.innerWidth);
  expect(toggleBox!.width).toBe(40); // the fixed width we set
  expect(toggleBox!.width).toBeLessThan(screenWidth);

  // 2. thumb bar scroll bar is visible but customized (thin)
  const thumbBar = overlay.locator('.slideshow-thumb-bar');
  await expect(thumbBar).toBeVisible();
  
  // Verify scrollbar-width is 'thin' (custom scrollbar requirement)
  const scrollbarWidth = await thumbBar.evaluate((el) => {
    return window.getComputedStyle(el).scrollbarWidth;
  });
  expect(scrollbarWidth).toBe('thin');

  // 3. highlighted thumb has the correct color and uses outline to prevent scaling
  // The first image is highlighted by default (index 0)
  const activeThumb = thumbBar.locator('.slideshow-thumb-img.active');
  await expect(activeThumb).toBeVisible();
  
  const activeThumbOutlineColor = await activeThumb.evaluate((el) => {
    return window.getComputedStyle(el).outlineColor;
  });
  const activeThumbOutlineWidth = await activeThumb.evaluate((el) => {
    return window.getComputedStyle(el).outlineWidth;
  });
  
  // rgb(0, 255, 0) is #0f0 (green)
  expect(activeThumbOutlineColor).toBe('rgb(0, 255, 0)');
  // Depending on display scaling, Chrome might report outline width as 2.4px instead of 3px
  expect(parseFloat(activeThumbOutlineWidth!)).toBeGreaterThanOrEqual(2);

  // 4. thumb has index number text
  const firstThumbWrapper = thumbBar.locator('.slideshow-thumb-wrapper').first();
  const indexText = firstThumbWrapper.locator('.slideshow-thumb-index');
  await expect(indexText).toBeVisible();
  
  const textContent = await indexText.textContent();
  expect(textContent).toBe('1');
});

test('main image text selection is disabled (user-select is none)', async ({ page, background }) => {
  await page.goto('https://www.baidu.com');
  await page.waitForLoadState('networkidle');

  // Open the slideshow
  await background.evaluate(() => {
    (self as any).__triggerSlideshow();
  });

  const overlay = page.locator('#slide-overlay');
  await expect(overlay).toBeVisible();

  const mainImage = overlay.locator('.slideshow-main-img');
  await expect(mainImage).toBeVisible();

  // Verify text selection is disabled to prevent highlighting while interacting
  const userSelect = await mainImage.evaluate((el) => {
    return window.getComputedStyle(el).userSelect;
  });
  
  expect(userSelect).toBe('none');

  // Also verify scale overlay image
  await mainImage.click();
  const scaleOverlay = page.locator('#slide-scale-image-overlay');
  await expect(scaleOverlay).toBeVisible();

  const scaleImage = scaleOverlay.locator('.scale-overlay-img');
  await expect(scaleImage).toBeVisible();

  const scaleUserSelect = await scaleImage.evaluate((el) => {
    return window.getComputedStyle(el).userSelect;
  });
  
  expect(scaleUserSelect).toBe('none');
});

test('Ctrl+C copies image URL to clipboard', async ({ page, background, context }) => {
  // Grant clipboard permissions to the context
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('https://www.baidu.com');
  await page.waitForLoadState('networkidle');

  // Open the slideshow
  await background.evaluate(() => {
    (self as any).__triggerSlideshow();
  });

  const overlay = page.locator('#slide-overlay');
  await expect(overlay).toBeVisible();

  // Ensure image is visible
  const mainImage = overlay.locator('.slideshow-main-img');
  await expect(mainImage).toBeVisible();

  // Get the current image src
  const imgSrc = await mainImage.getAttribute('src');

  // Press Ctrl+C on the page
  await page.keyboard.press('Control+C');

  // Wait for the toast to appear
  const toast = overlay.locator('.slideshow-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText('Image URL copied to clipboard');

  // Read from clipboard and verify it's the image URL
  const clipboardText = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      console.error(e);
      return null;
    }
  });

  expect(clipboardText).toBe(imgSrc);
});