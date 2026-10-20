import { useState, useEffect } from 'react';

/**
 * Standard Tailwind breakpoints:
 * - Mobile: < 768px (below 'md')
 * - Tablet: >= 768px && < 1024px ('md' to 'lg')
 * - Desktop: >= 1024px ('lg' and up)
 */
export function getViewportState(width = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}

export default function useViewport() {
  const [viewport, setViewport] = useState(() => getViewportState());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setViewport(getViewportState(window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    // Also trigger on orientation change for mobile/tablet
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return viewport;
}
