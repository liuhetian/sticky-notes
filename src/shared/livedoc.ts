// 文档里的实时占位符：{{ api("/api/ai/boards").boards.name.join("、") }}
// 人读（src/docs/live.ts，浏览器里填 HTML）和 AI 读（server/routes/ai.ts，后端填 markdown）共用这一份规则：
//   - "/api/..." 是本站接口，GET，带调用者自己的登录状态；同一份文档里相同地址只调一次
//   - .a.b.0 按层取字段；当前值是数组、键又不是数字时，对每一项取（.boards.name 就是所有白板的名字）
//   - 末尾可选 .join("、")：数组拼成一行；不写 join 的数组和对象按 JSON 显示
//   - 取不到的字段是空串；接口失败写一句简短的中文说明
//   - 代码块和行内代码里的不替换（用来写文档说明）
// 语法里刻意不用 * | _ < > 这些 markdown 符号：放进粗体、表格时会被 markdown 拆坏

/** 一个占位符 */
export const CALL = /\{\{\s*api\(\s*(?<q>["'])(?<url>.+?)\k<q>\s*\)(?<keys>(?:\.[\w$]+)*)(?:\.join\(\s*(?<jq>["'])(?<sep>.*?)\k<jq>\s*\))?\s*\}\}/g;
/** markdown 里的代码：``` 或 ~~~ 围起来的块，行内的 `x` */
const CODE = /(?<fence>`{3,}|~{3,})[\s\S]*?\k<fence>|`[^`\n]*`/;
const CODE_OR_CALL = new RegExp(`${CODE.source}|${CALL.source}`, 'g');

export type Slot = { url: string; keys: string[]; sep?: string };
export type Result = { ok: true; data: unknown } | { ok: false; status: number; message: string };

export const slotOf = (g: Record<string, string | undefined>): Slot => ({ url: g.url!, keys: (g.keys ?? '').split('.').filter(Boolean), sep: g.sep });

/** 按 .a.b.0 取字段；遇到数组且键不是数字时，对每一项接着取 */
export function pick(data: unknown, keys: string[]): unknown {
  let cur = data;
  for (let i = 0; i < keys.length; i++) {
    if (Array.isArray(cur) && !/^\d+$/.test(keys[i])) return cur.map((x) => pick(x, keys.slice(i)));
    cur = cur !== null && typeof cur === 'object' ? (cur as Record<string, unknown>)[keys[i]] : undefined;
  }
  return cur;
}

/** 填进文档的文字 */
export function show(v: unknown, sep?: string): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v) && sep !== undefined) return v.map((x) => show(x)).join(sep);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** 接口的响应 → 结果：失败时带上接口给的 error 说明 */
export async function readResult(res: Response): Promise<Result> {
  const body = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, data: body };
  const err = (body as { error?: unknown } | undefined)?.error;
  return { ok: false, status: res.status, message: typeof err === 'string' ? err : `HTTP ${res.status}` };
}

/** 填一个占位符；401 两边写法不同（网页给登录链接，AI 读的写「需要密码」），由调用方给 */
export function fill(r: Result, slot: Slot, onAuth: string): string {
  if (r.ok) return show(pick(r.data, slot.keys), slot.sep);
  return r.status === 401 ? onAuth : `（获取失败：${r.message}）`;
}

/** 后端（AI 读）：把 markdown 里代码以外的占位符换成实时值；不同地址并发调，相同地址只调一次 */
export async function renderMarkdown(text: string, get: (url: string) => Promise<Result>): Promise<string> {
  const matches = [...text.matchAll(CODE_OR_CALL)].filter((m) => m.groups?.url !== undefined);
  const urls = [...new Set(matches.map((m) => m.groups!.url!))];
  const results = new Map(await Promise.all(urls.map(async (u) => [u, await get(u).catch((e: Error): Result => ({ ok: false, status: 0, message: e.message }))] as const)));
  let out = '', last = 0;
  for (const m of matches) {
    const slot = slotOf(m.groups!);
    out += text.slice(last, m.index) + fill(results.get(slot.url)!, slot, '（需要密码：请求头带 X-Password: 密码#名字）');
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}
