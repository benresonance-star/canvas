/** Reserved top offset for floating side panels and HUD stacks below the toolbar. */
export const BIM_VIEWPORT_FLOATING_PANEL_TOP_CLASS = 'top-14';

/** Bottom inset for floating side panels. */
export const BIM_VIEWPORT_FLOATING_PANEL_BOTTOM_CLASS = 'bottom-3';

/** @deprecated Use BIM_VIEWPORT_FLOATING_PANEL_TOP_CLASS for floating panel layout. */
export const BIM_VIEWPORT_TOOLBAR_CHROME_CLASS = 'pt-14';

/** Gap between the floating viewport toolbar and HUD / side panel content. */
export const BIM_VIEWPORT_CHROME_GAP_PX = 8;

/** Fallback toolbar bottom offset when layout has not been measured yet. */
export const BIM_VIEWPORT_TOOLBAR_FALLBACK_BOTTOM_PX = 48;

export const BIM_VIEWPORT_TOOLBAR_OVERLAY_CLASS =
  'pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3';

export function resolveBimViewportHudTopPx(toolbarBottomPx) {
  return toolbarBottomPx + BIM_VIEWPORT_CHROME_GAP_PX;
}

export function applyBimViewportToolbarLayout(container, toolbarBottomPx) {
  if (!container) return;
  const hudTopPx = resolveBimViewportHudTopPx(toolbarBottomPx);
  container.style.setProperty('--bim-viewport-toolbar-bottom', `${toolbarBottomPx}px`);
  container.style.setProperty('--bim-viewport-hud-top', `${hudTopPx}px`);
}
