'use strict';
const escapeV = value => String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){let result='',bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>75){result+='\r\n ';bytes=1}result+=char;bytes+=size}return result}
function vcard(c){const lines=['BEGIN:VCARD','VERSION:3.0',`N:${escapeV(c.familyName)};${escapeV(c.givenName)};;;`,`FN:${escapeV(c.name)}`];for(const [key,value] of [['ORG',c.organization],['TITLE',c.title],['EMAIL;TYPE=INTERNET,WORK',c.email],['TEL;TYPE=CELL',c.phone],['URL',c.website],['URL;TYPE=LinkedIn',c.linkedin]])if(value)lines.push(`${key}:${escapeV(value)}`);lines.push('END:VCARD');return lines.map(fold).join('\r\n')+'\r\n'}
function addLink(container,label,url,icon){if(!url)return;if(!/^(https:\/\/|mailto:|tel:|sms:)/.test(url))throw Error('Unsupported contact link');const a=document.createElement('a');a.className='contact-link';a.href=url;const badge=document.createElement('span');badge.className='contact-icon';badge.setAttribute('aria-hidden','true');badge.textContent=icon;const text=document.createElement('span');text.className='contact-label';text.textContent=label;const arrow=document.createElement('span');arrow.className='contact-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';a.append(badge,text,arrow);container.append(a)}
function addPhoto(id,path,position,alt){if(!path)return;const container=document.getElementById(id);const fallback=[...container.childNodes];const img=document.createElement('img');img.alt=alt;img.style.objectPosition=position||'50% 50%';img.onload=()=>container.removeAttribute('aria-label');img.onerror=()=>container.replaceChildren(...fallback);img.src=path;container.replaceChildren(img)}
function renderContact(c){document.getElementById('name').textContent=c.name;const links=document.getElementById('links');links.replaceChildren();addLink(links,c.email,c.email?'mailto:'+c.email:'','@');addLink(links,'quill.org',c.organizationUrl,'↗');addLink(links,'LinkedIn',c.linkedin,'in');addPhoto('portrait',c.headshot,c.headshotPosition,'Portrait of '+c.name);addPhoto('cover',c.cover,c.coverPosition,'');const url=URL.createObjectURL(new Blob([vcard(c)],{type:'text/vcard;charset=utf-8'}));document.getElementById('save').onclick=()=>{const a=document.createElement('a');a.href=url;a.download='Jared-Fritz.vcf';document.body.append(a);a.click();a.remove();document.getElementById('status').textContent=c.approved?'Open the contact file to add me to your contacts.':'Contact downloaded. Open the file to add me to your contacts.'}}

async function init(){const response=await fetch('../contact.json');if(!response.ok)throw Error('Contact configuration unavailable');renderContact(await response.json())}
init().catch(()=>{document.getElementById('save').disabled=true;document.getElementById('status').textContent='Contact details could not load. Please refresh and try again.'});

function initWelcome(){
 const dialog=document.getElementById('card-welcome');
 if(!dialog || typeof dialog.showModal!=='function')return;
 const visitKey='jaredfritz-card-welcome-seen';
 try{if(sessionStorage.getItem(visitKey))return;}catch{}
 const card=document.getElementById('welcome-card');
 const dismiss=document.getElementById('welcome-dismiss');
 let flipTimer;
 const setSide=contactSide=>{
  card.classList.toggle('is-flipped',contactSide);
  card.setAttribute('aria-pressed',String(contactSide));
  card.setAttribute('aria-label',contactSide?'Show Quill side of business card':'Show contact side of business card');
  card.querySelector('.welcome-logo').setAttribute('aria-hidden',String(contactSide));
  card.querySelector('.welcome-contact').setAttribute('aria-hidden',String(!contactSide));
 };
 const flip=()=>setSide(true);
 card.addEventListener('click',()=>{
  clearTimeout(flipTimer);
  setSide(!card.classList.contains('is-flipped'));
 });
 const close=()=>dialog.close();
 dismiss.addEventListener('click',close);
 dialog.addEventListener('click',event=>{
  if(event.target===dialog || event.target.classList.contains('welcome-content') || event.target.classList.contains('welcome-help'))close();
 });
 dialog.addEventListener('close',()=>{
  clearTimeout(flipTimer);
  document.body.classList.remove('welcome-open');
  document.querySelector('#card-flip summary').focus({preventScroll:true});
 });
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduced)flip();
 dialog.showModal();
 document.body.classList.add('welcome-open');
 try{sessionStorage.setItem(visitKey,'true');}catch{}
 if(!reduced)flipTimer=setTimeout(flip,1400);
}
initWelcome();

const inlineCard=document.getElementById('card-flip');
inlineCard.addEventListener('toggle',()=>{
 inlineCard.querySelector('.card-front').setAttribute('aria-hidden',String(inlineCard.open));
 inlineCard.querySelector('.card-back').setAttribute('aria-hidden',String(!inlineCard.open));
 inlineCard.querySelector('summary').setAttribute('aria-label',inlineCard.open?'Show contact side of business card':'Show Quill side of business card');
});
