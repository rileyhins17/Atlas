/**
 * The default style, outside the 'use client' module so the server-rendered
 * root layout can read it — see lib/theme/style.ts.
 */
export type UiStyle = 'classic' | 'soft';

export const DEFAULT_STYLE: UiStyle = 'soft';
