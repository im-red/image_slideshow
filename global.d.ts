export {};

declare global {
  interface Window {
    __slideshowConfig?: any;
    __slideOverlay?: {
      remove: () => void;
      unmount?: () => void;
    } | null;
  }
}

declare module '*?script' {
  const content: string;
  export default content;
}