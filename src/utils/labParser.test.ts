import { describe, expect, it } from 'vitest';
import { parseLabFile, phonemeToViseme } from './labParser';

describe('parseLabFile', () => {
  it('parses AITalk-style timestamps in 100ns units', async () => {
    const content = '0 10000000 a\n10000000 20000000 i\n';
    const file = new File([content], 'test.lab', { type: 'text/plain' });
    const result = await parseLabFile(file);
    expect(result).toEqual([
      { startTime: 0, endTime: 1, phoneme: 'a' },
      { startTime: 1, endTime: 2, phoneme: 'i' }
    ]);
  });

  it('ignores blank lines and trims whitespace', async () => {
    const content = '\n  0 50000000 sil  \n\n';
    const file = new File([content], 'x.lab');
    const result = await parseLabFile(file);
    expect(result).toHaveLength(1);
    expect(result[0].phoneme).toBe('sil');
    expect(result[0].endTime).toBeCloseTo(5, 5);
  });
});

describe('phonemeToViseme', () => {
  it('maps vowels and common variants', () => {
    expect(phonemeToViseme('a')).toBe('a');
    expect(phonemeToViseme('aa')).toBe('a');
    expect(phonemeToViseme('ii')).toBe('i');
    expect(phonemeToViseme('y')).toBe('i');
    expect(phonemeToViseme('uu')).toBe('u');
    expect(phonemeToViseme('w')).toBe('u');
    expect(phonemeToViseme('ee')).toBe('e');
    expect(phonemeToViseme('oo')).toBe('o');
  });

  it('maps closed-mouth phonemes to n', () => {
    expect(phonemeToViseme('N')).toBe('n');
    expect(phonemeToViseme('m')).toBe('n');
    expect(phonemeToViseme('sil')).toBe('n');
    expect(phonemeToViseme('pau')).toBe('n');
  });

  it('returns null for unmapped consonants', () => {
    expect(phonemeToViseme('k')).toBeNull();
    expect(phonemeToViseme('s')).toBeNull();
  });
});
