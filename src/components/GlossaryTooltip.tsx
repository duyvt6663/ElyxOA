'use client';

/**
 * DECISION RECAP — 020 Phase 1 accessible glossary tooltip
 * - Explains a compact tag without permanent clutter. Opens on hover AND focus, toggles on
 *   click/tap, closes on Escape (020 design decision 2: native `title` is insufficient).
 * - NESTABLE inside clickable rows: the trigger is a role="button" span (not a real <button>, which
 *   would be invalid inside the day/row buttons), and click/keys stopPropagation so they never fire
 *   the parent row's selection (020: "must not break the parent row's click target").
 * - The popover is absolutely positioned so it never shifts layout.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryKey } from '@/lib/ui-glossary';

export interface GlossaryTooltipProps {
  term: GlossaryKey;
  children: ReactNode;
  className?: string;
}

export default function GlossaryTooltip({ term, children, className = '' }: GlossaryTooltipProps) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  // Touch dismissal: hover/blur don't fire reliably on touch, so close on a pointerdown outside.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        // The full explanation is on the trigger too, so screen readers get it without the popover.
        aria-label={`${entry.label}: ${entry.explanation}`}
        className="cursor-help"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Click/tap OPENS (not toggles): on desktop, hover already opened it, so a toggle would
        // close it; on touch, the outside-pointerdown above handles dismissal.
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded border border-gray-200 bg-white p-2 text-left text-[11px] font-normal normal-case leading-snug text-gray-700 shadow-lg"
        >
          <span className="block font-medium text-gray-900">{entry.label}</span>
          <span className="mt-0.5 block">{entry.explanation}</span>
        </span>
      )}
    </span>
  );
}
