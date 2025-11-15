function createScaleImageOverlay(imgSrc) {
    console.log('Creating scale image overlay for', imgSrc);
    const old = document.getElementById("slide-scale-image-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "slide-scale-image-overlay";
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
        scale = Math.max(scale, defaultScale());
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

function removeScaleImageOverlay() {
    const overlay = document.getElementById("slide-scale-image-overlay");
    if (overlay) overlay.remove();
}
