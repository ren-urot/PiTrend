import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom doesn't implement the Pointer Events APIs that Radix UI's Select
// relies on for its interactions; polyfill them so userEvent clicks work.
window.HTMLElement.prototype.hasPointerCapture ??= () => false;
window.HTMLElement.prototype.releasePointerCapture ??= () => {};
window.HTMLElement.prototype.scrollIntoView ??= () => {};
