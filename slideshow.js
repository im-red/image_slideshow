(async function () {
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

    function isSmallImage(img) {
        return img.complete && (img.naturalWidth < minWidth || img.naturalHeight < minHeight);
    }

    const imageEls = [...document.images].filter(img => img.src);

    let imageUrls = imageEls.map(img => img.src);
    imageUrls = [...new Set(imageUrls)];
    imageUrls.sort();

    let bigImages = imageEls
        .filter(img => !isSmallImage(img))
        .map(img => img.src);
    bigImages = [...new Set(bigImages)];

    let smallImages = imageEls
        .filter(img => isSmallImage(img))
        .map(img => img.src);
    smallImages = [...new Set(smallImages)];

    let bgImages = [...document.querySelectorAll('*')]
        .map(el => {
            const bg = getComputedStyle(el).backgroundImage;
            const match = bg && bg !== 'none' && bg.match(/url\(["']?(.*?)["']?\)/);
            return match ? match[1] : null;
        })
        .filter(Boolean);
    bgImages = [...new Set(bgImages)];

    let images = []
    let filtered = []
    if (showBigImage) {
        images.push(...bigImages);
    } else {
        filtered.push(...bigImages);
    }
    if (showSmallImage) {
        images.push(...smallImages);
    } else {
        filtered.push(...smallImages);
    }
    if (showBgImage) {
        images.push(...bgImages);
    } else {
        filtered.push(...bgImages);
    }

    console.log(`imageUrls: ${imageUrls.length} bgImages: ${bgImages.length} bigImages: ${bigImages.length} smallImages: ${smallImages.length} images: ${images.length} filtered: ${filtered.length}`)
    console.log("slideshow.js", imageUrls);

    filtered = [... new Set(filtered)];
    const uniqueImages = [...new Set(images)];
    if (!filtered.length && !uniqueImages.length) return;

    // 创建覆盖层
    const overlay = document.createElement('div');
    window.__slideOverlay = overlay;
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

    let mode = 'slideshow';
    let index = 0;

    // 自动播放状态
    let autoPlay = false;
    let autoPlayInterval = intervalMs; // 默认间隔3秒
    let autoTimer = null;
    let progressTimer = null;
    let startTime = 0;

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
    indexText.textContent = 'indexText';
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
    saveBtn.textContent = '💾 保存';
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
            images: uniqueImages
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

    const thumbs = [];
    uniqueImages.forEach((src, i) => {
        const thumb = document.createElement('img');
        thumb.classList.add('slide-ignore');
        thumb.src = src;
        thumb.title = src;
        thumb.style.cssText = `
            width:60px;
            height:60px;
            object-fit:cover;
            cursor:pointer;
            border-radius:4px;
            transition:border 0.2s;
            flex-shrink:0;
            box-sizing: border-box;
        `;
        thumb.onclick = () => showImage(i);
        thumbBar.appendChild(thumb);
        thumbs.push(thumb);
    });

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

    uniqueImages.forEach((src, i) => {
        const thumb = document.createElement('img');
        thumb.classList.add('slide-ignore');
        thumb.src = src;
        thumb.title = src;
        thumb.style.cssText = 'width:200px;height:200px;object-fit:cover;cursor:pointer;border-radius:4px';
        thumb.loading = 'lazy';
        thumb.onclick = () => { switchToSlideshow(i); };
        galleryContainer.appendChild(thumb);
    });

    filtered.forEach((src) => {
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
        thumb.loading = 'lazy';
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
        thumbs.forEach((t, j) => {
            t.style.border = (j === i) ? '3px solid #0f0' : 'none';
        });
        // 自动滚动缩略图到中间
        thumbs[i].scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }

    function showImage(i) {
        if (uniqueImages.length === 0) {
            return;
        }
        if (autoPlay) {
            resetAutoPlayTimer();
        }
        index = (i + uniqueImages.length) % uniqueImages.length;
        indexText.textContent = `${index + 1} / ${uniqueImages.length}(+${filtered.length})`
        mainImage.style.opacity = 0;
        setTimeout(() => {
            mainImage.src = uniqueImages[index];
            mainImage.onload = () => mainImage.style.opacity = 1;
            highlightThumb(index);
        }, 0);
    }

    function switchToGallery() {
        mode = 'gallery';
        indexText.textContent = `${uniqueImages.length}(+${filtered.length})`
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
        playBtn.textContent = '暂停 ❚❚';
        autoTimer = setInterval(() => scrollThumbs(1), autoPlayInterval);

        startTime = performance.now();
        progressEl.style.width = '0%';
        progressTimer = requestAnimationFrame(updateProgress);
    }

    function stopAutoPlay() {
        autoPlay = false;
        playBtn.textContent = '播放 ▶';
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
        // console.log(progressEl.style.width)
        if (percent < 1 && autoPlay) {
            progressTimer = requestAnimationFrame(updateProgress);
        } else if (autoPlay) {
            // 下一轮重新开始
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

    // 键盘控制
    ['keydown', 'keyup'].forEach(type => {
        window.addEventListener(type, e => {
            if (e.code === 'F12' || e.code === 'F11') return;
            if (!window.__slideOverlay) return;

            e.stopPropagation();
            e.preventDefault();
            if (e.type == 'keyup') {
                return;
            }
            if (e.code === 'Space') { // 空格切换自动播放
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

    // 点击切换 Slideshow
    overlay.addEventListener('click', e => {
        if (mode === 'slideshow') {
            if (e.target.closest('.slide-ignore')) return;
            if (e.clientX > window.innerWidth / 2) scrollThumbs(1);
            else scrollThumbs(-1);
        }
    });

    if (uniqueImages.length === 0) {
        switchBtn.style.display = 'none';
        switchToGallery();
        return;
    }

    switchToSlideshow(0);
    if (uniqueImages.length === 1) {
        return;
    }

    Promise.all(uniqueImages.map(src => new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img); // 加载失败也算完成
    }))).then(imgEls => {
        if (autoPlayOnStart) {
            startAutoPlay();
        }
    });
})();
