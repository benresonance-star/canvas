import React from 'react';
import { strings } from './content/strings.js';
import { useAppShell } from './features/workspace/useAppShell.js';
import { CanvasWorkspaceView } from './features/workspace/CanvasWorkspaceView.jsx';

export default function ProjectCanvas() {
  const { loaded, viewProps } = useAppShell();

  if (!loaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-canvas text-muted font-serif italic">
        {strings.loadingCanvas}
      </div>
    );
  }

  return <CanvasWorkspaceView {...viewProps} />;
}
