import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { measureSupplementalContrast } from './contrast-measurements';

/** The existing whole-app regression's thirteen routes, including compatibility URLs. */
export const AUDIT_ROUTES = [
  '/today', '/tasks', '/calendar', '/goals', '/habits', '/journal', '/notes',
  '/fitness', '/finance', '/progress', '/everything', '/week', '/settings',
] as const;

export async function measureScreen(page: Page, route: string, theme: 'light' | 'dark') {
  const geometry = await page.evaluate(() => {
    const describe = (el: Element) => ({
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
      name: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '').trim().slice(0, 100),
    });
    const visible = (el: Element) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const controls = Array.from(document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="checkbox"], [role="tab"], [role="option"], [role="switch"], [tabindex]:not([tabindex="-1"])',
    )).filter(visible);
    const targets = controls.map((el) => {
      const rect = el.getBoundingClientRect();
      return { ...describe(el), width: rect.width, height: rect.height };
    });
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, select'))
      .filter(visible).map((el) => ({ ...describe(el), fontSize: Number.parseFloat(getComputedStyle(el).fontSize) }));
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    return {
      viewportWidth, scrollWidth, overflow: Math.max(0, scrollWidth - viewportWidth),
      pageHeight: document.documentElement.scrollHeight,
      controlCount: targets.length,
      undersizedTargets: targets.filter((el) => el.width < 24 || el.height < 24),
      textInputCount: inputs.length,
      undersizedInputs: inputs.filter((el) => el.fontSize < 16),
      // Negative-left clipping does not increase document.scrollWidth. Floating
      // surfaces must be checked explicitly; do not confuse offscreen with no overflow.
      offscreenSurfaces: Array.from(document.querySelectorAll('[role="dialog"], .task-goal-menu')).filter(visible).flatMap((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.right > viewportWidth ? [{ ...describe(el), left: r.left, right: r.right }] : [];
      }),
      overflowingElements: Array.from(document.querySelectorAll('body *')).filter(visible).flatMap((el) => {
        const r = el.getBoundingClientRect();
        // Diagnostic candidates only: descendants of an intentional scroller can appear here.
        return r.right > viewportWidth || r.left < 0 ? [{ ...describe(el), left: r.left, right: r.right }] : [];
      }).slice(0, 60),
    };
  });
  // No tags or impact filtering: all violations, including best-practice rules.
  const axe = await new AxeBuilder({ page }).analyze();
  return {
    route, resolvedUrl: page.url(), theme, ...geometry,
    supplementalContrast: await measureSupplementalContrast(page),
    violations: axe.violations.map(({ id, impact, description, nodes }) => ({
      id, impact, description, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
    incomplete: axe.incomplete.map(({ id, nodes }) => ({
      id, targets: nodes.map((n) => n.target),
      nodes: nodes.map(({ target, failureSummary, any, all, none }) => ({
        target, failureSummary,
        checks: [...any, ...all, ...none].map(({ id, message, data }) => ({ id, message, data })),
      })),
    })),
  };
}

export function screenFailures(report: Awaited<ReturnType<typeof measureScreen>>): string[] {
  const prefix = `${report.route} (${report.theme})`;
  return [
    ...(report.overflow > 0 ? [`${prefix}: horizontal overflow ${report.overflow}px`] : []),
    ...report.offscreenSurfaces.map((surface) => `${prefix}: surface outside viewport ${surface.left}..${surface.right} ${surface.tag}.${surface.className}`),
    ...report.undersizedTargets.map((t) => `${prefix}: target ${t.width}x${t.height} ${t.tag}.${t.className} ${t.name}`),
    ...report.undersizedInputs.map((t) => `${prefix}: input font ${t.fontSize}px ${t.tag}.${t.className} ${t.name}`),
    ...report.supplementalContrast.filter((sample) => sample.minimumRatio === null || sample.minimumRatio < 4.5)
      .map((sample) => `${prefix}: supplemental contrast ${sample.target}: ${sample.unsupported ?? sample.minimumRatio?.toFixed(2)}`),
    ...report.violations.map((v) => `${prefix}: axe ${v.id} (${v.impact}) on ${v.nodes.length} element(s)`),
  ];
}
