const API_ROOT = '/api/auth';
const REQUEST_TIMEOUT = 8000;

export class AccountApiError extends Error {
  constructor(message, code = 'unavailable') {
    super(message);
    this.name = 'AccountApiError';
    this.code = code;
  }
}

// The session endpoint is authoritative. Never infer authentication from a URL,
// a cached guest profile, or the readiness endpoint.
export function parseSession(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.authenticated !== 'boolean') {
    throw new AccountApiError('Invalid session response.', 'invalid-response');
  }
  if (!payload.authenticated) return { authenticated: false, csrfToken: null, courses: [] };
  if (!payload.user || typeof payload.user.id !== 'string' || !payload.user.id.trim()) {
    throw new AccountApiError('Verified session has no account identifier.', 'invalid-response');
  }
  // Retain the opaque identifier only on the server. The interface does not need
  // to display, log, or persist it. Only course titles from this user's response
  // can be shown; no public/demo data is loaded here.
  return {
    authenticated: true,
    csrfToken: typeof payload.csrfToken === 'string' && payload.csrfToken.trim() ? payload.csrfToken : null,
    courses: Array.isArray(payload.courses) ? payload.courses.filter(course => course && typeof course.title === 'string' && course.title.trim()).map(course => ({ title: course.title.trim() })) : []
  };
}

export function parseServiceStatus(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.configured !== 'boolean') return { configured: null };
  return { configured: payload.configured };
}

export async function requestAccountJson(path, options = {}, fetchImpl = globalThis.fetch) {
  if (!/^\/(?:me|status|logout)$/.test(path)) throw new AccountApiError('Unsupported account endpoint.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetchImpl(API_ROOT + path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    if (!response.ok) throw new AccountApiError('Account API is unavailable.', String(response.status));
    if (!/\bapplication\/json\b/i.test(response.headers.get('content-type') || '')) {
      throw new AccountApiError('Account API did not return JSON.', 'invalid-response');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AccountApiError) throw error;
    throw new AccountApiError('Could not verify account state.', error?.name === 'AbortError' ? 'timeout' : 'unavailable');
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAccount(fetchImpl = globalThis.fetch) {
  const [session, status] = await Promise.allSettled([
    requestAccountJson('/me', {}, fetchImpl).then(parseSession),
    requestAccountJson('/status', {}, fetchImpl).then(parseServiceStatus)
  ]);
  return {
    session: session.status === 'fulfilled' ? session.value : null,
    service: status.status === 'fulfilled' ? status.value : { configured: null },
    error: session.status === 'rejected' ? session.reason : null
  };
}

export async function logoutAccount(csrfToken, fetchImpl = globalThis.fetch) {
  if (typeof csrfToken !== 'string' || !csrfToken.trim()) {
    throw new AccountApiError('A verified session token is required.', 'missing-csrf');
  }
  // For this same-origin POST, the browser supplies Origin. Never spoof it or
  // send the session/CSRF token to a separately configured external API.
  const result = await requestAccountJson('/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    body: '{}'
  }, fetchImpl);
  if (!result || result.authenticated !== false) throw new AccountApiError('Sign-out was not confirmed.', 'invalid-response');
}

export function createAccountPage(documentRef, locationRef, fetchImpl = globalThis.fetch) {
  const element = id => documentRef.getElementById(id);
  let session = null;
  let busy = false;

  function message(text = '') {
    element('action-message').textContent = text;
    element('action-message').hidden = !text;
  }

  function checking() {
    session = null;
    message();
    element('identity-badge').className = 'status-badge checking';
    element('identity-badge').textContent = '检查中 · Checking';
    element('session-title').textContent = '正在检查登录状态…';
    element('session-detail').textContent = '请稍候。身份校验成功后，本页才会显示已登录。';
    element('service-state').textContent = '校方登录服务 · Checking service';
    for (const id of ['login-link', 'logout-button', 'retry-button', 'logout-note']) element(id).hidden = true;
    element('personal-courses').replaceChildren();
    element('personal-courses').hidden = true;
    element('courses-empty').hidden = false;
    element('courses-badge').textContent = '未接入 · Not connected';
  }

  function render(result) {
    session = result.session;
    const verified = session?.authenticated === true;
    const badge = element('identity-badge');
    badge.className = 'status-badge ' + (verified ? 'verified' : session ? 'signed-out' : 'unavailable');
    badge.textContent = verified ? '身份已校验 · Verified' : session ? '未登录 · Signed out' : '未校验 · Not verified';
    element('login-link').hidden = verified;
    element('logout-button').hidden = !verified;
    element('logout-button').disabled = !session?.csrfToken;
    element('logout-note').hidden = !verified;
    element('retry-button').hidden = verified && Boolean(session.csrfToken);
    if (verified) {
      element('session-title').textContent = 'TUM 身份已校验';
      element('session-detail').textContent = '你已登录本站。个人课程尚需接入，不会因登录而自动同步 TUMonline 或 Moodle。';
      if (!session.csrfToken) message('登录会话缺少安全退出信息，请重新检查。Sign-out is temporarily unavailable.');
    } else if (session) {
      element('session-title').textContent = '请先登录你的个人账户';
      element('session-detail').textContent = result.service.configured === false
        ? '校方登录尚未配置。你可以查看登录说明；当前不会校验身份或加载个人课程。'
        : '前往登录页面，通过 TUM 官方页面验证身份后再返回。Sign in to open your account.';
    } else {
      element('session-title').textContent = '当前无法校验身份';
      element('session-detail').textContent = '此页面未连接到可用的账户服务。纯静态 GitHub Pages 仅展示账户界面，不能完成 TUM 登录或载入个人课表。The account service is unavailable.';
    }
    element('service-state').textContent = result.service.configured === true
      ? '校方登录服务已配置 · SSO configured'
      : result.service.configured === false
        ? '校方登录尚未配置 · SSO not configured'
        : '校方登录服务状态未确认 · Service status unconfirmed';
    const courses = verified ? session.courses : [];
    element('personal-courses').replaceChildren(...courses.map(course => {
      const item = documentRef.createElement('li');
      item.textContent = course.title;
      return item;
    }));
    element('personal-courses').hidden = !courses.length;
    element('courses-empty').hidden = Boolean(courses.length);
    element('courses-badge').textContent = courses.length ? `${courses.length} 门个人课程 · Connected` : '未接入 · Not connected';
    if (courses.length) element('session-detail').textContent = '你已登录本站。下方仅显示此登录会话返回的个人课程。';
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    checking();
    try {
      render(await loadAccount(fetchImpl));
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    if (busy || session?.authenticated !== true) return;
    busy = true;
    message();
    const button = element('logout-button');
    button.disabled = true;
    try {
      await logoutAccount(session.csrfToken, fetchImpl);
      session = null;
      locationRef.assign('./login.html');
    } catch {
      message('退出结果未确认，请重新检查登录状态。Sign-out could not be confirmed.');
      button.disabled = !session?.csrfToken;
      element('retry-button').hidden = false;
    } finally {
      busy = false;
    }
  }

  element('retry-button').addEventListener('click', refresh);
  element('logout-button').addEventListener('click', signOut);
  return { refresh, signOut };
}

if (typeof document !== 'undefined') {
  const page = createAccountPage(document, globalThis.location);
  void page.refresh();
}
