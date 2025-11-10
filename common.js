function getBestImageUrl(img) {
    return img.currentSrc || img.src || img.dataset.src || img.dataset.original || null;
}

function isSmallImage(img, prefs) {
    return img.complete && (img.naturalWidth < prefs.minWidth || img.naturalHeight < prefs.minHeight);
}

function collectImagesForWeb(prefs) {
    const imageEls = [...document.images].filter(img => getBestImageUrl(img) && !img.closest('#slideOverlay'));

    let imageUrls = imageEls.map(getBestImageUrl);
    imageUrls = [...new Set(imageUrls)];
    imageUrls.sort();

    let bigImages = [];
    let smallImages = [];

    imageEls.forEach(img => {
        if (isSmallImage(img, prefs)) {
            smallImages.push(getBestImageUrl(img));
        } else {
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
    if (prefs.showBigImage) {
        shownImages.push(...bigImages);
    } else {
        filteredImages.push(...bigImages);
    }
    if (prefs.showSmallImage) {
        shownImages.push(...smallImages);
    } else {
        filteredImages.push(...smallImages);
    }
    if (prefs.showBgImage) {
        shownImages.push(...bgImages);
    } else {
        filteredImages.push(...bgImages);
    }

    // console.log(`imageEls: ${imageEls.length} imageUrls: ${imageUrls.length} bigImages: ${bigImages.length} smallImages: ${smallImages.length}`);
    // console.log(`bgImages: ${bgImages.length}`);
    // console.log(`shownImages: ${shownImages.length} filteredImages: ${filteredImages.length}`);

    shownImages = [...new Set(shownImages)];
    filteredImages = [... new Set(filteredImages)];

    return { shownImages, filteredImages };
}

function collectImagesForLocal() {
    // 1. 匹配常见图片扩展名
    const imgExt = /\.(jpe?g|png|gif|webp|bmp|avif|heic|tiff?)$/i;

    // 2. 提取所有 <a href="..."> 元素
    const links = Array.from(document.querySelectorAll('a[href]'));

    // 3. 提取图片链接
    let imageUrls = links
        .map(a => {
            try {
                // 把相对路径转为绝对 file:// URL
                const href = new URL(a.getAttribute('href'), location.href).href;
                return href;
            } catch (err) {
                return null;
            }
        })
        .filter(Boolean)
        .filter(href => imgExt.test(href))
        .filter(href => !href.endsWith('../'))  // 排除上级目录链接
        .filter(href => !/\/\.\//.test(href))   // 排除奇怪路径
        .filter(href => !href.includes('?'))    // 排除带查询参数的奇怪链接
        .filter(href => !href.includes('#'))    // 排除带锚点的链接
        .filter(href => href.startsWith('file:///')); // 确保是本地路径

    return { shownImages: imageUrls, filteredImages: [] };
}

function collectImage(prefs) {
    const isLocal = location.protocol === 'file:';
    return isLocal ? collectImagesForLocal() : collectImagesForWeb(prefs);
}
