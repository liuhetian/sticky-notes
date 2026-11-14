// 部署相关的固定配置，和从 .env 读密钥的入口。密钥只在本机脚本里用，不打印
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

/** EdgeOne Makers 项目名 */
export const PROJECT = 'clip';
export const DOMAIN = 'clip.liuhetian.life';
export const SITE = `https://${DOMAIN}`;
/** 本地开发时页面的来源，也要允许它往 COS 传文件 */
export const DEV_ORIGIN = 'http://localhost:5173';

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺环境变量 ${name}（写在 .env 里）`);
  return v;
}

/** 主账号密钥：建项目、绑域名、配桶的跨域规则用 */
export const mainCredentials = () => ({
  secretId: process.env.TENCENTCLOUD_SECRET_ID ?? need('COS_SECRET_ID'),
  secretKey: process.env.TENCENTCLOUD_SECRET_KEY ?? need('COS_SECRET_KEY'),
});

/** 存文件的桶，和只管这个桶的子账号密钥（线上边缘函数用的就是它） */
export const bucket = () => ({
  name: need('CLIP_COS_BUCKET'),
  region: need('CLIP_COS_REGION'),
  secretId: need('CLIP_COS_SECRET_ID'),
  secretKey: need('CLIP_COS_SECRET_KEY'),
});
