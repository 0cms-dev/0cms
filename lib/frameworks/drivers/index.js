import { astro } from './astro.js';
import { hexo } from './hexo.js';
import { nextjs } from './nextjs.js';
import { genericVite } from './generic-vite.js';

/**
 * drivers/index.js
 * The central registry of all framework drivers.
 * This makes it incredibly easy for newcomers to see supported 
 * frameworks and add their own.
 */
export const DRIVERS = [
  astro,
  hexo,
  nextjs,
  genericVite
];
