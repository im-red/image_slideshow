import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { logger } from "../logger";
import './options.css';

function Options() {
    const [prefs, setPrefs] = useState({
        autoPlayOnStart: true,
        interval: 3,
        minWidth: 100,
        minHeight: 100,
        showBigImage: true,
        showSmallImage: false,
        showBgImage: false,
        sequentialDownload: false,
    });

    useEffect(() => {
        chrome.storage.sync.get(prefs, (loadedPrefs) => {
            setPrefs(loadedPrefs as typeof prefs);
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, type, checked, value } = e.target;
        setPrefs(prev => ({
            ...prev,
            [id]: type === 'checkbox' ? checked : Number(value)
        }));
    };

    const handleSave = () => {
        chrome.storage.sync.set(prefs, () => {
            logger.success("Options saved!");
            alert("Options saved!");
        });
    };

    return (
        <div className="options-container">
            <h1>Slideshow Settings</h1>

            <label className="options-label">
                <input id="autoPlayOnStart" type="checkbox" checked={prefs.autoPlayOnStart} onChange={handleChange} />
                Auto play on start
            </label>

            <label htmlFor="interval" className="options-label">Auto play interval (s)</label>
            <input id="interval" type="number" min="1" value={prefs.interval} onChange={handleChange} className="options-input-number" />

            <label htmlFor="minWidth" className="options-label">Small image threshold width (px)</label>
            <input id="minWidth" type="number" min="1" value={prefs.minWidth} onChange={handleChange} className="options-input-number" />

            <label htmlFor="minHeight" className="options-label">Small image threshold height (px)</label>
            <input id="minHeight" type="number" min="1" value={prefs.minHeight} onChange={handleChange} className="options-input-number" />

            <label className="options-label">Display</label>
            <div className="options-group">
                <label className="options-checkbox-label">
                    <input id="showBigImage" type="checkbox" checked={prefs.showBigImage} onChange={handleChange} />Big image
                </label>
                <label className="options-checkbox-label">
                    <input id="showSmallImage" type="checkbox" checked={prefs.showSmallImage} onChange={handleChange} />Small image
                </label>
                <label className="options-checkbox-label">
                    <input id="showBgImage" type="checkbox" checked={prefs.showBgImage} onChange={handleChange} />Background image
                </label>
            </div>

            <label className="options-label">Download</label>
            <div className="options-group">
                <label className="options-checkbox-label">
                    <input id="sequentialDownload" type="checkbox" checked={prefs.sequentialDownload} onChange={handleChange} />Download images one by one
                </label>
            </div>

            <button onClick={handleSave} className="options-save-btn">Save</button>
        </div>
    );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Options />);