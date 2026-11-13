// Fixed SQL with bound values only. Schema belongs to Drizzle migrations, never request handlers.
const USER='id, username, password_hash AS passwordHash, created_at AS createdAt';
const FEED='user_id AS userId, source, encrypted_url AS encryptedUrl, events_json AS eventsJson, last_synced AS lastSynced, last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt';
function storeFromExecutor({first,all,run}){
  return{
    users:{
      getByUsername:username=>first(`SELECT ${USER} FROM users WHERE username = ?`,[username]),
      getById:id=>first(`SELECT ${USER} FROM users WHERE id = ?`,[id]),
      create:({id,username,passwordHash,createdAt})=>first(`INSERT INTO users (id,username,password_hash,created_at) VALUES (?,?,?,?) ON CONFLICT(username) DO NOTHING RETURNING ${USER}`,[id,username,passwordHash,createdAt]),
    },
    sessions:{
      create:({tokenHash,userId,csrfHash,createdAt,expiresAt})=>run('INSERT INTO sessions (token_hash,user_id,csrf_hash,created_at,expires_at) VALUES (?,?,?,?,?)',[tokenHash,userId,csrfHash,createdAt,expiresAt]),
      get:async(tokenHash,now)=>{
        const row=await first('SELECT s.token_hash AS tokenHash,s.user_id AS userId,s.csrf_hash AS csrfHash,s.created_at AS createdAt,s.expires_at AS expiresAt,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',[tokenHash,now]);
        return row?{...row,user:{id:row.userId,username:row.username}}:null;
      },
      remove:tokenHash=>run('DELETE FROM sessions WHERE token_hash = ?',[tokenHash]),
    },
    rates:{
      hit:async({keyHash,windowStart,expiresAt})=>{
        const row=await first('INSERT INTO rate_buckets (key_hash,window_start,count,expires_at) VALUES (?,?,1,?) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN rate_buckets.window_start=excluded.window_start THEN rate_buckets.count+1 ELSE 1 END,window_start=excluded.window_start,expires_at=excluded.expires_at RETURNING count',[keyHash,windowStart,expiresAt]);return row.count;
      },
    },
    feeds:{
      get:(userId,source)=>first(`SELECT ${FEED} FROM feeds WHERE user_id=? AND source=?`,[userId,source]),
      list:userId=>all(`SELECT ${FEED} FROM feeds WHERE user_id=? ORDER BY source`,[userId]),
      upsert:async(userId,source,{encryptedUrl,eventsJson='[]',lastSynced=null,lastError=null,createdAt=Date.now(),updatedAt=Date.now()})=>{
        await run('INSERT INTO feeds (user_id,source,encrypted_url,events_json,last_synced,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,source) DO UPDATE SET encrypted_url=excluded.encrypted_url,events_json=excluded.events_json,last_synced=excluded.last_synced,last_error=excluded.last_error,updated_at=excluded.updated_at',[userId,source,encryptedUrl,eventsJson,lastSynced,lastError,createdAt,updatedAt]);
        return first(`SELECT ${FEED} FROM feeds WHERE user_id=? AND source=?`,[userId,source]);
      },
      // Bind the refresh write to the ciphertext read at its start: a late refresh cannot undo a new feed binding.
      updateSync:(userId,source,{eventsJson=null,lastSynced=null,lastError=null,updatedAt=Date.now()},expectedEncryptedUrl)=>run('UPDATE feeds SET events_json=COALESCE(?,events_json),last_synced=COALESCE(?,last_synced),last_error=?,updated_at=? WHERE user_id=? AND source=? AND encrypted_url=?',[eventsJson,lastSynced,lastError,updatedAt,userId,source,expectedEncryptedUrl]),
      remove:(userId,source)=>run('DELETE FROM feeds WHERE user_id=? AND source=?',[userId,source]),
    },
    cleanup:async now=>{
      await run('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<=? LIMIT 500)',[now]);
      await run('DELETE FROM rate_buckets WHERE key_hash IN (SELECT key_hash FROM rate_buckets WHERE expires_at<=? LIMIT 500)',[now]);
    },
  };
}
export function createD1Store(binding){
  if(!binding?.prepare)throw Error('D1 binding DB is required');
  const statement=(sql,args)=>binding.prepare(sql).bind(...args);
  return storeFromExecutor({first:async(sql,args)=>(await statement(sql,args).first())||null,all:async(sql,args)=>(await statement(sql,args).all()).results||[],run:(sql,args)=>statement(sql,args).run()});
}
// Pass a node:sqlite DatabaseSync from local/test code. The Worker module never imports node:sqlite.
export function createSQLiteStore(database){
  return storeFromExecutor({first:async(sql,args)=>database.prepare(sql).get(...args)||null,all:async(sql,args)=>database.prepare(sql).all(...args),run:async(sql,args)=>database.prepare(sql).run(...args)});
}
