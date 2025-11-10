async function countImages() {
    const prefs = await getConfig();
    const { shownImages, filteredImages } = collectImage(prefs);
    return shownImages.length + filteredImages.length;
}

let lastCount = 0;
async function report() {
    const count = await countImages();
    if (count !== lastCount) {
        lastCount = count;
        chrome.runtime.sendMessage({ type: 'imageCount', count });
    }
}

// 初始化时主动检查一次
report();

// 监听页面 DOM 变化（如懒加载、新增节点等）
let reportTimer = null;
const observer = new MutationObserver(() => {
    if (reportTimer !== null) {
        return;
    }
    reportTimer = setTimeout(() => {
        report();
        reportTimer = null;
    }, 1000);
});
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, });
