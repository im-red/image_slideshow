export {};

declare global {
  interface Window {
    __slideshowConfig?: any;
    __slideThumbInitialized?: boolean;
    __slideOverlay?: {
      remove: () => void;
      unmount?: () => void;
    } | null;
  }
  function importScripts(...urls: string[]): void;
}

declare module '*?script' {
  const content: string;
  export default content;
}