/**
 * PSDTool ラジオ（'*' 接頭辞）意味論の契約テスト。
 *
 * PSDTool では「名前が '*' で始まるノード（レイヤー/フォルダ）自身」が
 * ラジオ項目であり、同じ親を持つ '*' 兄弟同士で排他になる。
 * 「isRadio なグループの子ども同士が排他」ではない（葵ちゃん.psd の
 * **髪 ショート 配下の !髪色/!髪線画 は排他ではなく両方必要）。
 */
import { describe, expect, it } from 'vitest';
import { togglePsdLayer } from './psdParser';
import type { PsdLayerNode } from '../types';

const node = (
  id: string,
  name: string,
  isGroup: boolean,
  children: PsdLayerNode[] = [],
): PsdLayerNode => ({
  id,
  name,
  isGroup,
  isRadio: name.startsWith('*'),
  children,
  width: 10,
  height: 10,
  left: 0,
  top: 0,
  defaultVisible: true,
});

/**
 * 葵ちゃん.psd の構造を模した fixture:
 * root
 * ├ !髪 (グループ)
 * │ ├ *髪ショート (ラジオ項目グループ)
 * │ │ ├ !髪色  (強制表示・非ラジオ)
 * │ │ └ !髪線画 (強制表示・非ラジオ)
 * │ └ *髪ロング (ラジオ項目グループ)
 * │   └ !髪色L
 * └ 左腕 (通常グループ)
 *   ├ *袖なし (ラジオ項目リーフ)
 *   ├ *袖あり (ラジオ項目リーフ)
 *   └ こて   (非ラジオリーフ)
 */
const buildTree = () =>
  node('root', 'root', true, [
    node('g-hair', '!髪', true, [
      node('g-short', '*髪ショート', true, [
        node('l-short-colour', '!髪色', false),
        node('l-short-line', '!髪線画', false),
      ]),
      node('g-long', '*髪ロング', true, [node('l-long-colour', '!髪色L', false)]),
    ]),
    node('g-arm', '左腕', true, [
      node('l-sleeveless', '*袖なし', false),
      node('l-sleeved', '*袖あり', false),
      node('l-gauntlet', 'こて', false),
    ]),
  ]);

const initialActive: Record<string, boolean> = {
  root: true,
  'g-hair': true,
  'g-short': true,
  'l-short-colour': true,
  'l-short-line': true,
  'g-arm': true,
  'l-sleeveless': true,
  'l-gauntlet': true,
};

describe('togglePsdLayer (PSDTool radio semantics)', () => {
  it('selecting a radio leaf turns off its radio siblings but not plain siblings', () => {
    const next = togglePsdLayer(buildTree(), initialActive, 'l-sleeved');
    expect(next['l-sleeved']).toBe(true);
    expect(next['l-sleeveless']).toBe(false); // '*' 兄弟は排他
    expect(next['l-gauntlet']).toBe(true); // 非ラジオ兄弟は無関係
  });

  it('tapping an active radio leaf keeps it selected (radio cannot be deselected)', () => {
    const next = togglePsdLayer(buildTree(), initialActive, 'l-sleeveless');
    expect(next['l-sleeveless']).toBe(true);
  });

  it('selecting a radio GROUP switches hair styles without wiping its interior state', () => {
    const next = togglePsdLayer(buildTree(), initialActive, 'g-long');
    expect(next['g-long']).toBe(true);
    expect(next['g-short']).toBe(false); // '*' 兄弟グループは排他
    // 非選択側の内部状態は保持される（再選択で元の見た目に戻る）
    expect(next['l-short-colour']).toBe(true);
    expect(next['l-short-line']).toBe(true);
  });

  it('does NOT treat children of a radio group as mutually exclusive', () => {
    // !髪色 / !髪線画 は両方必要。片方のトグルで他方が消えてはならない。
    const next = togglePsdLayer(buildTree(), initialActive, 'l-short-line');
    expect(next['l-short-colour']).toBe(true);
    expect(next['l-short-line']).toBe(false); // 非ラジオリーフは通常トグル
  });

  it('selecting a leaf inside a radio group also applies exclusivity to the group level', () => {
    const active = { ...initialActive, 'g-long': true };
    const next = togglePsdLayer(buildTree(), active, 'l-short-colour');
    // 経路上のラジオ祖先 g-short が選択され、兄弟 g-long は OFF
    expect(next['g-short']).toBe(true);
    expect(next['g-long']).toBe(false);
  });

  it('still ignores plain (non-radio) group targets', () => {
    const next = togglePsdLayer(buildTree(), initialActive, 'g-arm');
    expect(next).toEqual(initialActive);
  });

  it('plain leaf toggling still works both ways', () => {
    const off = togglePsdLayer(buildTree(), initialActive, 'l-gauntlet');
    expect(off['l-gauntlet']).toBe(false);
    const on = togglePsdLayer(buildTree(), off, 'l-gauntlet');
    expect(on['l-gauntlet']).toBe(true);
  });
});
