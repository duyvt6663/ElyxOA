# 018 - Day-timeline action list: time grouping, hierarchy, substitute distinction

## Observations (from UI review)
The day-detail **action list** (under the calendar day timeline, `DayTimeline.tsx`) is a flat list
sorted by start time. Two gaps:

1. **Expanded bundle children aren't visually subordinate.** A bundle row `▸ 07:30 Morning
   Medications ×4` expands to its child rows at `ml-3 pl-2` — barely indented, so they read as peers
   of the parent, not children. Also, **every child shares the bundle's timestamp** (verified Jun 1:
   Morning Medications children are all `07:30`), so repeating the time on each child is noise.
2. **Same-timestamp actions aren't grouped, and substitutes don't stand out.** Many actions land at
   one time (Jun 1: 12 at `07:30`, 10 at `12:30`); they list flat with no time grouping. Substituted
   occurrences (`~Remote Brisk Walk ← VO2 Max Primer`) render like ordinary scheduled rows — only the
   `← source` tag distinguishes them, which is easy to miss.

## Reconciling earlier feedback
016 §1 deliberately stopped collapsing heterogeneous clusters into a bland `07:30 ×9` because that
*hid* the actions. This plan does the opposite of hiding: it **groups by time but keeps every action
visible** under a time header, adding hierarchy + substitute distinction. So it is consistent with —
not a reversal of — the "list them individually" decision.

## Proposed design

Two levels of hierarchy in the list (the proportional timeline BARS above are unchanged):

```
07:30                                   ← time-group header (the time appears ONCE here)
  ▸ Morning Medications ×4              ← semantic bundle (collapsed; no repeated time)
      Morning Antihypertensive          ← (when expanded) deeper indent, connector line, no time
      Metformin With Breakfast
      Morning Supplementation Protocol
      Creatine Daily Dose
  • CGM Sensor Check                     ← individual scheduled action (no repeated time)
  • Blood Pressure Log
  • Weekly GLP-1 Injection
09:00
  • Endocrinology Review
  • Neck and Shoulder Reset
  • Step Count Floor
  ↳ substituted (1)                      ← sub-group label within the time group
      Remote Brisk Walk ← VO2 Max Primer ← amber tint + ↳ + indent
13:00
  ↳ substituted (1)
      Home Rehab Fallback ← Acute Pain Triage
```

### Decisions (proposed; mostly design calls)
1. **Time-group headers always** (even for a single action at that time) — consistent hierarchy beats
   special-casing. Header = the `HH:MM`, muted, sticky-free.
2. **Drop the per-row timestamp** inside a group — it's the header now (removes the redundancy #1
   called out, including for bundle children).
3. **Bundle children indent deeper** (e.g. `pl-6` + a left connector border) so the parent→child
   hierarchy is obvious; children show dot + title only (no time, no source — they're scheduled).
4. **Substitutes are a distinct sub-group at the END of each time group**, under a small `↳
   substituted (N)` label, each row amber-tinted + `↳`-prefixed + indented, showing `{fallback} ←
   {source}`. This is the "different highlight/indent so they're clearly not the same hierarchy" ask.
   *(Alternative considered: keep substitutes inline, only tinted — rejected; the user wants them
   visually separated.)*
5. **Skipped section unchanged** (already its own "Skipped / no slot" block below).

### What this is NOT
- Not changing the scheduler, bundling logic, or the proportional timeline bars.
- Not re-introducing `×N` collapsing of heterogeneous clusters — items stay visible.
- Not adding new data; uses `startTime`, `status`, `displayBundleLabel`, `sourceTitle`.

## Implementation tasks (DayTimeline.tsx only)
1. Build the list as `Map<startTime, { bundles: Entry[]; scheduled: Occ[]; substituted: Occ[] }>`,
   iterated in `HH:MM` order. (Reuse the existing bundle/loose split; partition loose by status.)
2. Render: time header → bundles (collapsed toggle, no time) → scheduled rows (dot + title, no time)
   → `↳ substituted (N)` sub-block (amber, indented, `← source`).
3. Bundle expansion: deeper indent (`pl-6` + connector), children = dot + title only.
4. `ActionRow`: add a `variant?: 'scheduled' | 'substituted' | 'bundleChild'` to drive
   indent/tint/whether the time + source show; drop the standalone lead-spacer logic (the time
   header replaces the alignment need).
5. Keep selection wiring intact (every row + child + substitute still calls `onSelect`).

## Verification
- A day with a busy time (e.g. Jun 1 `07:30`) shows ONE `07:30` header with the bundle + individual
  rows beneath it; no row repeats `07:30`.
- Expanding a bundle indents its children clearly deeper than the bundle row.
- A day with substitutes (e.g. a travel-week day) shows them under `↳ substituted (N)`, amber +
  indented, with `← source`, separated from scheduled rows.
- Every row/child/substitute still opens its Trace on click. Acceptance suite + `npm test` green;
  0 console errors.
