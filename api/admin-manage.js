import { db } from './db.js';
export const access = 'admin';
export const methods = ['POST'];
export default async function (req, res) {
 const action=String(req.body?.action||''); const actor=req.member?.email||req.member?.handle||'admin';
 if(action==='create_session'){
  const title=String(req.body?.title||'').trim().slice(0,120); const days=Number(req.body?.days); const minVotes=Number(req.body?.minVotes); const maxChoices=Number(req.body?.maxChoices||5);
  if(!title||![1,2,3].includes(days)||!Number.isInteger(minVotes)||minVotes<0||minVotes>100000||!Number.isInteger(maxChoices)||maxChoices<1||maxChoices>9)return res.status(400).json({error:'Semak nama sesi, tempoh 1–3 hari, had minimum dan bilangan pilihan.'});
  const id='VV-'+Date.now().toString(36).toUpperCase();
  const {rows}=await db.query("INSERT INTO voting_sessions (id,title,starts_at,ends_at,status,min_votes,max_choices) VALUES ($1,$2,NOW(),NOW()+($3::text || ' days')::interval,'open',$4,$5) RETURNING id,title,starts_at,ends_at,status,min_votes,max_choices",[id,title,days,minVotes,maxChoices]);
  await db.query('INSERT INTO session_vendors (session_id,vendor_id) SELECT $1,id FROM vendors WHERE active=TRUE',[id]);
  await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)',[actor,'create_session',JSON.stringify({id,title,days,minVotes,maxChoices})]);
  return res.json({ok:true,message:'Sesi berjaya dicipta dan dibuka.',session:rows[0]});
 }
 if(action==='update_session'){
  const id=String(req.body?.sessionId||''); const status=String(req.body?.status||''); const minVotes=Number(req.body?.minVotes);
  if(!id||!['scheduled','open','closed','finalized'].includes(status)||!Number.isInteger(minVotes)||minVotes<0||minVotes>100000)return res.status(400).json({error:'Status atau had minimum tidak sah.'});
  const {rows}=await db.query('UPDATE voting_sessions SET status=$2,min_votes=$3 WHERE id=$1 RETURNING id,title,status,min_votes',[id,status,minVotes]);
  if(!rows.length)return res.status(404).json({error:'Sesi tidak ditemui.'});
  await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)',[actor,'update_session',JSON.stringify({id,status,minVotes})]);
  return res.json({ok:true,message:'Tetapan sesi dikemas kini.'});
 }
 if(action==='set_vendor_active'){
  const id=String(req.body?.vendorId||''); const active=Boolean(req.body?.active);
  const {rows}=await db.query('UPDATE vendors SET active=$2 WHERE id=$1 RETURNING id,name,active',[id,active]);
  if(!rows.length)return res.status(404).json({error:'Peniaga tidak ditemui.'});
  await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)',[actor,'set_vendor_active',JSON.stringify({id,active})]);
  return res.json({ok:true,message:'Status peniaga dikemas kini.'});
 }
 if(action==='update_vendor_image'){
  const id=String(req.body?.vendorId||'').trim();
  const imageUrl=String(req.body?.imageUrl||'').trim();
  const {rows}=await db.query('UPDATE vendors SET image_url=$2 WHERE id=$1 RETURNING id,name,image_url',[id,imageUrl]);
  if(!rows.length)return res.status(404).json({error:'Peniaga tidak ditemui.'});
  await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)',[actor,'update_vendor_image',JSON.stringify({id,imageUrl:imageUrl?'(set)':'(cleared)'})]);
  return res.json({ok:true,message:'Gambar branding peniaga berjaya dikemas kini.',vendor:rows[0]});
 }
 if(action==='update_vendor_slug'){
  const id=String(req.body?.vendorId||'').trim();
  let slug=String(req.body?.slug||'').trim().toLowerCase();
  slug=slug.replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  if(!slug)return res.status(400).json({error:'Slug tidak sah. Gunakan huruf kecil, nombor, atau tanda sempang.'});
  const {rows:conflict}=await db.query('SELECT id, name FROM vendors WHERE slug=$1 AND id<>$2',[slug,id]);
  if(conflict && conflict.length){
   return res.status(409).json({error:`Slug "/${slug}" telah digunakan oleh peniaga ${conflict[0].name} (${conflict[0].id}). Sila pilih slug yang berbeza.`});
  }
  const {rows}=await db.query('UPDATE vendors SET slug=$2 WHERE id=$1 RETURNING id,name,slug',[id,slug]);
  if(!rows.length)return res.status(404).json({error:'Peniaga tidak ditemui.'});
  await db.query('INSERT INTO admin_audit_log (actor,action,details) VALUES ($1,$2,$3::jsonb)',[actor,'update_vendor_slug',JSON.stringify({id,slug})]);
  return res.json({ok:true,message:`Pautan slug gerai berjaya dikemas kini kepada /${slug}`,vendor:rows[0]});
 }
 return res.status(400).json({error:'Tindakan admin tidak dikenali.'});
}