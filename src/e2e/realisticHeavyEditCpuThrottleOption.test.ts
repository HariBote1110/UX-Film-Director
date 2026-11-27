import { describe, expect, it } from 'vitest';

// realistic-heavy-edit-e2eにCPUスロットリング計測オプションを追加するための
// パーステスト。Emulation.setCPUThrottlingRateはrenderer側main threadのみを
// 遅くするものであり、Electron main process・Rust backend・GPUは一切遅くならない
// （擬似的な低スペック機シミュレーションではない）。そのためこのオプションは
// あくまで「renderer main threadの余裕度」を測る用途に限定し、数値の妥当性を
// 厳格にチェックする（不正値をCDPへそのまま渡さない）。
describe('realistic-heavy-edit-e2e のCPUスロットリング倍率オプションのパース', () => {
  it('UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE が未設定なら既定で1（スロットリングなし）を返す', async () => {
    const { parseCpuThrottleRateOption } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(parseCpuThrottleRateOption({})).toBe(1);
    expect(parseCpuThrottleRateOption(undefined)).toBe(1);
  });

  it('妥当な数値文字列を倍率として返す', () => {
    return import('../../scripts/lib/realistic-heavy-edit-options.mjs').then(
      ({ parseCpuThrottleRateOption }) => {
        expect(parseCpuThrottleRateOption({
          UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '4',
        })).toBe(4);
        expect(parseCpuThrottleRateOption({
          UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '2.5',
        })).toBe(2.5);
        expect(parseCpuThrottleRateOption({
          UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '1',
        })).toBe(1);
      },
    );
  });

  it('数値でない・0以下・上限超過の値は例外を投げる（CDPへ不正値をそのまま渡さない）', async () => {
    const { parseCpuThrottleRateOption } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(() => parseCpuThrottleRateOption({
      UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: 'not-a-number',
    })).toThrow();
    expect(() => parseCpuThrottleRateOption({
      UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '0',
    })).toThrow();
    expect(() => parseCpuThrottleRateOption({
      UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '-2',
    })).toThrow();
    expect(() => parseCpuThrottleRateOption({
      UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '1000',
    })).toThrow();
    expect(() => parseCpuThrottleRateOption({
      UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: 'NaN',
    })).toThrow();
  });

  it('上限値20（Chrome DevTools「Low-end mobile」相当）はそのまま受理する', async () => {
    const { parseCpuThrottleRateOption } = await import(
      '../../scripts/lib/realistic-heavy-edit-options.mjs'
    );
    expect(parseCpuThrottleRateOption({
      UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE: '20',
    })).toBe(20);
  });
});
