// 给 smoke、backup、wipe 用：带着站点密码调线上接口，请求头是 X-Password: 密码#名字，名字用 NAMES 里的第一个。
// 密码和名字映射从 .env 读，没有就去项目的环境变量里取
import { PROJECT, SITE } from './config';
import { findProject, makersClient, projectEnv } from './tencent';

export const BASE = process.env.CLIP_URL ?? SITE;

export type SiteAuth = { password: string; name: string; aiPassword?: string };

export async function siteAuth(): Promise<SiteAuth> {
  let { SITE_PASSWORD: password, NAMES: names, AI_PASSWORD: aiPassword } = process.env;
  if (!password || !names) {
    const makers = await makersClient();
    const project = await findProject(makers, PROJECT);
    if (!project) throw new Error(`没有项目 ${PROJECT}，先 npm run setup`);
    const env = await projectEnv(makers, project.projectId);
    password ||= env.SITE_PASSWORD;
    names ||= env.NAMES;
    aiPassword ||= env.AI_PASSWORD;
  }
  if (!password) throw new Error('项目里没有 SITE_PASSWORD');
  const name = names?.split(',')[0]?.split(':')[0]?.trim();
  if (!name) throw new Error('没有名字映射 NAMES：写进 .env，再 npm run setup');
  return { password, name, aiPassword };
}

export async function siteClient() {
  const { password, name } = await siteAuth();
  return async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = { 'X-Password': `${password}#${name}` }) {
    const res = await fetch(`${BASE}/api${path}`, {
      method, redirect: 'manual',
      headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* 文件或纯文本 */ }
    return { status: res.status, data, res };
  };
}
