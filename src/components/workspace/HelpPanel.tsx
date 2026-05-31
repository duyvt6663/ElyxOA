'use client';

/**
 * DECISION RECAP — 020 Phase 4 help hub
 * - A dismissible panel reachable from the header so a user can rediscover guidance after onboarding:
 *   restart the tour + browse the full glossary. Works with no API key (020 success criterion 4).
 * - Closes on backdrop click, the × button, and Escape.
 */

import { useEffect } from 'react';
import { GLOSSARY } from '@/lib/ui-glossary';

export interface HelpPanelProps {
  onClose: () => void;
  onStartTour: () => void;
}

export default function HelpPanel({ onClose, onStartTour }: HelpPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Help and glossary"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-3">
          <h2 className="text-sm font-semibold">Help &amp; glossary</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="rounded px-2 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </header>
        <div className="space-y-4 p-4">
          <div className="rounded border border-blue-200 bg-blue-50 p-3">
            <div className="text-sm font-medium text-blue-900">New here?</div>
            <p className="mt-0.5 text-xs text-blue-800">
              A 90-second tour walks the core story: a plan becomes an adaptive calendar you can explain and edit.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
            >
              Take the tour
            </button>
          </div>
          <div>
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Glossary</h3>
            <dl className="space-y-2">
              {Object.entries(GLOSSARY).map(([key, e]) => (
                <div key={key}>
                  <dt className="text-xs font-semibold text-gray-900">{e.label}</dt>
                  <dd className="text-xs text-gray-600">{e.explanation}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
