(function(){
  var RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var st=document.getElementById('fcopy-status');
  [].forEach.call(document.querySelectorAll('.fcopy'),function(btn){btn.addEventListener('click',function(){
    var t=btn.getAttribute('data-copy');
    function ok(){btn.textContent='Copied';btn.classList.add('done');if(st)st.textContent='Copied to clipboard';setTimeout(function(){btn.textContent='Copy';btn.classList.remove('done');},1600);}
    function fb(){var a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.position='absolute';a.style.left='-9999px';document.body.appendChild(a);a.select();try{document.execCommand('copy');ok();}catch(e){}document.body.removeChild(a);}
    if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(ok,fb);else fb();
  });});
  // tabs (WAI-ARIA)
  [].forEach.call(document.querySelectorAll('[data-tabs]'),function(w){
    var tabs=[].slice.call(w.querySelectorAll('[role=tab]'));
    function sel(i,focus){tabs.forEach(function(t,j){var on=i===j;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!on;});if(focus)tabs[i].focus();}
    tabs.forEach(function(t,i){t.addEventListener('click',function(){sel(i);});t.addEventListener('keydown',function(e){var k=e.key,n=tabs.length;if(k==='ArrowRight'){sel((i+1)%n,1);e.preventDefault();}else if(k==='ArrowLeft'){sel((i-1+n)%n,1);e.preventDefault();}else if(k==='Home'){sel(0,1);e.preventDefault();}else if(k==='End'){sel(n-1,1);e.preventDefault();}});});
  });
  // tongue demo
  var d=document.querySelector('[data-demo=tongue]');
  if(d){var c=d.querySelector('#d-count'),o=d.querySelector('#d-count-o'),nm=d.querySelector('#d-name'),pr=new Intl.PluralRules('en');
    function up(){var n=+c.value,cat=n===0?'0':pr.select(n);o.textContent=n;
      var txt=n===0?'No messages':(cat==='one'?n+' message':n+' messages');
      d.querySelector('#d-inbox').textContent=txt;d.querySelector('#d-cat').textContent=n===0?'=0 (exact match)':pr.select(n);
      [].forEach.call(d.querySelectorAll('.msg b'),function(b){b.classList.toggle('on',b.getAttribute('data-b')===(n===0?'0':cat==='one'?'one':'other'));});
      d.querySelector('#d-title').textContent='Welcome, '+(nm.value||'')+'!';}
    c.addEventListener('input',up);nm.addEventListener('input',up);up();
    if(!RM){var k=0,seq=[0,1,2,5,1],tm=setInterval(function(){if(k>=seq.length){clearInterval(tm);return;}c.value=seq[k++];up();},900);c.addEventListener('pointerdown',function(){clearInterval(tm);});nm.addEventListener('focus',function(){clearInterval(tm);});}
  }
  // herald demo
  var h=document.querySelector('[data-demo=herald]');
  if(h){var ti=h.querySelector('#h-title'),pa=h.querySelector('#h-path'),de=h.querySelector('#h-desc');
    function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function norm(p){p=(p||'/').split('#')[0].split('?')[0].replace(/\/{2,}/g,'/');if(p.charAt(0)!=='/')p='/'+p;return p;}
    function ser(o){return JSON.stringify(o,null,2).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
    function up(){var t=ti.value,p=norm(pa.value),ds=de.value;
      h.querySelector('#h-url').textContent='https://example.com'+(p==='/'?'':' › '+p.split('/').filter(Boolean).join(' › '));
      h.querySelector('#h-t').textContent=t?t+' · Example':'Example';
      h.querySelector('#h-d').textContent=ds||'What Example does, in one sentence.';
      var w=[];if(!t.trim())w.push(['w','warn: empty title']);if(t.length>70)w.push(['w','warn: title is '+t.length+' characters (over 70)']);
      if(!ds.trim())w.push(['w','warn: empty description']);if(ds.length>160)w.push(['w','warn: description is '+ds.length+' characters (over 160)']);
      if(!w.length)w.push(['o','✓ canonical https://example.com'+p]);else w.push(['o','canonical https://example.com'+p]);
      h.querySelector('#h-warn').innerHTML=w.map(function(x){return '<li class="'+x[0]+'">'+esc(x[1])+'</li>';}).join('');
      var s=ser({'@context':'https://schema.org','@type':'Article',headline:t,description:ds});
      h.querySelector('#h-ld').innerHTML=esc(s).replace(/\\u00(3c|3e|26)/g,'<span class="e">\\u00$1</span>');}
    [ti,pa,de].forEach(function(x){x.addEventListener('input',up);});up();
  }
  // subtle tilt on hero demo
  var tl=document.querySelector('.tilt');
  if(tl&&!RM&&window.matchMedia('(pointer:fine)').matches){tl.addEventListener('pointermove',function(e){var r=tl.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;tl.style.transform='perspective(1400px) rotateY('+(x*3)+'deg) rotateX('+(-y*3)+'deg)';});tl.addEventListener('pointerleave',function(){tl.style.transform='';});}
  if('IntersectionObserver' in window&&!RM){var els=document.querySelectorAll('.why,.st,.fcard,.diag-wrap,.pos,.road li,.faq details,.tabs,.sib-card');var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -6% 0px'});document.documentElement.classList.add('js');[].forEach.call(els,function(x,i){x.classList.add('reveal');x.style.transitionDelay=(i%4)*60+'ms';io.observe(x);});}
})();
