(() => {
  'use strict';
  const button=document.getElementById('tum-signin'),account=document.getElementById('open-account'),check=document.getElementById('check-auth'),state=document.getElementById('auth-state'),text=document.getElementById('status-text'),note=document.getElementById('setup-note'),error=document.getElementById('auth-error');
  let loginAvailable=false;
  if(new URLSearchParams(location.search).get('error')==='authentication-failed'){error.hidden=false;error.textContent='未能验证此次登录。请重新开始学校登录；如果问题持续，请联系站点维护者。 / Sign-in could not be verified. Please start again.';}
  async function refresh(){
    loginAvailable=false;button.disabled=true;button.hidden=false;account.hidden=true;check.disabled=true;state.classList.remove('ready');text.textContent='正在检查登录服务… / Checking sign-in…';
    try{
      const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
      if(!response.ok||!/application\/json/i.test(response.headers.get('content-type')||''))throw Error('backend-unavailable');
      const status=await response.json();
      if(status?.provider!=='tum-saml'||typeof status.configured!=='boolean'||typeof status.authenticated!=='boolean'||status.state!==(status.configured?'ready':'not-configured')||status.loginUrl!==(status.configured?'/api/auth/login':null))throw Error('invalid-status');
      if(status.authenticated===true){
        if(!status.configured)throw Error('invalid-session-state');
        const meResponse=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
        if(!meResponse.ok||!/application\/json/i.test(meResponse.headers.get('content-type')||''))throw Error('session-unverified');
        const me=await meResponse.json();if(me.authenticated!==true||typeof me.user?.id!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(me.user.id))throw Error('session-unverified');
        button.hidden=true;account.hidden=false;state.classList.add('ready');text.textContent='已通过本站会话验证 / Signed in';note.textContent='个人课程与同步权限将在账户页单独显示。 / Course data access is separate from sign-in.';return;
      }
      loginAvailable=status.configured===true&&status.state==='ready'&&status.provider==='tum-saml'&&status.loginUrl==='/api/auth/login';
      button.disabled=!loginAvailable;
      if(loginAvailable){state.classList.add('ready');text.textContent='学校登录服务已接入 / University sign-in available';note.textContent='继续后将跳转到学校身份认证页面。 / Continue to the university identity provider.';}
      else{text.textContent='等待学校 SSO 接入 / Institutional setup pending';note.textContent='目前尚未完成学校 SSO 注册，TUM 登录暂不可用。此页面不会模拟登录或展示他人的课表。';}
    }catch{text.textContent='认证后端尚未连接 / Sign-in backend unavailable';note.textContent='此部署目前只能展示登录介绍页。学校认证与私有账户需要单独运行的后端，不能由 GitHub Pages 静态页面提供。';}
    finally{check.disabled=false;}
  }
  button.addEventListener('click',()=>{if(loginAvailable&&!button.disabled)location.assign('/api/auth/login');});
  check.addEventListener('click',refresh);
  refresh();
})();
