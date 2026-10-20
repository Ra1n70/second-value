/// <reference types="vite/client" />

// Keep HTML out of the public asset directory so /index.html remains the solo
// game and is never normalized to the multiplayer root by static hosting.
const sources = import.meta.glob('./client/*.{html,js,css}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

export const gamePages: Record<string, string> = Object.fromEntries(
  Object.entries(sources).map(([filename, source]) => [filename.split('/').at(-1)!, source]),
);
