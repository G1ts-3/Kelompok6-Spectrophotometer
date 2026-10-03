(() => {
  'use strict';
  const core = window.UVVisCore;
  const $ = id => document.getElementById(id);
  const viewer = $('instrument');
  const ranges = {uv:[200,400],vis:[400,800],all:[200,800]};
  const parts = [
    ['Sumber cahaya','Lampu deuterium dan wolfram menyediakan cahaya UV dan tampak.','150deg 53deg .80m','.29m .38m .15m'],
    ['Monokromator','Memilih satu panjang gelombang, lalu cahaya dibagi menjadi dua berkas sejajar yang melintas dari sisi kiri ke sisi kanan ruang sampel.','220deg 45deg .52m','-.012m .25m -.027m'],
    ['Kuvet blanko','Posisi merah di barisan belakang selalu berisi blanko atau standar sebagai pembanding, baik saat Zero maupun saat scan.','195deg 40deg .5m','-.166m .255m .053m'],
    ['Kuvet sampel','Posisi abu di barisan depan menampung larutan yang dipilih dari baki.','195deg 40deg .45m','-.166m .255m -.107m'],
    ['Detektor','Mengukur cahaya yang lolos dari kuvet belakang dan depan untuk menghitung absorbansi.','145deg 45deg .5m','-.316m .25m -.027m'],
    ['Ruang sampel','Tutup gelap melindungi kedua kuvet dari cahaya luar selama pembacaan.','180deg 42deg .74m','-.166m .27m -.027m'],
    ['Tombol daya','Sakelar instrumen berada di sisi kiri depan. Komputer memiliki daya terpisah.','186deg 77deg .66m','.45m .07m -.40m'],
  ];
  const state = {
    instrumentOn:false, monitorOn:false, softwareOpen:false, lidOpen:false, lidProgress:0,
    modelReady:false, measuring:false, blanked:false, selected:'aquades',
    range:'uv', wavelength:246, mode:'abs', tab:'scan', currentScan:null,
    zeroGroup:null, queueId:'std-0', filling:false, level:1, lastResult:null,
    history:loadHistory(), part:-1,
  };
  let lidFrame=0, lidResolve=null, beamTimer=0;
  const busy = () => state.measuring || state.filling;
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Klip LidMotion berdurasi 1 detik dan diputar dengan LoopRepeat. Jika currentTime tepat sama
  // dengan durasi, three.js membungkusnya ke 0 sehingga tutup kembali tertutup. Karena itu posisi
  // 'terbuka penuh' dipetakan sedikit di bawah durasi klip (selisih 0,1% tidak terlihat).
  function applyLidPose(progress) {
    if (!state.modelReady) return;
    const p=Math.max(0,Math.min(1,progress));
    const time=p*(viewer.duration||1)*0.999;
    const set=()=>{ viewer.pause(); viewer.currentTime=time; };
    viewer.animationName='LidMotion'; set(); requestAnimationFrame(set);
  }
  const getSolution = id => core.solutions.find(s => s.id===id) || core.solutions[0];
  // Urutan kerja: standar 0-25 ppm dan Presisi 1-5 + Akurasi berjalan berurutan.
  const sequences = {standar:core.standards.map(s=>s.id), sampel:core.samples.map(s=>s.id)};
  const groupLabels = {standar:'standar', sampel:'larutan sampel', lainnya:'larutan ini'};
  const groupOf = id => getSolution(id).family;
  function nextInSequence(id) {
    const list=sequences[groupOf(id)], i=list?list.indexOf(id):-1;
    return i>=0 && i<list.length-1 ? list[i+1] : null;
  }

  function loadHistory() {
    try {
      const saved=JSON.parse(localStorage.getItem('uvvis-history-v3')||'[]');
      return Array.isArray(saved) ? saved.filter(r=>r && core.solutions.some(s=>s.id===r.solutionId) && Array.isArray(r.points)).slice(0,60) : [];
    } catch { return []; }
  }
  function saveHistory() {
    try { localStorage.setItem('uvvis-history-v3',JSON.stringify(state.history)); } catch { /* Private storage may be unavailable. */ }
  }
  function status(message) { $('screen-status').textContent=message; }
  function setTab(name) {
    state.tab=name;
    for (const tab of ['scan','cal','history']) {
      $(`tab-${tab}`).setAttribute('aria-selected',String(name===tab));
      $(`panel-${tab}`).hidden=tab!==name;
    }
  }
  function updateControls() {
    $('connection').classList.toggle('online',state.instrumentOn);
    $('connection').lastChild.textContent=state.instrumentOn?'Alat tersambung':'Alat mati';
    $('instrument-power').setAttribute('aria-pressed',String(state.instrumentOn));
    $('instrument-power').lastChild.textContent=state.instrumentOn?' Matikan alat':' Nyalakan alat';
    $('lid-button').setAttribute('aria-pressed',String(state.lidOpen));
    $('lid-button').lastChild.textContent=state.lidOpen?' Tutup tutup':' Buka tutup';
    $('lid-button').disabled=busy();
    $('parts-toggle').disabled=busy();
    document.querySelectorAll('.hotspot').forEach(b=>b.disabled=busy());
    $('zero-button').disabled=!state.instrumentOn || busy();
    $('scan-button').disabled=!state.instrumentOn || !state.blanked || busy();
    $('scan-button').firstChild.textContent=state.measuring?'Memindai… ':'Mulai scan ';
    $('software').hidden=!state.monitorOn || !state.softwareOpen; $('software-launch').hidden=!state.monitorOn || state.softwareOpen;
    $('monitor-off').hidden=state.monitorOn;
    $('monitor-led').classList.toggle('off',!state.monitorOn);
    $('monitor-power').setAttribute('aria-pressed',String(state.monitorOn));
    $('monitor-power').setAttribute('aria-label',state.monitorOn?'Matikan monitor':'Nyalakan monitor');
    $('range-select').value=state.range;
    $('mode-abs').classList.toggle('active',state.mode==='abs');
    $('mode-t').classList.toggle('active',state.mode==='t');
    $('mode-abs').setAttribute('aria-pressed',String(state.mode==='abs'));
    $('mode-t').setAttribute('aria-pressed',String(state.mode==='t'));
    $('active-solution').textContent=getSolution(state.selected).name;
    $('readout-nm').textContent=String(state.wavelength);
    $('readout-unit').textContent=state.mode==='abs'?'Abs':'%T';
    let value='—';
    if (state.currentScan) {
      const abs=interpolatedValue(state.currentScan.points,state.wavelength);
      value=state.mode==='abs'?abs.toFixed(3):`${core.transmittance(abs).toFixed(1)}%`;
    }
    $('readout-value').textContent=value;
    document.querySelectorAll('.solution').forEach(b => {b.setAttribute('aria-pressed',String(b.dataset.solution===state.selected));b.disabled=busy();});
    $('history-count').textContent=String(state.history.length);
  }
  function rgb(hex) { return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255); }
  function setMaterial(name,color) {
    try {
      const mat=viewer.model?.materials.find(m=>m.name===name);
      if (mat) mat.pbrMetallicRoughness.setBaseColorFactor(color);
    } catch { /* Renderer can be reinitialising during a context change. */ }
  }
  function setEmissive(name,color) {
    try {
      const mat=viewer.model?.materials.find(m=>m.name===name);
      if (mat && typeof mat.setEmissiveFactor==='function') mat.setEmissiveFactor(color);
    } catch { /* Material not loaded yet. */ }
  }
  function updateModelMaterials() {
    if (!state.modelReady) return;
    const sol=getSolution(state.selected);
    setMaterial('SampleLiquid',[...rgb(sol.color),(sol.alpha ?? .72)*(findLiquid()?1:Math.max(0,state.level))]);
    setMaterial('PowerLED',state.instrumentOn?[.29,.96,.57,1]:[.22,.35,.33,1]);
    setEmissive('PowerLED',state.instrumentOn?[.14,.78,.38]:[0,0,0]);
  }
  // ---- Tinggi cairan di kuvet depan: skala sumbu-Y node 'SampleLiquid' (alas tetap), cadangan: transparansi.
  let liq;
  function findLiquid() {
    if (liq!==undefined) return liq;
    liq=null;
    try {
      const sym=Object.getOwnPropertySymbols(viewer).find(x=>x.description==='scene');
      const scene=sym && viewer[sym];
      scene?.traverse(o=>{
        if (!liq && o.isMesh && o.material?.name==='SampleLiquid') {
          o.geometry.computeBoundingBox();
          liq={o,minY:o.geometry.boundingBox.min.y,p0:o.position.y,s0:o.scale.y};
        }
      });
    } catch { liq=null; }
    return liq;
  }
  function setLevel(l) {
    state.level=l;
    const n=findLiquid();
    if (n) {
      const k=Math.max(.001,l), bottom=n.p0+n.minY*n.s0;
      n.o.visible=l>.01; n.o.scale.y=n.s0*k; n.o.position.y=bottom-n.minY*n.s0*k;
    }
    updateModelMaterials();
  }
  function animateLevel(to,ms) {
    const from=state.level;
    if (reduced() || Math.abs(to-from)<.001) { setLevel(to); return Promise.resolve(); }
    const t0=performance.now();
    return new Promise(resolve=>{
      const tick=now=>{
        const p=Math.min(1,(now-t0)/ms), e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
        setLevel(from+(to-from)*e);
        p<1?requestAnimationFrame(tick):resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  // ---- Animasi scanning: kamera zoom ke ruang kuvet, tutup menjadi tembus pandang, berkas cahaya menyapu panjang gelombang.
  const lidMats=['GraphiteCover','CoverInset'], lidBase={};
  const scanCamera={orbit:'184deg 50deg .55m',target:'-.166m .262m -.027m'};
  function setLidGhost(g) {            // 0 = tutup gelap utuh, 1 = kaca asap tembus pandang
    for (const n of lidMats) {
      try {
        const mat=viewer.model?.materials.find(m=>m.name===n); if(!mat) continue;
        lidBase[n]=lidBase[n]||[...mat.pbrMetallicRoughness.baseColorFactor];
        const b=lidBase[n], tint=[.5,.62,.68];
        if (typeof mat.setAlphaMode==='function') mat.setAlphaMode(g>.001?'BLEND':'OPAQUE');
        mat.pbrMetallicRoughness.setBaseColorFactor([0,1,2].map(i=>b[i]+(tint[i]-b[i])*g).concat(1-.84*g));
      } catch { /* material belum siap */ }
    }
  }
  function tween(ms,fn) {
    return new Promise(resolve=>{
      if (reduced()) { fn(1); resolve(); return; }
      const t0=performance.now();
      const tick=now=>{ const p=Math.min(1,(now-t0)/ms); fn(p); p<1?requestAnimationFrame(tick):resolve(); };
      requestAnimationFrame(tick);
    });
  }
  function saveCamera() {
    try { const o=viewer.getCameraOrbit(), t=viewer.getCameraTarget(); return {orbit:`${o.theta}rad ${o.phi}rad ${o.radius}m`,target:`${t.x}m ${t.y}m ${t.z}m`}; }
    catch { return null; }
  }
  async function opticalSweep(solution,ms,title,onProgress) {
    const [start,end]=ranges[state.range], cam=saveCamera();
    viewer.cameraOrbit=scanCamera.orbit; viewer.cameraTarget=scanCamera.target;   // zoom ke kuvet
    await setLid(false);
    await tween(600,p=>setLidGhost(p));                                           // tutup jadi tembus pandang
    showBeam(true);
    $('hud-title').textContent=title; $('scan-hud').hidden=false;
    await tween(ms,p=>{
      const nm=start+(end-start)*p;
      $('hud-nm').textContent=`${Math.round(nm)} nm`; $('hud-bar').style.width=`${(p*100).toFixed(1)}%`;
      setMaterial('SampleBeam',[1,.68,.29,.12+.62*Math.pow(10,-core.absorbance(solution,nm))]);   // berkas sampel meredup bila diserap
      if (onProgress) onProgress(p,nm);
    });
    $('scan-hud').hidden=true; showBeam(false);
    await tween(500,p=>setLidGhost(1-p));
    if (cam) { viewer.cameraOrbit=cam.orbit; viewer.cameraTarget=cam.target; }     // kembali ke sudut semula
    await wait(reduced()?0:700);
  }
  function showBeam(active) {
    const on=active && state.instrumentOn;
    setMaterial('ReferenceBeam',[.39,.83,.98,on?.55:0]);
    setMaterial('SampleBeam',[1,.68,.29,on?.7:0]);
    $('stage').classList.toggle('scanning',on);
    document.querySelector('.flow-strip').classList.toggle('active',on);
  }
  function animateLid(target) {
    if (lidFrame) cancelAnimationFrame(lidFrame);
    if (lidResolve) lidResolve();
    const from=state.lidProgress, to=target?1:0;
    state.lidOpen=target;
    if (!state.modelReady || Math.abs(to-from)<.001) {
      state.lidProgress=to;
      applyLidPose(to);
      return Promise.resolve();
    }
    const duration=Math.max(160,750*Math.abs(to-from));
    const start=performance.now();
    return new Promise(resolve=>{
      lidResolve=resolve;
      const tick=now=>{
        const p=Math.min(1,(now-start)/duration);
        const eased=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
        state.lidProgress=from+(to-from)*eased;
        applyLidPose(state.lidProgress);
        if (p<1) lidFrame=requestAnimationFrame(tick);
        else { lidFrame=0;lidResolve=null;state.lidProgress=to;resolve(); }
      };
      lidFrame=requestAnimationFrame(tick);
    });
  }
  function setLid(open) {
    state.lidOpen=open;
    updateControls();
    return animateLid(open);
  }
  function resetView() {
    state.part=-1;$('part-card').hidden=true;
    document.querySelectorAll('.hotspot').forEach(b=>b.classList.remove('active'));
    const stage=$('stage');
    const distance=Math.max(1.7,1.25/(2*Math.tan(Math.PI/12)*(stage.clientWidth/stage.clientHeight)));
    viewer.cameraOrbit=`180deg 65deg ${distance.toFixed(2)}m`;
    viewer.cameraTarget='0m 0.17m 0m';
    viewer.fieldOfView='30deg';
  }
  function positionPartCard() {
    if (state.part<0) return;
    const button=document.querySelector(`.hotspot[data-part="${state.part}"]`);
    const rect=button.getBoundingClientRect(), stage=$('stage').getBoundingClientRect();
    if (!rect.width) return;
    const card=$('part-card'), width=card.offsetWidth||255, height=card.offsetHeight||120;
    let x=rect.left-stage.left+rect.width+13;
    if (x+width>stage.width-12) x=rect.left-stage.left-width-13;
    card.style.left=`${Math.max(12,Math.min(stage.width-width-12,x))}px`;
    card.style.top=`${Math.max(54,Math.min(stage.height-height-88,rect.top-stage.top-height/2))}px`;
  }
  function focusPart(index) {
    state.part=index;
    document.querySelectorAll('.hotspot').forEach(b=>b.classList.toggle('active',Number(b.dataset.part)===index));
    $('part-number').textContent=`${String(index+1).padStart(2,'0')} / 07`;
    $('part-title').textContent=parts[index][0];$('part-copy').textContent=parts[index][1];
    $('part-card').hidden=false;
    if ([1,2,3,4].includes(index)) setLid(true);
    viewer.cameraOrbit=parts[index][2];viewer.cameraTarget=parts[index][3];viewer.fieldOfView='30deg';
    requestAnimationFrame(positionPartCard);
  }
  function updateWeightPanel(solution) {
    const panel=$('weight-panel'), input=$('sample-weight'), select=$('weight-select'), manualWrap=$('manual-weight-wrap'), info=$('weight-info');
    if (!panel || !solution) return;
    const isSample=['presisi-1','presisi-2','presisi-3','presisi-4','presisi-5','akurasi'].includes(solution.id);
    panel.hidden=!isSample;
    if(isSample){
      const applyWeight=()=>{
        const val=select.value==='manual'?Number(input.value):Number(select.value);
        solution.weight=Number.isFinite(val)?val:0;
        info.textContent=`Bobot ${solution.name}: ${solution.weight.toFixed(4)} gram`;
      };
      select.value=['0.010','0.050','0.100'].includes(String(solution.weight))?String(solution.weight):'manual';
      input.value=(solution.weight ?? 0.010).toFixed(4);
      manualWrap.hidden=select.value!=='manual';
      info.textContent=`${solution.name} menggunakan bobot preparasi sampel.`;
      select.onchange=()=>{manualWrap.hidden=select.value!=='manual';applyWeight();};
      input.onchange=applyWeight;
    }
  }
  // Isi kuvet depan (sampel). Kuvet belakang selalu aquades (blanko).
  function putInFront(id) {
    state.selected=id;
    updateWeightPanel(getSolution(id));
    updateModelMaterials();updateControls();
  }
  // Kuvet depan dikosongkan, lalu diisi larutan baru. withVial: botol dari rak terbang ke kuvet dan menuang.
  async function fillFront(id,withVial) {
    if (state.level>.01) await animateLevel(0,450);
    putInFront(id);
    if (withVial && !reduced()) await pourFromVial(id); else await animateLevel(1,1000);
  }
  async function pourFromVial(id) {
    const btn=document.querySelector(`.solution[data-solution="${id}"]`), src=btn?.querySelector('.vial');
    if (!src) return animateLevel(1,1200);
    const sol=getSolution(id), sr=src.getBoundingClientRect(), stg=$('stage').getBoundingClientRect();
    const ar=document.querySelector('.fill-anchor').getBoundingClientRect();
    const ok=ar.width>0 && ar.left>stg.left && ar.left<stg.right && ar.top>stg.top && ar.top<stg.bottom;
    const tx=ok?ar.left:stg.left+stg.width/2, ty=ok?ar.top:stg.top+stg.height*.4;
    const fly=src.cloneNode(true);
    fly.classList.add('fly-vial');
    fly.style.cssText+=`left:${sr.left}px;top:${sr.top}px;width:${sr.width}px;height:${sr.height}px;--fluid:${sol.color}`;
    document.body.append(fly);
    btn.classList.add('lifted');
    const ox=sr.left+sr.width/2, oy=sr.top+sr.height*.12, dx=tx-ox, dy=ty-34-oy, S=1.9;
    const go=(frames,ms)=>fly.animate(frames,{duration:ms,easing:'ease-in-out',fill:'forwards'}).finished;
    await go([{transform:'none'},{transform:'translateY(-26px) scale(1.5)',offset:.2},{transform:`translate(${dx}px,${dy-44}px) scale(${S})`,offset:.7},{transform:`translate(${dx}px,${dy}px) scale(${S}) rotate(-105deg)`}],1250);
    const stream=document.createElement('div');
    stream.className='pour-stream';stream.style.cssText+=`left:${tx-1}px;top:${ty-30}px;--fluid:${sol.color}`;
    document.body.append(stream);
    stream.animate([{height:'0px',opacity:1},{height:'66px',opacity:1}],{duration:280,fill:'forwards'});
    await wait(260);
    await animateLevel(1,1400);
    await stream.animate([{opacity:1},{opacity:0}],{duration:220,fill:'forwards'}).finished;
    stream.remove();
    await go([{transform:`translate(${dx}px,${dy}px) scale(${S}) rotate(-105deg)`},{transform:`translate(${dx}px,${dy-44}px) scale(${S})`,offset:.35},{transform:'none'}],1000);
    fly.remove();btn.classList.remove('lifted');
  }
  function frontMessage(solution) {
    const head=`${solution.name} ada di kuvet depan, kuvet belakang berisi aquades.`;
    if (!state.instrumentOn) return `${head} Nyalakan alat, lalu tekan Zero (blanko–blanko).`;
    if (!state.blanked) return `${head} Tekan Zero (blanko–blanko) dulu, karena kelompok larutan berubah.`;
    return `${head} Tekan Mulai scan.`;
  }
  async function chooseSolution(id) {
    if (busy()) return;
    const solution=getSolution(id);
    state.currentScan=null;
    if (solution.family!=='blanko') {
      state.queueId=id;
      // Ganti kelompok (standar, presisi, dst.) harus Zero blanko–blanko lagi.
      if (state.zeroGroup!==solution.family) { state.blanked=false; state.zeroGroup=null; }
    }
    state.filling=true;updateControls();
    status(`Mengambil ${solution.name} dari rak…`);
    await setLid(true);
    await fillFront(id,true);
    drawSpectrum();
    state.filling=false;updateControls();
    status(frontMessage(solution));
  }
  function makeSolutions() {
    const containers={blanko:$('blank-solutions'),standar:$('standard-solutions'),sampel:$('sample-solutions'),lainnya:$('other-solutions')};
    for (const s of core.solutions) {
      const button=document.createElement('button');button.type='button';button.className='solution';button.dataset.solution=s.id;
      button.setAttribute('aria-pressed','false');button.title=`Masukkan ${s.name} ke kuvet abu`;
      const vial=document.createElement('span');vial.className='vial';vial.style.setProperty('--fluid',s.color);vial.setAttribute('aria-hidden','true');
      button.append(vial,document.createTextNode(s.name));button.addEventListener('click',()=>chooseSolution(s.id));
      containers[s.family].append(button);
    }
    $('other-count').textContent=`(${core.solutions.filter(s=>s.family==='lainnya').length})`;
  }
  function interpolatedValue(points,nm) {
    if (!points?.length) return 0;
    if (nm<=points[0].nm) return points[0].abs;
    if (nm>=points.at(-1).nm) return points.at(-1).abs;
    let low=0,high=points.length-1;
    while (high-low>1) { const mid=(low+high)>>1;if(points[mid].nm<=nm)low=mid;else high=mid; }
    const a=points[low],b=points[high];return a.abs+(b.abs-a.abs)*(nm-a.nm)/(b.nm-a.nm);
  }
  function svgPath(points,start,end,yMax) {
    return points.map((p,i)=>`${i?'L':'M'}${(38+(p.nm-start)*370/(end-start)).toFixed(2)},${(176-p.abs*158/yMax).toFixed(2)}`).join(' ');
  }
  function drawSpectrum() {
    const [start,end]=ranges[state.range], points=state.currentScan?.points || [];
    const max=Math.max(.7,...points.map(p=>p.abs))*1.12;
    let grid='';for(let i=0;i<4;i++) {const y=18+i*158/3;grid+=`<line x1="38" y1="${y}" x2="408" y2="${y}" stroke="#e6eef1"/><text x="2" y="${y+3}" fill="#a0b3bd" font-size="10">${(max*(1-i/3)).toFixed(1)}</text>`;}
    $('chart-grid').innerHTML=grid;
    $('chart-line').setAttribute('d',points.length?svgPath(points,start,end,max):'');
    $('chart-area').setAttribute('d',points.length?`${svgPath(points,start,end,max)} L408,176 L38,176 Z`:'');
    $('chart-labels').innerHTML=points.length?'':'<text x="223" y="103" text-anchor="middle" fill="#aec1ca" font-size="12">Belum ada pemindaian</text>';
    if (points.length) {
      const nm=Math.max(start,Math.min(end,state.wavelength)), x=38+(nm-start)*370/(end-start), y=176-interpolatedValue(points,nm)*158/max;
      $('chart-cursor').innerHTML=`<line x1="${x}" y1="16" x2="${x}" y2="176"/><circle cx="${x}" cy="${y}" r="5"/>`;
    } else $('chart-cursor').innerHTML='';
    $('range-start').textContent=`${start} nm`;$('range-end').textContent=`${end} nm`;
    $('chart-title').textContent=state.currentScan?(state.currentScan.baseline?'Baseline · blanko–blanko':`Spektrum · ${state.currentScan.name||getSolution(state.currentScan.solutionId).name}`):'Spektrum serapan';
    updateControls();
  }
  function calibrationPoints() {
    return core.standards.flatMap(s=>{
      const record=state.history.find(r=>r.solutionId===s.id && r.start<=246 && r.end>=246);
      return record?[{ppm:s.ppm,abs:record.abs246}]:[];
    });
  }
  function drawCalibration() {
    const measured=calibrationPoints(),fit=core.regression(measured);
    const x=ppm=>46+ppm/25*356, y=abs=>162-abs/.65*140, mono='font-family="IBM Plex Mono, monospace"';
    let svg='<rect x="0" y="0" width="420" height="200" fill="white"/>';
    for(const level of [0,.2,.4,.6]) svg+=`<line x1="46" y1="${y(level)}" x2="404" y2="${y(level)}" stroke="#e7eff2"/><text x="40" y="${y(level)+3}" text-anchor="end" font-size="9" fill="#9cb1ba">${level.toFixed(1)}</text>`;
    svg+='<line x1="46" y1="162" x2="404" y2="162" stroke="#adc8d3"/>';
    for(const ppm of [0,5,10,15,20,25]) svg+=`<text x="${x(ppm)}" y="177" text-anchor="middle" font-size="9" fill="#91aab5">${ppm}</text>`;
    svg+='<text x="225" y="194" text-anchor="middle" font-size="10" fill="#6f8b99">Konsentrasi tiamin (ppm)</text><text transform="translate(11 92) rotate(-90)" text-anchor="middle" font-size="10" fill="#6f8b99">Absorbansi (A)</text>';
    if(fit) svg+=`<path d="M${x(0)},${y(fit.intercept)} L${x(25)},${y(fit.intercept+25*fit.slope)}" stroke="#62a9c1" stroke-width="2.5" fill="none"/>`;
    for(const p of measured) svg+=`<circle cx="${x(p.ppm)}" cy="${y(p.abs)}" r="5" fill="#247d99" stroke="white" stroke-width="2"/>`;
    if(fit && measured.length) {
      // Persamaan regresi ditempel pada salah satu titik (15 ppm, atau titik terakhir bila belum ada).
      const pt=measured.find(p=>p.ppm===15)||measured[measured.length-1], px=x(pt.ppm), py=y(pt.abs), bw=132, bh=38;
      const bx=Math.max(50,Math.min(px-bw-14,414-bw)), by=Math.max(6,py-bh-26);
      svg+=`<line x1="${bx+bw}" y1="${by+bh}" x2="${px}" y2="${py}" stroke="#1f8a8a" stroke-dasharray="3 3"/>`+
        `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="7" fill="#fff" stroke="#1f8a8a"/>`+
        `<text x="${bx+8}" y="${by+16}" ${mono} font-size="10.5" font-weight="600" fill="#17394a">y = ${fit.slope.toFixed(4)}x + ${fit.intercept.toFixed(4)}</text>`+
        `<text x="${bx+8}" y="${by+30}" ${mono} font-size="10" fill="#4a6b7b">R² = ${fit.r2.toFixed(4)}</text>`;
    }
    $('calibration-chart').innerHTML=svg;
    $('cal-points').replaceChildren();
    for(const s of core.standards){const el=document.createElement('span');el.className='cal-point'+(measured.some(p=>p.ppm===s.ppm)?' done':'');el.textContent=`${s.ppm} ppm ${measured.some(p=>p.ppm===s.ppm)?'✓':'·'}`;$('cal-points').append(el);}
    let message='Butuh sedikitnya dua standar untuk membuat garis kalibrasi.';
    if(fit) {
      message=`A = ${fit.slope.toFixed(4)} × C + ${fit.intercept.toFixed(4)} · R² ${fit.r2.toFixed(4)}`;
      const smp=state.history.find(r=>getSolution(r.solutionId).family==='sampel' && r.abs246!=null);
      if(smp) message+=` · ${smp.name} ≈ ${Math.max(0,(smp.abs246-fit.intercept)/fit.slope).toFixed(2)} ppm`;
    }
    $('cal-result').textContent=message;
  }
  // Rumus perhitungan di bagian bawah monitor, muncul setelah scan.
  function updateFormula(rec) {
    const bar=$('formula-bar');
    if(!rec || rec.baseline) { bar.hidden=true; return; }
    const A=rec.readAbs, T=Math.pow(10,-A), fit=core.regression(calibrationPoints()), sol=getSolution(rec.solutionId), f=(v,d)=>v.toFixed(d);
    let t=`<span class="fm-h">RUMUS · ${rec.name} pada ${rec.readNm} nm</span>`+
      `A = −log T = <b>${f(A,3)}</b><br>T = 10<sup>−A</sup> = 10<sup>−${f(A,3)}</sup> = ${f(T,3)}<br>%T = T × 100 = <b>${f(T*100,1)} %</b><br>Lambert–Beer: A = ε · b · C`;
    if(fit) {
      t+=`<br>Regresi: A = ${f(fit.slope,4)}·C + ${f(fit.intercept,4)} (R² = ${f(fit.r2,4)})`;
      if(sol.family==='sampel' && rec.abs246!=null) t+=`<br><span class="fm-r">C = (A − ${f(fit.intercept,4)}) / ${f(fit.slope,4)} = ${f(Math.max(0,(rec.abs246-fit.intercept)/fit.slope),2)} ppm</span>`;
    } else if(sol.family==='standar') t+='<br>Regresi muncul setelah minimal 2 standar di-scan.';
    bar.innerHTML=t; bar.hidden=false;
  }
  function drawHistory() {
    const list=$('history-list');list.replaceChildren();
    if(!state.history.length){const empty=document.createElement('div');empty.className='empty-history';empty.textContent='Hasil scan akan muncul di sini.';list.append(empty);return;}
    for(const item of state.history) {
      const row=document.createElement('button');row.type='button';row.className='history-item';row.title='Lihat lagi kurva ini';
      const left=document.createElement('div'), name=document.createElement('strong'),info=document.createElement('small'),value=document.createElement('span');
      name.textContent=item.name;info.textContent=`${new Date(item.ts).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ${item.start}–${item.end} nm`;
      value.textContent=`${Number(item.readAbs ?? item.abs246).toFixed(3)} Abs`;left.append(name,info);row.append(left,value);
      row.addEventListener('click',()=>{state.range=Object.keys(ranges).find(k=>ranges[k][0]===item.start&&ranges[k][1]===item.end)||'uv';state.wavelength=Math.max(item.start,Math.min(item.end,246));state.currentScan=item;state.lastResult=item;updateFormula(item);drawSpectrum();setTab('scan');status('Hasil dari riwayat sedang ditampilkan.');});
      list.append(row);
    }
  }
  function powerInstrument() {
    if(busy())return;
    state.instrumentOn=!state.instrumentOn;state.blanked=false;state.zeroGroup=null;state.currentScan=null;
    clearTimeout(beamTimer);showBeam(false);updateModelMaterials();drawSpectrum();
    status(state.instrumentOn?'Alat tersambung. Tekan Zero untuk baseline blanko–blanko (aquades di kuvet belakang dan depan).':'Alat mati. Hasil sebelumnya ada di Riwayat.');
  }
  async function zero() {
    if(!state.instrumentOn||state.measuring)return;
    const target=state.queueId;           // larutan yang akan masuk kuvet depan setelah Zero
    state.measuring=true;state.currentScan=null;
    await setLid(true);
    if (state.selected!=='aquades' || state.level<.99) await fillFront('aquades',false);
    drawSpectrum();
    status('Zero: aquades di kuvet belakang dan kuvet depan (blanko lawan blanko)…');
    const [start,end]=ranges[state.range], base=core.spectrum(core.solutions[0],start,end,4);
    let drawn=0;
    await opticalSweep(core.solutions[0],2600,'Zero · blanko–blanko',(p,nm)=>{
      const now=performance.now(); if(now-drawn<90 && p<1) return; drawn=now;
      state.currentScan={solutionId:'aquades',name:'Aquades',baseline:true,start,end,points:base.filter(q=>q.nm<=nm)}; drawSpectrum();
    });
    state.currentScan={solutionId:'aquades',name:'Aquades',baseline:true,start,end,points:core.spectrum(core.solutions[0],start,end,4)};
    state.blanked=true;state.zeroGroup=groupOf(target);
    drawSpectrum();
    // Baseline selesai: tutup dibuka, kuvet depan diisi larutan berikutnya, kuvet belakang tetap blanko.
    await setLid(true);
    await fillFront(target,false);
    state.measuring=false;drawSpectrum();
    status(`Baseline siap. Kuvet belakang aquades, kuvet depan ${getSolution(target).name}. Tekan Mulai scan.`);
  }
  async function scan() {
    if(!state.instrumentOn||!state.blanked||state.measuring)return;
    state.measuring=true;updateControls();status('Cahaya melewati monokromator, kuvet, dan detektor…');
    const solution=getSolution(state.selected),[start,end]=ranges[state.range];
    const noise=(Math.random()-.5)*.002;
    const points=core.spectrum(solution,start,end,4).map(p=>({nm:p.nm,abs:Math.max(0,p.abs+noise)}));
    let drawn=0;
    await opticalSweep(solution,3800,`Scanning ${solution.name}`,(p,nm)=>{
      const now=performance.now(); if(now-drawn<90 && p<1) return; drawn=now;
      state.currentScan={solutionId:solution.id,name:solution.name,start,end,points:points.filter(q=>q.nm<=nm)}; drawSpectrum();
    });
    const readNm=start<=246&&end>=246?246:Math.round((start+end)/2);
    const record={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,ts:Date.now(),solutionId:solution.id,name:solution.name,start,end,points,
      readNm,readAbs:interpolatedValue(points,readNm),abs246:start<=246&&end>=246?interpolatedValue(points,246):null};
    state.history.unshift(record);state.history=state.history.slice(0,60);saveHistory();
    state.currentScan=record;state.lastResult=record;updateFormula(record);
    if(state.wavelength<start||state.wavelength>end)state.wavelength=start;
    const nextId=nextInSequence(solution.id);
    if(!nextId) state.measuring=false;
    drawSpectrum();drawCalibration();drawHistory();
    if(nextId) {
      // Otomatis lanjut ke larutan berikutnya: tutup dibuka, kuvet depan diganti, tanpa loncat urutan.
      const list=sequences[solution.family], next=getSolution(nextId);
      status(`${solution.name} selesai. Menyiapkan ${next.name} di kuvet depan…`);
      await setLid(true);
      state.queueId=nextId;await fillFront(nextId,true);
      state.measuring=false;updateControls();
      status(`${solution.name} selesai. ${next.name} sudah di kuvet depan (${list.indexOf(nextId)+1} dari ${list.length}), kuvet belakang tetap aquades. Tekan Mulai scan. Rumus ada di bagian bawah layar.`);
    } else if(sequences[solution.family]) {
      const kurva=solution.family==='standar'?' Lihat Kurva kalibrasi.':'';
      status(`${solution.name} selesai. Semua ${groupLabels[solution.family]} sudah diukur.${kurva} Untuk kelompok lain, pilih larutan di baki lalu Zero lagi. Rumus ada di bagian bawah layar.`);
    } else {
      status(`${solution.name} selesai dipindai. Geser penunjuk pada kurva untuk membaca Abs atau %T. Rumus ada di bagian bawah layar.`);
    }
  }

  $('instrument-power').addEventListener('click',powerInstrument);
  $('monitor-power').addEventListener('click',()=>{state.monitorOn=!state.monitorOn;if(!state.monitorOn){state.softwareOpen=false;}updateControls();});
  $('open-software').addEventListener('click',()=>{state.softwareOpen=true;updateControls();});
  $('lid-button').addEventListener('click',()=>setLid(!state.lidOpen));
  $('reset-view').addEventListener('click',resetView);
  $('zero-button').addEventListener('click',zero);
  $('scan-button').addEventListener('click',scan);
  $('parts-toggle').addEventListener('click',()=>{
    if(busy())return;
    const active=$('stage').classList.toggle('show-parts');
    $('parts-toggle').setAttribute('aria-pressed',String(active));
    if(active)setLid(true);else resetView();
  });
  document.querySelectorAll('.hotspot').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();focusPart(Number(button.dataset.part));
    if(button.dataset.part==='6')powerInstrument();
  }));
  $('close-part').addEventListener('click',resetView);
  viewer.addEventListener('camera-change',positionPartCard);
  window.addEventListener('resize',positionPartCard);
  viewer.addEventListener('load',()=>{
    state.modelReady=true;
    if(viewer.availableAnimations?.includes('LidMotion')) {
      applyLidPose(state.lidProgress);
    }
    liq=undefined;findLiquid();setLevel(state.level);
    showBeam(false);resetView();
  });
  viewer.addEventListener('error',()=>{status('Model belum termuat. Periksa berkas spectrophotometer.glb dan jalankan melalui server lokal.');});
  document.querySelectorAll('.software-tabs button').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  $('range-select').addEventListener('change',event=>{
    state.range=event.target.value;state.wavelength=Math.max(ranges[state.range][0],Math.min(ranges[state.range][1],state.wavelength));
    state.blanked=false;state.zeroGroup=null;state.currentScan=null;drawSpectrum();status('Rentang berubah. Tekan Zero (blanko–blanko) untuk baseline pada rentang ini.');
  });
  $('mode-abs').addEventListener('click',()=>{state.mode='abs';updateControls();});
  $('mode-t').addEventListener('click',()=>{state.mode='t';updateControls();});
  const moveCursor=event=>{
    if(!state.currentScan)return;
    const rect=$('spectrum-chart').getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*420;
    const [start,end]=ranges[state.range];
    state.wavelength=Math.round(start+Math.max(0,Math.min(1,(x-38)/370))*(end-start));
    drawSpectrum();
  };
  $('chart-hit').addEventListener('pointerdown',event=>{event.target.setPointerCapture(event.pointerId);moveCursor(event);});
  $('chart-hit').addEventListener('pointermove',event=>{if(event.buttons)moveCursor(event);});
  $('clear-history').addEventListener('click',()=>{state.history=[];state.currentScan=null;state.lastResult=null;updateFormula(null);saveHistory();drawSpectrum();drawCalibration();drawHistory();});
  makeSolutions();updateControls();drawSpectrum();drawCalibration();drawHistory();
})();
