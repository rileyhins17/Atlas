import type { Page } from '@playwright/test';
import { contrast, luminance } from '@atlas/shared';

/** Supplement the specific short-text/gradient checks axe cannot calculate. */
export async function measureSupplementalContrast(page: Page) {
  const samples = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgb = (value: string) => {
      if (!CSS.supports('color', value)) throw new Error(`Unsupported colour: ${value}`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: r!, g: g!, b: b!, a: a! };
    };
    const splitStops = (value: string) => {
      let depth = 0; let start = 0; const parts: string[] = [];
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        if (value[i] === ')') depth--;
        if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
      }
      parts.push(value.slice(start));
      return parts;
    };
    return Array.from(document.querySelectorAll('.nownext *, .prog-habit-pct'))
      .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        && Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
      .map((el) => {
        const target = `${el.tagName.toLowerCase()}.${el.className}`;
        const foreground = rgb(getComputedStyle(el).color);
        let ancestor: Element | null = el;
        let backgrounds: ReturnType<typeof rgb>[] = [];
        let method = 'solid ancestor';
        let unsupported: string | null = null;
        if (foreground.a !== 255) unsupported = 'translucent foreground';
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          if (Number(style.opacity) !== 1) unsupported = 'ancestor opacity';
          if (style.backgroundImage !== 'none') {
            if (!ancestor.matches('.nownext') || !style.backgroundImage.startsWith('linear-gradient(')) {
              unsupported = 'unexpected background image'; break;
            }
            // Read actual computed stops; reject unsupported colour spaces/forms.
            const parts = splitStops(style.backgroundImage.slice(16, -1));
            if (parts[0]?.includes(' in ') && !parts[0].includes('in srgb')) unsupported = 'unsupported gradient interpolation';
            const stops = parts.slice(1);
            backgrounds = stops.map((stop) => {
              const colour = stop.trim().match(/^(rgba?\([^)]*\)|color\([^)]*\))/)?.[0];
              if (!colour) throw new Error(`Unsupported gradient stop: ${stop}`);
              return rgb(colour);
            });
            method = 'conservative RGB bounds across computed gradient stops';
            break;
          }
          const background = rgb(style.backgroundColor);
          if (background.a === 255) { backgrounds = [background]; break; }
          if (background.a !== 0) { unsupported = 'translucent background'; break; }
          ancestor = ancestor.parentElement;
        }
        if (backgrounds.length === 0 || backgrounds.some((c) => c.a !== 255)) unsupported ??= 'no opaque background';
        return { target, text: el.textContent?.trim(), foreground, backgrounds, method, unsupported };
      });
  });
  return samples.map((sample) => {
    if (sample.unsupported) return { ...sample, minimumRatio: null };
    // Luminance increases with every sRGB channel. Component-wise bounds cover
    // every interpolated stop colour, even when channels move in opposite directions.
    const low = { r: Math.min(...sample.backgrounds.map((c) => c.r)), g: Math.min(...sample.backgrounds.map((c) => c.g)), b: Math.min(...sample.backgrounds.map((c) => c.b)) };
    const high = { r: Math.max(...sample.backgrounds.map((c) => c.r)), g: Math.max(...sample.backgrounds.map((c) => c.g)), b: Math.max(...sample.backgrounds.map((c) => c.b)) };
    const fg = luminance(sample.foreground);
    const minimumRatio = fg >= luminance(low) && fg <= luminance(high)
      ? 1 : Math.min(contrast(sample.foreground, low), contrast(sample.foreground, high));
    return { ...sample, minimumRatio };
  });
}
