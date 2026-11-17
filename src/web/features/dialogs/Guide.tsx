// i 按钮里的说明：做成常见问题，一条一个折叠块，点标题才展开。
// 快捷指令只写它做什么和接口约定：家里已经有人搭好，其他人靠 iCloud 链接直接添加，不用照着一步步搭带签名的 .shortcut 只能在 Mac 上签，这里写清楚让一个人搭一次，再用 iCloud 链接分享给其他人
import { TRASH } from '@/shared/constants';
import type { Board } from '@/shared/schema';
import { guideStore } from '../../state/stores';
import type { ReactNode } from 'react';
import { Shell } from './Shell';

/** 一条常见问题：平时只露标题，点开才看内容 */
function Q({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="faq">
      <summary>{title}</summary>
      <div className="faq-body">{children}</div>
    </details>
  );
}

export function Guide({ boards }: { boards: Board[] }) {
  const open = guideStore.use();
  const origin = location.origin;
  const names = boards.filter((b) => b.id !== TRASH).map((b) => b.name);
  const code = (s: string) => <code>{s}</code>;
  const v = (s: string) => <span className="var">{s}</span>;
  return (
    <Shell open={open} onClose={() => guideStore.set(false)} className="guide" title="常见问题">
      <Q title="内容会保留多久？删掉的还能找回吗？">
      <ul className="steps">
        <li>设置里的几项（保留多久、新便利贴的颜色、小地图、自动同步）都只对这台设备生效；手机上没有小地图。</li>
        <li>自动同步默认关：别的设备的改动，切回这个页面时才看得到。</li>
        <li>每块白板最多 50 个元素。到期和删除的内容先进废纸篓，30 天后才真正删除，期间可以放回；废纸篓最多留 50 个，超出时最早删的先没。</li>
        <li>单个元素的保留时长在右键菜单或卡片右下角的倒计时处改。</li>
      </ul>
      </Q>
      <Q title="iPhone 上怎么从分享菜单直接发到牛牛便利贴？">
      <p>用一条叫「发到牛牛便利贴」的快捷指令。家里已经有人搭好了：让对方在快捷指令里点「共享 → 拷贝 iCloud 链接」发给你，点开添加，导入时把密码填成 {code('密码#自己的名字')}（比如 {code('密码#niuniu')}）就能用。之后在任何 App 里点「分享」，选它，再选发到哪块白板。</p>
      <p>它做的事：先选白板，再把分享进来的每一样东西按类型发到对应的接口。要自己搭或者改的话，照这张表：</p>
      <ul className="steps">
        <li>类型是 {code('URL')}：POST {code(`${origin}/api/share/link`)}，JSON 带 {code('board')}、{code('url')}、{code('title')}（那一项的「名称」）。</li>
        <li>类型是 {code('文本')}：POST {code(`${origin}/api/share/text`)}，JSON 带 {code('board')}、{code('text')}。</li>
        <li>其余（照片、文件）：POST {code(`${origin}/api/share/file`)}，JSON 带 {code('board')}、{code('name')}、{code('ext')}；它直接返回一个上传地址，再对这个地址 PUT 文件本身。</li>
        <li>每个请求的头部都带 {code('X-Password')} = {code('密码#自己的名字')}；{code('board')} 填白板名字（{names.map((n, i) => <span key={n}>{i ? '、' : ''}{code(n)}</span>)}）。</li>
        <li>类型用「获取类型」这个动作判断。这次分享里只要有 URL，就只发 URL，文字和文件不发：地图 App 分享地点时会顺带塞名字和小图标，这样白板上只出一张位置卡片。</li>
        <li>共享表单的接收类型不要选「任何」，也别勾「Safari 网页」，否则 Safari 交过来的是整个网页而不是网址。</li>
      </ul>
      <p className="muted">照片保持原格式，电脑上显示时自动转换；传完之前白板上先有一张「手机那边正在传」的卡片。单个文件最大 100 MB。</p>
      </Q>
      <Q title="怎么把手机的当前位置发过来？">
      <p>另建一条快捷指令「发位置到牛牛便利贴」，2 个动作，放在主屏幕或用 Siri 叫它：</p>
      <ol className="steps">
        <li><b>获取当前位置</b>。</li>
        <li><b>获取 URL 内容</b>：{code(`${origin}/api/share/location`)}，方法 {code('POST')}，头部 {code('X-Password')} = {code('密码#自己的名字')}，请求体 JSON：{code('board')} = 白板名字（比如 {code(names[0] ?? '共用')}），{code('lat')} = {v('当前位置')} 的「纬度」，{code('lng')} = {v('当前位置')} 的「经度」。</li>
      </ol>
      <p className="muted">白板上会出现一张位置卡片，地名和地图缩略图在第一次打开白板时自动补上。</p>
      </Q>
      <Q title="高德地图、苹果地图里的地点怎么发过来？">
      <p>在高德地图或苹果地图里看中一个地点，点「分享」再选那条「发到牛牛便利贴」快捷指令（搭法见第二个问题）。地图 App 交过来的是一条链接，白板上会变成一张位置卡片，名字就是地图里的地点名。</p>
      </Q>
      <Q title="怎么让 AI 读写白板？">
      <p>把 AI 的密码放进 AI 所在环境的环境变量 {code('MY_API_KEY')}，它每个请求的头部都会带 {code('X-Password')} = {code('$MY_API_KEY#ai')}。这个密码只能用给 AI 的那组接口，看不了别的。</p>
      <p>然后让它先读说明：{code(`${origin}/wiki/ai-api.md`)}（带上密码时，里面的白板列表是实时的）。人看的版本在 <a href={`${origin}/wiki/`} target="_blank" rel="noreferrer">{`${origin}/wiki/`}</a>。</p>
      </Q>
    </Shell>
  );
}
