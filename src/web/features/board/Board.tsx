// 白板：把视口、放置、抓手、框选、连线几块拼起来，处理右键菜单、粘贴、拖放、快捷键。
// 分享链接和提醒的高亮也在这一层
import * as ContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { toast } from 'sonner';
import { TRASH } from '@/shared/constants';
import { parseCoords } from '@/shared/geo';
import type { Board, NoteItem } from '@/shared/schema';
import { serverNow } from '../../api/client';
import { useMobile, useTick } from '../../lib/hooks';
import type { Actions } from '../../state/actions';
import { useItems } from '../../state/queries';
import { minimapStore, sketchStore, spotlightStore, ttlStore } from '../../state/stores';
import { undoLast } from '../../state/undo';
import { Icon } from '../../ui/Icon';
import { ItemCard } from '../items/ItemCard';
import { ItemMenu } from '../items/ItemMenu';
import { UploadingCard } from '../items/bodies';
import { anchorAt, type PickAnchor } from '../links/anchors';
import { LinkLayer } from '../links/LinkLayer';
import { withDescendants } from '../links/model';
import { enrichLocation } from '../location/thumbnail';
import { SketchEditor } from '../sketch/SketchEditor';
import { useUploading } from '../upload/useUploader';
import { CreateMenuItems, type CreateHandlers } from './CreateMenu';
import { CARD, contentCenter, fitScale, worldSize, type Pos } from './geometry';
import { Minimap } from './Minimap';
import { Toolbar } from './Toolbar';
import { useLinking } from './useLinking';
import { useMarquee } from './useMarquee';
import { usePan } from './usePan';
import { usePlacing } from './usePlacing';
import { useViewport } from './useViewport';
import { ZoomControl } from './ZoomControl';

export type BoardApi = { startDraft(pos?: Pos): void; startSketch(pos?: Pos): void; pickFiles(pos?: Pos): void; startLocation(pos?: Pos): void };
type Upload = (files: File[], meta: { boardId: string; x: number; y: number; ttl: number | null }) => void;

