'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * FASE 10B. Keyboard behaviour every `role="dialog"` with `aria-modal="true"`
 * has to honour, in one place instead of five.
 *
 * The dialogs already declared `aria-modal`, which tells assistive technology
 * that the rest of the page is inert. Nothing enforced it: focus stayed on the
 * element that opened the dialog, Tab walked straight out into the page behind,
 * and Escape did nothing. This hook makes the declaration true.
 *
 * `dismissible` mirrors the disabled state of each dialog's close control, so
 * Escape cannot abandon an in-flight submission that the close button itself
 * refuses to interrupt.
 */

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

export function useModalDialog<T extends HTMLElement>(
  onDismiss: () => void,
  dismissible: boolean,
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  // Kept in refs so the listener registers once: an inline `onCancel` arrow
  // would otherwise re-subscribe on every render.
  const dismissRef = useRef(onDismiss);
  const dismissibleRef = useRef(dismissible);
  // Synced in an effect rather than during render: a ref must not be mutated
  // while rendering. Running after every commit keeps both values current for
  // the listener registered once below.
  useEffect(() => {
    dismissRef.current = onDismiss;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Move focus inside so the first Tab continues within the dialog rather
    // than resuming from wherever the trigger sat.
    const initial = focusableElements(container)[0];
    if (initial) {
      initial.focus();
    } else {
      container.tabIndex = -1;
      container.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!dismissibleRef.current) return;
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(container!);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back in if it escaped the dialog.
      if (event.shiftKey && (active === first || !container!.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Returning focus to the trigger keeps the keyboard position the user
      // had before opening the dialog.
      previouslyFocused?.focus();
    };
  }, []);

  return containerRef;
}
