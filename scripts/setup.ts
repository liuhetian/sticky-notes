// 一次性的环境准备，可以重复跑（做过的步骤会跳过）：
//   1. 建 Makers 项目（中国大陆加速），写环境变量
//   2. 给存文件的 COS 桶配跨域规则（浏览器要直接往桶里 PUT）
//   3. 绑自定义域名：归属校验 → CNAME → 免费证书（项目要先部署过一次；第一次按 setup → deploy → setup 的顺序跑）
// 用法：npm run setup
import { createHash, randomBytes } from 'node:crypto';
import { cosSign } from '../src/server/storage/cos-sign';
import { DEV_ORIGIN, DOMAIN, PROJECT, SITE, bucket, mainCredentials } from './lib/config';
import { findProject, makersClient, projectEnv, sleep, tc3, type MakersClient } from './lib/tencent';

async function poll<T>(what: string, times: number, ms: number, fn: () => Promise<T | null | undefined | false>): Promise<T> {
  for (let i = 0; i < times; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(ms);
  }
  throw new Error(`${what}：等了 ${Math.round((times * ms) / 60000)} 分钟还没好，稍后重跑`);
}

/** .env 里写了才下发、没写就沿用项目里已有的：共用密码、AI 的密码、名字映射、登录页可选的名字 */
const PASSED = ['SITE_PASSWORD', 'AI_PASSWORD', 'NAMES', 'WEB_NAMES'];

async function ensureProject(makers: MakersClient) {
  const b = bucket();
  const cos = [
    { key: 'COS_BUCKET', value: b.name }, { key: 'COS_REGION', value: b.region },
    { key: 'COS_SECRET_ID', value: b.secretId }, { key: 'COS_SECRET_KEY', value: b.secretKey },
  ];
  const passed = PASSED.flatMap((key) => (process.env[key] ? [{ key, value: process.env[key]! }] : []));
  let project = await findProject(makers, PROJECT);
  if (!project) {
    if (!process.env.SITE_PASSWORD || !process.env.NAMES) throw new Error('新建项目要有站点密码和名字映射：在 .env 里写 SITE_PASSWORD、NAMES');
    const { projectId } = await makers.projects.create({
      name: PROJECT,
      area: 'mainland',
      initialEnvVars: [...passed, { key: 'COOKIE_SECRET', value: randomBytes(32).toString('hex') }, ...cos],
    });
    project = await makers.projects.get({ projectId });
    console.log(`1. 新建项目 ${PROJECT}（${projectId}），加速区域：中国大陆`);
  } else {
    const given = [...cos, ...passed];
    const have = await projectEnv(makers, project.projectId);
    const changed = given.filter((e) => have[e.key] !== e.value);
    if (changed.length) await makers.projects.setEnvs({ projectId: project.projectId, envVars: changed });
    console.log(`1. 项目 ${PROJECT} 已在（${project.projectId}），环境变量改了：${changed.map((e) => e.key).join('、') || '无'}`);
  }
  const have = await projectEnv(makers, project!.projectId);
  const lack = ['SITE_PASSWORD', 'NAMES', 'COOKIE_SECRET', ...cos.map((e) => e.key)].filter((k) => !have[k]);
  if (lack.length) throw new Error(`项目缺环境变量 ${lack.join('、')}`);
  return project!;
}

/** 桶是私有的，浏览器拿预签名地址直接 PUT；不配跨域规则浏览器会拦。另外暴露 X-Total-Page：文档封面的响应头里带着总页数 */
async function ensureCors() {
  const b = bucket();
  const origins = [SITE, DEV_ORIGIN];
  const xml = `<CORSConfiguration><CORSRule>${origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('')}`
    + '<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>'
    + '<AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><ExposeHeader>X-Total-Page</ExposeHeader><MaxAgeSeconds>600</MaxAgeSeconds></CORSRule></CORSConfiguration>';
  // 改桶的配置要主账号；子账号只管读写对象
  const call = async (method: string, init: RequestInit = {}) => {
    const s = await cosSign({ ...mainCredentials(), method, path: '/', query: { cors: '' }, start: Math.floor(Date.now() / 1000) - 60, expires: 360 });
    return fetch(`https://${b.name}.cos.${b.region}.myqcloud.com/?${s.query}`, { ...init, method, headers: { ...init.headers, Authorization: s.auth } });
  };
  const current = await (await call('GET')).text();
  if (origins.every((o) => current.includes(`<AllowedOrigin>${o}</AllowedOrigin>`)) && current.includes('<AllowedMethod>PUT</AllowedMethod>') && current.includes('<ExposeHeader>X-Total-Page</ExposeHeader>')) {
    console.log(`2. 桶 ${b.name} 的跨域规则已在`);
    return;
  }
  const res = await call('PUT', { body: xml, headers: { 'Content-Type': 'application/xml', 'Content-MD5': createHash('md5').update(xml).digest('base64') } });
  if (!res.ok) throw new Error(`配跨域规则失败 ${res.status}：${(await res.text()).slice(0, 300)}`);
  console.log(`2. 桶 ${b.name} 配好跨域规则：${origins.join('、')}`);
}

