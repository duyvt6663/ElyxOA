import { describe, it, expect } from 'vitest';
import { GLOSSARY } from './ui-glossary';

describe('ui-glossary', () => {
  it('every entry has a non-empty label and a meaningful explanation', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.label, key).toBeTruthy();
      expect(entry.explanation.length, `${key} explanation`).toBeGreaterThan(10);
    }
  });

  it('covers the core status vocabulary', () => {
    for (const k of ['status.scheduled', 'status.substituted', 'status.skipped'] as const) {
      expect(GLOSSARY[k]).toBeDefined();
    }
  });
});
