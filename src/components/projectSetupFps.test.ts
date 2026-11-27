import { describe, it, expect } from 'vitest';
import { parseFpsInput } from './projectSetupFps';

describe('parseFpsInput', () => {
  it('受理: 範囲内の整数文字列を数値として返す', () => {
    expect(parseFpsInput('24')).toBe(24);
    expect(parseFpsInput('120')).toBe(120);
    expect(parseFpsInput('1')).toBe(1);
    expect(parseFpsInput('240')).toBe(240);
  });

  it('拒否: 空文字はnull', () => {
    expect(parseFpsInput('')).toBeNull();
  });

  it('拒否: 小数はnull', () => {
    expect(parseFpsInput('12.5')).toBeNull();
  });

  it('拒否: 0以下はnull', () => {
    expect(parseFpsInput('0')).toBeNull();
    expect(parseFpsInput('-5')).toBeNull();
  });

  it('拒否: 240を超える値はnull', () => {
    expect(parseFpsInput('241')).toBeNull();
    expect(parseFpsInput('1000')).toBeNull();
  });

  it('拒否: 数値でない文字列はnull', () => {
    expect(parseFpsInput('abc')).toBeNull();
    expect(parseFpsInput('  ')).toBeNull();
  });
});