const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
const typing = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function BoardView({ board, boards, actions, upload, apiRef }: {
  board: Board; boards: Board[]; actions: Actions; upload: Upload; apiRef: Ref<BoardApi>;
}) {
  const mobile = useMobile();
  useTick(30_000); // 倒计时和到期隐藏
  const { data: items = [], isError, error, isPending } = useItems(board.id);
  const uploads = useUploading().filter((u) => u.boardId === board.id);
  const ttl = ttlStore.use();
  const showMinimap = minimapStore.use();
  const inTrash = board.id === TRASH;

  const [draft, setDraft] = useState<Pos | null>(null);
  const [dropping, setDropping] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [space, setSpace] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [group, setGroup] = useState<{ ids: Set<string>; dx: number; dy: number } | null>(null);
  // 右键点到的是哪张卡片（以及卡片上的哪个锚点）、哪条线；都不是就是空白处，弹新建
  const [ctx, setCtx] = useState<{ item: string | null; anchor?: PickAnchor; link: string | null }>({ item: null, link: null });
  const hand = !mobile && (tool === 'hand' || space);

  const scrollRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ctxPos = useRef<Pos>({ x: 64, y: 64 });
  const filePos = useRef<Pos | null>(null);
  const depth = useRef(0);
  const swallowClick = useRef(false);

  const vp = useViewport(scrollRef, canvasRef, mobile);
  const s = vp.scale;
  const place = usePlacing(vp.current, items);
  const pan = usePan(scrollRef, hand);
  const linking = useLinking(board.id, items, actions);
  const marquee = useMarquee({ canvasRef, enabled: !hand && !mobile, toCanvas: vp.toCanvas, scaleNow: vp.scaleNow, selected, setSelected });

  // 滚动时会频繁重渲染：world 和回调保持同一个引用，卡片（memo）才不用跟着重画
  const size = worldSize(vp.view, items, [
    ...uploads.map((u) => ({ x: u.x, y: u.y, w: 260, h: 120 })),
    ...(draft ? [{ ...draft, w: 240, h: 220 }] : []),
  ]);
  const world = useMemo(() => ({ w: size.w, h: size.h }), [size.w, size.h]);
  const endSpot = useCallback(() => setLit(null), []);
  const toggleSelect = useCallback((id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  // ── 新建 ──
  const blocked = () => {
    if (!inTrash) return false;
    toast('废纸篓里不能直接贴，先切到别的白板');
    return true;
  };
  const startDraft = (pos?: Pos) => { if (!blocked()) setDraft(pos ? place.fit(pos) : place.center()); };
  const pickFiles = (pos?: Pos) => {
    if (blocked()) return;
    filePos.current = pos ? place.fit(pos, CARD.image) : null;
    fileInput.current?.click();
  };
  const uploadAt = (files: File[], pos: Pos) => { if (files.length && !blocked()) upload(files, { boardId: board.id, ...pos, ttl }); };
  const startSketch = (pos?: Pos) => { if (!blocked()) sketchStore.set({ at: Date.now(), pos: pos ? place.fit(pos, CARD.image) : place.center(CARD.image) }); };
  const createNote = (text: string, pos: Pos, color = 'yellow') => {
    if (blocked()) return;
    // 只取坐标：草稿便利贴整张传进来时，它的空 text 不能盖掉刚写的字
    actions.create(board.id, { type: 'note', text, color: color as NoteItem['color'], x: pos.x, y: pos.y, ttl });
  };
  const createLocation = (lat: number, lng: number, pos: Pos) => {
    if (!blocked()) actions.create(board.id, { type: 'location', lat: round6(lat), lng: round6(lng), x: pos.x, y: pos.y, ttl });
  };
  /** 取这台设备的当前位置，建一张位置卡片 */
  const startLocation = (pos?: Pos) => {
    if (blocked()) return;
    if (!navigator.geolocation) { toast.error('这个浏览器取不到位置，可以直接粘贴「纬度,经度」'); return; }
    const at = pos ? place.fit(pos, CARD.location) : place.center(CARD.location);
    const tid = toast.loading('正在取当前位置…');
    navigator.geolocation.getCurrentPosition(
      (g) => { toast.dismiss(tid); createLocation(g.coords.latitude, g.coords.longitude, at); },
      (err) => { toast.dismiss(tid); toast.error(err.code === err.PERMISSION_DENIED ? '没有定位权限：在浏览器里允许后再试，或者直接粘贴「纬度,经度」' : '取不到当前位置，可以直接粘贴「纬度,经度」'); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  useImperativeHandle(apiRef, () => ({ startDraft, startSketch, pickFiles, startLocation }));
  const createAt = (pos?: () => Pos): CreateHandlers => ({
    onNote: () => startDraft(pos?.()), onSketch: () => startSketch(pos?.()), onFile: () => pickFiles(pos?.()), onLocation: () => startLocation(pos?.()),
  });

  // ── 一起拖：选中的几张一起动；有连线的，拖父卡片时它连出去的卡片跟着动 ──
  const chosen = items.filter((it) => selected.has(it.id));
  /** 拖这张卡片时要一起动的卡片（含它自己） */
  const movedWith = (id: string, sel: Set<string>, wires: typeof linking.wires) =>
    withDescendants(wires, sel.has(id) && sel.size > 1 ? [...sel] : [id]);
  const live = useRef({ items, selected, wires: linking.wires, world, boardId: board.id });
  live.current = { items, selected, wires: linking.wires, world, boardId: board.id };
  // 位移限制在「谁都不出画布」的范围里；松手一次性存所有位置
  const onGroupDrag = useCallback((id: string, d: { dx: number; dy: number }, last: boolean) => {
    const { items: all, selected: sel, wires, world: w, boardId } = live.current;
    const ids = movedWith(id, sel, wires);
    const list = all.filter((it) => ids.has(it.id));
    if (!list.length) return;
    const minX = Math.min(...list.map((i) => i.x)), maxX = Math.max(...list.map((i) => i.x));
    const minY = Math.min(...list.map((i) => i.y)), maxY = Math.max(...list.map((i) => i.y));
    const dx = Math.round(Math.min(Math.max(d.dx, 8 - minX), w.w - 80 - maxX));
    const dy = Math.round(Math.min(Math.max(d.dy, 44 - minY), w.h - 80 - maxY));
    if (!last) return setGroup({ ids, dx, dy });
    setGroup(null);
    if (dx || dy) actions.patchMany(boardId, list.map((it) => ({ item: it, patch: { x: it.x + dx, y: it.y + dy } })));
  }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps
  const deleteChosen = () => {
    if (!chosen.length) return;
    // 白板上的删除进废纸篓、还能撤销，不用问；废纸篓里的是真删
    if (inTrash && !confirm(`彻底删除选中的 ${chosen.length} 项？删了就找不回来了`)) return;
    setSelected(new Set());
    actions.removeMany(board.id, chosen);
  };
  const clearTrash = () => {
    if (items.length && confirm(`彻底删除废纸篓里的 ${items.length} 项？删了就找不回来了`)) actions.clearTrash();
  };

  // ── 粘贴：有文件就上传（哪怕光标在输入框里）；一对坐标变位置卡片；其余文字变便利贴 ──
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); uploadAt(files, place.nearPointer(CARD.image)); return; }
      if (typing(e.target)) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text?.trim()) return;
      e.preventDefault();
      const spot = parseCoords(text);
      if (spot) createLocation(spot.lat, spot.lng, place.nearPointer(CARD.location));
      else createNote(text, place.nearPointer());
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  // ── 键盘：V / H 切工具，按住空格临时变抓手，Delete 删所选，Esc 取消选择，Ctrl/Cmd+Z 撤销 ──
  useEffect(() => {
    if (mobile) return;
    const down = (e: KeyboardEvent) => {
      // 正在打字时这些键都归输入框（Ctrl+Z 撤销的是打的字）；画布编辑器开着时归它
      if (typing(e.target) || sketchStore.get()) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') setTool('select');
      else if (e.key === 'h' || e.key === 'H') setTool('hand');
      else if (e.key === ' ') { e.preventDefault(); setSpace(true); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && linking.selected) { e.preventDefault(); const w = linking.wires.find((x) => x.key === linking.selected); if (w) linking.remove(w); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && chosen.length) { e.preventDefault(); deleteChosen(); }
      else if (e.key === 'Escape') { setSelected(new Set()); linking.setSelected(null); linking.stop(); }
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false); };
    const blur = () => setSpace(false);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); };
  });

  // ── 打开白板时视角居中：有内容对准内容的中心，空白板对准画布中央；画布只往右下长，靠中间四周才都有地方放 ──
  const centered = useRef(false);
  useLayoutEffect(() => {
    if (centered.current || isPending || mobile || !scrollRef.current) return;
    centered.current = true;
    vp.centerOn(contentCenter(items));
  }, [isPending, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 高亮：分享链接、提醒「看看」把目标放进 spotlightStore；一直闪，直到鼠标移上去 ──
  const spot = spotlightStore.use();
  useEffect(() => {
    if (!spot || !items.some((it) => it.id === spot.itemId)) return;
    const id = spot.itemId;
    spotlightStore.set(null);
    setLit(id);
    requestAnimationFrame(() => canvasRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }));
  }, [spot, items]);

  // ── 位置卡片：还没有缩略图的补一次（手机快捷指令发来的、刚建的） ──
  useEffect(() => {
    if (inTrash) return;
    for (const it of items) if (it.type === 'location') void enrichLocation(actions, board.id, it);
  }, [items, inTrash, actions, board.id]);

  const draftItem: NoteItem | null = draft && {
    id: 'draft', boardId: board.id, type: 'note', text: '', color: 'yellow', x: draft.x, y: draft.y, rev: 1,
    createdAt: Date.now(), updatedAt: Date.now(), expiresAt: ttl === null ? null : serverNow() + ttl * 1000, remindAt: null, remindDone: false,
  };
  const version = items.map((i) => `${i.id}:${i.x}:${i.y}:${i.rev}`).join('|') + `#${uploads.length}#${draft ? 1 : 0}`;
  const ctxItem = ctx.item ? items.find((i) => i.id === ctx.item) : undefined;
  const ctxWire = ctx.link ? linking.wires.find((w) => w.key === ctx.link) : undefined;

  return (
    <div className={clsx('stage', hand && 'hand', pan.panning && 'panning', marquee.box && 'boxing', linking.from && 'linking')}>
      <ContextMenu.Root modal={false}>
        <ContextMenu.Trigger asChild disabled={mobile}>
          <main
            ref={scrollRef}
            className="board"
            onScroll={vp.onScroll}
            // 连线中按下就定；否则看是不是抓手。都在捕获阶段拦，卡片不会被拖走
            onPointerDownCapture={(e) => {
              if (linking.pick(e)) { e.stopPropagation(); e.preventDefault(); swallowClick.current = true; }
              else pan.start(e);
            }}
            onPointerMove={(e) => {
              if (canvasRef.current) place.track(vp.toCanvas(e));
              pan.move(e);
              if (linking.from) linking.setEnd(vp.toCanvas(e));
            }}
            onPointerUp={() => { if (pan.end()) swallowClick.current = true; }}
            onPointerCancel={() => { pan.end(); }}
            onClickCapture={(e) => { if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); e.preventDefault(); } }}
            onDragEnter={(e) => { if (hasFiles(e)) { depth.current++; setDropping(true); } }}
            onDragLeave={(e) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setDropping(false); } }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              depth.current = 0;
              setDropping(false);
              const p = vp.toCanvas(e);
              const at = (size?: [number, number]) => (mobile ? place.center(size) : place.fit({ x: p.x - 40, y: p.y - 30 }, size));
              const files = [...e.dataTransfer.files];
              if (files.length) uploadAt(files, at(CARD.image));
              else {
                const text = e.dataTransfer.getData('text/plain');
                if (text.trim()) createNote(text, at());
              }
            }}
          >
            {/* sizer 撑出缩放后的滚动范围；canvas 按画布坐标排版，整体 scale */}
            <div className="sizer" style={{ width: world.w * s, height: world.h * s }}>
              <div
                ref={canvasRef}
                className="canvas"
                style={{ width: world.w, height: world.h, transform: s === 1 ? undefined : `scale(${s})` }}
                onPointerDown={(e) => { if (e.target === e.currentTarget) linking.setSelected(null); marquee.start(e); }}
                onPointerMove={marquee.move}
                onPointerUp={marquee.end}
                onPointerCancel={marquee.end}
                onContextMenu={(e) => {
                  const p = vp.toCanvas(e);
                  ctxPos.current = { x: p.x - 20, y: p.y - 20 };
                  const t = e.target as Element;
                  const id = t.closest<HTMLElement>('.item[data-id]')?.dataset.id;
                  const card = id && id !== 'draft' ? items.find((i) => i.id === id) : undefined;
                  const link = card ? null : t.closest<HTMLElement>('[data-link]')?.dataset.link ?? null;
                  setCtx({ item: card?.id ?? null, anchor: card && !inTrash ? anchorAt(card, t, e.clientX, e.clientY) : undefined, link });
                  linking.stop();
                  // 废纸篓的空白处没东西可建：不弹菜单
                  if (inTrash && !card && !link) e.preventDefault();
                }}
                onDoubleClick={(e) => {
                  if (e.target !== e.currentTarget || mobile || hand) return;
                  const p = vp.toCanvas(e);
                  startDraft({ x: p.x - 30, y: p.y - 24 });
                }}
              >
                {!mobile && (
                  <LinkLayer wires={linking.wires} items={items} canvasRef={canvasRef} world={world}
                    selected={linking.selected} onSelect={linking.setSelected} onRemove={linking.remove}
                    temp={linking.from ? { from: linking.from.id, anchor: linking.from.anchor, to: linking.end } : null} />
                )}
                {items.map((it) => (
                  <ItemCard key={it.id} item={it} boardId={board.id} boards={boards} actions={actions} mobile={mobile}
                    bounds={world} canDrag={!hand} scale={s} selected={selected.has(it.id)} onShiftClick={toggleSelect}
                    onGroupDrag={movedWith(it.id, selected, linking.wires).size > 1 ? onGroupDrag : undefined}
                    groupOffset={group?.ids.has(it.id) ? group : undefined}
                    spotlight={lit === it.id} onSpotlightEnd={endSpot} />
                ))}
                {uploads.map((u) => <UploadingCard key={u.id} {...u} />)}
                {draftItem && (
                  <ItemCard key="draft" item={draftItem} boardId={board.id} boards={boards} actions={actions} mobile={mobile} bounds={world} canDrag={false} scale={s}
                    draft={{ onSave: (text, color) => { setDraft(null); createNote(text, draftItem, color); }, onCancel: () => setDraft(null) }} />
                )}
                {marquee.box && <div className="marquee" style={{ left: marquee.box.x, top: marquee.box.y, width: marquee.box.w, height: marquee.box.h }} />}
              </div>
            </div>
          </main>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          {/* 关菜单时不把焦点还给白板：不然「编辑」刚打开的输入框会被抢走焦点 */}
          <ContextMenu.Content className="menu" onCloseAutoFocus={(e) => e.preventDefault()}>
            {ctxWire ? (
              <ContextMenu.Item className="mi danger" onSelect={() => linking.remove(ctxWire)}><Icon name="unlink" /><span>删除连线</span></ContextMenu.Item>
            ) : ctxItem ? (
              <ItemMenu item={ctxItem} boardId={board.id} boards={boards} items={items} wires={linking.wires} actions={actions} mobile={mobile}
                anchor={ctx.anchor} onLink={(a) => linking.start(ctxItem.id, a)} onUnlink={linking.remove}
                selectedCount={selected.has(ctxItem.id) ? chosen.length : 0} onDeleteSelected={deleteChosen} />
            ) : (
              <CreateMenuItems kit={ContextMenu} {...createAt(() => ctxPos.current)} />
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {isError && !items.length && (
        <div className="empty">
          <div className="empty-big err">读不到这块白板</div>
          <div className="empty-sub">{error instanceof Error ? error.message : String(error)}；数据还在服务器上，过一会儿会自动重试</div>
        </div>
      )}
      {!isError && !isPending && !items.length && !uploads.length && !draft && (
        <div className="empty">
          <div className="empty-big">{inTrash ? '废纸篓是空的' : '粘贴到这里'}</div>
          <div className="empty-sub">
            {inTrash
              ? '删除的和到期的内容会先到这里，留 30 天，期间可以放回去'
              : mobile ? '点右下角的 + 写便利贴或传文件；iPhone 还可以从系统分享菜单直接发过来' : '右键或底部的 + 新建；也可以直接粘贴、把文件拖进来'}
          </div>
        </div>
      )}
      <div className={clsx('drop', dropping && 'on')}>松手上传</div>
      {linking.from && <div className="link-hint">点另一张卡片连上线；点在图片的某个位置上，就接到那里 <kbd>Esc</kbd> 取消</div>}
      <div className={clsx('spot-dim', lit && 'on')} />

      {!mobile && (
        <>
          <Toolbar hand={hand} onTool={setTool} selectedCount={chosen.length} onDeleteSelected={deleteChosen} onClearSelection={() => setSelected(new Set())}
            inTrash={inTrash} trashCount={items.length} onClearTrash={clearTrash} create={createAt()} />
          <ZoomControl scale={s} onZoom={(f) => vp.zoomTo(vp.scaleNow() * f)} onReset={() => {
              const el = scrollRef.current;
              vp.centerOn(contentCenter(items), el ? fitScale(items, { w: el.clientWidth, h: el.clientHeight }) : 1);
            }} />
          {showMinimap && <Minimap world={world} view={vp.view} canvasRef={canvasRef} version={version} onJump={(x, y) => vp.centerOn({ x, y })} />}
        </>
      )}
      <SketchEditor onSave={(file, pos) => uploadAt([file], {
        x: Math.round(Math.min(Math.max(8, pos.x), world.w - 300)),
        y: Math.round(Math.min(Math.max(44, pos.y), world.h - 320)),
      })} />
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => {
        uploadAt([...(e.target.files ?? [])], filePos.current ?? place.center(CARD.image));
        e.target.value = '';
      }} />
    </div>
  );
}
