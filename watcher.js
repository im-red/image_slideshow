function countBgImages() {
    let bgImgs = [...document.querySelectorAll('*')]
        .map(el => {
            const bg = getComputedStyle(el).backgroundImage;
            const match = bg && bg !== 'none' && bg.match(/url\(["']?(.*?)["']?\)/);
            return match ? match[1] : null;
        })
        .filter(Boolean);
    bgImgs = [...new Set(bgImgs)];
    return bgImgs.length;
}

function countNormalImages() {
    let imgEls = [...document.images]
        .filter(img => img.src && !img.closest('[data-slide-overlay]'))
        .map(img => img.src);
    imgEls = [...new Set(imgEls)];
    imgEls.sort();
    return imgEls.length;
}

function countImages() {
    const bgImagesCount = countBgImages();
    const normalImagesCount = countNormalImages();
    return bgImagesCount + normalImagesCount;
}

let lastCount = 0;
function report() {
    const count = countImages();
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
