// 白板：把视口、新建、抓手、框选、连线、快捷键几块拼起来，处理右键菜单、粘贴、拖放。
// 分享链接和提醒的高亮也在这一层。手机上同一套卡片排成一列（styles/mobile.css），没有画布操作
import * as ContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FAULTS, TRASH } from '@/shared/constants';
import { EDGE, NEW_NOTE, clampPos } from '@/shared/layout';
import type { Board } from '@/shared/schema';
import { isTyping, useEvent, useMobile, useTick } from '../../lib/hooks';
import type { Actions } from '../../state/actions';
import { useItems } from '../../state/queries';
import { minimapStore, spotlightStore } from '../../state/stores';
import { Icon } from '../../ui/Icon';
import { DraftNote } from '../items/DraftNote';
import { ItemCard } from '../items/ItemCard';
import { ItemContextMenu } from '../items/ItemContextMenu';
import { anchorAt, type PickAnchor } from '../links/anchors';
import { LinkLayer } from '../links/LinkLayer';
import { withDescendants } from '../links/model';
import { enrichLocation } from '../location/thumbnail';
import { SketchEditor } from '../sketch/SketchEditor';
import { useUploading, type UploadMeta } from '../upload/useUploader';
import { CreateMenuItems, PlusMenu } from './CreateMenu';
import { PEEK, contentCenter, fitScale, worldSize, type Pos } from './geometry';
import { Minimap } from './Minimap';
import { Toolbar } from './Toolbar';
import { UploadingCard } from './UploadingCard';
import { IMAGE, useCreate } from './useCreate';
import { useLinking } from './useLinking';
import { useMarquee } from './useMarquee';
import { usePan } from './usePan';
import { usePlacing } from './usePlacing';
import { useShortcuts } from './useShortcuts';
import { useViewport } from './useViewport';
import { ZoomControl } from './ZoomControl';

const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');

