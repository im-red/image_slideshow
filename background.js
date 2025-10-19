chrome.action.onClicked.addListener(async (tab) => {
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["slideshow.js"]
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log(msg, sender, sendResponse);
    if (msg.type === 'downloadImages') {
        const { title, url, images } = msg;
        const safeTitle = title.replace(/[\\/:*?"<>|]+/g, "_");
        const safeUrl = url.replace(/[\.\\/:*?"<>|]+/g, "_");
        const folderName = `${safeTitle}_${safeUrl}`;

        for (const [i, imgUrl] of images.entries()) {
            chrome.downloads.download({
                url: imgUrl,
                filename: `${folderName}/${String(i + 1).padStart(3, "0")}.jpg`
            });
        }
        sendResponse({ ok: true });
    }
    return true;
});