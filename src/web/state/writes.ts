// 所有写操作排成一队，一个个发：服务端是「读出来、改、写回去」，同一台设备并发写会互相覆盖
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
let seq = 0;

export function enqueue<T>(job: () => Promise<T>): Promise<T> {
  pending++;
  // 计数在 finally 里改：调用方拿到结果时「正在写」已经结束，紧接着触发的同步才不会被当成写到一半而跳过
  const p = chain.then(job).finally(() => { pending--; seq++; });
  chain = p.then(() => {}, () => {});
  return p;
}

/** 本机还有没写完的：这时候拉回来的数据可能是旧的，先不拿它覆盖界面 */
export const isWriting = () => pending > 0;
/** 每写完一次加 1：拉数据前后对一下，中间写过就丢掉这次拉的结果 */
export const writeSeq = () => seq;
/** 排着的都写完了 */
export const writesDone = () => chain;
