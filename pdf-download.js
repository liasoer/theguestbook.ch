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
  window.tgbPdf=function(knopf,element,dateiname,rand,extraCss){
    var text=knopf.textContent;knopf.disabled=true;knopf.textContent='PDF wird erstellt …';
    var zurueck=null;
    var ende=function(){druckRegeln(false);if(zurueck)zurueck();knopf.disabled=false;knopf.textContent=text;};
    lib().then(function(){return document.fonts?document.fonts.ready:null;}).then(function(){
      if(document.activeElement)document.activeElement.blur();
      druckRegeln(true,extraCss);
      return svgZuPng(element);
    }).then(function(z){
      zurueck=z;
      return html2pdf().set({
        margin:rand||0,
        filename:dateiname.replace(/[\\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim()+'.pdf',
        image:{type:'jpeg',quality:0.96},
        html2canvas:{scale:2,useCORS:true,logging:false,windowWidth:1100,scrollX:0,scrollY:0,backgroundColor:null},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
        pagebreak:{mode:['css'],avoid:['tr','li','dt','dd','.unterschrift','.gruss']}
      }).from(element).save();
    }).then(ende,function(){ende();window.print();});
  };
})();
