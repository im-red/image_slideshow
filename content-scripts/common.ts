import { logger } from "../logger";

function getBestImageUrl(img: HTMLImageElement): string | null {
    return img.currentSrc || img.src || img.dataset.src || img.dataset.original || null;
}

function isSmallImage(img: HTMLImageElement, prefs: any) {
    return img.complete && (img.naturalWidth < prefs.minWidth || img.naturalHeight < prefs.minHeight);
}

function collectImagesForWeb(prefs: any) {
    const imageEls = ([...document.images] as HTMLImageElement[]).filter(img => getBestImageUrl(img) && !img.closest('#slide-overlay'));

    let imageUrls = imageEls.map(getBestImageUrl).filter(Boolean) as string[];
    imageUrls = [...new Set(imageUrls)];
    imageUrls.sort();

    let bigImages: string[] = [];
    let smallImages: string[] = [];

    imageEls.forEach(img => {
        const url = getBestImageUrl(img);
        if (!url) return;
        if (isSmallImage(img, prefs)) {
            smallImages.push(url);
        } else {
            bigImages.push(url);
        }
    });

    bigImages = [...new Set(bigImages)];
    smallImages = [...new Set(smallImages)];

    let bgImages: string[] = [...document.querySelectorAll('*')]
        .map(el => {
            const bg = getComputedStyle(el).backgroundImage;
            const match = bg && bg !== 'none' && bg.match(/url\(["']?(.*?)["']?\)/);
            return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
    bgImages = [...new Set(bgImages)];

    let shownImages: string[] = []
    let filteredImages: string[] = []
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

    // consola.info(`imageEls: ${imageEls.length} imageUrls: ${imageUrls.length} bigImages: ${bigImages.length} smallImages: ${smallImages.length}`);
    // consola.info(`bgImages: ${bgImages.length}`);
    // consola.info(`shownImages: ${shownImages.length} filteredImages: ${filteredImages.length}`);

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
    let imageUrls: string[] = links
        .map(a => {
            try {
                // 把相对路径转为绝对 file:// URL
                const href = a.getAttribute('href');
                if (!href) return null;
                const url = new URL(href, location.href).href;
                return url;
            } catch (err) {
                return null;
            }
        })
        .filter(Boolean) as string[];
        
    imageUrls = imageUrls
        .filter(href => imgExt.test(href))
        .filter(href => !href.endsWith('../'))  // 排除上级目录链接
        .filter(href => !/\/\.\//.test(href))   // 排除奇怪路径
        .filter(href => !href.includes('?'))    // 排除带查询参数的奇怪链接
        .filter(href => !href.includes('#'))    // 排除带锚点的链接
        .filter(href => href.startsWith('file:///')); // 确保是本地路径

    return { shownImages: imageUrls, filteredImages: [] };
}

export function collectImage(prefs: any) {
    const isLocal = location.protocol === 'file:';
    return isLocal ? collectImagesForLocal() : collectImagesForWeb(prefs);
}
