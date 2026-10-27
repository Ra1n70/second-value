/* A read-only artwork viewer. Only explicitly confirmed identities get triggers. */
(function(root,factory){
  const viewer=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=viewer;
  else root.SecondValueArtZoom=viewer;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function createViewer(options={}){
    const engine=()=>options.engine||root.SecondValue, art=()=>options.art||root.SecondValueArt;
    const document=options.document||root.document, locale=()=>options.locale||root.SecondValueLocale;
    let dialog=null,current=null,opener=null;
    function confirmed(item,known){
      if(known!==true||!item||typeof item.catalogId!=='string')return null;
      const E=engine();
      const canonical=E?.catalogItems?.().find(value=>value.catalogId===item.catalogId&&value.shape===item.shape);
      if(!canonical)return null;
      const visual=art()?.visualFor(canonical,true);
      if(!visual||!/^assets\/(?:[\w-]+\/)*[\w-]+\.(?:png|svg|webp)$/.test(visual.sheet))return null;
      for(const key of ['columns','rows','column','row'])if(!Number.isInteger(visual[key]))return null;
      if(visual.columns<1||visual.rows<1||visual.column<0||visual.column>=visual.columns||visual.row<0||visual.row>=visual.rows)return null;
      return {item:canonical,visual};
    }
    function trigger(item,known,content=''){
      const value=confirmed(item,known);
      if(!value)return content;
      return `<button type="button" class="art-zoom-trigger" data-art-zoom="${escape(value.item.catalogId)}" data-art-zoom-known="true" aria-label="${escape('Enlarge artwork: '+value.item.name)}">${content}<span class="art-zoom-hint">Enlarge artwork</span></button>`;
    }
    function imageMarkup(value){
      const v=value.visual,x=v.columns>1?100*v.column/(v.columns-1):0,y=v.rows>1?100*v.row/(v.rows-1):0;
      return `<div class="art-zoom-image" role="img" aria-label="${escape(value.item.name)}" style="--zoom-aspect:${v.sheet==='assets/catalog-lots-v1.png'?1.5:1};background-image:url('${escape(v.sheet)}');background-size:${v.columns*100}% ${v.rows*100}%;background-position:${x}% ${y}%"></div>`;
    }
    function render(){
      if(!dialog||!current)return;
      const focusId=dialog.contains(document.activeElement)?document.activeElement.id:null;
      const language=locale()?.language||'en';
      dialog.innerHTML=`<header class="art-zoom-header"><div><span>Artwork</span><h2 id="art-zoom-title">${escape(current.item.name)}</h2></div><div class="art-zoom-tools"><label data-no-localize><select id="art-zoom-language" aria-label="Language / 语言 / Idioma"><option value="en" ${language==='en'?'selected':''}>English</option><option value="zh-CN" ${language==='zh-CN'?'selected':''}>中文</option><option value="es" ${language==='es'?'selected':''}>Español</option></select></label><button type="button" id="art-zoom-close" aria-label="Close artwork">×</button></div></header>${imageMarkup(current)}<p class="art-zoom-footnote">Press Escape or use Close to return.</p>`;
      locale()?.localize?.(dialog);
      if(focusId)dialog.querySelector('#'+focusId)?.focus({preventScroll:true});
    }
    function ensure(){
      if(dialog||!document?.createElement||!document.body)return dialog;
      dialog=document.createElement('dialog');dialog.className='art-zoom-dialog';dialog.setAttribute('aria-labelledby','art-zoom-title');
      dialog.addEventListener('click',event=>{
        if(event.target.closest?.('#art-zoom-close'))dialog.close();
        else if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}
      });
      dialog.addEventListener('change',event=>{if(event.target.id==='art-zoom-language')locale()?.setLanguage?.(event.target.value);});
      dialog.addEventListener('close',()=>{
        let target=opener?.isConnected?opener:null;
        if(!target&&current){
          const matches=[...document.querySelectorAll('[data-art-zoom]')].filter(el=>el.getAttribute('data-art-zoom')===current.item.catalogId);
          target=matches.find(el=>el.closest('dialog')?.open)||matches[0];
        }
        target?.focus?.({preventScroll:true});
      });
      document.body.append(dialog);return dialog;
    }
    function open(item,known,source){
      const value=confirmed(item,known);if(!value||!ensure())return false;
      current=value;opener=source||document.activeElement;render();if(!dialog.open)dialog.showModal();
      dialog.querySelector('#art-zoom-close')?.focus({preventScroll:true});return true;
    }
    document?.addEventListener?.('click',event=>{
      const button=event.target.closest?.('[data-art-zoom]');
      if(!button||button.getAttribute('data-art-zoom-known')!=='true')return;
      const item=engine()?.catalogItems?.().find(value=>value.catalogId===button.getAttribute('data-art-zoom'));
      if(!item)return;event.preventDefault();open(item,true,button);
    });
    root.addEventListener?.('secondvalue:languagechange',()=>{if(dialog?.open)render();});
    return Object.freeze({trigger,open,imageMarkup:(item,known)=>{const value=confirmed(item,known);return value?imageMarkup(value):'';}});
  }
  return Object.freeze({...createViewer(),createViewer});
});
