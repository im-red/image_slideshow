import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Play, Shuffle, Pause, RotateCcw, RotateCw, Save, Images, LayoutGrid, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Copy, Star, RefreshCw } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

import { getConfig } from './config';
import { collectImage } from './common';
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

async function hashUrl(url: string, prefix: string = 'rating_') {
    const msgUint8 = new TextEncoder().encode(url);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}${hashHex}`;
}

function LazyImage({ src, opacity, className, title, onClick }: any) {
    const { ref, inView } = useInView({
        rootMargin: '200px',
        triggerOnce: true,
    });

    return (
        <img
            ref={ref}
            src={inView ? src : loadingPlaceholder}
            style={{ opacity }}
            className={className}
            title={title}
            onClick={onClick}
        />
    );
}

function formatSize(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function SlideshowApp({ unmount }: { unmount: () => void }) {
    const [prefs, setPrefs] = useState<any>(null);
    const [allShownImages, setAllShownImages] = useState<string[]>([]);
    const [allFilteredImages, setAllFilteredImages] = useState<string[]>([]);
    const [shownImages, setShownImages] = useState<string[]>([]);
    const [filteredImages, setFilteredImages] = useState<string[]>([]);
    const [mode, setMode] = useState<'slideshow' | 'gallery'>('slideshow');
    const [index, setIndex] = useState(0);
    const [autoPlay, setAutoPlay] = useState(false);
    const [isRandom, setIsRandom] = useState(false);
    const [isThumbCollapsed, setIsThumbCollapsed] = useState(false);
    const [currentRotation, setCurrentRotation] = useState(0);
    const [imageStates, setImageStates] = useState<Record<string, 'loading' | 'ready' | 'failed'>>({});
    const [progress, setProgress] = useState(0);
    const [downloadedCount, setDownloadedCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
    const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0);
    const [currentImageInfo, setCurrentImageInfo] = useState<{ width: number, height: number, size: string } | null>(null);
    const [imageRatings, setImageRatings] = useState<Record<string, number>>({});
    const [ratingFilter, setRatingFilter] = useState<number | 'all' | 'unrated'>('all');
    const imageSizeCache = useRef<Record<string, string>>({});
    const preloadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

    const mainImageRef = useRef<HTMLImageElement>(null);
    const thumbBarRef = useRef<HTMLDivElement>(null);
    const autoPlayTimer = useRef<any>(null);
    const autoPlayStartTime = useRef(0);
    const autoPlayProgressTimer = useRef<any>(null);

    const filterCounts = React.useMemo(() => {
        const counts: Record<string, number> = { all: 0, unrated: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        counts.all = allShownImages.length + allFilteredImages.length;
        allShownImages.forEach(url => {
            const r = imageRatings[url];
            if (!r) counts.unrated++;
            else counts[r]++;
        });
        return counts;
    }, [allShownImages, allFilteredImages, imageRatings]);

    const showToast = useCallback((msg: string) => {
        const id = ++toastIdCounter.current;
        setToast({ id, msg });
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    }, []);

    const copyFilteredUrls = useCallback(() => {
        const allFiltered = [...shownImages, ...filteredImages];
        const text = allFiltered.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied ${allFiltered.length} URLs to clipboard`);
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy URLs');
        });
    }, [shownImages, filteredImages, showToast]);

    const applyFilter = useCallback((newFilter: any) => {
        logger.info(`Applying filter: ${newFilter}`);
        setRatingFilter(newFilter);

        let newShown: string[] = [];
        let newFiltered: string[] = [];

        if (newFilter === 'all') {
            newShown = allShownImages;
            newFiltered = allFilteredImages;
        } else {
            const passes = (url: string, isOriginalFiltered: boolean) => {
                if (isOriginalFiltered) return false;
                const r = imageRatings[url];
                if (newFilter === 'unrated') return !r;
                return r === newFilter;
            };
            newShown = allShownImages.filter(url => passes(url, false));
            newFiltered = allFilteredImages.filter(url => passes(url, true));
        }

        setShownImages(newShown);
        setFilteredImages(newFiltered);
        setCurrentRotation(0);

        if (newShown.length === 0) {
            setIndex(0);
        } else if (index >= newShown.length) {
            setIndex(newShown.length - 1);
        } else {
            const currentUrl = shownImages[index];
            const newIndex = newShown.indexOf(currentUrl);
            if (newIndex !== -1) {
                setIndex(newIndex);
            } else {
                setIndex(0);
            }
        }

        const indices = Array.from({ length: newShown.length }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        setShuffledIndices(indices);
        setCurrentShuffleIndex(0);
    }, [allShownImages, allFilteredImages, imageRatings, shownImages, index]);

    const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        const newFilter = val === 'all' || val === 'unrated' ? val as any : Number(val);
        applyFilter(newFilter);
    }, [applyFilter]);

    useEffect(() => {
        if (shownImages.length > 0 && shownImages[index]) {
            Promise.all([
                hashUrl(location.href, 'index_'),
                hashUrl(shownImages[index], 'img_')
            ]).then(([pageKey, imgHash]) => {
                chrome.storage.local.set({ [pageKey]: imgHash });
            });
        }
    }, [index, shownImages]);

    useEffect(() => {
        getConfig().then(p => {
            logger.info(p);
            setPrefs(p);
            const { shownImages: collectedShown, filteredImages: collectedFiltered } = collectImage(p);
            setAllShownImages(collectedShown);
            setAllFilteredImages(collectedFiltered);
            setShownImages(collectedShown);
            setFilteredImages(collectedFiltered);

            if (collectedShown.length === 0) {
                setMode('gallery');
            } else {
                const indices = Array.from({ length: collectedShown.length }, (_, i) => i);
                setShuffledIndices(indices);

                hashUrl(location.href, 'index_').then(pageKey => {
                    chrome.storage.local.get([pageKey], async (result) => {
                        const savedImgHash = result[pageKey];
                        if (savedImgHash) {
                            const hashes = await Promise.all(collectedShown.map(url => hashUrl(url, 'img_')));
                            const foundIndex = hashes.indexOf(savedImgHash);
                            if (foundIndex !== -1) {
                                setIndex(foundIndex);
                            }
                        }
                    });
                });

                if (p.autoPlayOnStart) {
                    setAutoPlay(true);
                }

                // Preload images
                let dCount = 0;
                let fCount = 0;
                collectedShown.forEach(src => {
                    const isLocal = src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file://');
                    if (isLocal) {
                        dCount++;
                        setDownloadedCount(dCount);
                        setImageStates(prev => ({ ...prev, [src]: 'ready' }));
                        return;
                    }

                    setImageStates(prev => ({ ...prev, [src]: 'loading' }));
                    const img = new Image();
                    preloadedImagesRef.current[src] = img;
                    img.src = src;
                    img.onload = () => {
                        dCount++;
                        setDownloadedCount(dCount);
                        setImageStates(prev => ({ ...prev, [src]: 'ready' }));
                    };
                    img.onerror = () => {
                        fCount++;
                        setFailedCount(fCount);
                        setImageStates(prev => ({ ...prev, [src]: 'failed' }));
                    };
                });
            }
        });

        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
            stopAutoPlay();
        };
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

    useEffect(() => {
        let isCancelled = false;
        const cacheAllSizes = async () => {
            const allImages = [...allShownImages, ...allFilteredImages];
            for (const url of allImages) {
                if (isCancelled) break;
                if (imageSizeCache.current[url]) continue;

                if (url.startsWith('http')) {
                    try {
                        let sizeStr = 'Unknown';
                        const entries = performance.getEntriesByName(url) as PerformanceResourceTiming[];
                        if (entries.length > 0 && (entries[0].decodedBodySize || entries[0].transferSize)) {
                            const size = entries[0].decodedBodySize || entries[0].transferSize;
                            if (size > 0) sizeStr = formatSize(size);
                        }

                        if (sizeStr === 'Unknown' || sizeStr === '0 B') {
                            const response = await chrome.runtime.sendMessage({ type: 'getFileSize', url });
                            if (response && response.size) {
                                sizeStr = formatSize(response.size);
                            }
                        }

                        if (sizeStr !== 'Unknown' && sizeStr !== '0 B') {
                            imageSizeCache.current[url] = sizeStr;
                        }
                    } catch (e) {
                        console.error('Failed to pre-fetch image size', e);
                    }
                }
            }
        };

        cacheAllSizes();
        return () => {
            isCancelled = true;
        };
    }, [allShownImages, allFilteredImages]);

    useEffect(() => {
        const fetchAllRatings = async () => {
            const allImages = [...allShownImages, ...allFilteredImages];
            if (allImages.length === 0) return;
            const keysToUrl: Record<string, string> = {};
            const keys = await Promise.all(allImages.map(async (url) => {
                const key = await hashUrl(url);
                keysToUrl[key] = url;
                return key;
            }));

            chrome.storage.local.get(null, (result) => {
                const newRatings: Record<string, number> = {};
                for (const key of keys) {
                    if (result[key] !== undefined && keysToUrl[key]) {
                        newRatings[keysToUrl[key]] = result[key];
                    }
                }
                setImageRatings(newRatings);
            });
        };
        fetchAllRatings();
    }, [allShownImages, allFilteredImages]);

    useEffect(() => {
        if (mode !== 'slideshow' || shownImages.length === 0) return;

        let isActive = true;
        const url = shownImages[index];
        setCurrentImageInfo(null); // Reset while loading

        const fetchInfo = async () => {
            let sizeStr = 'Unknown';
            try {
                if (imageSizeCache.current[url]) {
                    sizeStr = imageSizeCache.current[url];
                } else if (url.startsWith('data:')) {
                    const base64Str = url.split(',')[1];
                    const padding = (base64Str.match(/=*$/) || [''])[0].length;
                    const sizeInBytes = Math.floor((base64Str.length * 3) / 4) - padding;
                    sizeStr = formatSize(sizeInBytes);
                } else if (url.startsWith('blob:')) {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    sizeStr = formatSize(blob.size);
                } else {
                    // Try to get from performance entries first
                    const entries = performance.getEntriesByName(url) as PerformanceResourceTiming[];
                    if (entries.length > 0 && (entries[0].decodedBodySize || entries[0].transferSize)) {
                        const size = entries[0].decodedBodySize || entries[0].transferSize;
                        if (size > 0) sizeStr = formatSize(size);
                    }

                    if (sizeStr === 'Unknown' || sizeStr === '0 B') {
                        // Fallback to asking background script to bypass CORS
                        const response = await chrome.runtime.sendMessage({ type: 'getFileSize', url });
                        if (response && response.size) {
                            sizeStr = formatSize(response.size);
                        }
                    }
                }

                // Cache the successful result
                if (sizeStr !== 'Unknown' && sizeStr !== '0 B') {
                    imageSizeCache.current[url] = sizeStr;
                }
            } catch (e) {
                console.error('Failed to get image size', e);
            }

            if (!isActive) return;

            const img = new Image();
            img.src = url;
            img.onload = () => {
                if (isActive) {
                    setCurrentImageInfo({
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        size: sizeStr
                    });
                }
            };
            img.onerror = () => {
                if (isActive) {
                    setCurrentImageInfo({
                        width: 0,
                        height: 0,
                        size: sizeStr
                    });
                }
            };
        };

        fetchInfo();

        return () => {
            isActive = false;
        };
    }, [index, shownImages, mode]);

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

    const copyImageUrl = (url: string) => {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Image URL copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy image URL');
        });
    };

    const handleSave = () => {
        chrome.runtime.sendMessage({
            type: 'downloadImages',
            title: document.title,
            url: location.href,
            images: shownImages
        });
    };

    const handleRatingChange = useCallback(async (newRating: number) => {
        const url = shownImages[index];
        if (!url) return;
        try {
            const key = await hashUrl(url);
            const currentRating = imageRatings[url];
            if (newRating === 0 || currentRating === newRating) {
                setImageRatings(prev => {
                    const next = { ...prev };
                    delete next[url];
                    return next;
                });
                chrome.storage.local.remove([key]);
                showToast('Rating removed');
            } else {
                setImageRatings(prev => ({ ...prev, [url]: newRating }));
                chrome.storage.local.set({ [key]: newRating });
                showToast(`Rated ${newRating} star${newRating > 1 ? 's' : ''}`);
            }
        } catch (e) {
            console.error('Failed to set rating', e);
            showToast('Failed to save rating');
        }
    }, [index, shownImages, imageRatings, showToast]);

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

    // Handle thumb bar wheel scrolling with passive: false to preventDefault
    useEffect(() => {
        const bar = thumbBarRef.current;
        if (!bar) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            bar.scrollLeft += e.deltaY;
        };

        bar.addEventListener('wheel', handleWheel, { passive: false });
        return () => bar.removeEventListener('wheel', handleWheel);
    }, [mode, isThumbCollapsed, shownImages.length]);

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

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.ctrlKey || e.metaKey) && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) {
                const currentImage = shownImages[index];
                if (currentImage) {
                    copyImageUrl(currentImage);
                }
                return;
            }

            e.stopPropagation();
            e.preventDefault();

            if (document.getElementById("slide-scale-image-overlay")) {
                if (e.key === 'Escape') removeScaleImageOverlay();
                return;
            }

            if (e.key >= '0' && e.key <= '5') {
                const ratingValue = parseInt(e.key, 10);
                handleRatingChange(ratingValue);
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
    }, [mode, autoPlay, isRandom, index, shownImages, showImage, unmount, showToast, handleRatingChange]);

    if (!prefs) return null;

    const isVertical = Math.abs(currentRotation / 90) % 2 === 1;
    const downloadedPercent = shownImages.length ? (downloadedCount / shownImages.length) * 100 : 0;
    const failedPercent = shownImages.length ? (failedCount / shownImages.length) * 100 : 0;

    const getThumbProps = (src: string, isFiltered: boolean) => {
        if (isFiltered) return { src, opacity: 0.3 };

        const state = imageStates[src] || 'loading';
        if (state === 'failed') return { src, opacity: 0.2 };
        if (state === 'loading') return { src: loadingPlaceholder, opacity: 0.5 };
        return { src, opacity: 1 };
    };

    return (
        <div id="slide-overlay" className="slideshow-overlay">
            <style>{slideshowStyles}</style>
            {/* Top Area */}
            <div className="slideshow-top-bar">
                <div className="slideshow-top-center">
                    {mode !== 'gallery' && (
                        <div className="slideshow-index-text">
                            {`${index + 1} / ${shownImages.length}`}
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <select
                            className="slideshow-rating-filter"
                            value={ratingFilter}
                            onChange={handleFilterChange}
                        >
                            <option value="all">All ({allShownImages.length}{allFilteredImages.length ? ` + ${allFilteredImages.length} filtered` : ''})</option>
                            <option value="unrated">Unrated ({filterCounts.unrated})</option>
                            <option value={1}>1 Star ({filterCounts[1]})</option>
                            <option value={2}>2 Stars ({filterCounts[2]})</option>
                            <option value={3}>3 Stars ({filterCounts[3]})</option>
                            <option value={4}>4 Stars ({filterCounts[4]})</option>
                            <option value={5}>5 Stars ({filterCounts[5]})</option>
                        </select>
                        {mode !== 'gallery' && (
                            <button onClick={() => applyFilter(ratingFilter)} className="slideshow-btn" title="Refresh current filter">
                                <RefreshCw size={16} />
                            </button>
                        )}
                    </div>
                    {mode === 'gallery' && (
                        <button onClick={copyFilteredUrls} className="slideshow-btn" title="Copy filtered URLs">
                            <Copy size={16} />
                        </button>
                    )}
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
                        <button onClick={switchMode} className="slideshow-btn" title="Switch View">
                            {(mode === 'slideshow') ? <LayoutGrid size={16} /> : <Images size={16} />}
                        </button>
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
                        title={shownImages[index]}
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
                            const rating = imageRatings[src];
                            return (
                                <div key={i} className="slideshow-gallery-wrapper" onClick={() => switchToSlideshow(i)} title={src}>
                                    <LazyImage src={thumbSrc} opacity={opacity} className="slideshow-gallery-img" />
                                    <div className="slideshow-gallery-index">{i + 1}</div>
                                    {rating && (
                                        <div className="slideshow-gallery-rating">
                                            <Star size={12} fill="#FFD700" color="#FFD700" />
                                            <span>{rating}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredImages.map((src, i) => {
                            const { src: thumbSrc, opacity } = getThumbProps(src, true);
                            const rating = imageRatings[src];
                            return (
                                <div key={`f-${i}`} className="slideshow-gallery-wrapper filtered" title={src}>
                                    <LazyImage src={thumbSrc} opacity={opacity} className="slideshow-gallery-img filtered" />
                                    <div className="slideshow-gallery-index">{shownImages.length + i + 1}</div>
                                    {rating && (
                                        <div className="slideshow-gallery-rating">
                                            <Star size={12} fill="#FFD700" color="#FFD700" />
                                            <span>{rating}</span>
                                        </div>
                                    )}
                                </div>
                            );
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
                            <div ref={thumbBarRef} className="slideshow-thumb-bar">
                                {shownImages.map((src, i) => {
                                    const { src: thumbSrc, opacity } = getThumbProps(src, false);
                                    const rating = imageRatings[src];
                                    return (
                                        <div key={i} className="slideshow-thumb-wrapper" onClick={() => showImage(i)} title={src}>
                                            <LazyImage
                                                src={thumbSrc}
                                                opacity={opacity}
                                                className={`slideshow-thumb-img ${i === index ? 'active' : 'inactive'}`}
                                            />
                                            <div className="slideshow-thumb-index">{i + 1}</div>
                                            {rating && (
                                                <div className="slideshow-thumb-rating">
                                                    <Star size={10} fill="#FFD700" color="#FFD700" />
                                                    <span>{rating}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="slideshow-thumb-nav" onClick={() => showImage(index + 1)}><ChevronRight size={24} /></div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Info Bar */}
            {mode === 'slideshow' && shownImages.length > 0 && (
                <div className="slideshow-bottom-info-bar">
                    <div className="slideshow-info-left">
                        <div className="slideshow-rating">
                            {[1, 2, 3, 4, 5].map((starIndex) => {
                                const currentRating = imageRatings[shownImages[index]] || null;
                                return (
                                    <button
                                        key={starIndex}
                                        className="slideshow-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRatingChange(starIndex);
                                        }}
                                        title={`Rate ${starIndex} star${starIndex > 1 ? 's' : ''}`}
                                        style={{ padding: '2px' }}
                                    >
                                        <Star
                                            size={14}
                                            fill={currentRating && currentRating >= starIndex ? '#FFD700' : 'none'}
                                            color={currentRating && currentRating >= starIndex ? '#FFD700' : 'currentColor'}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                        <span className="slideshow-info-geometry">
                            {currentImageInfo ? `${currentImageInfo.width} × ${currentImageInfo.height} px` : '...'}
                        </span>
                        <span className="slideshow-info-size">
                            {currentImageInfo ? currentImageInfo.size : '...'}
                        </span>
                    </div>
                    <div className="slideshow-info-right">
                        <span className="slideshow-info-url" title={shownImages[index]}>
                            {shownImages[index]}
                        </span>
                        <button onClick={() => copyImageUrl(shownImages[index])} className="slideshow-btn" title="Copy URL">
                            <Copy size={14} />
                        </button>
                    </div>
                </div>
            )}
            {autoPlay && <div className="slideshow-autoplay-progress" style={{ width: `${(1 - progress) * 100}%` }} />}
        </div>
    );
}

// Injection logic
export async function initSlideshow() {
    if (window.__slideOverlay) {
        removeScaleImageOverlay?.();
        window.__slideOverlay.unmount?.();
        window.__slideOverlay = null;
        document.body.style.overflow = "";
        return;
    }

    const prefs = await getConfig();
    const { shownImages, filteredImages } = collectImage(prefs);

    if (shownImages.length === 0 && filteredImages.length === 0) {
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: opacity 0.3s ease;
            pointer-events: none;
            text-align: center;
        `;
        popup.textContent = "No images found on this page.";
        document.body.appendChild(popup);

        setTimeout(() => {
            popup.style.opacity = '0';
            setTimeout(() => popup.remove(), 300);
        }, 3000);
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