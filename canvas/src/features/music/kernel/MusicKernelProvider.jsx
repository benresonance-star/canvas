import React, { createContext, useContext, useMemo } from 'react';
import { MusicKernel } from './MusicKernel.js';

const MusicKernelContext = createContext(null);

export function MusicKernelProvider({ children, kernel = null }) {
  const value = useMemo(() => kernel ?? new MusicKernel(), [kernel]);
  return (
    <MusicKernelContext.Provider value={value}>
      {children}
    </MusicKernelContext.Provider>
  );
}

export function useMusicKernel() {
  const kernel = useContext(MusicKernelContext);
  if (!kernel) throw new Error('useMusicKernel must be used within MusicKernelProvider');
  return kernel;
}
