/* Theme-aware date picker; original date inputs retain ISO values and events. */
(() => {
 const pad=n=>String(n).padStart(2,'0'), key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const [y,m,d]=s.split('-').map(Number),v=new Date(y,m-1,d,12);return key(v)===s?v:null};
 const pretty=s=>{const d=parse(s);return d?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Choose a date'};
 const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18m4 4h3m4 0h3"/></svg>';
 function enhance(){document.querySelectorAll('input[type="date"]:not([data-cw-date])').forEach(input=>{
  input.dataset.cwDate='true';input.classList.add('cw-date-original');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
  const button=document.createElement('button');button.type='button';button.className='cw-date-trigger';button.setAttribute('aria-haspopup','dialog');
  input.after(button);
  const label=input.labels?.[0]?.textContent?.trim()||input.getAttribute('aria-label')||'Date';
  function sync(){button.innerHTML='<span></span>'+icon;button.firstChild.textContent=pretty(input.value);button.disabled=input.disabled;button.setAttribute('aria-label',label+': '+pretty(input.value));button.classList.toggle('is-empty',!input.value)}
  input.addEventListener('change',sync);input.addEventListener('input',sync);input.form?.addEventListener('reset',()=>setTimeout(sync));sync();
  button.onclick=()=>open(input,button,label,sync);
  input.addEventListener('focus',()=>button.focus());
 });}
 function open(input,trigger,label,sync){
  let focus=parse(input.value)||new Date(),month=new Date(focus.getFullYear(),focus.getMonth(),1,12);
  const dialog=document.createElement('dialog');dialog.className='cw-calendar';dialog.setAttribute('aria-label','Choose '+label.toLowerCase());document.body.append(dialog);
  const allowed=d=>(!input.min||key(d)>=input.min)&&(!input.max||key(d)<=input.max);
  const close=()=>dialog.close();
  function select(d){input.value=d?key(d):'';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));sync();close()}
  function draw(){const today=key(new Date()),selected=input.value,start=new Date(month.getFullYear(),month.getMonth(),1-month.getDay(),12);
   dialog.innerHTML='<div class="cw-cal-top"><span>MAKE A LITTLE PLAN</span><button type="button" data-close aria-label="Close calendar">×</button></div><div class="cw-cal-month"><button type="button" data-prev aria-label="Previous month">‹</button><h2 aria-live="polite"></h2><button type="button" data-next aria-label="Next month">›</button></div><div class="cw-cal-week" aria-hidden="true">'+['S','M','T','W','T','F','S'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="cw-cal-days" role="group" aria-label="Dates"></div><div class="cw-cal-bottom"><button type="button" data-clear>Clear date</button><button type="button" data-today>Today</button></div>';
   dialog.querySelector('h2').textContent=month.toLocaleDateString(undefined,{month:'long',year:'numeric'});
   for(let n=0;n<42;n++){const d=new Date(start);d.setDate(start.getDate()+n);const k=key(d),b=document.createElement('button');b.type='button';b.textContent=d.getDate();b.dataset.date=k;b.disabled=!allowed(d);b.className=(d.getMonth()!==month.getMonth()?'outside ':'')+(k===today?'today ':'')+(k===selected?'selected':'');b.setAttribute('aria-label',d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}));b.setAttribute('aria-pressed',String(k===selected));if(k===today)b.setAttribute('aria-current','date');b.tabIndex=k===key(focus)?0:-1;b.onclick=()=>select(d);dialog.querySelector('.cw-cal-days').append(b)}
   dialog.querySelector('[data-close]').onclick=close;
   function move(delta){month.setMonth(month.getMonth()+delta);focus=new Date(month);draw();dialog.querySelector('[data-'+(delta<0?'prev':'next')+']').focus()}
   dialog.querySelector('[data-prev]').onclick=()=>move(-1);dialog.querySelector('[data-next]').onclick=()=>move(1);
   dialog.querySelector('[data-clear]').onclick=()=>select(null);dialog.querySelector('[data-clear]').disabled=input.required;
   dialog.querySelector('[data-today]').onclick=()=>select(new Date());dialog.querySelector('[data-today]').disabled=!allowed(new Date());
  }
  dialog.addEventListener('keydown',e=>{if(!e.target.dataset.date)return;let d=parse(e.target.dataset.date);const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(e.key in delta)d.setDate(d.getDate()+delta[e.key]);else if(e.key==='Home')d.setDate(d.getDate()-d.getDay());else if(e.key==='End')d.setDate(d.getDate()+6-d.getDay());else if(e.key==='PageUp'||e.key==='PageDown'){d=new Date(d.getFullYear(),d.getMonth()+(e.key==='PageUp'?-1:1),1,12)}else return;e.preventDefault();if(!allowed(d))return;focus=d;month=new Date(d.getFullYear(),d.getMonth(),1,12);draw();dialog.querySelector(`[data-date="${key(d)}"]`)?.focus()});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
  dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus()},{once:true});draw();dialog.showModal();const first=dialog.querySelector(`[data-date="${key(focus)}"]:not(:disabled)`)||dialog.querySelector('[data-date]:not(:disabled)');if(first){first.tabIndex=0;first.focus()}
 }
 new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});enhance();
})();
