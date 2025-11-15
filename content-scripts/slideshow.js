(async function () {
    if (window.__slideOverlay) {
        removeScaleImageOverlay();
        window.__slideOverlay.remove();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        return;
    }

    const prefs = await getConfig();
    console.log(prefs);

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
        createScaleImageOverlay(mainImage.src);
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
    thumbBar.id = 'slide-thumb-bar';
    thumbBar.style.cssText = `
        display: flex;
        gap: 5px;
        overflow-x: auto;
        overflow-y: hidden;
        max-width: 80%;
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
        const thumb = createThumbElement(shownImages[i], 60, i, false, () => showImage(i));
        slideShowThumbs.push(thumb);
        thumbBar.appendChild(thumb);
    }

    const galleryThumbs = [];
    for (let i = 0; i < shownImages.length; i++) {
        const thumb = createThumbElement(shownImages[i], 200, i, false, () => switchToSlideshow(i));
        galleryThumbs.push(thumb);
        galleryContainer.appendChild(thumb);
    }

    for (let i = 0; i < shownImages.length; i++) {
        genThumb(shownImages[i]).then(thumbSrc => {
            setThumbSrc(shownImages[i], thumbSrc);
        });
    }

    filteredImages.forEach((src) => {
        const thumb = createThumbElement(src, 200, -1, true, () => { });
        galleryContainer.appendChild(thumb);
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
        height: 3px;
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
        height: 3px;
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
            const mainImgOverlay = document.getElementById("slide-scale-image-overlay");
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
