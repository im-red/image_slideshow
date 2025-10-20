(async function () {
    if (window.__slideOverlay) {
        window.__slideOverlay.remove();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        return;
    }

    const prefs = await new Promise(resolve =>
        chrome.storage.sync.get({ interval: 3, minWidth: 100, minHeight: 100, showBigImage: true, showSmallImage: false, showBgImage: false }, resolve)
    );

    const intervalMs = prefs.interval * 1000;
    const minWidth = prefs.minWidth;
    const minHeight = prefs.minHeight;
    const showBigImage = prefs.showBigImage;
    const showSmallImage = prefs.showSmallImage;
    const showBgImage = prefs.showBgImage;

    console.log(intervalMs, minWidth, minHeight, showBigImage, showSmallImage, showBgImage)

    function isSmallImage(img) {
        return img.complete && (img.naturalWidth < minWidth || img.naturalHeight < minHeight);
    }

    const imageEls = [...document.images].filter(img => !img.src.startsWith("data:"));

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

    console.log(`imageEls: ${imageEls.length} bigImages: ${bigImages.length} smallImages: ${smallImages.length} bgImages: ${bgImages.length} images: ${images.length} filtered: ${filtered.length}`)

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

    // Slideshow 大图
    const imgEl = document.createElement('img');
    imgEl.classList.add('slide-ignore');
    imgEl.style.cssText = `
        max-width:90vw;
        max-height:80vh;
        object-fit:contain;
        transition: opacity 0.3s;
        border-radius:8px;
        margin-bottom:10px;
    `;
    overlay.appendChild(imgEl);

    // 底部缩略图容器
    const thumbWrapper = document.createElement('div');
    thumbWrapper.style.cssText = `
        position: fixed;
        bottom:0;
        width:100%;
        display:flex;
        justify-content:center;
        align-items:center;
        background: #111;
        padding:5px 0;
        box-sizing:border-box;
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
        display:none;
        width:90vw;
        padding:20px 0;
        gap:5px;
        justify-items:center;
        grid-template-columns: repeat(auto-fill,minmax(120px,1fr));
        display:grid;
        overflow-x: auto;
        scrollbar-width: none;
    `;
    overlay.appendChild(galleryContainer);

    uniqueImages.forEach((src, i) => {
        const thumb = document.createElement('img');
        thumb.classList.add('slide-ignore');
        thumb.src = src;
        thumb.title = src;
        thumb.style.cssText = 'width:100px;height:100px;object-fit:cover;cursor:pointer;border-radius:4px';
        thumb.loading = 'lazy';
        thumb.onclick = () => { switchToSlideshow(i); };
        galleryContainer.appendChild(thumb);
    });

    filtered.forEach((src) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('slide-ignore');
        wrapper.style.cssText = `
            position: relative;
            width: 100px;
            height: 100px;
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

    const topBar = document.createElement('div');
    topBar.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        background: black;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 10px;
        gap: 12px;
    `
    overlay.appendChild(topBar);

    const topBtnContainer = document.createElement('div');
    topBtnContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
    `;
    topBar.appendChild(topBtnContainer);

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
        if (autoPlay) {
            resetAutoPlayTimer();
        }
        index = (i + uniqueImages.length) % uniqueImages.length;
        imgEl.style.opacity = 0;
        setTimeout(() => {
            imgEl.src = uniqueImages[index];
            imgEl.onload = () => imgEl.style.opacity = 1;
            highlightThumb(index);
        }, 0);
    }

    function switchToGallery() {
        mode = 'gallery';
        imgEl.style.display = 'none';
        thumbWrapper.style.display = 'none';
        galleryContainer.style.display = 'grid';
        playBtn.style.display = 'none'
        switchBtn.textContent = 'Slideshow';
        stopAutoPlay();
    }

    function switchToSlideshow(i) {
        mode = 'slideshow';
        imgEl.style.display = 'block';
        thumbWrapper.style.display = 'flex';
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
            if (e.code === 'F12') return;
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

    switchToSlideshow(0);
    function preloadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img); // 加载失败也算完成
        });
    }
    Promise.all(uniqueImages.map(preloadImage)).then(imgEls => {
        // 所有图片加载完成
        startAutoPlay();
    });
})();
