// 把 build/（dist 静态页 + 打好的边缘函数 + edgeone.json）部署到 Makers 项目。
// 平台上不装依赖、不构建，产物在本地 npm run build 好
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { PROJECT, SITE } from './lib/config';
import { findProject, makersClient } from './lib/tencent';

for (const f of ['build/dist/index.html', 'build/edge-functions/api/[[default]].js']) {
  if (!existsSync(f)) throw new Error(`缺 ${f}，先 npm run build`);
}
copyFileSync('edgeone.json', 'build/edgeone.json');
writeFileSync('build/package.json', JSON.stringify({ name: PROJECT, private: true }, null, 2));

const makers = await makersClient();
const project = await findProject(makers, PROJECT);
if (!project) throw new Error(`没有项目 ${PROJECT}，先 npm run setup`);
const d = await makers.deployments.deploy({
  projectId: project.projectId,
  artifact: { directory: new URL('../build', import.meta.url).pathname },
  wait: true,
  onStatusChange: (e) => console.log('  部署状态：', e.deployment.status),
});
if (d.status !== 'Success') {
  const { logUrl } = await makers.deployments.getLog({ projectId: project.projectId, deploymentId: d.deploymentId });
  throw new Error(`部署 ${d.status}，构建日志：${logUrl}`);
}
console.log(`✅ 部署成功 ${d.deploymentId}：${SITE}（生效要几十秒）`);
