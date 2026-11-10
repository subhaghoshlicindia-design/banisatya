/* Shared, reversible client identities. Imported financial rows are never rewritten. */
(function(root){
 'use strict';
 const R=typeof module==='object'?require('./rta-core.js'):root.RTA;
 const empty=()=>({clients:{},merges:{},groups:{}}),upper=x=>String(x||'').trim().toUpperCase();
 const validPan=x=>/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(upper(x));
 const val=(d,r,n)=>String(R.value(d,r,n)||'').trim();
 const folio=(d,r)=>JSON.stringify([d.provider,upper(val(d,r,'AMC')),upper(val(d,r,'Folio Number'))]);
 const fallback=(d,r)=>R.excelInvestorKey(d,r)||'folio:'+folio(d,r);
 const resolve=(key,master={})=>master.merges?.[key]?.target||key;
 function entries(datasets){return Object.entries(datasets).filter(([code])=>code!=='WBR3').map(([sourceCode,data])=>({sourceCode,data:R.normalize({...data,provider:R.providerFor(sourceCode)})}));}
 function catalogue(list,master=empty()){
  list=[...list];const profiles=Object.values(master.clients||{});
  if(profiles.length&&master.clientRecords!==false)list.push({sourceCode:'Client master',data:{category:'clients',provider:'Manual',headers:['Investor Name','PAN','Email','Mobile','Folio Number'],records:profiles.map(p=>[p.name,p.pan,p.email||'',p.mobile||'',''])}});
  const links=new Map(),people=new Map();
  for(const {data:d} of list)for(const r of d.records){const pan=upper(val(d,r,'PAN'));if(pan&&val(d,r,'Folio Number')){const key=folio(d,r);if(!links.has(key))links.set(key,pan);else if(links.get(key)!==pan)links.set(key,null);}}
  const identity=(d,r)=>{const pan=upper(val(d,r,'PAN'))||(val(d,r,'Folio Number')&&links.get(folio(d,r)));return pan?'pan:'+pan:resolve(fallback(d,r),master);};
  for(const {data:d} of list)for(const r of d.records){
   if(!val(d,r,'PAN')&&!val(d,r,'Folio Number'))continue;
   const key=identity(d,r),pan=key.startsWith('pan:')?key.slice(4):'',profile=master.clients?.[pan],name=profile?.name||val(d,r,'Investor Name')||'Investor';
   if(!people.has(key))people.set(key,{key,pan,name,label:'',folios:new Set(),rows:0,email:profile?.email||'',mobile:profile?.mobile||''});
   const p=people.get(key);if(p.name==='Investor'&&name!=='Investor')p.name=name;if(!p.email)p.email=val(d,r,'Email');if(!p.mobile)p.mobile=val(d,r,'Mobile');if(val(d,r,'Folio Number')){p.folios.add(folio(d,r));p.rows++;}
   p.label=p.name+' - '+(pan||val(d,r,'Investor Group Code')||val(d,r,'Folio Number'));
  }
  return {list,identity,people:[...people.values()].map(p=>({...p,folios:[...p.folios]})).sort((a,b)=>a.label.localeCompare(b.label))};
 }
 function selection(scope,id,cat,families={},master=empty()){
  let keys;
  if(scope==='family'){if(!families[id])throw Error('Choose a saved family.');keys=families[id].members;}
  else if(scope==='group'){const group=master.groups?.[id];if(!group)throw Error('Choose a saved group.');keys=[...group.clients,...group.families.flatMap(f=>{if(!families[f])throw Error('A family in this group is unavailable. Review the group master.');return families[f].members;})];}
  else keys=[id];
  const ids=[...new Set(keys.map(k=>resolve(k,master)))],members=cat.people.filter(p=>ids.includes(p.key));
  if(!id||!members.length)throw Error('Choose a client, family or group with available members.');
  if(members.length!==ids.length)throw Error('Some members are unavailable. Review the saved family or group membership.');
  return members;
 }
 function checkMergeConflicts(list,master){
  for(const {data:d} of list)for(const r of d.records){const pan=upper(val(d,r,'PAN')),link=master.merges?.[fallback(d,r)];if(pan&&link&&link.target!=='pan:'+pan)throw Error('An imported PAN conflicts with a saved client merge. Review or undo that merge before importing.');}
 }
 function update(current,action,payload,datasets,families){
  const next=structuredClone(current||empty());next.clients||={};next.merges||={};next.groups||={};
  const cat=catalogue(entries(datasets),next),known=new Set(cat.people.map(p=>p.key));
  const text=(x,max,label,required=false)=>{if(typeof x!=='string'||x.length>max||required&&!x.trim())throw Error('Enter a valid '+label+'.');return x.trim();};
  if(action==='save-client'){
   const pan=upper(payload.pan);if(!validPan(pan))throw Error('Enter a valid PAN: five letters, four digits, one letter.');
   const name=text(payload.name,100,'client name',true),email=text(payload.email||'',254,'email'),mobile=text(payload.mobile||'',30,'mobile number');
   if(email&&!/^\S+@\S+\.\S+$/.test(email))throw Error('Enter a valid email address.');
   if(!next.clients[pan]&&Object.keys(next.clients).length>=20000)throw Error('Client master limit reached.');
   next.clients[pan]={pan,name,email,mobile};
  }else if(action==='merge-clients'){
   const target=String(payload.target||'');if(!target.startsWith('pan:')||!validPan(target.slice(4))||!known.has(target))throw Error('Choose an existing PAN client as the merge target.');
   if(!Array.isArray(payload.sources)||!payload.sources.length||payload.sources.length>500)throw Error('Select between 1 and 500 source clients.');
   for(const source of new Set(payload.sources)){if(typeof source!=='string'||source.length>500||!source.startsWith('folio:')||!known.has(source))throw Error('Only PAN-missing clients can be linked. Different PAN clients must remain separate.');next.merges[source]={target,sourceName:cat.people.find(p=>p.key===source).label,createdAt:new Date().toISOString()};}
   if(Object.keys(next.merges).length>20000)throw Error('Client merge limit reached.');checkMergeConflicts(entries(datasets),next);
  }else if(action==='undo-merge'){
   if(typeof payload.source!=='string'||!Object.hasOwn(next.merges,payload.source))throw Error('Choose an existing merge to undo.');delete next.merges[payload.source];
  }else if(action==='save-group'){
   const id=text(payload.id,100,'group ID',true);if(!/^[a-zA-Z0-9-]+$/.test(id))throw Error('Invalid group ID.');
   const name=text(payload.name,80,'group name',true);
   if(!Array.isArray(payload.clients)||!Array.isArray(payload.families)||payload.clients.length+payload.families.length>500||!payload.clients.length&&!payload.families.length)throw Error('Choose at least one client or family, up to 500 selections.');
   if(payload.clients.some(k=>typeof k!=='string'||!known.has(resolve(k,next)))||payload.families.some(k=>typeof k!=='string'||!Object.hasOwn(families,k)))throw Error('Some group members are unavailable. Refresh and review the group.');
   if(!next.groups[id]&&Object.keys(next.groups).length>=2000)throw Error('Group master limit reached.');
   next.groups[id]={name,clients:[...new Set(payload.clients.map(k=>resolve(k,next)))],families:[...new Set(payload.families)]};
  }else if(action==='delete-group'){
   if(typeof payload.id!=='string'||!Object.hasOwn(next.groups,payload.id))throw Error('Choose a saved group.');delete next.groups[payload.id];
  }else throw Error('Unsupported master action.');
  return next;
 }
 root.ClientMaster={empty,validPan,folio,fallback,resolve,entries,catalogue,selection,update,checkMergeConflicts};if(typeof module==='object')module.exports=root.ClientMaster;
})(typeof window==='object'?window:globalThis);
