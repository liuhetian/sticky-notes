// 文档站（/ai/）的页面脚本：打开页面时调接口，把正文里的 {{ api(...) }} 换成实时数据（规则在 shared/livedoc.ts）。
// scripts/build-docs.ts 把它打包成 build/dist/ai/javascripts/live.js。
// 文档站和接口同域，fetch 自带登录 cookie；没登录（401）时显示「登录后可见」链接。
// 以后文档放进别的域名（大 wiki）：页面里加 <meta name="api-base" content="https://clip.liuhetian.life">，跨域要本站配 CORS，见报告
import { CALL, fill, readResult, slotOf, type Result, type Slot } from '../shared/livedoc';

const API_BASE = (document.querySelector<HTMLMetaElement>('meta[name="api-base"]')?.content ?? '').replace(/\/$/, '');
const SKIP = 'code, pre, script, style, textarea';
const LOGIN = '\u0000login'; // fill() 遇到 401 返回它，下面换成链接

/** 把正文里的占位符换成 <span>，返回待填的 */
function collect(root: Element): { span: HTMLSpanElement; slot: Slot }[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue!.includes('{{') && !n.parentElement!.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  const out: { span: HTMLSpanElement; slot: Slot }[] = [];
  for (const node of nodes) {
    const text = node.nodeValue!;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(CALL)) {
      const span = document.createElement('span');
      span.className = 'live';
      span.textContent = '…';
      span.title = m[0];
      frag.append(text.slice(last, m.index), span);
      out.push({ span, slot: slotOf(m.groups!) });
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  return out;
}

function render() {
  const requests = new Map<string, Promise<Result>>(); // 相同地址只调一次
  for (const { span, slot } of collect(document.querySelector('article') ?? document.body)) {
    if (!requests.has(slot.url)) {
      requests.set(slot.url, fetch(API_BASE + slot.url, { credentials: 'include', cache: 'no-store' }).then(readResult, (e: Error): Result => ({ ok: false, status: 0, message: e.message })));
    }
    requests.get(slot.url)!.then((r) => {
      const text = fill(r, slot, LOGIN);
      if (text !== LOGIN) span.textContent = text; // textContent：接口返回的东西不会被当成 HTML
      else {
        const a = document.createElement('a');
        a.href = `${API_BASE}/`;
        a.textContent = '登录后可见';
        span.replaceChildren(a);
      }
    });
  }
  // 「Copy as Markdown」默认复制静态的 md 副本（占位符没替换），改成复制实时版 /api/ai/<页>.md
  for (const b of document.querySelectorAll('button[data-md-copy-url]')) {
    const u = new URL(b.getAttribute('data-md-copy-url')!, document.baseURI);
    if (!API_BASE && u.origin === location.origin && u.pathname.startsWith('/ai/')) b.setAttribute('data-md-copy-url', `/api${u.pathname}`);
  }
}

// zensical 的主题脚本提供 document$：首次加载和无刷新切页都会触发
const doc$ = (window as unknown as { document$?: { subscribe(fn: () => void): void } }).document$;
if (doc$) doc$.subscribe(render);
else render();
