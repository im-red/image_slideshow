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
            #slideOverlay img.thumb-main-image-loading {
                opacity: 0.5;
            }
            #slideOverlay img.thumb-main-image-ready {
                opacity: 1;
            }
            #slideOverlay img.thumb-main-image-failed {
                opacity: 0.2;
            }
        `;
        document.head.appendChild(style);
    }
    if (window.__slideOverlay) {
        window.__slideOverlay.remove();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        return;
    }

    const prefs = await new Promise(resolve =>
        chrome.storage.sync.get({ autoPlayOnStart: true, interval: 3, minWidth: 100, minHeight: 100, showBigImage: true, showSmallImage: false, showBgImage: false }, resolve)
    );

    const autoPlayOnStart = prefs.autoPlayOnStart;
    const intervalMs = prefs.interval * 1000;
    const minWidth = prefs.minWidth;
    const minHeight = prefs.minHeight;
    const showBigImage = prefs.showBigImage;
    const showSmallImage = prefs.showSmallImage;
    const showBgImage = prefs.showBgImage;

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

    function findThumbElementByUrl(url) {
        const overlay = document.querySelector('[data-slide-overlay]');
        if (!overlay) return [];
        return Array.from(overlay.querySelectorAll('img.thumb')).filter(img => {
            return img.title === url || img.dataset.src === url;
        });
    }

    function showDownloadingPlaceholder(url) {
        const els = findThumbElementByUrl(url);
        for (const el of els) {
            if (el) {
                el.src = downloadingPlaceholder;
            }
        }
    }

    function showReadyPlaceholder(url) {
        const els = findThumbElementByUrl(url);
        for (const el of els) {
            if (el) {
                el.src = readyPlaceholder;
            }
        }
    }

    function setThumbMainImageState(url, state) {
        console.log(url, state);
        const els = findThumbElementByUrl(url);
        for (const el of els) {
            if (el) {
                el.classList.remove('thumb-main-image-loading', 'thumb-main-image-ready', 'thumb-main-image-failed');
                el.classList.add(`thumb-main-image-${state}`);
            }
        }
    }

    function isSmallImage(img) {
        return img.complete && (img.naturalWidth < minWidth || img.naturalHeight < minHeight);
    }

    function collectImages() {
        const imageEls = [...document.images].filter(img => getBestImageUrl(img));

        let imageUrls = imageEls.map(getBestImageUrl);
        imageUrls = [...new Set(imageUrls)];
        imageUrls.sort();

        let bigImages = [];
        let smallImages = [];

        imageEls.forEach(img => {
            if (isSmallImage(img)) {
                // console.log('Small image detected:', img.src, img.naturalWidth, img.naturalHeight);
                smallImages.push(getBestImageUrl(img));
            } else {
                // console.log('Big image detected:', img.src, img.naturalWidth, img.naturalHeight);
                bigImages.push(getBestImageUrl(img));
            }
        });

        bigImages = [...new Set(bigImages)];
        smallImages = [...new Set(smallImages)];

        let bgImages = [...document.querySelectorAll('*')]
            .map(el => {
                const bg = getComputedStyle(el).backgroundImage;
                const match = bg && bg !== 'none' && bg.match(/url\(["']?(.*?)["']?\)/);
                return match ? match[1] : null;
            })
            .filter(Boolean);
        bgImages = [...new Set(bgImages)];

        let shownImages = []
        let filteredImages = []
        if (showBigImage) {
            shownImages.push(...bigImages);
        } else {
            filteredImages.push(...bigImages);
        }
        if (showSmallImage) {
            shownImages.push(...smallImages);
        } else {
            filteredImages.push(...smallImages);
        }
        if (showBgImage) {
            shownImages.push(...bgImages);
        } else {
            filteredImages.push(...bgImages);
        }

        console.log(`imageEls: ${imageEls.length} imageUrls: ${imageUrls.length} bigImages: ${bigImages.length} smallImages: ${smallImages.length}`);
        console.log(`bgImages: ${bgImages.length}`);
        console.log(`shownImages: ${shownImages.length} filteredImages: ${filteredImages.length}`);

        // console.log('imageUrls', imageUrls);
        // console.log('bgImages', bgImages);
        // console.log('shownImages', shownImages);
        // console.log('filteredImages', filteredImages);

        shownImages = [...new Set(shownImages)];
        filteredImages = [... new Set(filteredImages)];

        return { shownImages, filteredImages };
    }

    const { shownImages, filteredImages } = collectImages();
    if (!filteredImages.length && !shownImages.length) return;

    let mode = 'slideshow';
    let index = 0;

    // 自动播放状态
    let autoPlay = false;
    let autoPlayInterval = intervalMs; // 默认间隔3秒
    let autoTimer = null;
    let progressTimer = null;
    let startTime = 0;

    // 创建覆盖层
    const overlay = document.createElement('div');
    window.__slideOverlay = overlay;
    overlay.id = 'slideOverlay';
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
    overlay.dataset.slideOverlay = "1";
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
        padding: 10px;
        gap: 12px;
        flex: 0 0 auto;
        z-index: 2000000;
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
    mainImage.classList.add('slide-ignore');
    mainImage.style.cssText = `
        max-width:95%;
        max-height:95%;
        object-fit:contain;
        border-radius:8px;
        margin-bottom:10px;
    `;
    contentArea.appendChild(mainImage);

    // 底部缩略图容器
    const thumbWrapper = document.createElement('div');
    thumbWrapper.style.cssText = `
        width:100%;
        display:flex;
        justify-content:center;
        align-items:center;
        background: #111;
        padding:5px 0;
        box-sizing:border-box;
        flex: 0 0 auto;
    `;
    overlay.appendChild(thumbWrapper);

    const leftArrow = document.createElement('div');
    leftArrow.classList.add('slide-ignore');
    leftArrow.textContent = '<';
    leftArrow.style.cssText = `
        color:white; font-size:24px; cursor:pointer; user-select:none; margin:0 5px;
    `;
    leftArrow.onclick = () => scrollThumbs(-1);
    thumbWrapper.appendChild(leftArrow);

    const thumbBar = document.createElement('div');
    thumbBar.style.cssText = `
        display:flex;
        gap:5px;
        overflow:hidden;
        max-width:80%;
    `;
    thumbWrapper.appendChild(thumbBar);

    const rightArrow = document.createElement('div');
    rightArrow.classList.add('slide-ignore');
    rightArrow.textContent = '>';
    rightArrow.style.cssText = `
        color:white; font-size:24px; cursor:pointer; user-select:none; margin:0 5px;
    `;
    rightArrow.onclick = () => scrollThumbs(1);
    thumbWrapper.appendChild(rightArrow);

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
        thumb.classList.add('slide-ignore', 'thumb', 'thumb-main-image-loading');
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
        thumb.classList.add('slide-ignore', 'thumb', 'thumb-main-image-loading');
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

    const progressEl = document.createElement('div');
    progressEl.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 1px;
        width: 100%;
        background: limegreen;
        transition: none;
        z-index: 1000002;
    `;
    overlay.appendChild(progressEl);

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
        indexText.textContent = `${index + 1} / ${shownImages.length}`
        mainImage.style.opacity = 0;
        setTimeout(() => {
            mainImage.src = shownImages[index];
            mainImage.onload = () => mainImage.style.opacity = 1;
            highlightThumb(index);
        }, 0);
    }

    function switchToGallery() {
        mode = 'gallery';
        indexText.textContent = `${shownImages.length}(+${filteredImages.length} filtered)`
        mainImage.style.display = 'none';
        thumbWrapper.style.display = 'none';
        contentArea.style.alignItems = 'stretch';
        galleryContainer.style.display = 'grid';
        playBtn.style.display = 'none'
        switchBtn.textContent = 'Slideshow';
        stopAutoPlay();
    }

    function switchToSlideshow(i) {
        mode = 'slideshow';
        mainImage.style.display = 'block';
        thumbWrapper.style.display = 'flex';
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
        autoTimer = setInterval(() => scrollThumbs(1), autoPlayInterval);

        startTime = performance.now();
        progressEl.style.width = '0%';
        progressTimer = requestAnimationFrame(updateProgress);
    }

    function stopAutoPlay() {
        autoPlay = false;
        playBtn.textContent = 'Play ▶';
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }

        cancelAnimationFrame(progressTimer);
        progressEl.style.width = '0%';
    }

    function updateProgress(now) {
        const elapsed = now - startTime;
        const percent = Math.min(elapsed / autoPlayInterval, 1);
        progressEl.style.width = `${(1 - percent) * 100}%`;
        if (percent < 1 && autoPlay) {
            progressTimer = requestAnimationFrame(updateProgress);
        } else if (autoPlay) {
            startTime = performance.now();
            progressEl.style.width = '100%';
            progressTimer = requestAnimationFrame(updateProgress);
        }
    }

    function toggleAutoPlay() {
        if (autoPlay) stopAutoPlay();
        else startAutoPlay();
    }

    function resetAutoPlayTimer() {
        if (autoTimer) {
            clearInterval(autoTimer);
        }
        autoTimer = setInterval(() => showImage(index + 1), autoPlayInterval);
        cancelAnimationFrame(progressTimer);
        startTime = performance.now();
        progressEl.style.width = '0%';
        progressTimer = requestAnimationFrame(updateProgress);
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
            if (e.code === 'Space') {
                if (mode === 'slideshow') toggleAutoPlay();
                return;
            }
            if (mode === 'slideshow') {
                if (e.key === 'Escape') exitBtn.click();
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
    if (shownImages.length === 1) {
        return;
    }

    Promise.all(shownImages.map(src => new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            setThumbMainImageState(src, 'ready');
            resolve(img);
        }
        img.onerror = () => {
            setThumbMainImageState(src, 'failed');
            resolve(img);
        };
    }))).then(imgEls => {
        if (autoPlayOnStart) {
            startAutoPlay();
        }
    });
})();
