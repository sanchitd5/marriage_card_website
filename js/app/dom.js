export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const $ = (selector, context = document) => context.querySelector(selector);
export const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