const dnspod = (action: string, body: unknown) => tc3('dnspod', '2021-03-23', action, body);

async function upsertDns(zone: string, sub: string, type: string, value: string) {
  const list = await dnspod('DescribeRecordList', { Domain: zone, Subdomain: sub, RecordType: type });
  const old = (list.RecordList || []).find((r: any) => r.Name === sub && r.Type === type);
  if (old && old.Value.replace(/\.$/, '') === value.replace(/\.$/, '')) return console.log(`   DNS 已有 ${type} ${sub}.${zone}`);
  const body = { Domain: zone, SubDomain: sub, RecordType: type, RecordLine: '默认', Value: value, TTL: 600 };
  const r = old ? await dnspod('ModifyRecord', { ...body, RecordId: old.RecordId }) : await dnspod('CreateRecord', body);
  if (r.Error) throw new Error(`DNSPod ${type} ${sub}.${zone}：${r.Error.Code} ${r.Error.Message}`);
  console.log(`   DNS ${old ? '改' : '加'} ${type} ${sub}.${zone} → ${value}`);
}

async function ensureDomain(makers: MakersClient, projectId: string) {
  const row = async () => (await makers.domains.list({ projectId, domain: DOMAIN }))[0] as any;
  let d = await row();
  if (!d) {
    // 平台要求项目先有一次部署才能绑域名
    try { await makers.domains.create({ projectId, domain: DOMAIN }); } catch (e) {
      if (!/尚无可部署记录/.test(String(e))) throw e;
      console.log('3. 项目还没部署过，绑不了域名：先 npm run deploy，再重跑 npm run setup');
      return false;
    }
    d = await poll('域名出现在项目里', 10, 3000, row);
    console.log(`3. 加自定义域名 ${DOMAIN}`);
  } else console.log(`3. 域名 ${DOMAIN} 已在项目里（${d.status}）`);

  const zone: string = d.mainDomain;
  const sub = DOMAIN === zone ? '@' : DOMAIN.slice(0, -(zone.length + 1));
  if ((await dnspod('DescribeDomain', { Domain: zone })).Error) throw new Error(`${zone} 不在这个账号的 DNSPod 里，DNS 记录要手动加`);

  const txt = d.ownershipVerification?.dnsVerification;
  if (d.status === 'init' && txt) {
    console.log('   归属校验');
    await upsertDns(zone, txt.subdomain, txt.recordType, txt.recordValue);
    await poll('归属校验', 20, 15000, async () => (await makers.domains.verifyOwnership({ domain: DOMAIN })).status === 'success');
  }
  const cname = await poll<string>('平台分配 CNAME', 30, 10000, async () => (await row())?.cname);
  await upsertDns(zone, sub, 'CNAME', cname);
  await poll('CNAME 生效', 20, 15000, async () =>
    ((await makers.domains.checkCname({ recordNames: [DOMAIN] })) as any).cnameStatus?.[0]?.status === 'active');
  console.log('   CNAME 已生效');

  const cert = async () => {
    const r = (await makers.domains.listHostCertificates({ filters: [{ name: 'host', values: [DOMAIN] }] })) as any;
    const c = r.certificates?.[0];
    return { mode: c?.mode, ...(c?.hostCertInfo?.[0] || {}) } as { mode?: string; status?: string; expireTime?: string };
  };
  let c = await cert();
  if (!(c.mode === 'eofreecert' && c.status === 'deployed')) {
    if (c.mode !== 'eofreecert') await makers.domains.modifyCertificate({ hosts: [DOMAIN], mode: 'eofreecert' });
    c = await poll('证书签发', 40, 15000, async () => { const x = await cert(); return x.status === 'deployed' ? x : null; });
  }
  console.log(`   证书已部署，到期 ${c.expireTime}`);
  return true;
}

const makers = await makersClient();
const project = await ensureProject(makers);
await ensureCors();
if (await ensureDomain(makers, project.projectId)) console.log(`✅ 环境就绪：${SITE}`);
