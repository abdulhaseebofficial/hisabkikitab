import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useViewport, { getViewportState } from './useViewport';

describe('useViewport hook', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    vi.restoreAllMocks();
  });

  it('correctly calculates desktop breakpoint for width >= 1024', () => {
    const state = getViewportState(1200);
    expect(state.isDesktop).toBe(true);
    expect(state.isTablet).toBe(false);
    expect(state.isMobile).toBe(false);
  });

  it('correctly calculates tablet breakpoint for 768 <= width < 1024', () => {
    const state = getViewportState(800);
    expect(state.isDesktop).toBe(false);
    expect(state.isTablet).toBe(true);
    expect(state.isMobile).toBe(false);
  });

  it('correctly calculates mobile breakpoint for width < 768', () => {
    const state = getViewportState(375);
    expect(state.isDesktop).toBe(false);
    expect(state.isTablet).toBe(false);
    expect(state.isMobile).toBe(true);
  });

  it('updates state dynamically when window resizes', () => {
    window.innerWidth = 1200;
    const { result } = renderHook(() => useViewport());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isDesktop).toBe(true);

    act(() => {
      window.innerWidth = 500;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(true);
    expect(result.current.isDesktop).toBe(false);

    act(() => {
      window.innerWidth = 1024;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isDesktop).toBe(true);
  });
});
