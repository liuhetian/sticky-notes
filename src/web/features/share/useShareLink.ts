// 分享链接 /share/<白板id>/<元素id>（只分享白板就是 /share/<白板id>）：登录后切到那块白板并高亮那个元素，
// 然后把路径从地址栏去掉，回到 /。只认链接里的白板，元素不在上面就提示不存在
import { useEffect } from 'react';
import { ITEM_ID_RE } from '@/shared/constants';
import { jumpTo } from '../../state/stores';

export function useShareLink(ready: boolean) {
  useEffect(() => {
    if (!ready || (location.pathname === '/' && !location.hash)) return;
    const [, boardId, itemId] = location.pathname.match(/^\/share\/([0-9a-z]{1,40})(?:\/([^/]+))?\/?$/) ?? [];
    history.replaceState(null, '', `/${location.search}`);
    if (boardId) jumpTo(boardId, itemId && ITEM_ID_RE.test(itemId) ? itemId : undefined);
  }, [ready]);
}
