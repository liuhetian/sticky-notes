import type { Db } from './repo/db';
import type { FileStore } from './storage/files';

export type Bindings = {
  SITE_PASSWORD: string;
  COOKIE_SECRET: string;
  COS_BUCKET: string;
  COS_REGION: string;
  COS_SECRET_ID: string;
  COS_SECRET_KEY: string;
};

/** 一次请求里业务代码能用到的东西：元素数据（EdgeOne Blob）、文件（COS）、「响应发出后接着做」 */
export type Ctx = {
  db: Db;
  files: FileStore;
  defer: (p: Promise<unknown>) => void;
};

export type Env = { Bindings: Bindings; Variables: { ctx: Ctx } };
