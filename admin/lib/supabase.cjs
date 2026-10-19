// Minimal Supabase Auth client over fetch, used only on the server.
class AuthError extends Error {constructor(message,status){super(message);this.status=status;}}
function createSupabaseAuth({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,fetchImpl=fetch}={}){
  async function call(path,{method='GET',token,body}={}){
    if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set.');
    const response=await fetchImpl(url.replace(/\/$/,'')+path,{method,signal:AbortSignal.timeout(10000),headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body&&JSON.stringify(body)});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new AuthError(data?.msg||data?.error_description||data?.message||'Supabase request failed.',response.status);
    return data;
  }
  const session=data=>({accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+(data.expires_in||3600)*1000,user:data.user});
  return {
    signIn:(email,password)=>call('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}).then(session),
    refresh:refreshToken=>call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken}}).then(session),
    getUser:token=>call('/auth/v1/user',{token}),
    // Null when the person has a Supabase login but is not on the dashboard_users list.
    role:token=>call('/rest/v1/rpc/dashboard_role',{method:'POST',token,body:{}}),
    updatePassword:(token,password)=>call('/auth/v1/user',{method:'PUT',token,body:{password}}),
    signOut:token=>call('/auth/v1/logout',{method:'POST',token}).catch(()=>null),
    recover:(email,redirectTo)=>call('/auth/v1/recover'+(redirectTo?'?redirect_to='+encodeURIComponent(redirectTo):''),{method:'POST',body:{email}})
  };
}
module.exports={createSupabaseAuth,AuthError};
