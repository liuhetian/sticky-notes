// 用主账号密钥调腾讯云 API（TC3 签名）和 Makers SDK
import { createHash, createHmac } from 'node:crypto';
import { Makers } from '@edgeone/makers-sdk';
import { mainCredentials } from './config';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tc3(service: string, version: string, action: string, body: unknown): Promise<any> {
  const { secretId, secretKey } = mainCredentials();
  const host = `${service}.tencentcloudapi.com`;
  const payload = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const hmac = (k: string | Buffer, s: string) => createHmac('sha256', k).update(s).digest();
  const canonical = ['POST', '/', '', `content-type:application/json\nhost:${host}\n`, 'content-type;host', sha(payload)].join('\n');
  const scope = `${date}/${service}/tc3_request`;
  const sig = createHmac('sha256', hmac(hmac(hmac('TC3' + secretKey, date), service), 'tc3_request'))
    .update(['TC3-HMAC-SHA256', ts, scope, sha(canonical)].join('\n')).digest('hex');
  const res = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${sig}`,
      'Content-Type': 'application/json', Host: host, 'X-TC-Action': action, 'X-TC-Version': version, 'X-TC-Timestamp': String(ts),
    },
    body: payload,
  });
  return ((await res.json()) as { Response: any }).Response;
}

/** Makers 站点：开通 Makers 时自动建的那个 pages 站点；有多个时用 MAKERS_ZONE_ID 指定 */
export async function makersClient() {
  let zoneId = process.env.MAKERS_ZONE_ID;
  if (!zoneId) {
    const r = await tc3('teo', '2022-09-01', 'DescribeZones', { Filters: [{ Name: 'zone-type', Values: ['pages'] }] });
    if (r.Error) throw new Error(`DescribeZones: ${r.Error.Code} ${r.Error.Message}`);
    if (r.Zones?.length !== 1) throw new Error('Makers 站点不是正好一个，用 MAKERS_ZONE_ID 指定');
    zoneId = r.Zones[0].ZoneId as string;
  }
  return new Makers({ credentials: mainCredentials(), zoneId, region: 'china' });
}
export type MakersClient = Awaited<ReturnType<typeof makersClient>>;

export async function findProject(makers: MakersClient, name: string) {
  for await (const p of makers.projects.listAll()) if (p.name === name) return p;
  return null;
}

/** 项目的环境变量（含值）；smoke、backup 用它拿站点密码，不用另外抄一份 */
export async function projectEnv(makers: MakersClient, projectId: string): Promise<Record<string, string>> {
  const envs = await makers.projects.listEnvs({ projectId });
  return Object.fromEntries(envs.map((e: { key: string; value?: string }) => [e.key, e.value ?? '']));
}
