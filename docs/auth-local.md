# 本应用账户与持久化存储

当前可用版使用独立的本应用用户名和密码，不验证 TUM 身份，不接收学校密码。官方学校 SAML 接入保留为将来可选方案，仍须学校完成注册；不能同时把两种身份当成同一个账户。日历订阅是用户另外主动绑定的数据源，认证成功不代表得到 TUMonline/Moodle API 权限。

## Worker 接入

`server/local-auth.mjs` 只处理标准 Web `Request`/`Response`，不依赖 Node HTTP。持久化绑定名称为 `DB`：

```js
import {createD1Store} from './d1-store.mjs';
import {createLocalAuth,localAuthErrorResponse} from './local-auth.mjs';

const store=createD1Store(env.DB);
const auth=createLocalAuth({store,expectedOrigin:env.APP_ORIGIN});

// 在路由中返回对应方法；不要缓存这些响应。
// POST /api/local/register -> auth.register(request)
// POST /api/local/login    -> auth.login(request)
// GET  /api/auth/me        -> auth.me(request)
// POST /api/auth/logout    -> auth.logout(request)
```

`APP_ORIGIN` 必须是部署者配置的完整 HTTPS origin，不含末尾斜杠或路径。函数不会根据代理内部的 `request.url`、Host 或 X-Forwarded-For 推导可信来源。所有写操作要求 `Origin` 精确一致；跨站 `Sec-Fetch-Site` 也会被拒绝。

对于个人日历 API，先调用 `await auth.requireSession(request)`，始终只用返回的 `context.user.id` 读取数据，不能采用浏览器传入的 userId。所有绑定、刷新、删除等写操作调用 `await auth.requireSession(request,{csrf:true})`，需要 `X-CSRF-Token` 请求头。异常可经 `localAuthErrorResponse(error)` 转为无敏感细节的 JSON。账户页和日历响应也必须 `private, no-store`，不能被 PWA/service worker 缓存。

默认限速地址读取 Cloudflare 设置的 `CF-Connecting-IP`。这只适用于直接可信的 Cloudflare Worker 请求；Node 反向代理接入必须显式传入可信的 `getClientAddress(request)`，不能盲信任用户提供的请求头。如果该头缺失，所有缺失地址共用保守的 `unavailable` 桶；部署验收应确认边缘地址可用。限速键只以 SHA-256 形式持久化，不保存原始 IP。

## API

注册和登录的 JSON 为 `{username,password}`。用户名先去两端空白、转换 ASCII 小写，只接受 3–32 位 `[a-z0-9._-]`，首字符须为字母或数字；密码不去空白，长度为 8–128 个 Unicode 字符，不要求大写或特殊符号。学校密码不能用于本应用。当前不提供邮件确认、找回密码或官方身份认证。

| API | 成功响应 |
| --- | --- |
| `POST /api/local/register` | 201，`{authenticated:true,user:{id,username},csrfToken}`，设置会话 cookie |
| `POST /api/local/login` | 200，同上，轮换当前浏览器会话 |
| `GET /api/auth/me` | 登录时同上；未登录时 200，`{authenticated:false,user:null}` |
| `POST /api/auth/logout` | 200，`{authenticated:false,user:null}`，撤销当前会话并清除 cookie |

错误使用 `{error,message}`；错误密码与不存在的用户名返回相同 401。重复注册返回 409；请求过快返回 429 和 `Retry-After`。返回的 `csrfToken` 仅用于当前会话写操作。前端不得将密码、cookie 或订阅私密链接存入 localStorage、日志、URL、分析事件或公开仓库。

会话是 32 随机字节的 opaque token，cookie 名 `__Host-tt-local`，`Secure; HttpOnly; SameSite=Lax; Path=/`，不设置 Domain。默认 14 天到期；数据库只保存 token 与 CSRF 的 SHA-256，不保存原始会话 token。每个请求验证数据库会话和到期时间，退出仅撤销本会话。不同账户的所有 feed SQL 都含 `user_id` 条件。

## 密码与运行限制

密码使用真实 `node:crypto` 异步 scrypt，随机 16 字节 salt、32 字节派生值，固定 `N=32768,r=8,p=3`，工作内存约 32 MiB、`maxmem=64 MiB`，属于 [OWASP 推荐的 scrypt 参数组合](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。不存在用户也执行同等成本 KDF。每个 isolate 同时只执行一个 KDF，最多等待 8 项，超出立即返回 429。

实际本地 Node 24 测试每次 KDF 约 270–400 毫秒；部署须留出足够 CPU 时间，不能假定极低 CPU 限额可运行。Worker 需要启用当前支持的 Node 兼容能力；可用 API 以 [Cloudflare 官方 Node crypto 文档](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) 为准。Node 测试不能代替生产 Worker 上的真实注册、登录、退出和重新登录验收。

默认注册每地址每小时 8 次、每用户名每小时 3 次；登录每地址每 15 分钟 60 次、每用户名每 15 分钟 20 次。限速以数据库原子 upsert 实现，服务实例重建后仍有效；到期记录每分钟最多清理一次，每表最多 500 条。管理员如需调整可配置 `rateLimits`，不应取消所有保护。

## D1 模型与迁移

`db/schema.ts` 是 Drizzle 模型；`drizzle.config.ts` 的 `out:'./drizzle'` 符合 Sites 原生迁移收集路径。生成迁移而非在请求中建表：

```sh
npx drizzle-kit generate --config=drizzle.config.ts
node --test server/local-auth.test.mjs
```

提交生成的 SQL、`drizzle/meta/_journal.json` 和 snapshot。部署时由平台的 D1 迁移流程应用；不要在 API handler 中执行 CREATE TABLE，也不要把本地 SQLite 文件作为生产用户数据库。原生绑定为 `DB`。本地测试可传入 Node 24 `DatabaseSync` 给 `createSQLiteStore`，生产模块本身不会导入 `node:sqlite`。

| 表 | 核心字段 |
| --- | --- |
| `users` | 随机 UUID 主键；规范化唯一 username；password_hash；created_at（毫秒） |
| `sessions` | token_hash 主键；user_id 外键；csrf_hash；created_at/expires_at（毫秒） |
| `rate_buckets` | 哈希键；window_start/count/expires_at，原子累计 |
| `feeds` | 联合主键 user_id/source；encrypted_url；events_json；last_synced/last_error；created_at/updated_at |

`source` 只允许 `tumonline` 或 `moodle`；`events_json` 为 JSON 数组字符串。`encrypted_url` 由日历服务用部署 secret `FEED_ENCRYPTION_KEY` 加密；本模块不生成或公开这个 secret。时间戳均为 UTC epoch 毫秒。错误只存通用 code，不存完整 URL、查询 token 或请求头。

Feed store 契约：`feeds.get(userId,source)`、`list(userId)`、`upsert(userId,source,{encryptedUrl,eventsJson,lastSynced,lastError,createdAt?,updatedAt?})`、`remove(userId,source)`。后台刷新使用 `updateSync(userId,source,{eventsJson?,lastSynced?,lastError,updatedAt?},expectedEncryptedUrl)`，只有旧 ciphertext 仍匹配才写入，避免较晚结束的刷新覆盖刚重新绑定的订阅；省略 eventsJson/lastSynced 时保留已有内容，lastError=null 清除错误。

账户初始没有课程或订阅。不得把维护者旧版课表、私人待办或访客练习进度导入每个账户，也不得声称未实现的学习记录跨设备同步。
