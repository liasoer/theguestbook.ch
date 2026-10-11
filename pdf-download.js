/* PDF direkt herunterladen statt Druckdialog (html2pdf.js) */
(function(){
  var LIB='/vendor/html2pdf.bundle.min.js';
  var laden=null;
  function lib(){
    if(window.html2pdf)return Promise.resolve();
    if(!laden)laden=new Promise(function(ok,fehler){var s=document.createElement('script');s.src=LIB;s.onload=ok;s.onerror=function(){laden=null;fehler();};document.head.appendChild(s);});
    return laden;
  }
  /* Druckregeln (@media print) während der Erstellung als eigenes Stylesheet zuletzt anhängen */
  var druckCss=null;
  function druckRegeln(an,extra){
    var alt=document.getElementById('pdf-druck');if(alt)alt.remove();
    document.documentElement.classList.toggle('pdf-modus',an);
    if(!an)return;
    if(druckCss===null){
      druckCss='';
      for(var i=0;i<document.styleSheets.length;i++){
        var r;try{r=document.styleSheets[i].cssRules;}catch(e){continue;}
        for(var j=0;j<r.length;j++){
          var m=r[j].media;if(!m||m.mediaText.indexOf('print')<0)continue;
          for(var k=0;k<r[j].cssRules.length;k++)druckCss+=r[j].cssRules[k].cssText+'\n';
        }
      }
      druckCss+='html.pdf-modus .blatt{width:210mm!important;max-width:none!important;box-shadow:none!important}';
    }
    var st=document.createElement('style');st.id='pdf-druck';st.textContent=druckCss+(extra||'');document.head.appendChild(st);
  }
  /* SVG-Bilder für html2canvas in scharfe PNG umwandeln (SVG ohne feste Grösse wird sonst falsch gezeichnet) */
  function svgZuPng(element){
    var bilder=[].slice.call(element.querySelectorAll('img')).filter(function(i){return /\.svg(\?|$)|^data:image\/svg/.test(i.getAttribute('src')||'');});
    return Promise.all(bilder.map(function(img){
      return new Promise(function(ok){
        var w=img.getBoundingClientRect().width||img.clientWidth,h=img.getBoundingClientRect().height||img.clientHeight;
        if(!w||!h)return ok(null);
        var q=new Image();q.onload=function(){
          try{var f=5,c=document.createElement('canvas');c.width=Math.round(w*f);c.height=Math.round(h*f);
            c.getContext('2d').drawImage(q,0,0,c.width,c.height);
            var alt=img.getAttribute('src');img.setAttribute('src',c.toDataURL('image/png'));ok(function(){img.setAttribute('src',alt);});
          }catch(e){ok(null);}
        };q.onerror=function(){ok(null);};q.src=img.currentSrc||img.src;
      });
    })).then(function(r){return function(){r.forEach(function(f){if(f)f();});};});
  }
  /* Leere Felder wirklich leeren: nach dem Löschen bleibt oft ein <br> zurück, das als Leerzeile im PDF landet */
  function leereFelder(element){
    [].forEach.call(element.querySelectorAll('[contenteditable]'),function(f){if(!f.textContent.trim()&&f.innerHTML!=='')f.innerHTML='';});
    /* Leere Adresszeilen ausblenden. html2canvas wandelt Platzhalter in echte Elemente um, darum greift :empty dort nicht */
    var weg=[].filter.call(element.querySelectorAll('.empf [contenteditable]'),function(f){return !f.textContent.trim();});
    weg.forEach(function(f){f.style.display='none';});
    return function(){weg.forEach(function(f){f.style.display='';});};
  }
  /* Ganze Seite auf genau ein A4-Blatt bringen: ist der Inhalt höher, wird er verkleinert statt umgebrochen */
  function aufEineSeite(c,bg){
    var W=c.width,H=c.height,pw=W,ph=Math.floor(W*297/210);
    if(H>ph){ph=H;pw=Math.ceil(H*210/297);ph=Math.floor(pw*297/210);}
    var o=document.createElement('canvas');o.width=pw;o.height=ph;
    var g=o.getContext('2d');g.fillStyle=bg||'#F7F2E9';g.fillRect(0,0,pw,ph);
    var k=Math.min(pw/W,ph/H,1);g.drawImage(c,Math.round((pw-W*k)/2),0,Math.round(W*k),Math.round(H*k));
    return o;
  }
  window.tgbPdf=function(knopf,element,dateiname,rand,extraCss,optionen){
    optionen=optionen||{};
    var text=knopf.textContent;knopf.disabled=true;knopf.textContent='PDF wird erstellt …';
    var zurueck=null,felder=null;
    var ende=function(){druckRegeln(false);if(zurueck)zurueck();if(felder)felder();knopf.disabled=false;knopf.textContent=text;};
    lib().then(function(){return document.fonts?document.fonts.ready:null;}).then(function(){
      if(document.activeElement)document.activeElement.blur();
      felder=leereFelder(element);
      druckRegeln(true,extraCss);
      return svgZuPng(element);
    }).then(function(z){
      zurueck=z;
      var name=dateiname.replace(/[\\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim()+'.pdf';
      var grund={margin:rand||0,filename:name,image:{type:'jpeg',quality:0.96},
        html2canvas:{scale:2,useCORS:true,logging:false,windowWidth:1100,scrollX:0,scrollY:0,backgroundColor:null},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
        pagebreak:{mode:['css'],avoid:['tr','li','dt','dd','.unterschrift','.gruss']}};
      if(!optionen.einseitig)return html2pdf().set(grund).from(element).save();
      var bg=getComputedStyle(element).backgroundColor;
      return html2pdf().set(grund).from(element).toCanvas().get('canvas').then(function(c){
        var seite=aufEineSeite(c,bg);
        return html2pdf().set({margin:0,filename:name,image:{type:'jpeg',quality:0.96},
          jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},pagebreak:{mode:[]}}).from(seite,'canvas').save();
      });
    }).then(ende,function(){ende();window.print();});
  };
})();
