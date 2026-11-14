// 给 smoke、backup 用：带着站点密码调线上接口。密码从 SITE_PASSWORD 读，没有就去项目的环境变量里取
import { PROJECT, SITE } from './config';
import { findProject, makersClient, projectEnv } from './tencent';

export const BASE = process.env.CLIP_URL ?? SITE;

export async function sitePassword(): Promise<string> {
  if (process.env.SITE_PASSWORD) return process.env.SITE_PASSWORD;
  const makers = await makersClient();
  const project = await findProject(makers, PROJECT);
  if (!project) throw new Error(`没有项目 ${PROJECT}，先 npm run setup`);
  const pw = (await projectEnv(makers, project.projectId)).SITE_PASSWORD;
  if (!pw) throw new Error('项目里没有 SITE_PASSWORD');
  return pw;
}

export async function siteClient() {
  const password = await sitePassword();
  return async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = { 'X-Password': password }) {
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
