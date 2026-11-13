# TUM SSO 接入状态与部署

当前尚未申请并完成学校的 SP 注册。本项目默认关闭学校登录；缺少配置时按钮保持禁用，`/api/auth/status` 返回 `configured:false`。没有“模拟成功”模式，不接收学校密码，也不会把维护者的私人课表作为其他人的个人数据。

## 学校接入前置条件

TUM 使用的 Shibboleth/SAML 接入需要将本服务的 SP 元数据加入学校本地 AAI 联盟或 DFN-AAI，并经 LRZ/学校协调注册、证书和属性释放。不是添加一个登录按钮就能启用。需要准备 EntityID、对外 HTTPS 服务地址、ACS、SP 证书、技术/支持/安全联系人、服务介绍及隐私信息，并与学校确认允许释放的稳定身份标识。[LRZ 官方接入说明](https://doku.lrz.de/shibboleth-fuer-eigene-webanwendungen-10333379.html)

供管理员与学校核对的官方入口：

- IdP EntityID：`https://tumidp.lrz.de/idp/shibboleth`
- Redirect SSO：`https://login.tum.de/idp/profile/SAML2/Redirect/SSO`
- TUM 本地联盟元数据：[DFN-AAI local-8](https://www.aai.dfn.de/fileadmin/metadata/dfn-aai-local-8-metadata.xml)

端点、受信签名证书和释放属性必须由管理员依据学校批准的元数据核对。程序不会在用户请求期间自行下载并信任新证书。不要把测试证书、其他 IdP 或网上找到的客户端配置当成已注册的 TUM 接入。

## 运行方式

Node BFF 同源提供登录壳和会话保护的页面，默认仅监听 `127.0.0.1:3000`。生产使用固定域名的 HTTPS 反向代理，代理到该进程；不要用 GitHub Pages 来托管认证回调或私有账户。Pages 静态构建只能显示公开登录介绍页。

```sh
npm ci
npm run test:auth
npm start
```

未配置时也可以本地查看“待接入”状态。启用学校登录必须在服务端环境变量中同时提供下列配置；不能放进 `public/`、前端 JS、仓库或构建产物：

| 配置 | 必须由部署者提供的值 |
| --- | --- |
| `TUM_SSO_ENABLED` | 学校接入完成后显式设为 `true` |
| `TUM_SSO_REGISTRATION_CONFIRMED` | 收到受信 SP 注册确认后显式设为 `true` |
| `PUBLIC_ORIGIN` | 本服务固定 HTTPS origin，不带路径 |
| `SAML_SP_ENTITY_ID` | 学校批准、与元数据一致的 SP EntityID |
| `SAML_ACS_URL` | `PUBLIC_ORIGIN` 加 `/api/auth/callback`，必须按此地址注册 |
| `SAML_IDP_ENTRY_POINT` | 经官方元数据核对的 TUM Redirect SSO 地址 |
| `SAML_IDP_ISSUER` | 经官方元数据核对的 TUM IdP EntityID |
| `SAML_IDP_CERT` | 官方元数据中的受信 IdP 签名证书 PEM |
| `SAML_SP_PRIVATE_KEY` | SP RSA 私钥 PEM，至少 2048 位 |
| `SAML_SP_CERT` | 与 SP 私钥匹配的当前有效 X.509 证书 PEM |
| `SAML_SUBJECT_ATTRIBUTE` | 学校批准释放的稳定、最好成对假名化标识的属性名 |
| `SESSION_SECRET` | 至少 32 随机字节的 base64url 值，仅服务端保存 |

PEM 可以使用真实换行，也可由 secret manager 注入包含 `\n` 的字符串。若学校使用加密断言，可配置 `SAML_DECRYPTION_PRIVATE_KEY`；当前最小实现要求解密私钥也与 `SAML_SP_CERT` 匹配，否则配置保持不可用。

若学校批准使用持久化 NameID，`SAML_SUBJECT_ATTRIBUTE` 可明确设为 `nameID`；程序将只接受 persistent NameID，拒绝临时 NameID。不要自行改用用户名、邮箱或未经批准的属性。证书轮换、属性释放和签名要求须与学校协调，不能关闭验证来兼容失败响应。

本实现要求响应和断言都签名、SHA-256 请求签名、明确的 issuer/audience、有效时间以及 `validateInResponseTo:'always'`。每次登录还绑定一次性 RelayState、浏览器随机 cookie 和具体请求 ID；回调只在完整验证后创建新会话。额外校验读取的是 node-saml 的已验证 assertion accessor，不信任未验证响应内容。[Node-SAML 5.2.0 官方文档](https://github.com/node-saml/node-saml/blob/v5.2.0/README.md)

## API 契约

所有认证和个人响应使用 `Cache-Control: private, no-store`；私有 BFF 不提供 `sw.js`。

| 方法与地址 | 行为 |
| --- | --- |
| `GET /api/auth/status` | `configured`、`state`、`authenticated`、`loginUrl`；从不返回证书或密钥 |
| `GET /api/auth/me` | 未登录为 `authenticated:false,user:null`；已登录才返回假名化 `user.id` 与注销用 `csrfToken` |
| `GET /api/auth/login` | 缺配置返回 503；完整配置才创建一次性请求并 302 到学校 IdP |
| `POST /api/auth/callback` | 接收表单 `SAMLResponse`/`RelayState`；验证成功后设置会话并 303 到 `/account.html` |
| `POST /api/auth/logout` | 需相同 `Origin` 和 `x-csrf-token`；仅销毁本站会话，不宣称全校单点退出 |
| `GET /api/auth/metadata` | 完整配置时提供供学校审核的 SP 元数据，缺配置为 503 |
| `GET /api/courses` | 需会话；当前返回空课程列表与 `source:'not-connected'` |

回调失败只显示通用错误，不向浏览器或日志输出 SAML 断言、学校标识或签名材料。Session 为随机不透明值，使用 `__Host-`、`Secure`、`HttpOnly`、`SameSite=Lax` cookie；跨站 SAML POST 使用另外的短时 `SameSite=None` 随机绑定 cookie。客户端 JS 不获得会话凭据。

匿名只能访问登录壳及其必要公开资源；账户与其他静态内容由真实服务端 session 保护。前端隐藏按钮不是访问控制。账户数据不从公开 `data.js` 读取，每个已验证用户目前都是空账户。

## 已实现范围与上线边界

认证成功不等于取得 TUMonline/Moodle 的课程 API 权限。本项目还没有获批的数据访问接口、课程同步、持久化个人数据库或跨设备学习记录同步；不得把公共教材练习进度描述成已同步到学校账户。

当前请求缓存、重放记录、会话与限流均为单 Node 进程内存。进程重启会使会话和待处理登录失效。扩展到多进程或多实例之前，必须换成共享的、支持原子消费请求 ID 和原子防重放的存储，并配置入口限流；不要直接开多个副本。程序采用全局上限及浏览器绑定限流，不信任任意 `X-Forwarded-For`；反向代理仍应按真实客户端配置入口限流。当前绑定安全优先：没有正确回传浏览器绑定 cookie 时，登录会失败，需重新开始。[Node-SAML cache provider 约束](https://github.com/node-saml/node-saml/blob/v5.2.0/README.md#cache-provider)

测试使用运行时生成的临时证书及官方 XML 签名库验证本地安全边界。没有在真实 TUM IdP、实际属性释放或学校注册环境完成联调，因此不能声称真正学校登录或同步已经可用。学校批准后仍需在测试部署核验签名方式、NameID/属性、ACS、加密、cookie、时间同步、证书轮换和注销行为。
