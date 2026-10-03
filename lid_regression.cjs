const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname+'/';
const raw=fs.readFileSync(root+'spectrophotometer.glb');
const glb=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
const html=fs.readFileSync(root+'index.html','utf8');
assert(html.indexOf('id="control-card"') > html.indexOf('id="monitor-screen"') && html.indexOf('id="control-card"') < html.indexOf('class="crt-chin"'), 'measurement controls must be inside the CRT screen');
class Element {
 constructor(id='node'){this.id=id;this.tagName=id==='title'?'TITLE':'DIV';this.listeners={};this.attrs={};this.children=[];this.style={setProperty(){}};this.dataset={};this.hidden=false;this.textContent='';this.classList={toggle(){},remove(){},add(){},contains(){return false}};this.offsetWidth=230;this.offsetHeight=100;}
 addEventListener(n,fn){(this.listeners[n]||=[]).push(fn)} removeEventListener(n,fn){this.listeners[n]=(this.listeners[n]||[]).filter(f=>f!==fn)}
 emit(n,e={}){for(const fn of this.listeners[n]||[])fn({...e,target:this,currentTarget:this,stopPropagation(){},composedPath(){return []}})}
 setAttribute(k,v){this.attrs[k]=String(v)} removeAttribute(k){delete this.attrs[k]}
 getBoundingClientRect(){return {left:100,right:132,top:190,bottom:222,width:this.id==='spectrum-chart'?720:800,height:600}}
 querySelectorAll(){return this.children.filter(e=>e.tagName==='BUTTON')}
 querySelector(s){return this.children.find(e=>s==='.measure-check'?e.className==='measure-check':e.tagName==='SPAN')||new Element('span')}
 append(...items){for(const item of items){item.parent=this;this.children.push(item)}} get lastChild(){return this.children.at(-1)}
 remove(){const i=this.parent?.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1)} replaceChildren(...items){this.children=[];this.append(...items)}
 setPointerCapture(){} click(){} matches(s){return s==='button'&&this.tagName==='BUTTON'||s==='[data-screen]'&&!!this.dataset.screen}
 scrollIntoView(){} focus(){}
 set innerHTML(s){this.children=[];if(s.includes('<span')){const child=new Element('span');child.tagName='SPAN';this.append(child)}if(s.includes('measure-check')){const child=new Element('span');child.tagName='SPAN';child.className='measure-check';this.append(child)}}
}
const elements=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
const viewer=elements['instrument-model'];const hotspots=Array.from({length:8},(_,i)=>new Element('hotspot-'+(i+1)));
viewer.querySelectorAll=()=>hotspots;viewer.availableAnimations=glb.animations.map(a=>a.name);viewer.duration=.04;viewer.updateComplete=Promise.resolve();
viewer.model={materials:glb.materials.map(m=>({name:m.name,pbrMetallicRoughness:{setBaseColorFactor(){}},setAlphaMode(){},setEmissiveFactor(){}}))};
const played=[]; viewer.play=()=>{const name=viewer.animationName;played.push(name);setTimeout(()=>viewer.emit('finished'),2);setTimeout(()=>{viewer.currentTime=viewer.duration;viewer.emit('finished')},50)};
viewer.pause=()=>{};let lidSpot='';viewer.updateHotspot=({name,position})=>{if(name==='hotspot-6')lidSpot=position};
elements['spectrum-chart'].append(new Element('title'));
const tabs=['spectrum','calibration','history'].map(x=>{const e=new Element('tab-'+x);e.dataset.screen=x;return e});
const pages=tabs.map(t=>{const e=new Element('page-'+t.dataset.screen);e.dataset.page=t.dataset.screen;return e});
const flows=Array.from({length:4},(_,i)=>{const e=new Element('flow'+i);e.dataset.flow=String(i);return e});
const themes=['pearl','ivory','graphite'].map(x=>{const e=new Element(x);e.dataset.theme=x;return e});
const storage=new Map();
const document={body:{dataset:{release:'2026-09-27-r14'}},documentElement:{dataset:{}},querySelector(s){if(s[0]==='#')return elements[s.slice(1)];return new Element(s)},querySelectorAll(s){return s==='[data-screen]'?tabs:s==='[data-page]'?pages:s==='[data-flow]'?flows:s==='.theme-picker button'?themes:[]},createElement(n){const e=new Element(n);e.tagName=n.toUpperCase();return e},createElementNS(ns,n){const e=new Element(n);e.tagName=n.toUpperCase();return e}};
const context={document,HTMLElement:Element,console,setTimeout,clearTimeout,performance,requestAnimationFrame:fn=>setTimeout(()=>fn(performance.now()),1),getComputedStyle:()=>({getPropertyValue:()=> '"2026-09-27-r14"'}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{innerWidth:1440,addEventListener(){},matchMedia:()=>({matches:true})},customElements:{get:()=>true},Blob,URL};
vm.createContext(context);vm.runInContext(fs.readFileSync(root+'app.js','utf8')+'\nglobalThis.qa={state,setViewMode,animateLid,power,blank,focusPart,selectSpecimen,scan};',context);viewer.emit('load');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const {state,setViewMode,animateLid,power,blank,focusPart,selectSpecimen,scan}=context.qa;
 await delay(10);assert(state.ready);assert.equal(viewer.animationName,'Pose off open');
 assert(elements['viewer-loading'].hidden, 'the loaded model must never stay behind the loading veil');
 document.body.dataset.release='older';elements['viewer-loading'].hidden=false;viewer.emit('load');await delay(10);
 assert(elements['viewer-loading'].hidden && state.ready && !elements['asset-warning'].hidden, 'mixed versions warn without hiding the model');
 document.body.dataset.release='2026-09-27-r14';viewer.emit('load');await delay(10);
 assert(elements['asset-warning'].hidden, 'matching assets should have no warning');
 const originalMaterials=viewer.model.materials;
 viewer.model.materials=originalMaterials.filter(m=>m.name!=='PhotoLidInner');viewer.emit('load');await delay(10);
 assert(elements['viewer-loading'].hidden && state.ready && !elements['asset-warning'].hidden, 'optional 3D details cannot hide the model');
 viewer.model.materials=originalMaterials;
 const originalAnimations=viewer.availableAnimations;
 viewer.availableAnimations=originalAnimations.filter(name=>name!=='Pose off closed');viewer.emit('load');await delay(10);
 assert(elements['viewer-loading'].hidden && !state.ready && !elements['asset-warning'].hidden, 'an older model remains visible with simulation disabled');
 viewer.availableAnimations=originalAnimations;viewer.emit('load');await delay(10);assert(state.ready);
 for(let i=0;i<5;i++){
  assert(await animateLid(false));assert.equal(state.lidOpen,false);assert.equal(viewer.animationName,'Pose off closed');assert(lidSpot.includes('0.2250m'));
  setViewMode('simulation');setViewMode('components');await delay(20);assert.equal(viewer.animationName,'Pose off closed');assert.equal(state.lidOpen,false);
  assert(await animateLid(true));assert.equal(state.lidOpen,true);assert.equal(viewer.animationName,'Pose off open');assert(lidSpot.includes('0.3280m'));
  setViewMode('simulation');setViewMode('components');await delay(20);assert.equal(viewer.animationName,'Pose off open');
 }
 setViewMode('simulation');await delay(220);assert(state.connected);
 assert(await power(true));assert.equal(viewer.animationName,'Pose sample open');
 assert(await blank());assert.equal(state.lidOpen,false);assert.equal(viewer.animationName,'Pose blank closed');
 setViewMode('components');await delay(20);assert.equal(viewer.animationName,'Pose blank closed');
 focusPart(5);await delay(80);assert.equal(state.lidOpen,true);assert.equal(viewer.animationName,'Pose blank open');
 assert(await animateLid(false));setViewMode('simulation');setViewMode('components');await delay(20);
 assert.equal(state.lidOpen,false);assert.equal(viewer.animationName,'Pose blank closed');
 const opening=animateLid(true);setViewMode('simulation');setViewMode('components');assert(await opening);assert.equal(viewer.animationName,'Pose blank open');
 const closing=animateLid(false);setViewMode('simulation');setViewMode('components');assert(await closing);assert.equal(state.lidOpen,false);assert.equal(viewer.animationName,'Pose blank closed');
 assert(played.includes('Lid open blank')&&played.includes('Lid close blank'));
 setViewMode('simulation');await delay(220);const filling=selectSpecimen({type:'standard',ppm:0});setViewMode('components');assert(await filling);assert.equal(viewer.animationName,'Pose blank open');
 setViewMode('simulation');await delay(220);assert(await scan());assert.equal(state.lidOpen,false);assert.equal(viewer.animationName,'Pose sample closed');
 for(const ppm of [5,10,15,25]) { assert(await selectSpecimen({type:'standard',ppm}));assert(await scan()); }
 assert(await selectSpecimen({type:'sample'}));assert(await scan());
 assert.equal(state.standards.size,5);assert(state.sampleResult.estimatedPpm>11 && state.sampleResult.estimatedPpm<14);
 assert.equal(state.history.length,6);assert.equal(JSON.parse(storage.get('uvvis-lab-history-v1')).length,6);
 assert.equal(elements['standard-table-body'].children.length,5);
 console.log('PASS: lid/mode synchronization, in-screen controls, five standards, Vitamin B1 estimate, stored history and calibration table');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
