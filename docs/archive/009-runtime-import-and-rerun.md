# 009 - Runtime Import And Rerun Schedule (Stretch)

## Goal
Add an optional browser-only workflow that lets a reviewer import replacement `activities.json`
and/or `availability.json`, rerun the existing pure `schedule(activities, availability)`
function in memory, and re-render the same calendar view.

This is a stretch task, not required for assignment completion. It demonstrates that the
scheduler is runtime-agnostic without adding backend, auth, persistence, practitioner editing,
or multi-tenant product scope.

## Assumptions
- No backend, database, server actions, API routes, accounts, RBAC, or saved user state.
- Imports happen entirely in the browser using local file inputs.
- Imported data must use the exact 002/003/004 JSON contracts.
- The baseline static fixture calendar remains the default first screen.
- If both files are not imported, the app uses the committed fixture for the missing side.

## Tasks
1. Add an unobtrusive import control to the calendar page, clearly marked as optional/demo-only.
2. Accept two local JSON files: one `Activity[]` file and one `AvailabilityBundle` file.
3. Validate imported JSON with the existing `validate.ts` guards before scheduling.
4. On valid import, call `schedule(importedActivities, importedAvailability)` in browser state.
5. Reuse the existing `CalendarView` rendering path with the new `ScheduleResult`.
6. Show concise validation errors for malformed JSON, missing required fields, unknown roles,
   unresolved backups, or invalid date ranges.
7. Add a reset control that returns to the committed fixture schedule.
8. Document the feature in README as an optional local demo, not a hosted persistence workflow.

## Explicitly Out Of Scope
- Editing activities or availability inline.
- Practitioner/customer accounts.
- Multi-tenant data isolation.
- Saving uploaded files or generated schedules.
- API routes, server actions, databases, object storage, or authentication.
- Calendar drag/drop or manual rescheduling.

## Verification
- Baseline hosted page still loads the committed fixture calendar without uploads.
- Importing valid replacement JSON reruns `schedule()` and updates counts/month views.
- Importing only one file combines it with the committed fixture for the other input.
- Invalid JSON or invalid schema produces a readable error and does not replace the current plan.
- Reset returns to the original committed fixture result.
- `npm run build` and existing scheduler tests still pass.

