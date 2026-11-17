import { describe, expect, it } from 'vitest';
import { DAY, FILE_ID_RE, fileKind } from '../src/shared/constants';
import { gcj02ToWgs84, isAmapShortLink, mapUrl, parseAppleMapsUrl, parseAmapTarget, parseCoords, tileAt } from '../src/shared/geo';
import { fileIdTime, newFileId } from '../src/shared/ids';
import { itemBase, mergePatch } from '../src/shared/items';
import type { Item } from '../src/shared/schema';
import { addRef, dropRef, parseRef, refLink, refsIn } from '../src/shared/refs';
import { withDescendants, type Wire } from '../src/web/features/links/model';
import { previewKind } from '../src/shared/constants';
import { allTasksDone, continueTask, countTasks, normalizeBareTasks, toggleTaskLine } from '../src/shared/todo';

const T = '买菜\n- [ ] 鸡蛋\n- [x] 牛奶\n[ ] 行首直接写\n```\n- [ ] 代码块里的不算\n```';

describe('待办', () => {
  it('计数：两种写法都算，代码块里的不算', () => {
    expect(countTasks(T)).toEqual({ total: 3, done: 1 });
    expect(allTasksDone(T)).toBe(false);
    expect(allTasksDone('- [x] a\n[x] b')).toBe(true);
    expect(allTasksDone('没有待办')).toBe(false);
  });
  it('按行勾选', () => {
    let t = toggleTaskLine(T, 1, true);
    t = toggleTaskLine(t, 3, true);
    expect(countTasks(t)).toEqual({ total: 3, done: 3 });
    expect(toggleTaskLine(T, 0, true)).toBe(T); // 不是待办的行不动
  });
  it('行首的 [ ] 补成列表，行数不变', () => {
    const n = normalizeBareTasks(T);
    expect(n.split('\n')).toHaveLength(T.split('\n').length);
    expect(n.split('\n')[3]).toBe('- [ ] 行首直接写');
    expect(n.split('\n')[5]).toBe('- [ ] 代码块里的不算');
  });
  it('待办行末回车续一个待办，沿用缩进和符号', () => {
    const apply = (v: string, caret = v.length) => {
      const r = continueTask(v, caret);
      return r && v.slice(0, r.from) + r.insert + v.slice(r.to);
    };
    expect(apply('- [ ] 鸡蛋')).toBe('- [ ] 鸡蛋\n- [ ] ');
    expect(apply('买菜\n  * [x] 牛奶')).toBe('买菜\n  * [x] 牛奶\n  * [ ] ');
    expect(apply('[ ] 直接写')).toBe('[ ] 直接写\n[ ] ');
    expect(apply('1. [ ] 第一')).toBe('1. [ ] 第一\n2. [ ] ');
    expect(apply('- [ ] 一\n- [ ] 二', 7)).toBe('- [ ] 一\n- [ ] \n- [ ] 二'); // 光标在第一行末尾
  });
  it('空待办上回车是结束列表；普通行不管', () => {
    const r = continueTask('- [ ] 一\n- [ ] ', 14)!;
    expect('- [ ] 一\n- [ ] '.slice(0, r.from) + r.insert).toBe('- [ ] 一\n');
    expect(continueTask('普通一行', 4)).toBeNull();
    expect(continueTask('- 普通列表', 6)).toBeNull();
  });
});

