import {createApplication} from '../server/application.mjs';
import {createD1Store} from '../server/d1-store.mjs';
import assets from './generated-assets.mjs';
let application,configuration;
export default{
  async fetch(request,env){
    const config=env.APP_ORIGIN+'|'+env.FEED_ENCRYPTION_KEY;
    try{
      if(!application||config!==configuration){application=createApplication({store:createD1Store(env.DB),expectedOrigin:env.APP_ORIGIN,encryptionKey:env.FEED_ENCRYPTION_KEY,assets});configuration=config;}
      return await application.fetch(request);
    }catch{
      return new Response(JSON.stringify({error:'service_unavailable',message:'服务正在配置，请稍后再试。'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }
  },
};
