import { describe, it, expect } from 'vitest';
import { validateConsultSections } from '../tools/consult.js';

const goodOutput = `
## Recommendation
Use Postgres.

## Reasoning
Better fit for relational shape.

## Tradeoffs
Vertical scaling caps.

## Risks
Connection pool exhaustion under spikes.

## Open questions for the asker
None.
`;

describe('validateConsultSections', () => {
  it('returns missing=[] when all 5 sections are present', () => {
    expect(validateConsultSections(goodOutput).missing).toEqual([]);
  });

  it('returns missing=["Risks"] when Risks header is absent', () => {
    const dropped = goodOutput.replace('## Risks\nConnection pool exhaustion under spikes.\n', '');
    expect(validateConsultSections(dropped).missing).toEqual(['Risks']);
  });

  it('returns multiple missing sections', () => {
    const sparse = '## Recommendation\nx\n\n## Reasoning\ny\n';
    const result = validateConsultSections(sparse).missing;
    expect(result).toContain('Tradeoffs');
    expect(result).toContain('Risks');
    expect(result).toContain('Open questions for the asker');
    expect(result).toHaveLength(3);
  });

  it('matches headers case-sensitively (## Recommendation but not ## RECOMMENDATION)', () => {
    const cased = goodOutput.replace('## Recommendation', '## RECOMMENDATION');
    expect(validateConsultSections(cased).missing).toContain('Recommendation');
  });

  it('does not match bare bold text without ## prefix', () => {
    const broken = goodOutput.replace('## Recommendation', '**Recommendation**');
    expect(validateConsultSections(broken).missing).toContain('Recommendation');
  });

  it('matches headers even with trailing whitespace', () => {
    const trailing = goodOutput.replace('## Recommendation', '## Recommendation  ');
    expect(validateConsultSections(trailing).missing).toEqual([]);
  });

  it('accepts headers with trailing colon (## Recommendation:)', () => {
    const colon = goodOutput.replace('## Recommendation', '## Recommendation:');
    expect(validateConsultSections(colon).missing).toEqual([]);
  });

  it('accepts headers with em-dash continuation (## Recommendation — Postgres)', () => {
    const dash = goodOutput.replace('## Recommendation', '## Recommendation — Postgres');
    expect(validateConsultSections(dash).missing).toEqual([]);
  });

  it('does NOT match headers nested inside fenced code blocks', () => {
    // A model that returns only a fenced example skeleton must be flagged as drifted.
    const fenced = [
      'Here is what your output should look like:',
      '',
      '```markdown',
      '## Recommendation',
      'foo',
      '## Reasoning',
      'bar',
      '## Tradeoffs',
      'baz',
      '## Risks',
      'r',
      '## Open questions for the asker',
      'None.',
      '```',
      '',
      'Now I have to think about it.',
    ].join('\n');

    const result = validateConsultSections(fenced).missing;
    // All 5 headers are inside the fence — none should count.
    expect(result).toContain('Recommendation');
    expect(result).toContain('Reasoning');
    expect(result).toContain('Tradeoffs');
    expect(result).toContain('Risks');
    expect(result).toContain('Open questions for the asker');
  });
});