describe('位置', () => {
  it('认一对小数：先纬度后经度，反着写也认', () => {
    expect(parseCoords('39.9,116.4')).toEqual({ lat: 39.9, lng: 116.4 });
    expect(parseCoords(' (30.5728， 104.0668) ')).toEqual({ lat: 30.5728, lng: 104.0668 });
    expect(parseCoords('116.4 39.9')).toEqual({ lat: 39.9, lng: 116.4 });
    expect(parseCoords('-33.86,151.21')).toEqual({ lat: -33.86, lng: 151.21 });
  });
  it('不像坐标的不认', () => {
    for (const s of ['12, 34', '39.9', '今天 39.9,116.4', '39.9,116.4,5.0', '200.5,300.5', 'v1.2 3.4']) expect(parseCoords(s)).toBeNull();
  });
  it('瓦片换算、地图链接', () => {
    expect(tileAt({ lat: 0, lng: 0 }, 1)).toMatchObject({ x: 1, y: 1, px: 0 });
    const t = tileAt({ lat: 30.57, lng: 104.06 }, 12);
    expect([t.x, t.y]).toEqual([3231, 1682]);
    expect(mapUrl({ lat: 30.5, lng: 104.1 }, '天府广场', true)).toBe('https://maps.apple.com/?ll=30.5,104.1&q=%E5%A4%A9%E5%BA%9C%E5%B9%BF%E5%9C%BA');
    expect(mapUrl({ lat: 30.5, lng: 104.1 }, '', false)).toContain('position=104.1,30.5&name=30.500000%2C104.100000&coordinate=wgs84');
  });
});

describe('高德分享链接', () => {
  const target = 'https://wb.amap.com/?commonBizInfo=%7B%22a%22%3A1%7D&p=B001C8N36X%2C30.519278071908104%2C104.05351996421811%2C%E5%9B%9B%E5%96%9C%E9%9D%92%E8%8F%9C%E5%85%83%E5%AD%90%28%E5%AE%89%E5%85%AC%E8%B7%AF%E4%BA%8C%E6%AE%B5%E5%BA%97%29%2C%E5%8D%8E%E6%96%B0%E4%B8%8B%E8%A1%97&src=app_share';
  it('只认整条就是高德短链的', () => {
    expect(isAmapShortLink('https://surl.amap.com/17ncUA1Mya0I')).toBe(true);
    expect(isAmapShortLink('https://example.com/surl.amap.com/x')).toBe(false);
    expect(isAmapShortLink('【某某店】https://surl.amap.com/abc')).toBe(false);
  });
  it('跳转地址里取出名字和坐标，坐标换成 WGS-84', () => {
    const p = parseAmapTarget(target)!;
    expect(p.name).toBe('四喜青菜元子(安公路二段店)');
    // 成都一带 GCJ-02 比 WGS-84 偏东南几百米：换算后纬度变大、经度变小
    expect(p.lat - 30.519278).toBeGreaterThan(0.001);
    expect(104.05352 - p.lng).toBeGreaterThan(0.001);
    expect(Math.abs(p.lat - 30.519278)).toBeLessThan(0.01);
    expect(parseAmapTarget('https://wb.amap.com/?p=B0,abc,def')).toBeNull();
    expect(parseAmapTarget('https://wb.amap.com/?q=1')).toBeNull();
  });
  it('地图上随手点的位置走 q=纬度,经度,名字', () => {
    expect(parseAmapTarget('https://wb.amap.com/?commonBizInfo=%7B%7D&q=1.32055584878488%2C103.86010318994519%2CMcNair+Rd113C&src=app_share'))
      .toEqual({ lat: 1.320556, lng: 103.860103, name: 'McNair Rd113C' });
  });
  it('苹果地图链接自带坐标和名字', () => {
    expect(parseAppleMapsUrl('https://maps.apple.com/place?coordinate=1.366097,103.871558&name=%E5%B7%B2%E6%A0%87%E8%AE%B0%E4%BD%8D%E7%BD%AE&map=explore'))
      .toEqual({ lat: 1.366097, lng: 103.871558, name: '已标记位置' });
    expect(parseAppleMapsUrl('https://maps.apple.com/?ll=30.5,104.06&q=%E5%92%96%E5%95%A1%E9%A6%86')).toEqual({ lat: 30.5, lng: 104.06, name: '咖啡馆' });
    expect(parseAppleMapsUrl('https://maps.apple.com/?address=somewhere')).toBeNull();
    expect(parseAppleMapsUrl('https://example.com/?ll=1.0,2.0')).toBeNull();
  });
  it('GCJ-02 转 WGS-84：天安门对得上，国外不动', () => {
    const p = gcj02ToWgs84({ lat: 39.908722, lng: 116.397499 });
    expect(p.lat).toBeCloseTo(39.90732, 4);
    expect(p.lng).toBeCloseTo(116.39126, 4);
    expect(gcj02ToWgs84({ lat: 48.8584, lng: 2.2945 })).toEqual({ lat: 48.8584, lng: 2.2945 });
    // 新加坡、东京、首尔、台北都不偏；成都、哈尔滨、三亚、乌鲁木齐要换
    for (const q of [{ lat: 1.3205, lng: 103.8601 }, { lat: 35.68, lng: 139.76 }, { lat: 37.56, lng: 126.97 }, { lat: 25.03, lng: 121.56 }]) expect(gcj02ToWgs84(q)).toEqual(q);
    for (const q of [{ lat: 30.57, lng: 104.06 }, { lat: 45.8, lng: 126.53 }, { lat: 18.25, lng: 109.51 }, { lat: 43.82, lng: 87.61 }]) expect(gcj02ToWgs84(q)).not.toEqual(q);
  });
});

