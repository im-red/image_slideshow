function getBestImageUrl(img) {
    return img.currentSrc || img.src || img.dataset.src || img.dataset.original || null;
}