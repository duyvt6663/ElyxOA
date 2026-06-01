'use client';

/**
 * DECISION RECAP — 019 Phase 3 Draft edit preview
 * - Renders a draft schedule edit (a setTemporalPolicy tool call) as a PREVIEW the user must Apply
 *   (decision 4: no silent mutations). On mount it computes the preview by rerunning the scheduler
 *   on a patched copy and diffing vs the current result — no commit.
 * - Apply commits the patch (workspace mutates inputs + reruns + snapshots for undo). Discard leaves
 *   the schedule unchanged. An infeasible/invalid patch shows the blocking reason and cannot Apply.
 */

import { useMemo, useState } from 'react';
import type { SchedulePatch, ScheduleDiff } from '@/lib/schedule-patch';
import type { PatchPreview } from './AllocatorWorkspace';
import GlossaryTooltip from '../GlossaryTooltip';

export interface DraftPatchPreviewProps {
  patch: SchedulePatch;
  onPreview: (patch: SchedulePatch) => PatchPreview;
  onApply: (patch: SchedulePatch) => { error: string } | null;
  /** 019 Phase 3/4 — send a follow-up chat turn grounded in the preview's deterministic skip data. */
  onExplain: (prompt: string) => void;
}

export default function DraftPatchPreview({ patch, onPreview, onApply, onExplain }: DraftPatchPreviewProps) {
  // Compute the preview for this draft (the scheduler rerun is synchronous). `patch` is rebuilt on
  // every parent render (ChatSurface re-parses the tool part), so this memo recomputes each render —
  // intended, so a still-streaming tool input is tracked. But once Apply commits the patch into the
  // schedule, recomputing would diff the already-updated schedule against re-applying the same patch
  // and collapse to "No schedule change — already placed there". So we freeze the committed preview at
  // Apply time and keep showing it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const livePreview = useMemo(() => onPreview(patch), [patch]);
  const [appliedPreview, setAppliedPreview] = useState<PatchPreview | null>(null);
  const preview = appliedPreview ?? livePreview;
  const description = preview.description;
  const [state, setState] = useState<'pending' | 'applied' | 'discarded'>('pending');
  const [applyError, setApplyError] = useState<string | null>(null);

  // 019 Phase 3 rejection-explanation + Phase 4 why-not: compose a prompt from the DETERMINISTIC skip
  // reasons + feasible alternatives, so the assistant narrates from validator output, not intuition.
  function explainPrompt(): string {
    if (!('diff' in preview)) return '';
    const skips = preview.diff.nowSkipped.slice(0, 5).map((s) => `${s.title} on ${s.date} (${s.reason})`).join('; ');
    const better = (preview.alternatives ?? []).filter((a) => a.skipped < preview.diff.nowSkipped.length);
    const alts = better.map((a) => `${a.window} (${a.skipped} skipped)`).join(', ');
    return `If I "${description}", these actions get skipped: ${skips}.${alts ? ` Windows with fewer skips: ${alts}.` : ''} Explain briefly why this happens, and recommend whether to pick an alternative.`;
  }

  const headerCls = 'mt-1 rounded border px-2 py-1.5 text-xs ';

  if (state === 'discarded') {
    return <div className={headerCls + 'border-gray-200 bg-gray-50 text-gray-400'}>Discarded draft — {description}</div>;
  }

  const err = 'error' in preview ? preview.error : null;
  const diff = 'diff' in preview ? preview.diff : null;
  const alternatives = 'alternatives' in preview ? preview.alternatives : undefined;
  const betterAlts = (alternatives ?? []).filter((a) => diff && a.skipped < diff.nowSkipped.length);

  return (
    <div className={headerCls + (err ? 'border-red-200 bg-red-50' : 'border-amber-300 bg-amber-50')}>
      <div className="flex items-center gap-1 font-medium text-amber-900">
        <span aria-hidden>✎</span>
        <GlossaryTooltip term="chat.draftEdit">
          <span>Draft edit</span>
        </GlossaryTooltip>
        {state === 'applied' && <span className="ml-auto rounded bg-emerald-600 px-1.5 text-white">✓ Applied</span>}
      </div>
      <div className="mt-0.5 text-gray-700">{description}</div>

      {err ? (
        <div className="mt-1 text-red-700">Can’t apply: {err}</div>
      ) : (
        diff && <DiffSummary diff={diff} />
      )}

      {/* 019 Phase 3/4 — rejection-explanation + why-not, when the edit causes skips. */}
      {diff && diff.nowSkipped.length > 0 && (
        <div className="mt-1.5 rounded bg-red-50 px-1.5 py-1 text-[11px]">
          {betterAlts.length > 0 && (
            <div className="text-gray-700">
              Fewer skips in: {betterAlts.map((a) => `${a.window} (${a.skipped})`).join(', ')}
            </div>
          )}
          <button
            type="button"
            onClick={() => onExplain(explainPrompt())}
            className="mt-1 rounded border border-gray-300 px-1.5 py-0.5 text-gray-600 hover:bg-gray-100"
          >
            Explain why
          </button>
        </div>
      )}

      {applyError && <div className="mt-1 text-red-700">Apply failed: {applyError}</div>}

      {state === 'pending' && !err && (
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              const r = onApply(patch);
              if (r?.error) setApplyError(r.error);
              else {
                // freeze the pre-apply diff before onApply's state update re-renders this card
                setAppliedPreview(livePreview);
                setState('applied');
              }
            }}
            className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setState('discarded')}
            className="rounded border border-gray-300 px-2 py-0.5 text-gray-600 hover:bg-gray-100"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

function DiffSummary({ diff }: { diff: ScheduleDiff }) {
  if (diff.totalChanged === 0) {
    return <div className="mt-1 text-gray-500">No schedule change — already placed there.</div>;
  }
  return (
    <div className="mt-1 space-y-1 text-gray-700">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {diff.retimed.length > 0 && <span>{diff.retimed.length} retimed</span>}
        {diff.movedDay.length > 0 && <span>{diff.movedDay.length} moved to another day</span>}
        {diff.nowScheduled.length > 0 && <span className="text-emerald-700">{diff.nowScheduled.length} newly scheduled</span>}
        {diff.nowSkipped.length > 0 && <span className="text-red-700">{diff.nowSkipped.length} now skipped</span>}
      </div>
      <ul className="space-y-0.5 font-mono text-[11px] text-gray-500">
        {diff.retimed.slice(0, 3).map((r) => (
          <li key={r.id}>
            {r.date}: {r.from} → {r.to}
          </li>
        ))}
        {diff.movedDay.slice(0, 3).map((r) => (
          <li key={r.id}>
            {r.from} → {r.to}
          </li>
        ))}
        {diff.nowSkipped.slice(0, 2).map((r) => (
          <li key={r.id} className="text-red-600">
            {r.date}: {r.title} skipped
          </li>
        ))}
      </ul>
    </div>
  );
}
