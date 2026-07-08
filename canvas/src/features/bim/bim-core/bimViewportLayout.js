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

/** End padding on the toolbar row when the view navigator gimbal is visible. */
export const BIM_VIEWPORT_GIMBAL_RESERVE_CLASS = 'pe-[5rem]';

export const BIM_VIEWPORT_TOOLBAR_SURFACE_CLASS =
  'pointer-events-auto flex w-max max-w-full flex-wrap items-center justify-center gap-y-1 overflow-x-hidden rounded-md border border-border bg-surface/95 px-2 py-1.5 shadow-lg backdrop-blur-sm';

export function resolveBimViewportHudTopPx(toolbarBottomPx) {
  return toolbarBottomPx + BIM_VIEWPORT_CHROME_GAP_PX;
}

/** Top offset for left/right HUD stacks (`top-3`). */
export const BIM_VIEWPORT_HUD_TOP_PX = 12;

/** Bottom inset shared by carousel and floating chrome (`bottom-3`). */
export const BIM_VIEWPORT_BOTTOM_INSET_PX = 12;

export function resolveBimLayersHudMaxHeightPx({
  viewportHeight,
  carouselTopPx = null,
  gapPx = BIM_VIEWPORT_CHROME_GAP_PX,
} = {}) {
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  if (carouselTopPx != null && Number.isFinite(carouselTopPx)) {
    return Math.max(0, carouselTopPx - BIM_VIEWPORT_HUD_TOP_PX - gapPx);
  }
  return Math.max(
    0,
    safeViewportHeight - BIM_VIEWPORT_HUD_TOP_PX - BIM_VIEWPORT_BOTTOM_INSET_PX - gapPx,
  );
}

export function applyBimViewportToolbarLayout(container, toolbarBottomPx) {
  if (!container) return;
  const hudTopPx = resolveBimViewportHudTopPx(toolbarBottomPx);
  container.style.setProperty('--bim-viewport-toolbar-bottom', `${toolbarBottomPx}px`);
  container.style.setProperty('--bim-viewport-hud-top', `${hudTopPx}px`);
}
