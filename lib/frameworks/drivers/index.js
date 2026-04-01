import astro from './astro.js';
import hexo from './hexo.js';
import nextjs from './nextjs.js';
import nuxt from './nuxt.js';
import sveltekit from './sveltekit.js';
import remix from './remix.js';
import eleventy from './eleventy.js';
import docusaurus from './docusaurus.js';
import vitepress from './vitepress.js';
import starlight from './starlight.js';
import gatsby from './gatsby.js';
import solidstart from './solidstart.js';
import hugo from './hugo.js';
import jekyll from './jekyll.js';
import fresh from './fresh.js';
import zola from './zola.js';
import genericVite from './generic-vite.js';

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
  nuxt,
  sveltekit,
  remix,
  eleventy,
  docusaurus,
  vitepress,
  starlight,
  gatsby,
  solidstart,
  hugo,
  jekyll,
  fresh,
  zola,
  genericVite
];
