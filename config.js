chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "tabActivated") {
        refreshConfig();
    }
});

async function refreshConfig() {
    window.__slideshowConfig = await new Promise((resolve) => {
        chrome.storage.sync.get(
            {
                autoPlayOnStart: true,
                interval: 3,
                minWidth: 100,
                minHeight: 100,
                showBigImage: true,
                showSmallImage: false,
                showBgImage: false
            },
            resolve
        );
    });
    console.log("Configuration refreshed:", window.__slideshowConfig);
}

async function getConfig() {
    if (window.__slideshowConfig === undefined) {
        await refreshConfig();
    }
    return window.__slideshowConfig;
}
