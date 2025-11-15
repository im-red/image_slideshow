function createImageOverlay(imgSrc) {
    console.log('Creating image overlay for', imgSrc);
    const old = document.getElementById("slide-main-image-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "slide-main-image-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(0,0,0,0.85);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        overflow: hidden;
    `;
    document.body.appendChild(overlay);

    const img = document.createElement("img");
    img.style.cssText = `
        user-select: none;
    `;
    img.src = imgSrc;
    img.style.opacity = 0;
    img.addEventListener('dragstart', e => e.preventDefault());
    overlay.appendChild(img);

    const scaleText = document.createElement("div");
    scaleText.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        color: white;
        font-size: 16px;
        user-select: none;
    `;
    overlay.appendChild(scaleText);

    // 状态变量
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let dragged = false;
    let startX = 0, startY = 0;
    let maxW = 0, maxH = 0;
    let imgW = 0, imgH = 0;

    function updateTransform() {
        console.log('Updating transform:', { offsetX, offsetY, scale });
        const xrange = Math.max(0, (imgW * scale - maxW) / 2);
        const yrange = Math.max(0, (imgH * scale - maxH) / 2);
        offsetX = Math.min(Math.max(offsetX, -xrange), xrange);
        offsetY = Math.min(Math.max(offsetY, -yrange), yrange);
        img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        scaleText.textContent = `${(scale * 100).toFixed(0)}%`;
    }

    function defaultScale() {
        return Math.min(maxW / imgW, maxH / imgH, 1);
    }

    function resetTransform() {
        scale = defaultScale();
        offsetX = 0;
        offsetY = 0;
        updateTransform();
    }

    // 等图片加载完后居中
    img.addEventListener("load", () => {
        const rect = overlay.getBoundingClientRect();
        maxW = rect.width - 40;
        maxH = rect.height - 40;
        imgW = img.naturalWidth;
        imgH = img.naturalHeight;
        scale = defaultScale();
        updateTransform();
        img.style.opacity = 1;
    });

    // 滚轮缩放（以鼠标为中心）
    overlay.addEventListener("wheel", e => {
        e.preventDefault();

        const rect = img.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - img.naturalWidth * scale / 2;
        const mouseY = e.clientY - rect.top - img.naturalHeight * scale / 2;

        const prevScale = scale;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale = Math.min(Math.max(scale * delta, 0.1), 10);

        // 缩放中心偏移补偿
        const factor = scale / prevScale;
        offsetX -= (mouseX) * (factor - 1);
        offsetY -= (mouseY) * (factor - 1);

        updateTransform();
    });

    // 拖拽移动
    overlay.addEventListener("mousedown", e => {
        console.log('Mouse down');
        dragging = true;
        dragged = false;
        overlay.style.cursor = "grabbing";

        startX = e.clientX;
        startY = e.clientY;
    });

    overlay.addEventListener("mousemove", e => {
        if (!dragging) return;
        dragged = true;
        console.log('Dragging:', { dx: e.clientX - startX, dy: e.clientY - startY });

        offsetX += e.clientX - startX;
        offsetY += e.clientY - startY;
        updateTransform();

        startX = e.clientX;
        startY = e.clientY;
    });

    overlay.addEventListener("mouseup", () => {
        console.log('Mouse up');
        dragging = false;
        overlay.style.cursor = "grab";
    });

    overlay.addEventListener("mouseleave", () => {
        console.log('Mouse leave');
        dragging = false;
        overlay.style.cursor = "grab";
    });

    // 双击重置
    overlay.addEventListener("dblclick", e => {
        if (e.target !== img) return;
        resetTransform();
    });

    // 点击空白关闭
    overlay.addEventListener("click", e => {
        console.log('Overlay clicked');
        if (dragged) {
            return;
        }
        if (e.target === overlay) overlay.remove();
    });
}

function removeImageOverlay() {
    const overlay = document.getElementById("slide-main-image-overlay");
    if (overlay) overlay.remove();
}

(async function () {
    if (!window.__slideShowInitialized) {
        window.__slideShowInitialized = true;
        chrome.runtime.onMessage.addListener((msg) => {
            console.log('Background received message:', msg);
            if (msg.type === "imageDownloading") {
                showDownloadingPlaceholder(msg.url);
            }
            if (msg.type === "imageReady") {
                showReadyPlaceholder(msg.url);
            }
        });

        const style = document.createElement('style');
        style.textContent = `
            #slide-overlay img.slide-thumb-main-image-loading {
                opacity: 0.5;
            }
            #slide-overlay img.slide-thumb-main-image-ready {
                opacity: 1;
            }
            #slide-overlay img.slide-thumb-main-image-failed {
                opacity: 0.2;
            }
            #thumbBar {
                scrollbar-width: thin;
                scrollbar-color: #888 transparent;
            }
            #thumbBar::-webkit-scrollbar {
                height: 8px;
            }
            #thumbBar::-webkit-scrollbar-track {
                background: transparent;
            }
            #thumbBar::-webkit-scrollbar-thumb {
                background: rgba(136,136,136,0.6);
                border-radius: 4px;
                transition: background 0.3s;
            }
            #thumbBar::-webkit-scrollbar-thumb:hover {
                background: rgba(136,136,136,0.9);
            }
        `;
        document.head.appendChild(style);
    }
    if (window.__slideOverlay) {
        removeImageOverlay();
        window.__slideOverlay.remove();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        return;
    }

    const prefs = await getConfig();
    console.log(prefs);

    const loadingPlaceholder = `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
            <circle cx="30" cy="30" r="10" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `)}`;

    const downloadingPlaceholder = `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
            <circle cx="30" cy="30" r="10" fill="none" stroke="#3498db" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `)}`;

    const readyPlaceholder = `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
            <circle cx="30" cy="30" r="10" fill="none" stroke="#2ecc71" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `)}`;

    function findThumbElementsByUrl(url) {
        const overlay = document.getElementById("slide-overlay");
        if (!overlay) return [];
        return Array.from(overlay.querySelectorAll('img.thumb')).filter(img => {
            return img.title === url || img.dataset.src === url;
        });
    }

    function showDownloadingPlaceholder(url) {
        const els = findThumbElementsByUrl(url);
        for (const el of els) {
            if (el) {
                el.src = downloadingPlaceholder;
            }
        }
    }

    function showReadyPlaceholder(url) {
        const els = findThumbElementsByUrl(url);
        for (const el of els) {
            if (el) {
                el.src = readyPlaceholder;
            }
        }
    }

    function setThumbMainImageState(url, state) {
        console.log(url, state);
        const els = findThumbElementsByUrl(url);
        for (const el of els) {
            if (el) {
                el.classList.remove('slide-thumb-main-image-loading', 'slide-thumb-main-image-ready', 'slide-thumb-main-image-failed');
                el.classList.add(`slide-thumb-main-image-${state}`);
            }
        }
    }

    const { shownImages, filteredImages } = collectImage(prefs);
    if (!filteredImages.length && !shownImages.length) {
        return;
    }

    let downloadedCount = 0;
    let failedCount = 0;

    let mode = 'slideshow';
    let index = 0;

    // 自动播放状态
    let autoPlay = false;
    let autoPlayInterval = prefs.interval * 1000; // 默认间隔3秒
    let autoPlayTimer = null;
    let autoPlayProgressTimer = null;
    let autoPlayStartTime = 0;

    // 创建覆盖层
    const overlay = document.createElement('div');
    window.__slideOverlay = overlay;
    overlay.id = 'slide-overlay';
    overlay.style.cssText = `
        position: fixed;
        top:0; left:0;
        width:100vw; height:100vh;
        background: #000;
        z-index: 999999;
        display:flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const topArea = document.createElement('div');
    topArea.style.cssText = `
        position: relative;
        width: 100%;
        background: black;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 10px 0;
        gap: 12px;
        flex: 0 0 auto;
        z-index: 100;
    `
    overlay.appendChild(topArea);

    const indexText = document.createElement('div');
    indexText.textContent = '';
    indexText.style.cssText = `
        position: absolute;
        color: white;
        font-size: 15px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    `;
    topArea.appendChild(indexText);

    function updateIndexText() {
        if (mode === 'gallery') {
            indexText.textContent = `${shownImages.length}(+${filteredImages.length} filtered)`;
        } else {
            indexText.textContent = `${index + 1} / ${shownImages.length}`;
        }
    }

    const topBtnContainer = document.createElement('div');
    topBtnContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding-right: 12px;
    `;
    topArea.appendChild(topBtnContainer);

    const playBtn = document.createElement('button');
    playBtn.classList.add('slide-ignore');
    playBtn.style.cssText = `
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        font-size: 13px;
        color: white;
        cursor: pointer;
        padding: 6px 12px;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        background: rgba(255,255,255,0.1);
        overflow: hidden;
    `;
    topBtnContainer.appendChild(playBtn);
    playBtn.onclick = toggleAutoPlay;

    const switchBtn = document.createElement('button');
    switchBtn.classList.add('slide-ignore');
    switchBtn.style.cssText = `
        padding: 6px 12px;
        background: rgba(255,255,255,0.1);
        color: white;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
    `;
    topBtnContainer.appendChild(switchBtn);
    switchBtn.onclick = switchMode;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save';
    saveBtn.classList.add('slide-ignore');
    saveBtn.style.cssText = `
        padding: 6px 12px;
        background: rgba(255,255,255,0.1);
        color: white;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
    `;
    saveBtn.onclick = () => {
        chrome.runtime.sendMessage({
            type: 'downloadImages',
            title: document.title,
            url: location.href,
            images: shownImages
        }, response => {
            console.log('Download request sent:', response);
        });
    };
    topBtnContainer.appendChild(saveBtn);

    const exitBtn = document.createElement('button');
    exitBtn.classList.add('slide-ignore');
    exitBtn.textContent = '✕';
    exitBtn.style.cssText = `
        padding: 6px 12px;
        background: rgba(255,255,255,0.1);
        color: white;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
    `;
    exitBtn.onclick = () => {
        overlay.remove();
        window.__slideOverlay = null;
        document.body.style.overflow = '';
    };
    topBtnContainer.appendChild(exitBtn);

    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
        flex: 1 1 0;
        min-height: 0;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
    `
    overlay.appendChild(contentArea);

    // Slideshow 大图
    const mainImage = document.createElement('img');
    mainImage.id = 'slide-main-image';
    mainImage.classList.add('slide-ignore');
    mainImage.style.cssText = `
        max-width:95%;
        max-height:95%;
        object-fit:contain;
        border-radius:8px;
        margin-bottom:10px;
        user-select: none;
    `;
    mainImage.onclick = () => {
        console.log('Main image clicked:', mainImage.src);
        stopAutoPlay();
        createImageOverlay(mainImage.src);
    };
    contentArea.appendChild(mainImage);

    // 底部缩略图容器
    const bottomArea = document.createElement('div');
    bottomArea.style.cssText = `
        width:100%;
        display:flex;
        justify-content:center;
        align-items:center;
        background: #111;
        padding:5px 0;
        box-sizing:border-box;
        flex: 0 0 auto;
    `;
    overlay.appendChild(bottomArea);

    const leftArrow = document.createElement('div');
    leftArrow.classList.add('slide-ignore');
    leftArrow.textContent = '<';
    leftArrow.style.cssText = `
        color:white; font-size:24px; cursor:pointer; user-select:none; margin:0 5px;
    `;
    leftArrow.onclick = () => scrollThumbs(-1);
    bottomArea.appendChild(leftArrow);

    const thumbBar = document.createElement('div');
    thumbBar.id = 'thumbBar';
    thumbBar.style.cssText = `
        display:flex;
        gap:5px;
        overflow:auto;
        max-width:80%;
    `;
    thumbBar.addEventListener('wheel', (e) => {
        e.preventDefault();
        thumbBar.scrollLeft += e.deltaY;
    }, { passive: false });
    bottomArea.appendChild(thumbBar);

    const rightArrow = document.createElement('div');
    rightArrow.classList.add('slide-ignore');
    rightArrow.textContent = '>';
    rightArrow.style.cssText = `
        color:white; font-size:24px; cursor:pointer; user-select:none; margin:0 5px;
    `;
    rightArrow.onclick = () => scrollThumbs(1);
    bottomArea.appendChild(rightArrow);

    async function createThumb(src, maxWidth = 200, maxHeight = 200, quality = 0.7) {
        return new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: "fetchImageThumb",
                url: src,
                maxW: maxWidth,
                maxH: maxHeight,
                quality: quality
            }, response => {
                // console.log('Received thumb response for', src, response.blobUrl);
                resolve(response.blobUrl);
            });
        });
    }

    // Gallery 容器
    const galleryContainer = document.createElement('div');
    galleryContainer.style.cssText = `
        overflow: auto;
        width: 80%;
        min-height: 0;
        padding: 20px 0;
        gap: 10px;
        display: grid;
        justify-items: center;
        align-content: start;
        grid-template-columns: repeat(auto-fit,minmax(200px,1fr));
        scrollbar-width: none;
    `;
    contentArea.appendChild(galleryContainer);

    const slideShowThumbs = [];
    for (let i = 0; i < shownImages.length; i++) {
        const thumb = document.createElement('img');
        thumb.classList.add('slide-ignore', 'thumb', 'slide-thumb-main-image-loading');
        thumb.src = loadingPlaceholder;
        thumb.title = shownImages[i];
        thumb.style.cssText = `
            width:60px;
            height:60px;
            object-fit:cover;
            cursor:pointer;
            border-radius:4px;
            background:#111;
            flex-shrink:0;
            transition:border 0.2s;
            box-sizing:border-box;
        `;
        thumb.onclick = () => showImage(i);
        slideShowThumbs.push(thumb);
        thumbBar.appendChild(thumb);
    }

    const galleryThumbs = [];
    for (let i = 0; i < shownImages.length; i++) {
        const thumb = document.createElement('img');
        thumb.classList.add('slide-ignore', 'thumb', 'slide-thumb-main-image-loading');
        thumb.src = loadingPlaceholder;
        thumb.title = shownImages[i];
        thumb.style.cssText = `
            width:200px;
            height:200px;
            object-fit:cover;
            cursor:pointer;
            border-radius:4px;
            background:#000;
            flex-shrink:0;
            transition:border 0.2s;
            box-sizing:border-box;
        `;
        thumb.onclick = () => switchToSlideshow(i);
        galleryThumbs.push(thumb);
        galleryContainer.appendChild(thumb);
    }

    for (let i = 0; i < shownImages.length; i++) {
        createThumb(shownImages[i]).then(thumbSrc => {
            slideShowThumbs[i].src = thumbSrc;
            galleryThumbs[i].src = thumbSrc;
        });
    }

    filteredImages.forEach((src) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('slide-ignore');
        wrapper.style.cssText = `
            position: relative;
            width: 200px;
            height: 200px;
            flex: 0 0 auto;
        `;

        const thumb = document.createElement('img');
        thumb.src = src;
        thumb.title = src;
        thumb.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 4px;
            opacity: 0.6;
        `;
        wrapper.appendChild(thumb);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            inset: 0;
            border-radius: 4px;
            pointer-events: none;
            background: repeating-linear-gradient(
                -45deg,
                rgba(255, 0, 0, 0.3) 0,
                rgba(255, 0, 0, 0.3) 8px,
                rgba(255, 255, 255, 0.2) 8px,
                rgba(255, 255, 255, 0.2) 16px
            );
        `;
        wrapper.appendChild(overlay);

        galleryContainer.appendChild(wrapper);
    });

    const autoPlayProgressEl = document.createElement('div');
    autoPlayProgressEl.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 1px;
        width: 100%;
        background: limegreen;
        transition: none;
        z-index: 200;
    `;
    overlay.appendChild(autoPlayProgressEl);

    const downloadedProgressEl = document.createElement('div');
    downloadedProgressEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        height: 1px;
        width: 0%;
        background: #76E5FC;
        transition: none;
        z-index: 200;
    `;
    overlay.appendChild(downloadedProgressEl);

    const failedProgressEl = document.createElement('div');
    failedProgressEl.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        height: 1px;
        width: 0%;
        background: #FF0035;
        transition: none;
        z-index: 200;
    `;
    overlay.appendChild(failedProgressEl);

    function updateDownloadProgressBars() {
        const downloadedPercent = (downloadedCount / shownImages.length) * 100;
        const failedPercent = (failedCount / shownImages.length) * 100;
        console.log('Download progress:', downloadedCount, failedCount, downloadedPercent, failedPercent);

        downloadedProgressEl.style.width = `${downloadedPercent}%`;
        failedProgressEl.style.width = `${failedPercent}%`;
    }

    function highlightThumb(i) {
        slideShowThumbs.forEach((t, j) => {
            t.style.border = (j === i) ? '3px solid #0f0' : 'none';
        });
        // 自动滚动缩略图到中间
        slideShowThumbs[i].scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }

    function showImage(i) {
        if (shownImages.length === 0) {
            return;
        }
        if (autoPlay) {
            resetAutoPlayTimer();
        }
        index = (i + shownImages.length) % shownImages.length;
        updateIndexText();
        mainImage.style.opacity = 0;
        setTimeout(() => {
            mainImage.src = shownImages[index];
            mainImage.onload = () => mainImage.style.opacity = 1;
            highlightThumb(index);
        }, 0);
    }

    function switchToGallery() {
        mode = 'gallery';
        updateIndexText();
        mainImage.style.display = 'none';
        bottomArea.style.display = 'none';
        contentArea.style.alignItems = 'stretch';
        galleryContainer.style.display = 'grid';
        playBtn.style.display = 'none'
        switchBtn.textContent = 'Slideshow';
        stopAutoPlay();
    }

    function switchToSlideshow(i) {
        mode = 'slideshow';
        mainImage.style.display = 'block';
        bottomArea.style.display = 'flex';
        contentArea.style.alignItems = 'center';
        galleryContainer.style.display = 'none';
        playBtn.style.display = 'flex'
        switchBtn.textContent = 'Gallery';
        showImage(i);
        stopAutoPlay();
    }

    function switchMode() {
        if (mode === 'slideshow') {
            switchToGallery();
        } else {
            switchToSlideshow(index);
        }
    }

    function scrollThumbs(dir) {
        showImage(index + dir);
    }

    function startAutoPlay() {
        if (mode === 'gallery') return;
        if (autoPlay) return;
        autoPlay = true;
        playBtn.textContent = 'Pause ❚❚';
        autoPlayTimer = setInterval(() => scrollThumbs(1), autoPlayInterval);

        autoPlayStartTime = performance.now();
        autoPlayProgressEl.style.width = '0%';
        autoPlayProgressTimer = requestAnimationFrame(updateAutoplayProgress);
    }

    function stopAutoPlay() {
        autoPlay = false;
        playBtn.textContent = 'Play ▶';
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }

        cancelAnimationFrame(autoPlayProgressTimer);
        autoPlayProgressEl.style.width = '0%';
    }

    function updateAutoplayProgress(now) {
        const elapsed = now - autoPlayStartTime;
        const percent = Math.min(elapsed / autoPlayInterval, 1);
        autoPlayProgressEl.style.width = `${(1 - percent) * 100}%`;
        if (percent < 1 && autoPlay) {
            autoPlayProgressTimer = requestAnimationFrame(updateAutoplayProgress);
        } else if (autoPlay) {
            autoPlayStartTime = performance.now();
            autoPlayProgressEl.style.width = '100%';
            autoPlayProgressTimer = requestAnimationFrame(updateAutoplayProgress);
        }
    }

    function toggleAutoPlay() {
        if (autoPlay) stopAutoPlay();
        else startAutoPlay();
    }

    function resetAutoPlayTimer() {
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
        }
        autoPlayTimer = setInterval(() => showImage(index + 1), autoPlayInterval);
        cancelAnimationFrame(autoPlayProgressTimer);
        autoPlayStartTime = performance.now();
        autoPlayProgressEl.style.width = '0%';
        autoPlayProgressTimer = requestAnimationFrame(updateAutoplayProgress);
    }

    ['keydown', 'keyup'].forEach(type => {
        window.addEventListener(type, e => {
            if (e.code === 'F12' || e.code === 'F11') return;
            if (!window.__slideOverlay) return;

            e.stopPropagation();
            e.preventDefault();
            if (e.type == 'keyup') {
                return;
            }
            const mainImgOverlay = document.getElementById("slide-main-image-overlay");
            if (mainImgOverlay) {
                if (e.key === 'Escape') {
                    mainImgOverlay.remove();
                }
                return;
            }
            if (e.code === 'Space') {
                if (mode === 'slideshow') toggleAutoPlay();
                return;
            }
            if (mode === 'slideshow') {
                if (e.key === 'Escape') {
                    exitBtn.click();
                }
                else if (e.key === 'ArrowRight') scrollThumbs(1);
                else if (e.key === 'ArrowLeft') scrollThumbs(-1);
            } else if (e.key === 'Escape') {
                exitBtn.click();
            }
        }, true);
    });

    overlay.addEventListener('click', e => {
        if (mode === 'slideshow') {
            if (e.target.closest('.slide-ignore')) return;
            if (e.clientX > window.innerWidth / 2) scrollThumbs(1);
            else scrollThumbs(-1);
        }
    });

    if (shownImages.length === 0) {
        switchBtn.style.display = 'none';
        switchToGallery();
        return;
    }

    switchToSlideshow(0);

    Promise.all(shownImages.map(src => new Promise((resolve, reject) => {
        console.log('Preloading image:', src);
        const img = new Image();
        img.src = src;
        img.onload = () => {
            downloadedCount++;
            updateDownloadProgressBars();
            setThumbMainImageState(src, 'ready');
            resolve(img);
        }
        img.onerror = () => {
            failedCount++;
            updateDownloadProgressBars();
            setThumbMainImageState(src, 'failed');
            resolve(img);
        };
    }))).then(imgEls => {
        if (prefs.autoPlayOnStart && shownImages.length > 1) {
            startAutoPlay();
        }
    });
})();
