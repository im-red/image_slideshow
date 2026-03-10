// 获取元素
const autoPlayOnStartInput = document.getElementById('autoPlayOnStart');
const intervalInput = document.getElementById('interval');
const minWidthInput = document.getElementById('minWidth');
const minHeightInput = document.getElementById('minHeight');
const showBigImageInput = document.getElementById('showBigImage');
const showSmallImageInput = document.getElementById('showSmallImage');
const showBgImageInput = document.getElementById('showBgImage');
const sequentialDownloadInput = document.getElementById('sequentialDownload');
const saveBtn = document.getElementById('saveBtn');

// 页面加载时读取存储的配置
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get({
        autoPlayOnStart: true,
        interval: 3,
        minWidth: 100,
        minHeight: 100,
        showBigImage: true,
        showSmallImage: false,
        showBgImage: false,
        sequentialDownload: false,
    }, prefs => {
        autoPlayOnStartInput.checked = prefs.autoPlayOnStart
        intervalInput.value = prefs.interval;
        minWidthInput.value = prefs.minWidth;
        minHeightInput.value = prefs.minHeight;
        showBigImageInput.checked = prefs.showBigImage;
        showSmallImageInput.checked = prefs.showSmallImage;
        showBgImageInput.checked = prefs.showBgImage;
        sequentialDownloadInput.checked = prefs.sequentialDownload;
    });
});

// 点击保存
saveBtn.addEventListener('click', () => {
    const prefs = {
        autoPlayOnStart: Boolean(autoPlayOnStartInput.checked),
        interval: Number(intervalInput.value),
        minWidth: Number(minWidthInput.value),
        minHeight: Number(minHeightInput.value),
        showBigImage: Boolean(showBigImageInput.checked),
        showSmallImage: Boolean(showSmallImageInput.checked),
        showBgImage: Boolean(showBgImageInput.checked),
        sequentialDownload: Boolean(sequentialDownloadInput.checked),
    };

    chrome.storage.sync.set(prefs, () => {
        alert('Saved!');
    });
});
