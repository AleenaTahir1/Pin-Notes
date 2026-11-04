// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import releaseNotes from '../../RELEASE_NOTES.md?raw';
import { compareVersions, parseWhatsNew } from './UpdateChecker';

describe('update popup helpers', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.1.0', '1.0.10')).toBeGreaterThan(0);
    expect(compareVersions('1.0.10', '1.0.10')).toBe(0);
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
  });

  it("reads the What's new bullets from the release body", () => {
    const body = `## Pin Notes v1.1.0\n\nFloating sticky notes.\n\n${releaseNotes}\n### Installation\n- **Windows** — exe`;
    const items = parseWhatsNew(body);
    expect(items.length).toBe(5); // capped
    expect(items[0]).toMatch(/^Smoother writing/);
    expect(items.join(' ')).not.toContain('Windows');
  });

  it('is empty for old release bodies without a section', () => {
    expect(parseWhatsNew('## Pin Notes v1.0.9\n\n### Installation\n- **Windows**')).toEqual([]);
    expect(parseWhatsNew(undefined)).toEqual([]);
  });
});
