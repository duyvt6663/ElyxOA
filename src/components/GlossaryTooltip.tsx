'use client';

/**
 * DECISION RECAP — 020 Phase 1 accessible glossary tooltip (022 G1: portal + flip)
 * - Explains a compact tag without permanent clutter. Opens on hover AND focus, toggles open on
 *   click/tap, closes on mouse-leave, blur, Escape, and outside pointerdown.
 * - NESTABLE inside clickable rows: the trigger is a role="button" span (not a real <button>, which
 *   would be invalid inside the day/row buttons), and click/keys stopPropagation so they never fire
 *   the parent row's selection.
 * - 022 G1: the popover is PORTALED to <body> with fixed position, so it escapes the workspace's
 *   overflow clipping and the sticky tab bar; it flips BELOW the trigger when there isn't room above
 *   (top-of-viewport tags), and clamps to the viewport horizontally.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, type GlossaryKey } from '@/lib/ui-glossary';

export interface GlossaryTooltipProps {
  term: GlossaryKey;
  children: ReactNode;
  className?: string;
}

const POP_W = 224; // px

export default function GlossaryTooltip({ term, children, className = '' }: GlossaryTooltipProps) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 120; // not enough room above near the top → flip below
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
      setPos({ top: below ? r.bottom + 6 : r.top - 6, left, below });
    };
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('pointerdown', onDoc);
    };
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
        aria-label={`${entry.label}: ${entry.explanation}`}
        className="cursor-help"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
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
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: POP_W,
              transform: pos.below ? undefined : 'translateY(-100%)',
            }}
            className="z-[60] rounded border border-gray-200 bg-white p-2 text-left text-[11px] font-normal normal-case leading-snug text-gray-700 shadow-lg"
          >
            <span className="block font-medium text-gray-900">{entry.label}</span>
            <span className="mt-0.5 block">{entry.explanation}</span>
          </span>,
          document.body
        )}
    </span>
  );
}
