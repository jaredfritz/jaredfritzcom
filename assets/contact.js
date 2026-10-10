'use strict';
const escapeV = value => String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){let result='',bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>75){result+='\r\n ';bytes=1}result+=char;bytes+=size}return result}
function vcard(c,photo=''){const lines=['BEGIN:VCARD','VERSION:3.0',`N:${escapeV(c.familyName)};${escapeV(c.givenName)};;;`,`FN:${escapeV(c.name)}`];for(const [key,value] of [['ORG',c.organization],['TITLE',c.title],['EMAIL;TYPE=WORK',c.email],['TEL;TYPE=CELL',c.phone],['URL;TYPE=WORK',c.organizationUrl],['URL',c.linkedin]])if(value)lines.push(`${key}:${escapeV(value)}`);if(photo)lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photo}`);lines.push('END:VCARD');return lines.map(fold).join('\r\n')+'\r\n'}
async function contactPhoto(path){
 if(!path)return '';
 const response=await fetch(path);
 if(!response.ok)throw Error('Profile photo unavailable');
 const blob=await response.blob();
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(',')[1]);
  reader.onerror=()=>reject(Error('Profile photo could not be read'));
  reader.readAsDataURL(blob);
 });
}

function addLink(container,label,url,icon){if(!url)return;if(!/^(https:\/\/|mailto:|tel:|sms:)/.test(url))throw Error('Unsupported contact link');const a=document.createElement('a');a.className='contact-link';a.href=url;const badge=document.createElement('span');badge.className='contact-icon';badge.setAttribute('aria-hidden','true');if(icon==='quill'){badge.innerHTML='<svg viewBox="0 0 32 40" width="20" height="25" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 37h8l5-4-2-5L25 8a5 5 0 0 0-9-5L8 22l2 10M10 32 21 8M9 22l8-5M14 28l8-8"/></svg>';}else{badge.textContent=icon;}const text=document.createElement('span');text.className='contact-label';text.textContent=label;const arrow=document.createElement('span');arrow.className='contact-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';a.append(badge,text,arrow);container.append(a)}
function addPhoto(id,path,position,alt){if(!path)return;const container=document.getElementById(id);const fallback=[...container.childNodes];const img=document.createElement('img');img.alt=alt;img.style.objectPosition=position||'50% 50%';img.onload=()=>container.removeAttribute('aria-label');img.onerror=()=>container.replaceChildren(...fallback);img.src=path;container.replaceChildren(img)}
function renderContact(c){document.getElementById('name').textContent=c.name;const links=document.getElementById('links');links.replaceChildren();addLink(links,c.email,c.email?'mailto:'+c.email:'','@');addLink(links,'quill.org',c.organizationUrl,'quill');addLink(links,'LinkedIn',c.linkedin,'in');addPhoto('portrait',c.headshot,c.headshotPosition,'Portrait of '+c.name);addPhoto('cover',c.cover,c.coverPosition,'');const save=document.getElementById('save');
 save.onclick=async()=>{
  save.disabled=true;
  const status=document.getElementById('status');
  status.textContent='';
  try{
   const photo=await contactPhoto(c.headshot);
   const url=URL.createObjectURL(new Blob([vcard(c,photo)],{type:'text/vcard;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='Jared-Fritz.vcf';document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent='Open the contact file to add me to your contacts.';
  }catch{status.textContent='Contact download could not complete. Please try again.';}
  finally{save.disabled=false;}
 };
}


async function init(){const response=await fetch('../contact.json');if(!response.ok)throw Error('Contact configuration unavailable');renderContact(await response.json())}
init().catch(()=>{document.getElementById('save').disabled=true;document.getElementById('status').textContent='Contact details could not load. Please refresh and try again.'});

async function initWelcome(){
 const dialog=document.getElementById('card-welcome');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 if(!dialog || typeof dialog.showModal!=='function' || reduced.matches)return;
 const visitKey='jaredfritz-card-welcome-seen';
 try{if(sessionStorage.getItem(visitKey))return;}catch{}
 const card=document.getElementById('welcome-card');
 const target=document.querySelector('#card-flip .card-flip-inner');
 const timers=new Set();
 let moving=false,flight,keyboardNavigation=false;
 const schedule=(fn,delay)=>{const id=setTimeout(()=>{timers.delete(id);if(dialog.open)fn();},delay);timers.add(id);};
 const close=()=>{if(dialog.open)dialog.close();};
 const cleanup=()=>{
  timers.forEach(clearTimeout);timers.clear();
  if(flight)flight.cancel();
  target.style.visibility='';
  document.body.classList.remove('welcome-open');
  dialog.classList.remove('is-landing');
  card.style.transform='';
  window.removeEventListener('resize',close);
  window.visualViewport?.removeEventListener('resize',close);
  reduced.removeEventListener('change',close);
  if(keyboardNavigation)document.querySelector('#card-flip summary').focus({preventScroll:true});
 };
 const land=()=>{
  if(moving || !dialog.open)return;
  moving=true;
  if(typeof card.animate!=='function'){close();return;}
  const from=card.getBoundingClientRect(),to=target.getBoundingClientRect();
  if(!from.width || !to.width){close();return;}
  target.style.visibility='hidden';
  card.style.transformOrigin='top left';
  dialog.classList.add('is-landing');
  flight=card.animate([
   {transform:'translate(0px,0px) scale(1,1)'},
   {transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`}
  ],{duration:700,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
  flight.finished.then(close,close);
 };
 dialog.addEventListener('click',event=>{
  if(event.target===dialog || event.target.classList.contains('welcome-content'))close();
 });
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Tab' || event.key==='Escape')keyboardNavigation=true;
 });
 dialog.addEventListener('close',cleanup,{once:true});
 window.addEventListener('resize',close);
 window.visualViewport?.addEventListener('resize',close);
 reduced.addEventListener('change',close);
 dialog.showModal();
 document.body.classList.add('welcome-open');
 try{sessionStorage.setItem(visitKey,'true');}catch{}
 // Start timing only when both card faces are ready to display.
 await Promise.all([...card.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
 if(!dialog.open)return;
 schedule(()=>{
  card.classList.add('is-flipped');
  card.querySelector('.welcome-logo').setAttribute('aria-hidden','true');
  card.querySelector('.welcome-contact').setAttribute('aria-hidden','false');
  // 600ms flip, followed by a 1200ms reading pause.
  schedule(land,1800);
 },1400);
}
initWelcome();

const inlineCard=document.getElementById('card-flip');
inlineCard.addEventListener('toggle',()=>{
 inlineCard.querySelector('.card-front').setAttribute('aria-hidden',String(inlineCard.open));
 inlineCard.querySelector('.card-back').setAttribute('aria-hidden',String(!inlineCard.open));
 inlineCard.querySelector('summary').setAttribute('aria-label',inlineCard.open?'Show contact side of business card':'Show Quill side of business card');
});

const cardShareUrl='https://jaredfritz.com/card/';
async function copyCardLink(){
 const status=document.getElementById('status');
 try{
  if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
  await navigator.clipboard.writeText(cardShareUrl);
  status.textContent='Card link copied.';
 }catch{
  const field=document.getElementById('share-url');
  field.hidden=false;field.value=cardShareUrl;field.focus();field.select();
  status.textContent='Copy the selected card link to share it.';
 }
}
async function shareCard(){
 const status=document.getElementById('status');
 document.getElementById('share-url').hidden=true;
 status.textContent='';
 if(typeof navigator.share==='function'){
  try{await navigator.share({title:'Jared Fritz — Digital Business Card',url:cardShareUrl});return;}
  catch(error){if(error.name==='AbortError')return;}
 }
 await copyCardLink();
}
document.getElementById('share-card').addEventListener('click',shareCard);
