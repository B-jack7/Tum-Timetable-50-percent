export class LocalAuthError extends Error {
  constructor(code='unavailable',status=0){super(code);this.name='LocalAuthError';this.code=code;this.status=status;}
}
const VALIDATION_MESSAGES={invalid_username:'用户名须为 3–32 位字母、数字、点、下划线或短横线，并以字母或数字开头。',invalid_password:'本应用密码需要 12–128 个字符。'};
function credentialsErrorCode(username,password){
  if(typeof username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username.trim().toLowerCase()))return 'invalid_username';
  if(typeof password!=='string'||Array.from(password).length<12||Array.from(password).length>128)return 'invalid_password';
  return '';
}
export function validateCredentials(username,password){return VALIDATION_MESSAGES[credentialsErrorCode(username,password)]||'';}

async function jsonRequest(path,options={},fetchImpl=globalThis.fetch){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetchImpl(path,{...options,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(options.headers||{})}});
    if(!response.ok){
      let code='request-failed';
      if(/application\/json/i.test(response.headers.get('content-type')||'')){try{const payload=await response.json();if(['invalid_username','invalid_password','invalid_credentials','username_unavailable','authentication_busy'].includes(payload?.error))code=payload.error;}catch{}}
      throw new LocalAuthError(code,response.status);
    }
    if(!/application\/json/i.test(response.headers.get('content-type')||''))throw new LocalAuthError('invalid-response');
    return await response.json();
  }catch(error){if(error instanceof LocalAuthError)throw error;throw new LocalAuthError('unavailable');}finally{clearTimeout(timeout);}
}
export async function requestLocalAuth(mode,username,password,fetchImpl=globalThis.fetch){
  if(!['login','register'].includes(mode))throw new LocalAuthError('invalid-mode');
  const validation=credentialsErrorCode(username,password);if(validation)throw new LocalAuthError(validation);
  const result=await jsonRequest('/api/local/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.trim(),password})},fetchImpl);
  if(result?.authenticated!==true)throw new LocalAuthError('invalid-response');
  return result;
}
function errorText(error){
  if(VALIDATION_MESSAGES[error.code])return VALIDATION_MESSAGES[error.code];
  if(error.status===400)return '请检查用户名和本应用密码格式后重试。';
  if(error.status===401)return '用户名或本应用密码不正确。';
  if(error.status===409)return '这个用户名已被使用，请换一个，或切回登录。';
  if(error.status===429)return '尝试较多，请稍后再试。';
  if(error.status===403)return '本次操作未被允许，请刷新页面后重试。';
  return '暂时无法连接账号服务，请稍后重试。';
}
export function createLoginPage(doc,locationRef,fetchImpl=globalThis.fetch){
  const $=id=>doc.getElementById(id);let mode='login',available=false,busy=false;
  function message(text=''){$('auth-error').textContent=text;$('auth-error').hidden=!text;}
  function buttons(){for(const id of ['mode-login','mode-register','app-username','app-password','toggle-password'])$(id).disabled=busy;$('submit-auth').disabled=busy||!available;$('submit-auth').textContent=busy?'请稍候…':mode==='register'?'注册并打开课表 →':'登录并打开课表 →';}
  function setMode(next){if(busy||!['login','register'].includes(next))return;mode=next;message();$('app-password').value='';$('app-password').type='password';$('app-password').autocomplete=mode==='register'?'new-password':'current-password';$('toggle-password').textContent='显示';$('toggle-password').setAttribute('aria-pressed','false');$('signin-title').textContent=mode==='register'?'创建本应用账号':'登录本应用账号';$('mode-login').setAttribute('aria-pressed',String(mode==='login'));$('mode-register').setAttribute('aria-pressed',String(mode==='register'));buttons();}
  async function refresh(){
    if(busy)return;available=false;buttons();$('check-auth').hidden=true;$('status-text').textContent='正在连接本应用账号服务…';
    try{
      const status=await jsonRequest('/api/auth/status',{},fetchImpl);
      available=status?.mode==='local'&&status.configured===true;
      $('status-text').textContent=available?'本应用账号服务已连接。':'本应用账号服务暂未启用，请稍后再试。';
      try{const session=await jsonRequest('/api/auth/me',{},fetchImpl);if(session?.authenticated===true&&typeof session.user?.id==='string'){locationRef.assign('/account.html');return;}}catch{}
    }catch{$('status-text').textContent='账号服务暂时不可用；静态介绍页不能完成登录。';}
    finally{$('check-auth').hidden=available;buttons();}
  }
  async function submit(event){event?.preventDefault();if(busy||!available)return;const username=$('app-username').value.trim(),password=$('app-password').value;const invalid=validateCredentials(username,password);if(invalid){message(invalid);return;}
    busy=true;message();buttons();
    try{await requestLocalAuth(mode,username,password,fetchImpl);$('app-password').value='';locationRef.assign('/account.html');}
    catch(error){message(errorText(error));}
    finally{$('app-password').value='';busy=false;buttons();}
  }
  $('local-auth-form').addEventListener('submit',submit);$('mode-login').addEventListener('click',()=>setMode('login'));$('mode-register').addEventListener('click',()=>setMode('register'));$('check-auth').addEventListener('click',refresh);
  $('toggle-password').addEventListener('click',()=>{const show=$('app-password').type==='password';$('app-password').type=show?'text':'password';$('toggle-password').textContent=show?'隐藏':'显示';$('toggle-password').setAttribute('aria-pressed',String(show));});
  return {refresh,setMode,submit};
}
if(typeof document!=='undefined'){const page=createLoginPage(document,globalThis.location);void page.refresh();}