export function BoardView({ board, boards, actions, upload }: {
  board: Board; boards: Board[]; actions: Actions; upload: (files: File[], meta: UploadMeta) => void;
}) {
  const mobile = useMobile();
  useTick(30_000); // 倒计时和到期隐藏
  const { data: items = [], isError, error, isPending } = useItems(board.id);
  const uploads = useUploading().filter((u) => u.boardId === board.id);
  const showMinimap = minimapStore.use();
  const inTrash = board.id === TRASH;

  const [dropping, setDropping] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  /** 高亮时要不要把其余部分压暗 */
  const [dim, setDim] = useState(false);
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [space, setSpace] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [group, setGroup] = useState<{ ids: Set<string>; dx: number; dy: number } | null>(null);
  // 右键点到的是哪张卡片（以及卡片上的哪个锚点）、哪条线；都不是就是空白处，弹新建
  const [ctx, setCtx] = useState<{ item: string | null; anchor?: PickAnchor; link: string | null }>({ item: null, link: null });
  const hand = !mobile && (tool === 'hand' || space);

  const scrollRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const ctxPos = useRef<Pos>({ x: 64, y: 64 });
  const depth = useRef(0);
  const swallowClick = useRef(false);

  const vp = useViewport(scrollRef, canvasRef, mobile);
  const s = vp.scale;
  const place = usePlacing(vp.current, items);
  const pan = usePan(scrollRef, hand);
  const linking = useLinking(board.id, items, actions);
  const marquee = useMarquee({ canvasRef, enabled: !hand && !mobile, toCanvas: vp.toCanvas, scaleNow: vp.scaleNow, selected, setSelected });
  const create = useCreate(board.id, actions, place, upload);

  // 滚动时会频繁重渲染：world 和回调保持同一个引用，卡片（memo）才不用跟着重画
  const size = worldSize(vp.view, items, [
    ...uploads.map((u) => ({ x: u.x, y: u.y, w: 260, h: 120 })),
    ...(create.draft ? [{ ...create.draft, ...NEW_NOTE }] : []),
  ]);
  const world = useMemo(() => ({ w: size.w, h: size.h }), [size.w, size.h]);
  const endSpot = useCallback(() => setLit(null), []);
  const toggleSelect = useCallback((id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  // ── 一起拖：选中的几张一起动；有连线的，拖父卡片时它连出去的卡片跟着动 ──
  const chosen = items.filter((it) => selected.has(it.id));
  /** 拖这张卡片时要一起动的卡片（含它自己） */
  const movedWith = (id: string) => withDescendants(linking.wires, selected.has(id) && selected.size > 1 ? [...selected] : [id]);
  // 卡片是 memo 的，拿到的回调要一直是同一个；里面读最新的状态
  const live = useRef({ items, movedWith, world });
  live.current = { items, movedWith, world };
  // 位移限制在「谁都不出画布」的范围里；松手一次性存所有位置
  const onGroupDrag = useCallback((id: string, d: { dx: number; dy: number }, last: boolean) => {
    const { items: all, movedWith: withIt, world: w } = live.current;
    const ids = withIt(id);
    const list = all.filter((it) => ids.has(it.id));
    const minX = Math.min(...list.map((i) => i.x)), maxX = Math.max(...list.map((i) => i.x));
    const minY = Math.min(...list.map((i) => i.y)), maxY = Math.max(...list.map((i) => i.y));
    const dx = Math.round(Math.min(Math.max(d.dx, EDGE.x - minX), w.w - PEEK - maxX));
    const dy = Math.round(Math.min(Math.max(d.dy, EDGE.y - minY), w.h - PEEK - maxY));
    if (!last) return setGroup({ ids, dx, dy });
    setGroup(null);
    if (dx || dy) actions.patchMany(board.id, list.map((it) => ({ item: it, patch: { x: it.x + dx, y: it.y + dy } })));
  }, [actions, board.id]);
  /** 白板上的删除进废纸篓、还能撤销，不用问；废纸篓里的是真删 */
  const deleteChosen = () => {
    if (inTrash && !confirm(`彻底删除选中的 ${chosen.length} 项？删了就找不回来了`)) return;
    setSelected(new Set());
    actions.removeMany(board.id, chosen);
  };
  const clearTrash = () => {
    if (items.length && confirm(`彻底删除废纸篓里的 ${items.length} 项？删了就找不回来了`)) actions.clearTrash();
  };

  // ── 粘贴：有文件就上传（哪怕光标在输入框里）；文字只在没在打字时接 ──
  useEvent<ClipboardEvent>(document, 'paste', (e) => {
    const data = e.clipboardData;
    if (!data || (isTyping(e.target) && !data.files.length)) return;
    if (create.ingest(data, place.nearPointer)) e.preventDefault();
  });

  useShortcuts(!mobile, {
    tool: setTool,
    space: setSpace,
    del: () => {
      const wire = linking.selected ? linking.wires.find((x) => x.key === linking.selected) : undefined;
      if (wire) linking.remove(wire);
      else if (chosen.length) deleteChosen();
      else return false;
      return true;
    },
    escape: () => { setSelected(new Set()); linking.setSelected(null); linking.stop(); },
  });

  // ── 打开白板时视角居中：有内容对准内容的中心，空白板对准画布中央；画布只往右下长，靠中间四周才都有地方放 ──
  const centered = useRef(false);
  useLayoutEffect(() => {
    if (centered.current || isPending || mobile) return;
    centered.current = true;
    vp.centerOn(contentCenter(items));
  }, [isPending, mobile]);

  // ── 高亮：分享链接、提醒「看看」、点引用把目标放进 spotlightStore；一直闪，直到鼠标移上去 ──
  const spot = spotlightStore.use();
  useEffect(() => {
    if (!spot || !items.some((it) => it.id === spot.itemId)) return;
    const id = spot.itemId;
    spotlightStore.set(null);
    setLit(id);
    setDim(spot.dim);
    requestAnimationFrame(() => canvasRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }));
  }, [spot, items]);

  // ── 位置卡片：还没有缩略图的补一次（手机快捷指令发来的、刚建的） ──
  useEffect(() => {
    if (inTrash) return;
    for (const it of items) if (it.type === 'location') void enrichLocation(actions, board.id, it);
  }, [items, inTrash, actions, board.id]);

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
              place.track(vp.toCanvas(e));
              pan.move(e);
              if (linking.from) linking.setEnd(vp.toCanvas(e));
            }}
            onPointerUp={() => { if (pan.end()) swallowClick.current = true; }}
            onPointerCancel={() => { pan.end(); }}
            onClickCapture={(e) => { if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); e.preventDefault(); } }}
            // 白板里不发起浏览器自己的拖动：不然便利贴里的链接能被拖出来，落在画布上又变成一张新便利贴（还连上线）。
            // 卡片移动用的是指针事件，不受影响；编辑框里拖动选中的字照常
            onDragStart={(e) => { if (!isTyping(e.target)) e.preventDefault(); }}
            onDragEnter={(e) => { if (hasFiles(e)) { depth.current++; setDropping(true); } }}
            onDragLeave={(e) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setDropping(false); } }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              depth.current = 0;
              setDropping(false);
              const p = vp.toCanvas(e);
              create.ingest(e.dataTransfer, (size) => (mobile ? place.center(size) : place.fit({ x: p.x - 40, y: p.y - 30 }, size)));
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
                  const card = id ? items.find((i) => i.id === id) : undefined;
                  const link = card ? null : t.closest<HTMLElement>('[data-link]')?.dataset.link ?? null;
                  setCtx({ item: card?.id ?? null, anchor: card && !inTrash ? anchorAt(card, t, e.clientX, e.clientY) : undefined, link });
                  linking.stop();
                  // 废纸篓的空白处没东西可建：不弹菜单
                  if (inTrash && !card && !link) e.preventDefault();
                }}
                onDoubleClick={(e) => {
                  if (e.target !== e.currentTarget || mobile || hand) return;
                  const p = vp.toCanvas(e);
                  create.startDraft({ x: p.x - 30, y: p.y - 24 });
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
                    onGroupDrag={movedWith(it.id).size > 1 ? onGroupDrag : undefined}
                    groupOffset={group?.ids.has(it.id) ? group : undefined}
                    spotlight={lit === it.id} onSpotlightEnd={endSpot} />
                ))}
                {uploads.map((u) => <UploadingCard key={u.id} {...u} />)}
                {create.draft && (
                  <DraftNote {...create.draft} ttl={create.ttl} onCancel={() => create.setDraft(null)}
                    onSave={(text, color) => { create.createNote(text, create.draft!, color); create.setDraft(null); }} />
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
              <ItemContextMenu item={ctxItem} boardId={board.id} boards={boards} items={items} wires={linking.wires} actions={actions}
                anchor={ctx.anchor} onLink={(a) => linking.start(ctxItem.id, a)} onUnlink={linking.remove}
                selectedCount={selected.has(ctxItem.id) ? chosen.length : 0} onDeleteSelected={deleteChosen} />
            ) : (
              <CreateMenuItems kit={ContextMenu} {...create.menu(() => ctxPos.current)} />
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
      {/* 第一次打开、数据还没到：三张小便利贴轮流跳，免得和「真的是空的」分不清 */}
      {isPending && (
        <div className="empty loading" role="status">
          <div className="hop"><i /><i /><i /></div>
          <div className="empty-sub">正在打开白板…</div>
        </div>
      )}
      {!isError && !isPending && !items.length && !uploads.length && !create.draft && (
        <div className="empty">
          <div className="empty-big">{inTrash ? '废纸篓是空的' : board.id === FAULTS ? '没有失败记录' : '粘贴到这里'}</div>
          <div className="empty-sub">
            {inTrash
              ? '删除的和到期的内容会先到这里，留 30 天，期间可以放回去'
              : board.id === FAULTS ? '页面调接口失败（5xx、网络不通）会记下来，下次请求成功时报到这里，一次一张'
              : mobile ? '点右下角的 + 写便利贴或传文件；iPhone 还可以从系统分享菜单直接发过来' : '右键或底部的 + 新建；也可以直接粘贴、把文件拖进来'}
          </div>
        </div>
      )}
      <div className={clsx('drop', dropping && 'on')}>松手上传</div>
      {linking.from && <div className="link-hint">点另一张卡片连上线；点在图片的某个位置上，就接到那里 <kbd>Esc</kbd> 取消</div>}
      <div className={clsx('spot-dim', lit && dim && 'on')} />

      {mobile ? (
        // 手机没有底部操作栏：右下角常驻加号；废纸篓里不能新建，右上角放「清空废纸篓」
        inTrash ? (
          <div className="corner-float"><button type="button" className="btn danger" onClick={clearTrash}>清空废纸篓</button></div>
        ) : (
          <PlusMenu className="fab" side="top" {...create.menu()} />
        )
      ) : (
        <>
          <Toolbar hand={hand} onTool={setTool} selectedCount={chosen.length} onDeleteSelected={deleteChosen} onClearSelection={() => setSelected(new Set())}
            inTrash={inTrash} trashCount={items.length} onClearTrash={clearTrash} create={create.menu()} />
          <ZoomControl scale={s} onZoom={(f) => vp.zoomTo(vp.scaleNow() * f)} onReset={() => {
            const el = scrollRef.current!;
            vp.centerOn(contentCenter(items), fitScale(items, { w: el.clientWidth, h: el.clientHeight }));
          }} />
          {showMinimap && <Minimap world={world} view={vp.view} canvasRef={canvasRef} onJump={(x, y) => vp.centerOn({ x, y })} />}
        </>
      )}
      <SketchEditor onSave={(file, pos) => create.uploadAt([file], clampPos(pos, { x: world.w - IMAGE.w, y: world.h - IMAGE.h }))} />
      <input {...create.fileInputProps} />
    </div>
  );
}
