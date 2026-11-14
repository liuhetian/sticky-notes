// 分享链接 /?item=<id>：登录后找到元素所在白板，切过去并高亮，然后把参数从地址栏去掉
import { useEffect } from 'react';
import { toast } from 'sonner';
import { api, unwrap } from '../../api/client';
import { spotlight } from '../../state/stores';

export function useShareLink(ready: boolean, switchBoard: (id: string) => void) {
  useEffect(() => {
    if (!ready) return;
    const url = new URL(location.href);
    const itemId = url.searchParams.get('item');
    if (!itemId) return;
    url.searchParams.delete('item');
    history.replaceState(null, '', url.pathname + url.search);
    unwrap<{ boardId: string }>(api.items[':id'].locate.$get({ param: { id: itemId } }))
      .then(({ boardId }) => { switchBoard(boardId); spotlight(itemId); })
      .catch(() => toast.error('这条已经过期或被删了'));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
