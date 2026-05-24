import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Play, Shuffle, Pause, RotateCcw, RotateCw, Save, LayoutGrid, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

import { getConfig } from './config';
import { collectImage } from './common';
import { genThumb } from './thumb';
import { createScaleImageOverlay, removeScaleImageOverlay } from './scale';

import { logger } from "../utils/logger";
import slideshowStyles from './slideshow.css?inline';

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

const processingPlaceholder = `data:image/svg+xml;base64,${btoa(`
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
    <circle cx="30" cy="30" r="10" fill="none" stroke="#2ecc71" stroke-width="3" stroke-dasharray="20 42" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
    </circle>
</svg>
`)}`;

function SlideshowApp({ unmount }: { unmount: () => void }) {
    const [prefs, setPrefs] = useState<any>(null);
    const [shownImages, setShownImages] = useState<string[]>([]);
    const [filteredImages, setFilteredImages] = useState<string[]>([]);
    const [mode, setMode] = useState<'slideshow' | 'gallery'>('slideshow');
    const [index, setIndex] = useState(0);
    const [autoPlay, setAutoPlay] = useState(false);
    const [isRandom, setIsRandom] = useState(false);
    const [isThumbCollapsed, setIsThumbCollapsed] = useState(false);
    const [currentRotation, setCurrentRotation] = useState(0);
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const [thumbStates, setThumbStates] = useState<Record<string, 'loading' | 'downloading' | 'processing' | 'ready' | 'failed'>>({});
    const [progress, setProgress] = useState(0);
    const [downloadedCount, setDownloadedCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
    const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0);

    const mainImageRef = useRef<HTMLImageElement>(null);
    const thumbBarRef = useRef<HTMLDivElement>(null);
    const autoPlayTimer = useRef<any>(null);
    const autoPlayStartTime = useRef(0);
    const autoPlayProgressTimer = useRef<any>(null);

    useEffect(() => {
        getConfig().then(p => {
            logger.info(p);
            setPrefs(p);
            const { shownImages, filteredImages } = collectImage(p);
            setShownImages(shownImages);
            setFilteredImages(filteredImages);

            if (shownImages.length === 0) {
                setMode('gallery');
            } else {
                const indices = Array.from({ length: shownImages.length }, (_, i) => i);
                setShuffledIndices(indices);

                if (p.autoPlayOnStart) {
                    setAutoPlay(true);
                }

                // Preload thumbs
                shownImages.forEach(src => {
                    setThumbStates(prev => ({ ...prev, [src]: 'loading' }));
                    genThumb(src).then(thumbSrc => {
                        setThumbs(prev => ({ ...prev, [src]: thumbSrc }));
                        setThumbStates(prev => ({ ...prev, [src]: 'ready' }));
                    }).catch(() => {
                        setThumbStates(prev => ({ ...prev, [src]: 'failed' }));
                    });
                });

                // Preload images logic could go here
                let dCount = 0;
                let fCount = 0;
                shownImages.forEach(src => {
                    const img = new Image();
                    img.src = src;
                    img.onload = () => { dCount++; setDownloadedCount(dCount); };
                    img.onerror = () => { fCount++; setFailedCount(fCount); };
                });
            }
        });

        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
            stopAutoPlay();
        };
    }, []);

    useEffect(() => {
        const handleMessage = (msg: any) => {
            if (msg.type === "imageDownloading") {
                setThumbStates(prev => ({ ...prev, [msg.url]: 'downloading' }));
            } else if (msg.type === "imageReady") {
                setThumbStates(prev => ({ ...prev, [msg.url]: 'processing' }));
            }
        };
        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    const resetShuffle = useCallback(() => {
        const indices = Array.from({ length: shownImages.length }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        if (indices.length > 1 && indices[0] === index) {
            [indices[0], indices[indices.length - 1]] = [indices[indices.length - 1], indices[0]];
        }
        setShuffledIndices(indices);
        setCurrentShuffleIndex(0);
    }, [shownImages.length, index]);

    const [toast, setToast] = useState<{ id: number, msg: string } | null>(null);
    const toastTimerRef = useRef<any>(null);
    const toastIdCounter = useRef(0);

    const showToast = useCallback((msg: string) => {
        const id = ++toastIdCounter.current;
        setToast({ id, msg });
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    }, []);

    const showImage = useCallback((i: number) => {
        if (shownImages.length === 0) return;

        if (i < 0) {
            showToast("Already at the first image");
            return;
        }

        if (i >= shownImages.length) {
            showToast("Already at the last image");
            if (autoPlay) {
                setAutoPlay(false);
                setProgress(0);
            }
            return;
        }

        const newIndex = i;
        setIndex(newIndex);
        setCurrentRotation(0);

        if (autoPlay) {
            autoPlayStartTime.current = performance.now();
            setProgress(0);
        }
    }, [shownImages.length, autoPlay, showToast]);

    const autoPlayTick = useCallback(() => {
        if (isRandom) {
            setCurrentShuffleIndex(prev => {
                const next = prev + 1;
                if (next >= shuffledIndices.length) {
                    resetShuffle();
                    return 0;
                }
                return next;
            });
        } else {
            setIndex(prev => {
                const next = prev + 1;
                if (next >= shownImages.length) {
                    setTimeout(() => {
                        showToast("Already at the last image");
                        setAutoPlay(false);
                        setProgress(0);
                    }, 0);
                    return prev;
                }
                return next;
            });
        }
    }, [isRandom, shuffledIndices.length, shownImages.length, resetShuffle, showToast]);

    useEffect(() => {
        if (isRandom && shuffledIndices.length > 0) {
            showImage(shuffledIndices[currentShuffleIndex]);
        }
    }, [currentShuffleIndex, isRandom, shuffledIndices, showImage]);

    useEffect(() => {
        if (autoPlay && prefs) {
            const interval = prefs.interval * 1000;
            autoPlayTimer.current = setInterval(autoPlayTick, interval);
            autoPlayStartTime.current = performance.now();

            const updateProgress = () => {
                const elapsed = performance.now() - autoPlayStartTime.current;
                const p = Math.min(elapsed / interval, 1);
                setProgress(p);
                if (p < 1) {
                    autoPlayProgressTimer.current = requestAnimationFrame(updateProgress);
                } else {
                    autoPlayStartTime.current = performance.now();
                    autoPlayProgressTimer.current = requestAnimationFrame(updateProgress);
                }
            };
            autoPlayProgressTimer.current = requestAnimationFrame(updateProgress);

            return () => {
                clearInterval(autoPlayTimer.current);
                cancelAnimationFrame(autoPlayProgressTimer.current);
            };
        }
    }, [autoPlay, autoPlayTick, prefs]);

    const startAutoPlay = (random: boolean) => {
        setIsRandom(random);
        if (random) resetShuffle();
        setAutoPlay(true);
    };

    const stopAutoPlay = () => {
        setAutoPlay(false);
        setProgress(0);
    };

    const rotateImage = (deg: number) => {
        setCurrentRotation(prev => prev + deg);
    };

    const handleSave = () => {
        chrome.runtime.sendMessage({
            type: 'downloadImages',
            title: document.title,
            url: location.href,
            images: shownImages
        });
    };

    const switchMode = () => {
        if (mode === 'slideshow') {
            setMode('gallery');
            stopAutoPlay();
        } else {
            setMode('slideshow');
            showImage(index);
        }
    };

    const switchToSlideshow = (i: number) => {
        setMode('slideshow');
        showImage(i);
    };

    // Scroll active thumbnail into view (always centered)
    useEffect(() => {
        if (mode !== 'slideshow' || !thumbBarRef.current) return;

        const bar = thumbBarRef.current;
        const activeWrapper = bar.children[index] as HTMLElement;
        if (!activeWrapper) return;

        const barRect = bar.getBoundingClientRect();
        const thumbRect = activeWrapper.getBoundingClientRect();

        // Always center the active thumbnail
        bar.scrollLeft += (thumbRect.left - barRect.left) - barRect.width / 2 + thumbRect.width / 2;
    }, [index, mode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'F12' || e.code === 'F11') return;
            e.stopPropagation();
            e.preventDefault();

            if (document.getElementById("slide-scale-image-overlay")) {
                if (e.key === 'Escape') removeScaleImageOverlay();
                return;
            }

            if (e.code === 'Space') {
                if (mode === 'slideshow') autoPlay ? stopAutoPlay() : startAutoPlay(isRandom);
                return;
            }

            if (mode === 'slideshow') {
                if (e.key === 'Escape') unmount();
                else if (e.key === 'ArrowRight') e.ctrlKey ? rotateImage(90) : showImage(index + 1);
                else if (e.key === 'ArrowLeft') e.ctrlKey ? rotateImage(-90) : showImage(index - 1);
            } else if (e.key === 'Escape') {
                unmount();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [mode, autoPlay, isRandom, index, showImage, unmount]);

    if (!prefs) return null;

    const isVertical = Math.abs(currentRotation / 90) % 2 === 1;
    const downloadedPercent = shownImages.length ? (downloadedCount / shownImages.length) * 100 : 0;
    const failedPercent = shownImages.length ? (failedCount / shownImages.length) * 100 : 0;

    const getThumbProps = (src: string, isFiltered: boolean) => {
        if (isFiltered) return { src, opacity: 0.3 };

        if (thumbs[src]) return { src: thumbs[src], opacity: 1 };

        const state = thumbStates[src] || 'loading';
        if (state === 'failed') return { src: thumbs[src] || src, opacity: 0.2 };
        if (state === 'downloading') return { src: downloadingPlaceholder, opacity: 0.5 };
        if (state === 'processing') return { src: processingPlaceholder, opacity: 0.5 };
        return { src: loadingPlaceholder, opacity: 0.5 };
    };

    return (
        <div id="slide-overlay" className="slideshow-overlay">
            <style>{slideshowStyles}</style>
            {/* Top Area */}
            <div className="slideshow-top-bar">
                <div className="slideshow-index-text">
                    {mode === 'gallery' ? `${shownImages.length}${filteredImages.length ? `(+${filteredImages.length} filtered)` : ''}` : `${index + 1} / ${shownImages.length}`}
                </div>

                <div className="slideshow-controls">
                    {mode === 'slideshow' && (
                        <>
                            {!autoPlay ? (
                                <>
                                    <button onClick={() => startAutoPlay(false)} className="slideshow-btn" title="Play Normal"><Play size={16} /></button>
                                    <button onClick={() => startAutoPlay(true)} className="slideshow-btn" title="Play Random"><Shuffle size={16} /></button>
                                </>
                            ) : (
                                <button onClick={stopAutoPlay} className="slideshow-btn" title="Pause"><Pause size={16} /></button>
                            )}
                            {!autoPlay && (
                                <>
                                    <button onClick={() => rotateImage(-90)} className="slideshow-btn" title="Rotate Left"><RotateCcw size={16} /></button>
                                    <button onClick={() => rotateImage(90)} className="slideshow-btn" title="Rotate Right"><RotateCw size={16} /></button>
                                </>
                            )}
                        </>
                    )}
                    <button onClick={handleSave} className="slideshow-btn" title="Save Images"><Save size={16} /></button>
                    {shownImages.length > 0 && (
                        <button onClick={switchMode} className="slideshow-btn" title="Switch View"><LayoutGrid size={16} /></button>
                    )}
                    <button onClick={unmount} className="slideshow-btn" title="Close"><X size={16} /></button>
                </div>
            </div>

            {/* Progress Bars */}
            <div className="slideshow-progress-downloaded" style={{ width: `${downloadedPercent}%` }} />
            <div className="slideshow-progress-failed" style={{ width: `${failedPercent}%` }} />

            {/* Content Area */}
            <div
                className={`slideshow-content-area mode-${mode}`}
                onClick={(e) => {
                    if (mode === 'slideshow' && !(e.target as HTMLElement).closest('button')) {
                        if (e.clientX > window.innerWidth / 2) showImage(index + 1);
                        else showImage(index - 1);
                    }
                }}>
                {mode === 'slideshow' && shownImages.length > 0 && (
                    <img
                        ref={mainImageRef}
                        className="slideshow-main-img"
                        src={shownImages[index]}
                        style={{
                            maxWidth: isVertical ? '85vh' : '95%',
                            maxHeight: isVertical ? '95vw' : '95%',
                            transform: `rotate(${currentRotation}deg)`
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            stopAutoPlay();
                            createScaleImageOverlay(shownImages[index]);
                        }}
                    />
                )}

                {mode === 'gallery' && (
                    <div className="slideshow-gallery">
                        {shownImages.map((src, i) => {
                            const { src: thumbSrc, opacity } = getThumbProps(src, false);
                            return <img key={i} src={thumbSrc} style={{ opacity }} className="slideshow-gallery-img" onClick={() => switchToSlideshow(i)} />;
                        })}
                        {filteredImages.map((src, i) => {
                            const { src: thumbSrc, opacity } = getThumbProps(src, true);
                            return <img key={`f-${i}`} src={thumbSrc} style={{ opacity }} className="slideshow-gallery-img filtered" />;
                        })}
                    </div>
                )}

                {toast && (
                    <div key={toast.id} className="slideshow-toast">
                        {toast.msg}
                    </div>
                )}
            </div>

            {/* Thumbnails */}
            {mode === 'slideshow' && shownImages.length > 0 && (
                <div style={{ width: '100%', flex: '0 0 auto', zIndex: 100 }}>
                    <div onClick={(e) => { e.stopPropagation(); setIsThumbCollapsed(!isThumbCollapsed); }} className="slideshow-thumb-toggle">
                        {isThumbCollapsed ? <ChevronUp size={16} className="slideshow-thumb-toggle-icon" /> : <ChevronDown size={16} className="slideshow-thumb-toggle-icon" />}
                    </div>

                    {!isThumbCollapsed && (
                        <div className="slideshow-thumb-bar-container" onClick={e => e.stopPropagation()}>
                            <div className="slideshow-thumb-nav" onClick={() => showImage(index - 1)}><ChevronLeft size={24} /></div>
                            <div ref={thumbBarRef} className="slideshow-thumb-bar" onWheel={e => { e.preventDefault(); if (thumbBarRef.current) thumbBarRef.current.scrollLeft += e.deltaY; }}>
                                {shownImages.map((src, i) => {
                                    const { src: thumbSrc, opacity } = getThumbProps(src, false);
                                    return (
                                        <div key={i} className="slideshow-thumb-wrapper" onClick={() => showImage(i)}>
                                            <img
                                                src={thumbSrc}
                                                style={{ opacity }}
                                                className={`slideshow-thumb-img ${i === index ? 'active' : 'inactive'}`}
                                            />
                                            <div className="slideshow-thumb-index">{i + 1}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="slideshow-thumb-nav" onClick={() => showImage(index + 1)}><ChevronRight size={24} /></div>
                        </div>
                    )}
                </div>
            )}
            {autoPlay && <div className="slideshow-autoplay-progress" style={{ width: `${(1 - progress) * 100}%` }} />}
        </div>
    );
}

// Injection logic
export function initSlideshow() {
    if (window.__slideOverlay) {
        removeScaleImageOverlay?.();
        window.__slideOverlay.unmount?.();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        return;
    }

    const container = document.createElement('div');
    container.id = 'slide-overlay-container';
    document.body.appendChild(container);
    logger.info('Slideshow container injected into DOM');

    const root = createRoot(container);

    const unmount = () => {
        removeScaleImageOverlay?.();
        root.unmount();
        container.remove();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        logger.info('Slideshow overlay unmounted');
    };

    window.__slideOverlay = {
        unmount,
        remove: () => unmount()
    } as any;

    root.render(<SlideshowApp unmount={unmount} />);
}

// Expose the init function to the window object so it can be called again by executeScript in ES modules
(window as any).__initSlideshow = initSlideshow;

initSlideshow();