importScripts("enhanceConsole.js");

chrome.action.onClicked.addListener(async (tab) => {
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["slideshow.js"]
    });
});

function blobToDataURL(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); // dataURL
        reader.readAsDataURL(blob);
    });
}

async function createThumbnail(blob, maxW = 200, maxH = 200, quality = 0.7) {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;

    const scale = Math.min(maxW / width, maxH / height, 1);
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const thumbBlob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: quality
    });

    return blobToDataURL(thumbBlob); // 返回 dataURL
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log(msg, sender);
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
        return true;
    }
    if (msg.type === 'imageCount') {
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
    if (msg.type === 'fetchImageThumb') {
        const url = msg.url;
        fetch(url)
            .then(res => res.blob())
            .then(blob => createThumbnail(blob, msg.maxW, msg.maxH, msg.quality))
            .then(dataURL => sendResponse({ blobUrl: dataURL }))
            .catch(err => {
                console.error("thumbnail failed:", err, url);
                sendResponse({ blobUrl: url });
            });
        return true;
    }
    console.error('Unknown message type:', msg);
    return false;
});
