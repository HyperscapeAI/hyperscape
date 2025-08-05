// Browser polyfills for server-side Three.js/GLTF loading
// This file sets up global browser-like objects needed by Three.js loaders

/* eslint-disable @typescript-eslint/no-explicit-any */

// Set up self global with URL support for GLTFLoader
(globalThis as unknown as any).self = globalThis;
(globalThis as unknown as any).self.URL = URL;
(globalThis as unknown as any).self.webkitURL = URL;

// Ensure URL is available globally
if (!(globalThis as unknown as any).URL) {
  (globalThis as unknown as any).URL = URL;
}

// Set up window global
(globalThis as unknown as any).window = globalThis;

// Add location object needed by PhysX loader
(globalThis as unknown as any).window.location = {
  origin: 'http://localhost:4444',
  href: 'http://localhost:4444',
  protocol: 'http:',
  host: 'localhost:4444',
  hostname: 'localhost',
  port: '4444',
  pathname: '/',
  search: '',
  hash: ''
};

// Basic document mock for loaders that check for it
(globalThis as unknown as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      // Mock canvas for image loading
      return {
        style: {},
        width: 1024,
        height: 1024,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) })
        }),
        addEventListener: () => {},
        removeEventListener: () => {}
      };
    }
    return {
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  },
  // Add URL for document base URL resolution
  URL: URL,
  baseURI: 'http://localhost:4444'
};

// Add performance API if not available
if (!(globalThis as unknown as any).performance) {
  (globalThis as unknown as any).performance = {
    now: () => Date.now(),
    timeOrigin: Date.now()
  };
}

// Add path normalization support
import path from 'path';
if (!(globalThis as unknown as any).path) {
  (globalThis as unknown as any).path = path;
}

// PhysX loader needs nodePath
if (!(globalThis as unknown as any).nodePath) {
  (globalThis as unknown as any).nodePath = path;
}

// Ensure require is available for PhysX module
if (typeof require === 'undefined' && !(globalThis as unknown as any).require) {
  (globalThis as unknown as any).require = (id: string) => {
    if (id === 'path') return path;
    if (id === 'fs') return null; // PhysX checks for fs but doesn't need it in browser mode
    throw new Error(`Module not found: ${id}`);
  };
}

// Add __dirname and __filename for modules that might need them
if (typeof __dirname === 'undefined') {
  (globalThis as unknown as any).__dirname = process.cwd();
}
if (typeof __filename === 'undefined') {
  (globalThis as unknown as any).__filename = import.meta.url;
}

// Export empty object to make this a module
export {}