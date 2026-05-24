import { logger } from "../utils/logger";

export async function genThumb(src: string, maxWidth = 200, maxHeight = 200, quality = 0.7): Promise<string> {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({
            type: "fetchImageThumb",
            url: src,
            maxW: maxWidth,
            maxH: maxHeight,
            quality: quality
        }, response => {
            resolve(response.thumbBlobUrl);
        });
    });
}
