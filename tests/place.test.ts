import { describe, expect, it } from 'vitest';
import { pickPlaceName } from '../src/shared/geo';
import { autoPlace, sizeOf } from '../src/server/services/place';

describe('自动挑位置', () => {
  it('空白板放画布中央', () => {
    const p = autoPlace([]);
    expect(Math.abs(p.x + 120 - 1500)).toBeLessThan(5);
    expect(Math.abs(p.y - 1000)).toBeLessThan(120);
  });
  it('不压着已有的卡片，也不会离得太远', () => {
    const items = [{ type: 'note' as const, text: 'a', x: 1380, y: 900 }];
    for (let i = 0; i < 8; i++) {
      const size = sizeOf({ type: 'image' });
      const p = autoPlace(items, size);
      for (const it of items) {
        const s = sizeOf(it);
        expect(p.x + size.w <= it.x || p.x >= it.x + s.w || p.y + size.h <= it.y || p.y >= it.y + s.h).toBe(true);
      }
      expect(Math.hypot(p.x - 1380, p.y - 900)).toBeLessThan(1600);
      items.push({ type: 'image' as never, text: '', ...p });
    }
  });
});

describe('地名', () => {
  it('有名字的地方用「区 + 名字」，没有名字用街道，都没有用区', () => {
    expect(pickPlaceName({ name: '天府广场', district: '青羊区', city: '成都市' })).toBe('青羊区 天府广场');
    expect(pickPlaceName({ street: '人民南路', city: '成都市' })).toBe('成都市 人民南路');
    expect(pickPlaceName({ city: '成都市' })).toBe('成都市');
    expect(pickPlaceName({})).toBe('');
  });
});
