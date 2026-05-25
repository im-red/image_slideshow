import { logger } from '../utils/logger';
import slideshowScript from '../content-scripts/slideshow.tsx?script';

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [slideshowScript]
    });
    
    // Explicitly call init in case the ES module was already loaded
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            if (typeof (window as any).__initSlideshow === 'function') {
                (window as any).__initSlideshow();
            }
        }
    });
});

// Expose for Playwright testing
(self as any).__triggerSlideshow = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
        logger.info('Playwright trigger invoked for tab:', tabs[0].id);
        
        // Execute the script
        await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: [slideshowScript]
        });
        
        // Because ES modules are only evaluated once by the browser, 
        // if the script was already injected, the module body won't run again.
        // We explicitly call the global init function we exposed.
        await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
                if (typeof (window as any).__initSlideshow === 'function') {
                    (window as any).__initSlideshow();
                }
            }
        });
        
        logger.info('Playwright trigger execution finished.');
    } else {
        logger.error('Playwright trigger failed: No active tab found.');
    }
};

chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.sendMessage(tabId, { action: "tabActivated" });
});

chrome.runtime.onMessage.addListener((msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    logger.info(msg, sender);
    if (msg.type === 'downloadImages') {
        return onDownloadImages(msg, sender, sendResponse);
    }
    if (msg.type === 'imageCount') {
        return onImageCount(msg, sender, sendResponse);
    }
    logger.error('Unknown message type:', msg);
    return false;
});

function onDownloadImages(msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    const { title, url, images } = msg;
    const safeTitle = title.replace(/[\\/:*?"<>|]+/g, "_");
    const safeUrl = url.replace(/[\.\\/:*?"<>|]+/g, "_");
    const folderName = `${safeTitle}_${safeUrl}`;

    chrome.storage.sync.get({ sequentialDownload: false }, async (prefs) => {
        if (prefs.sequentialDownload) {
            await downloadSequentially(images, folderName);
        } else {
            downloadAllAtOnce(images, folderName);
        }
    });
    sendResponse({ ok: true });
    return true;
}

function downloadAllAtOnce(images: string[], folderName: string) {
    for (const [i, imgUrl] of images.entries()) {
        const options = {
            url: imgUrl,
            filename: `${folderName}/${String(i + 1).padStart(3, "0")}.jpg`
        };
        logger.info('Download options:', options);
        chrome.downloads.download(options);
    }
}

async function downloadSequentially(images: string[], folderName: string) {
    for (const [i, imgUrl] of images.entries()) {
        const options = {
            url: imgUrl,
            filename: `${folderName}/${String(i + 1).padStart(3, "0")}.jpg`
        };
        logger.info('Download options:', options);
        await downloadOne(options);
    }
}

function downloadOne(options: chrome.downloads.DownloadOptions): Promise<void> {
    return new Promise((resolve) => {
        chrome.downloads.download(options, (downloadId) => {
            const onChanged = (delta: chrome.downloads.DownloadDelta) => {
                if (delta.id === downloadId && delta.state) {
                    if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
                        chrome.downloads.onChanged.removeListener(onChanged);
                        resolve();
                    }
                }
            };
            chrome.downloads.onChanged.addListener(onChanged);
        });
    });
}

function onImageCount(msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
    const tabId = sender.tab?.id;
    if (tabId) {
        chrome.action.setBadgeText({
            text: msg.count > 0 ? String(msg.count) : '',
            tabId
        });
        chrome.action.setBadgeBackgroundColor({
            color: '#FF4D4D'
        });
    }
    return true;
}
