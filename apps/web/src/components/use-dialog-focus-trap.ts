'use client';

import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );
}

export function getTrappedFocusTarget(
  focusable: readonly HTMLElement[],
  activeElement: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  if (focusable.length === 0) return null;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function useDialogFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const closeDialog = useEffectEvent(onClose);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const restoreTarget =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => getFocusableElements(container)[0]?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusTarget = getTrappedFocusTarget(
        getFocusableElements(container),
        document.activeElement,
        event.shiftKey,
      );
      if (focusTarget !== null) {
        event.preventDefault();
        focusTarget.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      restoreTarget?.focus();
    };
  }, [containerRef]);
}
