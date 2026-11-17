---
description: "牛牛便利贴已确认要处理的事，一句话一条；做完就删"
---

# 待办

只收已确认要处理的事，做完就删。

- 确认强制 HTTPS 和 HSTS 已开：[需求](requirements.md)「登录与权限」要求密码只走 HTTPS，这一项只能在 EdgeOne 控制台开（项目 → 域名管理 → 配置 HTTPS），代码和 SDK 改不了（`plan.md`「HTTPS」，2026-11-16 实测未开）
- iCloud 上共享的那份快捷指令，里面的密码要改成 `密码#自己的名字`：不带名字的请求现在一律 401（`src/server/auth.ts:60`，`plan.md`「需要用户做的」，2026-11-16）
