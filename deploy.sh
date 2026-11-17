#!/usr/bin/env bash
# 便利贴 wiki 构建（规范：test-wiki/main-wiki/docs/new-subservice.md）：复制 live.js → 构建 HTML → 复制 .md 源文件 → 后处理
#
# 产物在 site/。和规范里的子服务不同，便利贴跑在 EdgeOne 上，构建完不会自己生效：
# npm run build:docs 会调这个脚本，再把 site/（不含 .md）放进 build/dist/wiki/，npm run deploy 上线。
# /wiki/x.md 由边缘函数渲染（src/server/wiki.ts，原文打进函数），site/ 里的 .md 只给 postbuild 检查链接用。
#
# 共享的 live.js、postbuild.py 和 Python 环境（zensical）都用兄弟目录 test-wiki 的；在别处时设 WIKI_ROOT。
set -euo pipefail
cd "$(dirname "$0")"
WIKI="${WIKI_ROOT:-../test-wiki}"

# live.js 统一维护在 test-wiki/shared/，构建前复制进 docs/
mkdir -p docs/javascripts && cp "$WIKI/shared/live.js" docs/javascripts/live.js

# 1. 构建 HTML（zensical 每次都会清空并重建 site/，所以复制 .md 必须放在这一步之后）
uv run --project "$WIKI" zensical build

# 2. 把 docs/ 下的 .md 按原目录结构复制进 site/。开了 use_directory_urls，HTML 在 x/index.html，x.md 正好空着
rsync -a --include='*/' --include='*.md' --exclude='*' --prune-empty-dirs docs/ site/

# 3. HTML 加 <link rel="alternate">，检查相对链接
uv run --project "$WIKI" python "$WIKI/shared/postbuild.py" site
