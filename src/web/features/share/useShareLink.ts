// 分享链接 /<id>：登录后跳到那个元素（切到它所在的白板并高亮），然后把路径从地址栏去掉，回到 /
import { useEffect } from 'react';
import { ITEM_ID_RE } from '@/shared/constants';
import { jumpTo } from '../../state/stores';

export function useShareLink(ready: boolean) {
  useEffect(() => {
    if (!ready || (location.pathname === '/' && !location.hash)) return;
    // 只认最后一段；引用图片某个点时带的 #px,py 一起去掉
    const id = location.pathname.split('/').filter(Boolean).pop();
    history.replaceState(null, '', `/${location.search}`);
    if (id && ITEM_ID_RE.test(id)) jumpTo(id);
  }, [ready]);
}
