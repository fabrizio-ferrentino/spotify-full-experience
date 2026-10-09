// Firefox exposes the promise-based `browser` namespace; Chromium only has `chrome`.
// In Manifest V3 both return promises from storage APIs.
declare const browser: typeof chrome | undefined;

export const ext: typeof chrome = typeof browser !== 'undefined' ? browser : chrome;
