import type { Db } from './repo/db';
import type { FileStore } from './storage/files';

export type Bindings = {
  /** 共用密码：网页登录、快捷指令、脚本都用它，哪里都能调 */
  SITE_PASSWORD: string;
  /** AI 的密码：只能调 /api/ai/ 下的接口；不配就没有 */
  AI_PASSWORD?: string;
  /** 名字的对应关系，比如 banana:香蕉,niuniu:牛牛,ai:AI。请求里的名字必须在这里 */
  NAMES: string;
  /** 登录页可选的名字（英文键，逗号分隔）；不配就是 NAMES 里全部 */
  WEB_NAMES?: string;
  COOKIE_SECRET: string;
  COS_BUCKET: string;
  COS_REGION: string;
  COS_SECRET_ID: string;
  COS_SECRET_KEY: string;
};

/** 一次请求里业务代码能用到的东西：元素数据（EdgeOne Blob）、文件（COS）、「响应发出后接着做」、这次是谁 */
export type Ctx = {
  db: Db;
  files: FileStore;
  defer: (p: Promise<unknown>) => void;
  /** 登录的名字（英文键），新建和改内容时记进元素的 by；不用登录的接口里是空串 */
  by: string;
};

export type Env = { Bindings: Bindings; Variables: { ctx: Ctx } };
