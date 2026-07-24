'use client';

import { HomeCapture } from '@/components/home/HomeCapture';
import { useAtlasUi } from './AtlasUiProvider';

/**
 * Capture, docked to the bottom of every page. This is the obvious path — a
 * box that's always right there, thumb-reachable on mobile — with ⌘K as the
 * power path behind it.
 */
export function CaptureDock() {
  const { captureContext, clearCaptureContext, captureFocusToken } = useAtlasUi();

  return (
    <div className="capture-dock">
      <div className="capture-dock-inner">
        <HomeCapture
          context={captureContext}
          onClearContext={clearCaptureContext}
          focusToken={captureFocusToken}
        />
      </div>
    </div>
  );
}