describe('便利贴里的引用', () => {
  const A = '0123456789abcdef', B = 'fedcba9876543210';
  const O = 'https://clip.liuhetian.life';
  it('生成：标题里的方括号转义、换行压平；图片上的点最多 3 位小数', () => {
    expect(refLink('a[1]\nb', { id: A })).toBe(`[a\\[1\\] b](/${A})`);
    expect(refLink('图', { id: A, p: { px: 0.25, py: 1 / 3 } })).toBe(`[图](/${A}#0.25,0.333)`);
  });
  it('只认 /id、/id#x,y；本站的完整链接、分享链接都不算', () => {
    expect(parseRef(`/${A}`)).toEqual({ id: A });
    expect(parseRef(`/${A}#0.5,0.25`)).toEqual({ id: A, p: { px: 0.5, py: 0.25 } });
    expect(parseRef(`/${A}#2,0.5`)).toEqual({ id: A });
    expect(parseRef(`${O}/${A}`)).toBeNull();
    expect(parseRef(`/share/b1/${A}`)).toBeNull();
    expect(parseRef(`/x/${A}`)).toBeNull();
    expect(parseRef(`/${A}0`)).toBeNull();
    expect(parseRef(`/${A}#top`)).toBeNull();
  });
  it('从文字里找：按出现顺序，id 和点都一样的算一次；正文里随手写的 /id 不算', () => {
    const text = `看 [图](/${B}#0.5,0.5) 和 [它](/${A})\n[又一次](/${B}#0.5,0.5)\n${O}/${A}，还有 /${B} 和 [外链](https://example.com/${A})\n[再看](/${B})`;
    expect(refsIn(text)).toEqual([{ id: B, p: { px: 0.5, py: 0.5 } }, { id: A }, { id: B }]);
    expect(refsIn(`[x](${O}/${A}) [分享](${O}/share/b1/${A})`)).toEqual([]);
  });
  it('加：给行号加在那一行末尾；否则加在最后，前面只有引用就接着写，不然空一行', () => {
    const md = `[图](/${A})`;
    expect(addRef('一\n二  \n三', md, 1)).toBe(`一\n二 ${md}\n三`);
    expect(addRef('一\n\n三', md, 1)).toBe(`一\n\n三\n\n${md}`);
    expect(addRef('- [ ] 待办\n', md)).toBe(`- [ ] 待办\n\n${md}`);
    expect(addRef(`一\n\n[它](/${B})`, md)).toBe(`一\n\n[它](/${B})\n${md}`);
    expect(addRef('', md)).toBe(md);
  });
  it('删：只删 id 和点都一样的，连同前面一个空格；删空的行去掉；没删到原样返回', () => {
    const text = `一 [图](/${A})\n二 [图](/${A}#0.5,0.5)\n\n[它](/${A})\n`;
    expect(dropRef(text, { id: A })).toBe(`一\n二 [图](/${A}#0.5,0.5)`);
    expect(dropRef(text, { id: A, p: { px: 0.5, py: 0.5 } })).toBe(`一 [图](/${A})\n二\n\n[它](/${A})`);
    expect(dropRef(text, { id: B })).toBe(text);
  });
});

