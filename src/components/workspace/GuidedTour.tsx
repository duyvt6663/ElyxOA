'use client';

/**
 * DECISION RECAP — 020 guided tour overlay
 * - Spotlights a `data-tour-id` target with a box-shadow "hole" + ring, and shows a fixed callout at
 *   the bottom (a bottom-sheet that works on every viewport — 020 mobile guidance). A full-screen
 *   blocker keeps the app non-interactive mid-tour; the callout sits above it.
 * - The target is re-located on each step (after `onPrepare` switches tab/selection) and kept aligned
 *   on scroll/resize. If a target isn't visible (e.g. wrong mobile pane), it dims the whole screen and
 *   still shows the callout — graceful degradation, never a blank highlight.
 * - Respects prefers-reduced-motion implicitly (instant scroll/positioning, no animation).
 */

import { useEffect, useState } from 'react';
import { TOUR_STEPS, type TourStep } from './tourSteps';

export interface GuidedTourProps {
  stepIndex: number;
  onPrepare: (step: TourStep) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

function visibleTarget(tourId: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-id="${tourId}"]`));
  return els.find((el) => el.offsetParent !== null) ?? els[0] ?? null;
}

export default function GuidedTour({ stepIndex, onPrepare, onBack, onNext, onSkip, onFinish }: GuidedTourProps) {
  const step = TOUR_STEPS[stepIndex];
  const [rect, setRect] = useState<DOMRect | null>(null);

  // On step change: prepare the app, then locate + scroll to the target and spotlight it.
  useEffect(() => {
    if (!step) return;
    onPrepare(step);
    const t = setTimeout(() => {
      const el = visibleTarget(step.tourId);
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Keep the spotlight aligned while the tour is open.
  useEffect(() => {
    if (!step) return;
    const update = () => {
      const el = visibleTarget(step.tourId);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Escape skips the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSkip]);

  if (!step) return null;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Guided tour: ${step.title}`}>
      {rect ? (
        <div
          className="pointer-events-none fixed rounded ring-2 ring-blue-400"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
          }}
        />
      ) : (
        <div className="pointer-events-auto fixed inset-0 bg-slate-900/55" />
      )}
      {/* Click blocker (pointer-events-auto). For an interactive step with a located target, cut a hole
          (4 strips around the rect) — the container is pointer-events-none, so the un-blocked rect passes
          clicks/hovers through to the spotlighted element; otherwise block the whole screen. */}
      {step.interactive && rect ? (
        <>
          <div className="pointer-events-auto fixed left-0 right-0 top-0" style={{ height: Math.max(0, rect.top - 4) }} />
          <div className="pointer-events-auto fixed bottom-0 left-0 right-0" style={{ top: rect.bottom + 4 }} />
          <div className="pointer-events-auto fixed left-0" style={{ top: rect.top - 4, height: rect.height + 8, width: Math.max(0, rect.left - 4) }} />
          <div className="pointer-events-auto fixed right-0" style={{ top: rect.top - 4, height: rect.height + 8, left: rect.right + 4 }} />
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0" />
      )}

      <section className="pointer-events-auto fixed bottom-4 left-1/2 z-10 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-blue-600">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </div>
        <h2 className="text-sm font-semibold text-gray-900">{step.title}</h2>
        <p className="mt-1 text-sm text-gray-600">{step.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onSkip} className="mr-auto text-xs text-gray-400 hover:text-gray-600">
            Skip tour
          </button>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onBack}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button type="button" onClick={onFinish} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
              Finish
            </button>
          ) : (
            <button type="button" onClick={onNext} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
