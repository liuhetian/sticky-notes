// src/server/md-render.ts 跑 test-wiki 的共享用例 shared/placeholder_cases.json（和 live.js、Python 版同一套规则）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { findPlaceholders, renderMarkdown } from '../src/server/md-render';

type Resp = { status: number; body: unknown; once?: boolean };
type Case = { name: string; input: string; responses: Record<string, Resp>; expected: string };

const file = join(process.env.WIKI_ROOT ?? '../test-wiki', 'shared/placeholder_cases.json');
const { cases } = JSON.parse(readFileSync(file, 'utf8')) as { cases: Case[] };

it.each(cases.map((c) => [c.name, c] as const))('%s', async (_, c) => {
  const calls = new Map<string, number>();
  const fetchJson = async (url: string) => {
    calls.set(url, (calls.get(url) ?? 0) + 1);
    const resp = c.responses[url];
    if (resp.status >= 400 || resp.body === '<not-json>') throw new Error(`HTTP ${resp.status}`);
    return resp.body;
  };
  expect(await renderMarkdown(c.input, fetchJson)).toBe(c.expected);
  for (const [url, resp] of Object.entries(c.responses)) if (resp.once) expect(calls.get(url)).toBe(1);
});

it('findPlaceholders 忽略代码', () => {
  const text = '`{{ api("/a").x }}`\n```\n{{ api("/b").x }}\n```\n{{ api("/c").x }} {{ api("/c").y }}';
  expect(findPlaceholders(text)).toEqual(['/c']);
});
