(async function () {
    if (!window.__slideThumbInitialized) {
        window.__slideThumbInitialized = true;
        chrome.runtime.onMessage.addListener((msg) => {
            console.log('Background received message:', msg);
            if (msg.type === "imageDownloading") {
                showDownloadingPlaceholder(msg.url);
            } else if (msg.type === "imageReady") {
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
            #slide-thumb-bar {
                scrollbar-width: thin;
                scrollbar-color: #888 transparent;
            }
            #slide-thumb-bar::-webkit-scrollbar {
                height: 8px;
            }
            #slide-thumb-bar::-webkit-scrollbar-track {
                background: transparent;
            }
            #slide-thumb-bar::-webkit-scrollbar-thumb {
                background: rgba(136,136,136,0.6);
                border-radius: 4px;
                transition: background 0.3s;
            }
            #slide-thumb-bar::-webkit-scrollbar-thumb:hover {
                background: rgba(136,136,136,0.9);
            }
        `;
        document.head.appendChild(style);
    }
})();

function findThumbElementsByUrl(url) {
    const overlay = document.getElementById("slide-overlay");
    if (!overlay) return [];
    return Array.from(overlay.querySelectorAll('img.slide-thumb')).filter(img => {
        return img.title === url || img.dataset.src === url;
    });
}

function setThumbSrc(url, src) {
    const els = findThumbElementsByUrl(url);
    for (const el of els) {
        if (el) {
            el.src = src;
        }
    }
}

function showDownloadingPlaceholder(url) {
    const downloadingPlaceholder = `data:image/svg+xml;base64,${btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
                <circle cx="30" cy="30" r="10" fill="none" stroke="#3498db" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
        `)}`;
    setThumbSrc(url, downloadingPlaceholder);
}

function showReadyPlaceholder(url) {
    const readyPlaceholder = `data:image/svg+xml;base64,${btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
                <circle cx="30" cy="30" r="10" fill="none" stroke="#2ecc71" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
                </circle>
            </svg>
        `)}`;
    setThumbSrc(url, readyPlaceholder);
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

function createThumbElement(src, size, index, isFiltered, onclick) {
    const loadingPlaceholder = `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
            <circle cx="30" cy="30" r="10" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `)}`;

    const wrapper = document.createElement('div');
    wrapper.classList.add('slide-ignore');
    wrapper.style.cssText = `
        position: relative;
        width: ${size}px;
        height: ${size}px;
        flex: 0 0 auto;
        opacity: ${isFiltered ? 0.6 : 1};
    `;

    const thumb = document.createElement('img');
    thumb.classList.add('slide-thumb', 'slide-thumb-main-image-loading');
    thumb.src = isFiltered ? src : loadingPlaceholder;
    thumb.title = src;
    thumb.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 4px;
        transition: border 0.2s;
        box-sizing: border-box;
        cursor: pointer;
        object-fit: cover;
        flex-shrink: 0;
    `;
    thumb.onclick = onclick;
    wrapper.appendChild(thumb);

    if (isFiltered) {
        const filteredOverlay = document.createElement('div');
        filteredOverlay.style.cssText = `
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
        wrapper.appendChild(filteredOverlay);
    }

    return wrapper;
}

async function genThumb(src, maxWidth = 200, maxHeight = 200, quality = 0.7) {
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
