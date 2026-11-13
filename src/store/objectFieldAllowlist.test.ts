import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  BASE_OBJECT_FIELDS,
  OBJECT_FIELD_GUARDS,
  OBJECT_FIELD_SCHEMA_TITLES,
  isFieldDiffRepresentable,
} from './objectFieldAllowlist';
import type { TimelineObject } from '../types';

interface JsonSchemaFile {
  title: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

const loadSchema = (fileName: string): JsonSchemaFile =>
  JSON.parse(
    readFileSync(new URL(`../../schema/rust-core/${fileName}`, import.meta.url), 'utf8'),
  ) as JsonSchemaFile;

// types.ts の PsdObject は rootLayer を Omit して合成される（唯一の例外）。
const FIELD_EXCLUSIONS: Record<string, string[]> = {
  PsdObjectFields: ['rootLayer'],
};

describe('objectFieldAllowlist（スキーマ契約）', () => {
  it('全ての *ObjectFields スキーマが許可リストのどこかで参照される', () => {
    const schemaTitles = readdirSync(new URL('../../schema/rust-core/', import.meta.url))
      .filter((name) => name.endsWith('ObjectFields.schema.json'))
      .map((name) => loadSchema(name).title);
    const referenced = new Set(Object.values(OBJECT_FIELD_SCHEMA_TITLES));
    for (const title of schemaTitles) {
      expect(referenced.has(title), `未参照のスキーマ: ${title}`).toBe(true);
    }
  });

  it('各型の許可/必須フィールドが BaseObject + 型別スキーマと一致する', () => {
    const base = loadSchema('BaseObject.schema.json');
    const baseProps = new Set(Object.keys(base.properties ?? {}));
    const baseRequired = new Set(base.required ?? []);
    expect([...BASE_OBJECT_FIELDS].sort()).toEqual([...baseProps].sort());

    for (const [type, title] of Object.entries(OBJECT_FIELD_SCHEMA_TITLES)) {
      const fields = loadSchema(`${title}.schema.json`);
      const excluded = new Set(FIELD_EXCLUSIONS[title] ?? []);
      const expectedAllowed = new Set(
        [...baseProps, ...Object.keys(fields.properties ?? {})].filter(
          (name) => !excluded.has(name),
        ),
      );
      const expectedRequired = new Set(
        [...baseRequired, ...(fields.required ?? [])].filter(
          (name) => !excluded.has(name),
        ),
      );
      const guard = OBJECT_FIELD_GUARDS[type];
      expect(guard, `ガードが無い型: ${type}`).toBeDefined();
      expect([...guard.allowed].sort(), `${type} の allowed`).toEqual(
        [...expectedAllowed].sort(),
      );
      expect([...guard.required].sort(), `${type} の required`).toEqual(
        [...expectedRequired].sort(),
      );
    }
  });
});

describe('isFieldDiffRepresentable', () => {
  const textObject = { type: 'text' } as unknown as TimelineObject;

  it('スキーマ内フィールドの変更は表現可能', () => {
    expect(
      isFieldDiffRepresentable(textObject, [
        { kind: 'setObjectField', objectId: 'o1', field: 'x', previous: 0, next: 10 },
      ]),
    ).toBe(true);
  });

  it('スキーマ外フィールドが1つでもあれば全体が表現不可能', () => {
    expect(
      isFieldDiffRepresentable(textObject, [
        { kind: 'setObjectField', objectId: 'o1', field: 'x', previous: 0, next: 10 },
        {
          kind: 'setObjectField',
          objectId: 'o1',
          field: 'runtimeOnlyField',
          previous: null,
          next: 1,
        },
      ]),
    ).toBe(false);
  });

  it('必須フィールドへの null 適用は表現不可能', () => {
    expect(
      isFieldDiffRepresentable(textObject, [
        { kind: 'setObjectField', objectId: 'o1', field: 'x', previous: 0, next: null },
      ]),
    ).toBe(false);
  });

  it('未知のオブジェクト型は表現不可能', () => {
    expect(
      isFieldDiffRepresentable({ type: 'nope' } as unknown as TimelineObject, [
        { kind: 'setObjectField', objectId: 'o1', field: 'x', previous: 0, next: 10 },
      ]),
    ).toBe(false);
  });
});