describe('拖父卡片带动子卡片', () => {
  const wire = (holder: string, to: string): Wire => ({ key: `${holder}-${to}`, holder, link: { id: `${holder}-${to}`, to } });
  const wires = [wire('a', 'b'), wire('b', 'c'), wire('a', 'd'), wire('c', 'a'), wire('x', 'y')];
  it('顺着连线的方向往下找，带上所有后代；成环也不死循环', () => {
    expect([...withDescendants(wires, ['a'])].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...withDescendants(wires, ['x'])].sort()).toEqual(['x', 'y']);
  });
  it('拖子卡片不带动父卡片', () => {
    expect([...withDescendants(wires, ['d'])]).toEqual(['d']);
    expect([...withDescendants(wires, ['y'])]).toEqual(['y']);
  });
});

describe('能直接播放或预览的文件', () => {
  it('按扩展名分：视频、音频、文档，其余不算', () => {
    expect(previewKind('a.MP4')).toBe('video');
    expect(previewKind('IMG_1.mov')).toBe('video');
    expect(previewKind('语音.m4a')).toBe('audio');
    expect(previewKind('微改.pdf')).toBe('doc');
    expect(previewKind('报价.XLSX')).toBe('doc');
    expect(previewKind('方案.pptx')).toBe('doc');
    expect(previewKind('a.zip')).toBeNull();
    expect(previewKind('没有扩展名')).toBeNull();
  });
});

describe('文件 ID', () => {
  it('带创建时间', () => {
    const id = newFileId(1_800_000_000_000);
    expect(id).toMatch(FILE_ID_RE);
    expect(fileIdTime(id)).toBe(1_800_000_000_000);
    expect(fileIdTime('f'.repeat(32))).toBeNull();
  });
});

describe('合并改动（前后端同一套）', () => {
  const note = { ...itemBase({ id: 'a'.repeat(16), boardId: 'b', x: 0, y: 0, now: 0, expiresAt: DAY, by: 'niuniu' }), type: 'note', text: 'x', color: 'yellow' } as Item;
  it('只改这种元素有的字段', () => {
    expect(mergePatch(note, { name: '地名', x: 5 }, 0, 'banana')).toEqual({ ...note, x: 5 });
  });
  it('内容变了才记最近编辑者；拖动、换颜色不算', () => {
    expect(mergePatch(note, { x: 1, color: 'white' }, 9, 'banana')).toMatchObject({ by: 'niuniu', editedAt: 0 });
    expect(mergePatch(note, { text: 'x' }, 9, 'banana')).toMatchObject({ by: 'niuniu', editedAt: 0 });
    expect(mergePatch(note, { text: 'y' }, 9, 'banana')).toMatchObject({ by: 'banana', editedAt: 9 });
  });
  it('设了提醒就重新等着响；提醒比到期还晚时，到期推到提醒后一天', () => {
    expect(mergePatch({ ...note, remindDone: true }, { remindAt: 3 * DAY }, 0, 'niuniu')).toMatchObject({ remindAt: 3 * DAY, remindDone: false, expiresAt: 4 * DAY });
    expect(mergePatch(note, { ttl: 600 }, 1000, 'niuniu')).toMatchObject({ expiresAt: 1000 + 600_000 });
  });
  it('连线去掉重复的和连自己的', () => {
    const l = (id: string, to: string) => ({ id, to });
    expect(mergePatch(note, { links: [l('00000001', 'c'.repeat(16)), l('00000001', 'c'.repeat(16)), l('00000002', note.id)] }, 0, 'niuniu').links).toEqual([l('00000001', 'c'.repeat(16))]);
  });
});

describe('图片卡还是文件卡', () => {
  it('只看扩展名：网页、快捷指令、聊天记录拆包一个规则', () => {
    expect(['a.PNG', 'IMG_1.heic', 'x.webp'].map(fileKind)).toEqual(['image', 'image', 'image']);
    expect(['a.svg', 'a.pdf', '没有扩展名'].map(fileKind)).toEqual(['file', 'file', 'file']);
  });
});
