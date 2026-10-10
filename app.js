(() => {
  'use strict';
  const core = window.UVVisCore;
  const $ = id => document.getElementById(id);
  const viewer = $('instrument');
  const ranges = {uv:[200,400],vis:[400,800],all:[200,800]};
  const massOverrides = loadMassOverrides();
  const absOverrides = loadAbsOverrides();
  const customSamples = loadCustomSamples();
  core.solutions.push(...customSamples);
  const parts = [
    ['Sumber cahaya','Lampu menyediakan cahaya sebelum panjang gelombang dipilih; posisinya di sisi kiri jalur optik.','210deg 53deg .80m','-.008m .25m -.027m'],
    ['Monokromator','Pemisahan spektrum berlangsung di dalam komponen ini. Hanya satu panjang gelombang terpilih yang terbagi ke kedua kuvet, dari kiri ke kanan.','160deg 42deg .55m','-.073m .25m -.027m'],
    ['Kuvet blanko','Posisi merah di barisan belakang berisi aquades sebagai pembanding saat pemindaian.','195deg 40deg .5m','-.166m .255m .053m'],
    ['Kuvet sampel','Posisi abu di barisan depan menampung larutan yang dipilih dari baki.','195deg 40deg .45m','-.166m .255m -.107m'],
    ['Detektor','Di sisi kanan, menerima dua jalur cahaya sesudah melewati kuvet blanko dan sampel.','215deg 45deg .5m','-.320m .25m -.027m'],
    ['Ruang sampel','Tutup gelap melindungi kedua kuvet dari cahaya luar selama pembacaan.','180deg 42deg .74m','-.166m .27m -.027m'],
    ['Tombol daya','Sakelar instrumen berada di sisi kiri depan. Komputer memiliki daya terpisah.','186deg 77deg .66m','.45m .07m -.40m'],
  ];
  const state = {
    upsOn:false, instrumentOn:false, pcuOn:false, softwareOpen:false, lidOpen:false, lidProgress:0,
    modelReady:false, transparent:true, paused:false, sweeping:false, callout:-1, measuring:false, blanked:false, selected:'aquades',
    range:'uv', wavelength:core.peakNm, mode:'abs', tab:'scan', currentScan:null,
    zeroGroup:null, queueId:'std-0', filling:false, blankReady:true, requiresSelection:false, lastResult:null,
    history:loadHistory(), part:-1, workflow:'lambda', zeroed:false, seriesPicked:false,
    confirmedPeaks:{},
  };
  let lidFrame=0, lidResolve=null, beamTimer=0;
  const busy = () => state.measuring || state.filling;
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The 2-second clip holds its final open pose for a full second. Scrub only
  // the first second: even a renderer update at the end cannot wrap to closed.
  function applyLidPose(progress) {
    if (!state.modelReady) return;
    const p=Math.max(0,Math.min(1,progress));
    if (viewer.animationName!=='LidMotion') viewer.animationName='LidMotion';
    viewer.pause();
    viewer.currentTime=p;
  }
  const getSolution = id => core.solutions.find(s => s.id===id) || core.solutions[0];
  const absDigits = (key=core.datasetKey) => key==='jena'?4:3;
  const formatAbs = (value,key=core.datasetKey) => Number(value).toFixed(absDigits(key));
  const recordAbs = record => record?.origin==='manual' && record.manualAbsText ? record.manualAbsText : formatAbs(record.readAbs ?? record.absPeak ?? record.abs246,record.dataset);
  const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatPeak = nm => Number(nm).toFixed(1).replace('.',',');
  const formatWeight = grams => {
    const value=String(Number(grams));
    if(value.includes('e'))return value.replace('.',',');
    const [whole,decimal='']=value.split('.');
    return `${whole},${decimal.padEnd(4,'0')}`;
  };
  // Urutan kerja: standar 0-25 ppm dan Presisi 1-5 + Akurasi berjalan berurutan.
  const sequences = {standar:core.standards.map(s=>s.id), sampel:core.samples.map(s=>s.id)};
  const groupLabels = {standar:'standar', sampel:'larutan sampel'};
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
  function loadMassOverrides() {
    try { const data=JSON.parse(localStorage.getItem('uvvis-mass-v1')||'{}');return data && typeof data==='object' ? data : {}; }
    catch { return {}; }
  }
  function loadAbsOverrides() {
    try { const data=JSON.parse(localStorage.getItem('uvvis-abs-v1')||'{}');return data && typeof data==='object' ? data : {}; }
    catch { return {}; }
  }
  function loadCustomSamples() {
    return []; // fitur "Tambah sampel sendiri" dihapus; sampel lama di browser tidak dimuat lagi
    try {
      const data=JSON.parse(localStorage.getItem('uvvis-custom-samples-v1')||'[]');
      if (!Array.isArray(data)) return [];
      const seen=new Set();
      return data.filter(s=>{
        if (!s || typeof s.id!=='string' || !/^user-\d+-[a-z0-9]{4,10}$/.test(s.id) || seen.has(s.id) || !Object.hasOwn(core.datasets,s.dataset) || typeof s.name!=='string' || !s.name.trim()) return false;
        seen.add(s.id);return true;
      }).slice(0,100).map(s=>({id:s.id,name:s.name.trim().slice(0,40),dataset:s.dataset,archived:!!s.archived,custom:true,family:'sampel',color:'#dcedf4',alpha:.5,peaks:[],weight:0}));
    } catch { return []; }
  }
  function saveCustomSamples() {
    try { localStorage.setItem('uvvis-custom-samples-v1',JSON.stringify(customSamples.map(({id,name,dataset,archived})=>({id,name,dataset,archived})))); } catch { /* Current session remains usable. */ }
  }
  function saveAbsOverrides() {
    try { localStorage.setItem('uvvis-abs-v1',JSON.stringify(absOverrides)); } catch { /* Current session remains usable. */ }
  }
  function applyMassOverrides() {
    const saved=massOverrides[core.datasetKey] || {};
    core.samples.forEach(s=>{if(Number.isFinite(saved[s.id]) && saved[s.id]>0)s.weight=saved[s.id];});
    customSamples.filter(s=>s.dataset===core.datasetKey).forEach(s=>{s.weight=Number.isFinite(saved[s.id]) && saved[s.id]>0?saved[s.id]:0;});
  }
  function saveMassOverrides() {
    try { localStorage.setItem('uvvis-mass-v1',JSON.stringify(massOverrides)); } catch { /* Use current session only. */ }
  }
  function parsePositiveDecimal(value) {
    const raw=String(value).trim().replace(',','.');
    if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw)) return null;
    const number=Number(raw);
    return Number.isFinite(number)&&number>0 ? number : null;
  }
  function parseNonnegativeDecimal(value) {
    const raw=String(value).trim().replace(',','.');
    if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw)) return null;
    const number=Number(raw);
    return Number.isFinite(number)&&number>=0 ? number : null;
  }
  function manualAbsText(solution) {
    if (solution.family!=='sampel') return null;
    const raw=$('manual-abs').value.trim().replace(',','.');
    return raw && parseNonnegativeDecimal(raw)!==null ? raw : null;
  }
  function status(message) { $('screen-status').textContent=message; }
  function setTab(name) {
    state.tab=name;
    for (const tab of ['scan','cal','history']) {
      $(`tab-${tab}`).setAttribute('aria-selected',String(name===tab));
      $(`panel-${tab}`).hidden=tab!==name;
    }
    const bar=$('formula-bar'); bar.hidden = bar.dataset.has!=='1' || name==='history';
  }
  // UPS memasok alat dan PCU; layar mengikuti daya PCU tanpa sakelar monitor terpisah.
  function syncUnit(el,on) {
    if (!el || el.classList.contains('on')===on) return;
    el.classList.toggle('on',on);
    clearTimeout(el._t);
    el.classList.toggle('powering-off',!on);
    if (!on) el._t=setTimeout(()=>el.classList.remove('powering-off'),900);
  }
  function updateControls() {
    syncUnit($('ups-unit'),state.upsOn);
    syncUnit($('pcu-unit'),state.pcuOn);
    document.querySelector('.computer-section').classList.toggle('on',state.pcuOn);
    const online=state.upsOn&&state.instrumentOn&&state.pcuOn;
    $('connection').classList.toggle('online',online);
    $('connection').lastChild.textContent=online?'ONLINE':'Alat mati';
    $('ups-power').disabled=busy() || (state.upsOn && (state.instrumentOn||state.pcuOn));
    $('ups-power').setAttribute('aria-pressed',String(state.upsOn));
    $('ups-power').setAttribute('aria-label',state.upsOn?'Matikan UPS':'Nyalakan UPS');
    $('ups-state').textContent=state.upsOn?'Menyala':'Mati';
    $('instrument-power').setAttribute('aria-pressed',String(state.instrumentOn));
    $('instrument-power').lastChild.textContent=state.instrumentOn?' Matikan alat':' Nyalakan alat';
    $('instrument-power').disabled=busy() || (!state.instrumentOn&&!state.upsOn) || (state.instrumentOn&&state.pcuOn);
    $('pcu-power').disabled=busy() || (!state.pcuOn&&(!state.upsOn||!state.instrumentOn)) || (state.pcuOn&&state.softwareOpen);
    $('pcu-power').setAttribute('aria-pressed',String(state.pcuOn));
    $('pcu-power').setAttribute('aria-label',state.pcuOn?'Shutdown PCU':'Nyalakan PCU');
    $('pcu-state').textContent=state.pcuOn?'Menyala':'Mati';
    $('close-software').disabled=busy();
    $('power-status').textContent=!state.upsOn?'Nyalakan UPS terlebih dahulu.':!state.instrumentOn?'UPS aktif · nyalakan alat.':!state.pcuOn?'Alat aktif · nyalakan PCU.':state.softwareOpen?'Selesai praktik: catat log book, tutup software → PCU → alat → UPS.':'PCU aktif · buka software. Untuk shutdown: PCU → alat → UPS.';
    $('lid-button').setAttribute('aria-pressed',String(state.lidOpen));
    $('lid-button').lastChild.textContent=state.lidOpen?' Tutup tutup':' Buka tutup';
    $('lid-button').disabled=busy();
    $('parts-toggle').disabled=busy();
    $('mode-button').disabled=busy();
    document.querySelectorAll('.hotspot').forEach(b=>b.disabled=busy());
    const finding=state.workflow==='lambda';
    const ready=state.upsOn&&state.instrumentOn&&state.pcuOn&&state.softwareOpen&&state.seriesPicked;
    const applied=Number.isFinite(state.confirmedPeaks[core.datasetKey]);
    $('workflow-lambda').setAttribute('aria-pressed',String(finding));
    $('workflow-concentration').setAttribute('aria-pressed',String(!finding));
    $('workflow-concentration').disabled=busy() || !applied;
    $('workflow-lambda').disabled=busy();
    $('workflow-setup').textContent=finding?
      `Seri ${core.datasetKey==='praktikum'?'1':'2'} dipilih. Scan 200–400 nm; puncak tertinggi kurva menjadi λmaks yang dipakai untuk pengukuran.`:
      `λ ${formatPeak(state.confirmedPeaks[core.datasetKey])} nm · blanko aquades · deret standar 0–25 mg/L · sampel Presisi 1–5 dan Akurasi.`;
    $('lambda-entry').hidden=!finding;
    $('scan-lambda').disabled=!ready || busy();
    $('scan-lambda').firstChild.textContent=state.measuring&&finding?'Memindai… ':'START scan λmaks ';
    $('lambda-hint').textContent=`Seri ${core.datasetKey==='praktikum'?'1':'2'} · sumbu X panjang gelombang (nm), sumbu Y absorbansi. Puncak kurva = λmaks.`;
    $('run-controls').hidden=finding;
    let next;
    if (state.upsOn&&state.instrumentOn&&state.pcuOn&&state.softwareOpen&&!state.seriesPicked) next='Pilih seri 1 atau seri 2 pada layar monitor.';
    else if (!ready) next='Nyalakan UPS → alat → PCU, lalu buka software.';
    else if (busy()) next=state.filling?'Menukar kuvet; tunggu sampai selesai…':'Alat sedang bekerja; tunggu hasilnya…';
    else if (finding) next='Tekan START scan λmaks; puncak kurva akan menentukan λmaks.';
    else if (state.requiresSelection) next='Pilih larutan baru dari baki di kiri.';
    else if (!state.blanked) next='Tekan Zero blanko untuk mulai pengukuran konsentrasi.';
    else if (getSolution(state.selected).family==='sampel' && parsePositiveDecimal($('sample-weight').value)===null) next='Isi bobot sampel positif pada komputer sebelum START ukur.';
    else if (getSolution(state.selected).custom && !manualAbsText(getSolution(state.selected))) next='Isi Abs manual sampel tambahan pada komputer sebelum START ukur.';
    else if (getSolution(state.selected).family==='sampel' && $('manual-abs').value.trim() && !manualAbsText(getSolution(state.selected))) next='Perbaiki angka Abs manual; gunakan angka nonnegatif.';
    else next='Tekan START ukur. Grafik, Abs, dan progres alat akan muncul.';
    $('next-instruction').textContent=next;
    $('zero-button').disabled=!ready || !applied || state.requiresSelection || busy();
    const selected=getSolution(state.selected), sample=selected.family==='sampel';
    const invalidAbs=sample && ((selected.custom && !manualAbsText(selected)) || (!!$('manual-abs').value.trim() && !manualAbsText(selected)));
    $('manual-abs').setAttribute('aria-invalid',String(!!invalidAbs));
    $('scan-button').disabled=!ready || !applied || state.requiresSelection || !state.blanked || busy() || (sample && parsePositiveDecimal($('sample-weight').value)===null) || invalidAbs;
    $('scan-button').firstChild.textContent=state.measuring?'Memindai… ':'02 · START ukur ';
    $('software').hidden=!state.pcuOn || !state.softwareOpen || !state.seriesPicked; $('software-launch').hidden=!state.pcuOn || state.softwareOpen;
    $('series-chooser').hidden=!state.pcuOn || !state.softwareOpen || state.seriesPicked;
    document.querySelectorAll('.series-option').forEach(b=>b.disabled=busy());
    $('chooser-close').disabled=busy();
    $('monitor-off').hidden=state.pcuOn;
    $('monitor-led').classList.toggle('off',!state.pcuOn);
    $('dataset-name').textContent=applied?`${core.datasets[core.datasetKey].label} · λmaks ${formatPeak(state.confirmedPeaks[core.datasetKey])} nm`:`${core.datasets[core.datasetKey].label} · λmaks belum dicari`;
    $('mode-abs').classList.toggle('active',state.mode==='abs');
    $('mode-t').classList.toggle('active',state.mode==='t');
    $('mode-abs').setAttribute('aria-pressed',String(state.mode==='abs'));
    $('mode-t').setAttribute('aria-pressed',String(state.mode==='t'));
    const displayed=state.currentScan ? getSolution(state.currentScan.solutionId) : getSolution(state.selected);
    $('active-solution').textContent=state.currentScan?.name || displayed.name;
    const weight=state.currentScan?.weight ?? displayed.weight;
    const sampleMeta=$('sample-weight-readout');
    sampleMeta.hidden=displayed.family!=='sampel' || !Number.isFinite(weight) || weight<=0;
    if (!sampleMeta.hidden) sampleMeta.textContent=`Bobot ${formatWeight(weight)} g`;
    const origin=$('result-origin');
    origin.hidden=!state.currentScan || !!state.currentScan.baseline;
    if (!origin.hidden) origin.textContent=state.currentScan.origin==='manual'?'Abs input manual · kurva ilustratif':'Abs data praktikum · kurva ilustratif';
    $('readout-caption').textContent=!finding&&state.wavelength===state.confirmedPeaks[core.datasetKey]?'PADA λ TERPASANG':'PADA λ';
    $('readout-nm').textContent=finding&&!state.currentScan?'—':state.wavelength===core.peakNm?formatPeak(state.wavelength):String(state.wavelength).replace('.',',');
    $('readout-unit').textContent=state.mode==='abs'?'Abs':'%T';
    let value='—';
    if (state.currentScan) {
      const abs=interpolatedValue(state.currentScan.points,state.wavelength);
      value=state.mode==='abs'?(state.wavelength===state.currentScan.readNm?recordAbs(state.currentScan):formatAbs(abs,state.currentScan.dataset)):`${core.transmittance(abs).toFixed(1)}%`;
    }
    $('readout-value').textContent=value;
    document.querySelectorAll('.solution').forEach(b => {
      const active=b.dataset.solution==='aquades'?state.blankReady:b.dataset.solution===state.selected && b.dataset.dataset===core.datasetKey;
      b.setAttribute('aria-pressed',String(active));b.disabled=busy() || state.zeroed || !state.modelReady;
    });
    document.querySelectorAll('.series-block').forEach(block=>block.classList.toggle('active',block.dataset.series===core.datasetKey));
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
    setMaterial('SampleLiquid',[...rgb(sol.color),sol.alpha ?? .72]);
    setMaterial('PowerLED',state.instrumentOn?[.29,.96,.57,1]:[.22,.35,.33,1]);
    setEmissive('PowerLED',state.instrumentOn?[.14,.78,.38]:[0,0,0]);
    setMaterial('SourceGlow',state.instrumentOn?[.91,.97,1,1]:[.18,.28,.33,1]);
    setEmissive('SourceGlow',state.instrumentOn?[.65,.76,.88]:[0,0,0]);
  }
  // ---- The scanning cutaway shows a short white segment BEFORE wavelength
  // selection and two rays of ONE selected wavelength across the cells.
  const lidMats=['GraphiteCover','CoverInset'], lidBase={};
  // About 58 cm of vertical framing leaves the well, both cells and some chassis
  // visible on desktop; the aspect term protects the same composition on mobile.
  function scanView() {
    const st=$('stage'), aspect=st.clientWidth/Math.max(1,st.clientHeight), t=2*Math.tan(Math.PI/12);   // FOV vertikal 30°
    if(state.transparent) {            // mode transparan: kamera lebih jauh agar seluruh alat dan isinya terlihat
      const dw=Math.max(1.3,1.1/(t*aspect));
      return {orbit:`180deg 48deg ${dw.toFixed(2)}m`,target:'-.02m .20m -.02m'};
    }
    const d=Math.max(.58/t,.54/(t*aspect),.96);
    return {orbit:`180deg 40deg ${d.toFixed(2)}m`,target:'-.166m .262m -.027m'};
  }
  function setLidGhost(g) {            // 0 = tutup gelap utuh, 1 = kaca asap tembus pandang
    for (const n of lidMats) {
      try {
        const mat=viewer.model?.materials.find(m=>m.name===n); if(!mat) continue;
        lidBase[n]=lidBase[n]||[...mat.pbrMetallicRoughness.baseColorFactor];
        const b=lidBase[n], tint=[.19,.27,.32];
        if (typeof mat.setAlphaMode==='function') mat.setAlphaMode(g>.001?'BLEND':'OPAQUE');
        mat.pbrMetallicRoughness.setBaseColorFactor([0,1,2].map(i=>b[i]+(tint[i]-b[i])*g).concat(1-.84*g));
      } catch { /* material belum siap */ }
    }
  }
  function setMonoGhost(g) {          // rumah monokromator menjadi kaca asap agar prisma terlihat
    try {
      const mat=viewer.model?.materials.find(m=>m.name==='MonoHousing'); if(!mat) return;
      const b=[.28,.38,.43], tint=[.16,.24,.30];
      if (typeof mat.setAlphaMode==='function') mat.setAlphaMode(g>.001?'BLEND':'OPAQUE');
      mat.pbrMetallicRoughness.setBaseColorFactor([0,1,2].map(i=>b[i]+(tint[i]-b[i])*g).concat(1-.78*g));
    } catch { /* material belum siap */ }
  }
  // Mode tembus pandang: seluruh cangkang luar menjadi kaca tipis berwarna biru seperti gambar potongan di brosur,
  // sehingga cermin, lampu, monokromator, chopper, dan jalur merah di dalam alat terlihat.
  const shellMats=[['PorcelainWhite',[.45,.66,.80],.13],['WarmWhiteTop',[.50,.70,.84],.12],['SeamWhite',[.40,.60,.76],.20],
    ['LowerGraphite',[.25,.38,.50],.16],['VentPanel',[.30,.45,.56],.14],['VentSlots',[.30,.45,.56],.20],['LampHousing',[.35,.55,.70],.22]], shellBase={};
  function setShellGhost(g) {
    setLidGhost(g); setMonoGhost(g);
    setMaterial('ChamberRay',[.95,.12,.10,.95*g]);            // berkas merah melintasi kompartemen sampel
    setMaterial('OutlineBlue',[.20,.26,.80,.9*g]);            // garis tepi biru seperti gambar potongan brosur
    for (const [n,tint,a] of shellMats) {
      try {
        const mat=viewer.model?.materials.find(m=>m.name===n); if(!mat) continue;
        shellBase[n]=shellBase[n]||[...mat.pbrMetallicRoughness.baseColorFactor];
        const b=shellBase[n];
        if (typeof mat.setAlphaMode==='function') mat.setAlphaMode(g>.001?'BLEND':'OPAQUE');
        mat.pbrMetallicRoughness.setBaseColorFactor([0,1,2].map(i=>b[i]+(tint[i]-b[i])*g).concat(1-(1-a)*g));
      } catch { /* material belum siap */ }
    }
  }
  const nodeCache={};
  function findNodeByMat(name) {
    if (name in nodeCache) return nodeCache[name];
    nodeCache[name]=null;
    try {
      const sym=Object.getOwnPropertySymbols(viewer).find(x=>x.description==='scene'), scene=sym && viewer[sym];
      scene?.traverse(o=>{ if(!nodeCache[name] && o.isMesh && o.material?.name===name) nodeCache[name]={o,x0:o.position.x}; });
    } catch { nodeCache[name]=null; }
    return nodeCache[name];
  }
  // Pelangi tetap lurus (tidak miring): ujungnya rata menempel pada pelat slit hitam. Untuk memilih panjang gelombang,
  // pelangi bergeser sepanjang sisi prisma (sumbu z) sehingga pita terpilih tepat berada di celah.
  let rotor, rotorZ0=0;
  function setFanAngle(nm) {
    if (rotor===undefined) {
      rotor=null;
      try { const sym=Object.getOwnPropertySymbols(viewer).find(x=>x.description==='scene'); rotor=viewer[sym]?.getObjectByName('MonoRotor')||null; if(rotor) rotorZ0=rotor.position.z; } catch { rotor=null; }
    }
    if (!rotor) return;
    const mids=[410,445,475,530,580,610,680], e=Math.min(Math.max(nm,mids[0]),mids[6]);
    let i=0; while (i<5 && e>mids[i+1]) i++;
    const f=i+(e-mids[i])/(mids[i+1]-mids[i]);          // posisi pita (0 = violet ... 6 = merah)
    const dz=-.022/2+(f+.5)*.022/7;                      // jarak pita dari sumbu (m), spread 22 mm
    rotor.rotation.y=0; rotor.position.z=rotorZ0-dz;     // geser, bukan putar
  }
  // Animasi isi alat saat scan transparan: bola cahaya mengalir sepanjang jalur merah (lampu, cermin, pra-monokromator,
  // monokromator, chopper, detektor, optik bawah), chopper dan roda gigi berputar, kisi bergoyang, kipas berputar.
  let rig;
  function getRig() {
    if (rig!==undefined) return rig;
    rig=null;
    try {
      const sym=Object.getOwnPropertySymbols(viewer).find(x=>x.description==='scene'), scene=sym&&viewer[sym];
      const paths=scene?.getObjectByName('Instrument')?.userData?.paths;
      let tpl=null; scene?.traverse(o=>{ if(!tpl&&o.isMesh&&o.material?.name==='InternalPulse') tpl=o; });
      if(!paths||!tpl) return rig;
      const items=[];
      for(const p of paths) {
        const pts=p.pts.map(q=>[-q[0],q[1],q[2]]), segs=[]; let len=0;
        for(let i=0;i<pts.length-1;i++){ const d=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1],pts[i+1][2]-pts[i][2]); segs.push(d); len+=d; }
        for(let k=0;k<p.n;k++){ const m=items.length?tpl.clone():tpl; if(m!==tpl) tpl.parent.add(m); items.push({m,pts,segs,len,off:k/p.n}); }
      }
      const spin=[['SpinChopper','y',11],['SpinGear','x',3],['SpinFan','z',16]].map(([n,ax,w])=>({o:scene.getObjectByName(n),ax,w})).filter(q=>q.o);
      const rock=[['RockGratingPre',0],['RockGratingMono',1.7]].map(([n,ph])=>({o:scene.getObjectByName(n),ph})).filter(q=>q.o);
      rig={items,spin,rock};
    } catch { rig=null; }
    return rig;
  }
  function animateInside(now) {
    const rg=getRig(); if(!rg) return; const t=now/1000;
    for(const it of rg.items) {
      const u=(t*.24/Math.max(it.len,.25)+it.off)%1; let d=u*it.len, i=0;
      while(i<it.segs.length-1 && d>it.segs[i]){ d-=it.segs[i]; i++; }
      const f=it.segs[i]?Math.min(1,d/it.segs[i]):0, a=it.pts[i], b=it.pts[i+1];
      it.m.position.set(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f);
      it.m.scale.setScalar(Math.max(.01,Math.min(1,u*10,(1-u)*10)));
    }
    for(const s of rg.spin) s.o.rotation[s.ax]=t*s.w;
    for(const r of rg.rock) r.o.rotation.y=Math.sin(t*2.2+r.ph)*.5;
  }
  function resetInside() {
    const rg=getRig(); if(!rg) return;
    setMaterial('InternalPulse',[1,.93,.55,0]);
    for(const s of rg.spin) s.o.rotation[s.ax]=0;
    for(const r of rg.rock) r.o.rotation.y=0;
  }
  let curT=1;
  // Pulsa foton kecil bergerak sepanjang kedua jalur (arah cahaya), dan meredup di jalur sampel setelah menembus larutan.
  function startPulses() {
    const nodes=[['PulseRef',findNodeByMat('PulseRef')],['PulseSample',findNodeByMat('PulseSample')]];
    let alive=true;
    setMaterial('InternalPulse',[1,.93,.55,.95]);
    const loop=now=>{
      if (!alive) return;
      animateInside(tnow());
      const ph=(tnow()/1000*.85)%1, xs=.213-ph*.183;
      nodes.forEach(([name,n],i)=>{
        if (!n) return;
        n.o.position.x=n.x0+(xs-.213);
        const dim = i===1 && xs<.1945 ? .2+.8*curT : 1, edge=Math.min(1,ph*6,(1-ph)*6);
        setMaterial(name,[1,1,1,.9*dim*edge]);
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { alive=false; resetInside(); for (const [name] of nodes) setMaterial(name,[1,1,1,0]); };
  }
  // Jam yang berhenti saat animasi dijeda: dipakai tween, denyut cahaya, dan putaran komponen.
  let pausedMs=0, pauseAt=null;
  const tnow=()=>performance.now()-pausedMs-(pauseAt!==null?performance.now()-pauseAt:0);
  function tween(ms,fn) {
    return new Promise(resolve=>{
      if (reduced()) { fn(1); resolve(); return; }
      const t0=tnow();
      const tick=()=>{
        if (pauseAt!==null) { requestAnimationFrame(tick); return; }
        const p=Math.min(1,(tnow()-t0)/ms); fn(p); p<1?requestAnimationFrame(tick):resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  function setPaused(on) {
    if(on===state.paused || (on && !state.sweeping))return;
    if(on) pauseAt=performance.now(); else if(pauseAt!==null) { pausedMs+=performance.now()-pauseAt; pauseAt=null; }
    state.paused=on;
    $('stage').classList.toggle('paused',on);
    $('pause-button').setAttribute('aria-pressed',String(on));
    $('pause-button').firstElementChild.textContent=on?'▶':'⏸';
    $('pause-label').textContent=on?'Lanjut':'Jeda';
    if(!on) { closeCallout(); try { const sv=scanView(); viewer.cameraOrbit=sv.orbit; viewer.cameraTarget=sv.target; } catch { /* kamera belum siap */ } }
    status(on?'Animasi dijeda. Klik nomor bagian untuk penjelasan; gunakan panel kanan untuk zoom, putar, dan geser.':'Animasi dilanjutkan.');
    updateControls();
  }
  function saveCamera() {
    try { const o=viewer.getCameraOrbit(), t=viewer.getCameraTarget(); return {orbit:`${o.theta}rad ${o.phi}rad ${o.radius}m`,target:`${t.x}m ${t.y}m ${t.z}m`}; }
    catch { return null; }
  }
  function setWorkProgress(percent,phase) {
    const value=Math.max(0,Math.min(100,Math.round(percent)));
    $('operation-progress').hidden=false;
    $('progress-phase').textContent=phase;
    $('progress-value').textContent=`${value}%`;
    $('progress-fill').style.width=`${value}%`;
    $('progress-meter').setAttribute('aria-valuenow',String(value));
  }
  const PROCESS_STEPS=['Lampu dan cermin kuarsa','Premonokromator · kisi memilih λ','Celah variabel · satu λ lolos','Chopper ganda · sampel dan referensi','Kompartemen sampel · I₀ → Iₜ','Detektor · membaca Iₜ'];
  function scrollToChart(top=false) {
    const sc=document.querySelector('.software-scroll'), card=document.querySelector('.chart-card');
    if(!sc||!card)return;
    try { const y=top?0:Math.max(0,sc.scrollTop+card.getBoundingClientRect().top-sc.getBoundingClientRect().top-((document.querySelector('.scan-action-dock')?.offsetHeight||0)+8)); sc.scrollTo({top:y,behavior:reduced()?'auto':'smooth'}); } catch { sc.scrollTop=0; }
  }
  // Saklar Transparan: aktif = saat scan alat menjadi transparan dan proses di dalamnya dianimasikan; mati = alat tampil biasa.
  function setTransparent(on) {
    if(busy())return;
    state.transparent=on;
    $('stage').classList.toggle('transparent',on);
    $('mode-button').setAttribute('aria-checked',String(on));
    status(on?'Mode transparan aktif: saat scan, badan alat menjadi tembus pandang dan jalur cahaya di dalamnya beranimasi.':'Mode transparan mati: alat tampil biasa saat scan.');
  }
  async function opticalSweep(solution,ms,title,onProgress,fixedNm=null) {
    const [start,end]=ranges[state.range], cam=saveCamera();
    const from=fixedNm??(state.workflow==='lambda'?end:start), to=fixedNm??(state.workflow==='lambda'?start:end);
    const see=state.transparent;
    if(see){ const sv=scanView(); viewer.fieldOfView='30deg'; viewer.cameraOrbit=sv.orbit; viewer.cameraTarget=sv.target; }   // mode transparan: kamera mundur agar seluruh alat terlihat
    setWorkProgress(4,'Menutup ruang sampel');
    await setLid(false);
    scrollToChart();
    if(see) await tween(600,p=>{ setShellGhost(p); });   // mode transparan: badan alat tembus pandang
    setWorkProgress(15,'Sumber cahaya menyala');
    let stopPulses=()=>{};
    if(see) {
      showBeam(true);
      await wait(reduced()?0:280);                                             // lampu menyala lebih dulu
      await tween(420,p=>beamLook(from,solution,p));                           // kemudian prisma, spektrum, dan dua jalur terpilih
      stopPulses=startPulses();
      state.sweeping=true; $('pause-button').hidden=false;      // tombol Jeda baru muncul saat animasi benar-benar berjalan
    }
    $('scan-hud').hidden=false;
    await tween(ms,p=>{
      const nm=from+(to-from)*p;
      const col=see?css(beamLook(nm,solution)):css(nmToRgb(nm));
      // Urutan proses mengikuti diagram: Source → Condenser → Monochromator → Slit → Sample Holder → Detector.
      // Sorotan bergerak kiri → kanan satu putaran tiap 3 dtk, searah jalur cahaya.
      const step=Math.min(PROCESS_STEPS.length-1,Math.floor(((tnow()%3000)/3000)*PROCESS_STEPS.length)), phase=PROCESS_STEPS[step];
      $('stage').dataset.step=String(step);
      $('proc-readout').textContent=formatAbs(core.absorbance(solution,nm));        // angka layar detektor
      setWorkProgress(22+p*68,`${title} · ${phase}`);
      $('hud-title').textContent=phase;
      $('hud-nm').textContent=`${fixedNm==null?Math.round(nm):formatPeak(nm)} nm${nm<400?' · UV':''}`; $('hud-nm').style.color=col; $('hud-bar').style.width=`${(p*100).toFixed(1)}%`; $('hud-bar').style.background=col;
      if (onProgress) onProgress(p,nm);
    });
    stopPulses();
    state.sweeping=false; setPaused(false); $('pause-button').hidden=true;
    delete $('stage').dataset.step; $('proc-readout').textContent=formatAbs(0);
    $('scan-hud').hidden=true; if(see) showBeam(false);
    setWorkProgress(95,'Detektor mengirim hasil ke software');
    if(see) await tween(500,p=>{ setShellGhost(1-p); });
    if (cam && see) { viewer.cameraOrbit=cam.orbit; viewer.cameraTarget=cam.target; }     // kembali ke sudut semula
    await wait(reduced()?0:700);
  }
  // Warna berkas = warna panjang gelombang yang sedang dipindai. UV (<400 nm) tidak terlihat mata,
  // jadi digambar ungu-biru kebiruan seperti foto acuan; 400–780 nm mengikuti warna spektrum tampak.
  function nmToRgb(nm) {
    if (nm<400) return [.5,.3,1];
    let r=0,g=0,b=0;
    if (nm<440) { r=(440-nm)/60; b=1; }
    else if (nm<490) { g=(nm-440)/50; b=1; }
    else if (nm<510) { g=1; b=(510-nm)/20; }
    else if (nm<580) { r=(nm-510)/70; g=1; }
    else if (nm<645) { r=1; g=(645-nm)/65; }
    else r=1;
    const k=nm>700?.35+.65*(780-Math.min(nm,780))/80:1;
    return [r*k,g*k,b*k].map(v=>Math.min(1,v));
  }
  const css = c => `rgb(${c.map(v=>Math.round(v*255)).join(',')})`;
  // Lampu deuterium untuk UV (190–350 nm), tungsten-halogen untuk Visibel (350–900 nm).
  function lampFor(nm) { return nm<350 ? {name:'Lampu deuterium',col:[.50,.42,1]} : {name:'Lampu tungsten-halogen',col:[1,.86,.62]}; }
  const BANDS=[['BandViolet',[.56,.12,1],410,22],['BandIndigo',[.30,.10,.95],445,22],['BandBlue',[.10,.45,1],475,24],
    ['BandGreen',[.12,.90,.25],530,34],['BandYellow',[1,.92,.10],580,24],['BandOrange',[1,.50,.05],610,22],['BandRed',[1,.10,.08],680,55]];
  function beamLook(nm,solution,level=1) {
    const c=nmToRgb(nm), T=Math.pow(10,-core.absorbance(solution,nm)), e=Math.max(nm,405), lamp=lampFor(nm);
    curT=T;
    const hot=c.map(v=>.45+.55*v), L=level;                 // inti berkas dibuat lebih terang daripada warna dasarnya
    // lampu + berkas putih sebelum prisma
    setMaterial('SourceBulb',[...lamp.col.map(v=>.4+.6*v),L]); setEmissive('SourceBulb',lamp.col.map(v=>v*L));
    setMaterial('SourceHalo',[...lamp.col,.24*L]); setEmissive('SourceHalo',lamp.col);
    const wh=lamp.col.map(v=>.7+.3*v);
    setMaterial('IncidentWhiteBeam',[...wh,.97*L]); setEmissive('IncidentWhiteBeam',wh.map(v=>v*.9*L));
    setMaterial('IncidentGlow',[...lamp.col,.2*L]); setEmissive('IncidentGlow',lamp.col);
    // prisma: pita yang sesuai panjang gelombang menyala, pita lain redup
    for (const [n,col,mid,w] of BANDS) {
      const k=Math.exp(-Math.pow((e-mid)/w,2));
      setMaterial(n,[...col,(.3+.65*k)*L]); setEmissive(n,col.map(v=>v*(.4+.9*k)));
    }
    for (const n of ['SplitterGlass','LensGlass','CondenserGlass']) setMaterial(n,[.74,.9,1,.34*L]);
    setMaterial('DetectorDisplayGlow',[1,.12,.08,.95*L]); setEmissive('DetectorDisplayGlow',[1,.12,.08]);   // layar merah detektor menyala
    setMaterial('MonoPrismGlass',[.10,.12,.15,L]);   // prisma abu-abu pekat (opak) agar jelas terlihat
    setFanAngle(nm);
    // sesudah celah: satu berkas satu warna menuju pembagi berkas
    setMaterial('SelectedBeam',[...hot,.98*L]); setEmissive('SelectedBeam',c.map(v=>v*L));
    setMaterial('SelectedGlow',[...c,.26*L]); setEmissive('SelectedGlow',c);
    // dua jalur berwarna sama: inti terang + halo lembut; jalur sampel meredup bila diserap
    setMaterial('ReferenceBeam',[...hot,.98*L]); setEmissive('ReferenceBeam',c.map(v=>v*L));
    setMaterial('ReferenceGlow',[...c,.22*L]); setEmissive('ReferenceGlow',c);
    setMaterial('SampleBeam',[...hot,(.2+.78*T)*L]); setEmissive('SampleBeam',c.map(v=>v*(.3+.7*T)*L));
    setMaterial('SampleGlow',[...c,(.04+.18*T)*L]); setEmissive('SampleGlow',c);
    // cairan di kuvet ikut berpendar halus oleh cahaya yang lewat
    setEmissive('BlankLiquid',c.map(v=>v*.30*L)); setEmissive('SampleLiquid',c.map(v=>v*.30*T*L));
    setMaterial('LightWindow',[...c.map(v=>.25+.75*v),1]); setEmissive('LightWindow',c.map(v=>v*.85));
    for (const n of ['PulseRef','PulseSample']) setEmissive(n,c);
    $('stage').style.setProperty('--ray-color',css(c));
    return c;
  }
  function beamReset() {
    for (const n of ['SourceBulb','SourceHalo','IncidentWhiteBeam','IncidentGlow','ReferenceGlow','SampleGlow','PulseRef','PulseSample'])
      setMaterial(n,[1,1,1,0]);
    for (const n of ['SelectedBeam','SelectedGlow']) setMaterial(n,[1,1,1,0]);
    if (rotor) { rotor.rotation.y=0; rotor.position.z=rotorZ0; }
    for (const [n,col] of BANDS) { setMaterial(n,[...col,0]); setEmissive(n,col); }
    for (const n of ['MonoPrismGlass','SplitterGlass','LensGlass','CondenserGlass']) setMaterial(n,[.74,.9,1,0]);
    setMaterial('DetectorDisplayGlow',[1,.12,.08,0]);
    setEmissive('BlankLiquid',[0,0,0]); setEmissive('SampleLiquid',[0,0,0]);
    setMaterial('ReferenceBeam',[.39,.83,.98,0]); setEmissive('ReferenceBeam',[.14,.37,.45]);
    setMaterial('SampleBeam',[1,.68,.29,0]); setEmissive('SampleBeam',[.45,.24,.06]);
    setMaterial('LightWindow',[.20,.31,.35,1]); setEmissive('LightWindow',[0,0,0]);
  }
  function showBeam(active) {
    const on=active && state.instrumentOn;
    if (!on) beamReset();
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
    if ([0,1,2,3,4].includes(index)) setLid(true);
    viewer.cameraOrbit=parts[index][2];viewer.cameraTarget=parts[index][3];viewer.fieldOfView='30deg';
    requestAnimationFrame(positionPartCard);
  }
  function updateWeightPanel(solution) {
    const panel=$('weight-panel'), input=$('sample-weight'), info=$('weight-info');
    if (!panel || !solution) return;
    const isSample=solution.family==='sampel';
    panel.hidden=!isSample;
    if(isSample){
      input.value=solution.weight>0?String(solution.weight).replace('.',','):'';
      info.textContent=solution.custom?'Isi bobot positif yang ditimbang. Bobot sampel tambahan disimpan di browser.':`Nilai awal dari praktikum: ${formatWeight(core.datasets[core.datasetKey].weights[core.samples.indexOf(solution)])} g. Ubah sesuai bobot yang ditimbang.`;
      input.onchange=()=>{
        const val=parsePositiveDecimal(input.value);
        if(val===null){
          info.textContent='Isi bobot positif dalam gram, misalnya 0,0053 atau 0.0053.';
          input.setAttribute('aria-invalid','true');
          updateControls();
          return;
        }
        input.setAttribute('aria-invalid','false');
        solution.weight=val;
        massOverrides[core.datasetKey] ??= {};
        massOverrides[core.datasetKey][solution.id]=val;
        saveMassOverrides();
        input.value=String(val).replace('.',',');
        info.textContent=`Bobot ${solution.name}: ${formatWeight(val)} g. Hasil scan berikutnya memakai bobot ini.`;
        updateControls();drawSampleResults();if(solution.custom)renderCustomSolutions();
      };
    }
  }
  let renderCustomSolutions=()=>{};
  function commitManualAbs(solution) {
    if(solution.family!=='sampel')return;
    const input=$('manual-abs'), raw=input.value.trim().replace(',','.');
    absOverrides[core.datasetKey] ??= {};
    if(!raw) delete absOverrides[core.datasetKey][solution.id];
    else if(parseNonnegativeDecimal(raw)!==null) absOverrides[core.datasetKey][solution.id]=raw;
    saveAbsOverrides();
    updateControls();
  }
  function updateAbsPanel(solution) {
    const panel=$('abs-entry'),input=$('manual-abs'),info=$('manual-abs-info');
    panel.hidden=solution.family!=='sampel';
    input.value=solution.family==='sampel'?absOverrides[core.datasetKey]?.[solution.id]||'':'';
    input.placeholder=solution.custom?'Wajib, contoh 0,672':'Kosong = data praktikum';
    info.textContent=solution.custom?'Wajib diisi. Abs yang diketik menjadi titik acuan kurva ilustratif; bukan pembacaan alat.':'Opsional. Kosong memakai Abs asli praktikum; angka yang diketik disimpan sebagai input manual.';
    input.onchange=()=>commitManualAbs(solution);
    input.oninput=()=>{commitManualAbs(solution);};
  }
  // Isi kuvet depan (sampel). Kuvet belakang selalu aquades (blanko).
  function putInFront(id) {
    state.selected=id;
    updateWeightPanel(getSolution(id));
    updateAbsPanel(getSolution(id));
    updateModelMaterials();updateControls();
  }
  // Both vessels are separate scene groups. Lift the occupied vessel away,
  // exchange it above the rack, then lower the selected, already-filled one.
  const cuvetteNodes={};
  function findCuvette(slot) {
    if (cuvetteNodes[slot]) return cuvetteNodes[slot];
    try {
      const sym=Object.getOwnPropertySymbols(viewer).find(x=>x.description==='scene');
      viewer[sym]?.traverse(o=>{if(o.name===slot+'CuvetteLift')cuvetteNodes[slot]=o;});
    } catch { /* Model not ready yet; the selected solution still updates. */ }
    return cuvetteNodes[slot]||null;
  }
  function setCuvetteContents(slot,id) {
    if(slot==='Blank') { state.blankReady=true;updateControls(); }
    else putInFront(id);
  }
  async function swapCuvette(slot,id) {
    const vessel=state.modelReady?findCuvette(slot):null;
    if(!vessel || reduced()) {setCuvetteContents(slot,id);return;}
    const side=slot==='Blank' ? .065 : -.065;
    const pose=(x,y,z,angle)=>{
      vessel.position.set(x,y,z);vessel.rotation.z=angle;
      applyLidPose(state.lidProgress);
    };
    try {
      // Lift straight out of its holder before travelling over the edge.
      await tween(480,p=>{const e=p*p*(3-2*p);pose(0,.165*e,0,0);});
      await tween(400,p=>{const e=p*p*(3-2*p);pose(.12*e,.165,side*e,-.10*e);});
      vessel.visible=false;
      setCuvetteContents(slot,id);
      pose(-.12,.165,side,.10);
      await wait(100);
      vessel.visible=true;
      await tween(440,p=>{const e=p*p*(3-2*p);pose(-.12*(1-e),.165,side*(1-e),.10*(1-e));});
      await tween(520,p=>{const e=p*p*(3-2*p);pose(0,.165*(1-e),0,0);});
    } finally {
      vessel.visible=true;pose(0,0,0,0);
    }
  }
  function frontMessage(solution) {
    const head=`${solution.name} ada di kuvet depan, kuvet belakang berisi aquades.`;
    if (!state.instrumentOn) return `${head} Nyalakan UPS, alat, PCU, lalu buka software.`;
    if (!state.blanked) return `${head} Jalankan Zero blanko lagi, karena kelompok larutan berubah.`;
    return `${head} Tekan Mulai scan.`;
  }
  async function chooseSolution(id,datasetKey) {
    if (busy()) return;
    const solution=getSolution(id);
    if(solution.archived)return;
    if (solution.family!=='blanko' && datasetKey!==core.datasetKey) {
      if (!core.setDataset(datasetKey)) return;
      applyMassOverrides();
      state.blanked=false;state.zeroed=false;state.zeroGroup=null;state.lastResult=null;
      if (!Number.isFinite(state.confirmedPeaks[datasetKey])) state.workflow='lambda';
      updateFormula(null);
      drawCalibration();
    }
    if(solution.family!=='blanko'&&!Number.isFinite(state.confirmedPeaks[core.datasetKey]))state.workflow='lambda';
    if (solution.family!=='blanko') {
      const [start,end]=ranges[state.range];
      if(core.peakNm<start || core.peakNm>end) state.range='uv';
      state.wavelength=core.peakNm;
    }
    if(solution.family!=='blanko'&&state.softwareOpen)state.seriesPicked=true;
    state.currentScan=null;
    $('operation-progress').hidden=true;
    if (solution.family==='blanko') {state.blanked=false;state.zeroed=false;state.zeroGroup=null;}
    else {
      state.queueId=id;state.requiresSelection=false;
      if (state.zeroGroup!==solution.family) {state.blanked=false;state.zeroGroup=null;}
    }
    state.filling=true;updateControls();
    const slot=solution.family==='blanko'?'Blank':'Sample';
    status(`Mengganti kuvet ${slot==='Blank'?'blanko belakang':'sampel depan'}…`);
    try {
      await setLid(true);
      await swapCuvette(slot,id);
      drawSpectrum();
      status(slot==='Blank'?
        `Kuvet blanko aquades terpasang di belakang; kuvet depan tetap ${getSolution(state.selected).name}. ${state.requiresSelection?'Pilih seri standar atau sampel di baki dahulu.':state.workflow==='lambda'?'Tekan START scan λmaks di komputer.':'Jalankan Zero blanko sebelum scan.'}`:
        `${state.workflow==='lambda'?'Tekan START scan λmaks di komputer.':frontMessage(solution)} Seri ${core.datasets[core.datasetKey].label}.`);
    } finally {state.filling=false;updateControls();}
  }
  function makeSolutions() {
    const containers={blanko:$('blank-solutions'),standar:$('standard-solutions'),sampel:$('sample-solutions')};
    const customRows={};
    const addButton=(s,parent,key)=>{
      const button=document.createElement('button');button.type='button';button.className='solution';button.dataset.solution=s.id;
      if (key) button.dataset.dataset=key;
      const place=s.family==='blanko'?'belakang (rak merah)':'depan (rak abu)';
      const data=core.datasets[key];
      button.setAttribute('aria-pressed','false');button.title=`Pasang kuvet ${s.name} di ${place}${data?` · ${data.label}, λmaks ${formatPeak(data.peakNm)} nm`:''}`;
      const vessel=document.createElement('span');vessel.className='cuvette-icon';vessel.style.setProperty('--fluid',s.color);vessel.setAttribute('aria-hidden','true');
      button.append(vessel,document.createTextNode(s.family==='standar'?`${s.ppm} ppm (mg/L)`:s.name));
      if (s.family==='sampel') {
        const index=core.samples.indexOf(s), mass=document.createElement('small');
        mass.textContent=s.custom?(s.weight>0?`${formatWeight(s.weight)} g`:'isi bobot'):`${data.weights[index].toFixed(4).replace('.',',')} g`;
        button.append(mass);
      }
      button.addEventListener('click',()=>chooseSolution(s.id,key));parent.append(button);
    };
    addButton(core.solutions[0],containers.blanko);
    for (const family of ['standar','sampel']) {
      for (const key of ['praktikum','jena']) {
        const block=document.createElement('div');block.className='series-block';block.dataset.series=key;
        const heading=document.createElement('div');heading.className='series-heading';
        const title=document.createElement('strong');title.textContent=core.datasets[key].series+(family==='sampel'?` · ${core.datasets[key].sampleMass}`:'');
        const source=document.createElement('small');source.textContent=`${family==='standar'?'Standar':'Sampel'} ${key==='praktikum'?'1':'2'}${family==='standar'?' ':''}`;
        heading.append(title,source);
        const row=document.createElement('div');row.className='solution-row';
        for (const s of family==='standar'?core.standards:core.samples) addButton(s,row,key);
        block.append(heading,row);
        if(family==='sampel'){
          const extra=document.createElement('div');extra.className='custom-series';extra.hidden=true;
          const title=document.createElement('small');title.textContent='SAMPEL TAMBAHAN';
          const customRow=document.createElement('div');customRow.className='solution-row';
          extra.append(title,customRow);block.append(extra);
          customRows[key]={extra,row:customRow};
        }
        containers[family].append(block);
      }
    }
    renderCustomSolutions=()=>{
      for(const [key,where] of Object.entries(customRows)){
        where.row.replaceChildren();
        const current=customSamples.filter(s=>s.dataset===key && !s.archived);
        where.extra.hidden=!current.length;
        for(const s of current){
          const item=document.createElement('div');item.className='custom-solution-item';
          addButton(s,item,key);
          const remove=document.createElement('button');remove.type='button';remove.className='custom-remove';remove.textContent='×';remove.title=`Arsipkan ${s.name}`;remove.setAttribute('aria-label',`Arsipkan ${s.name}`);
          remove.addEventListener('click',()=>{
            if(busy())return;
            s.archived=true;saveCustomSamples();
            if(state.selected===s.id) void chooseSolution('std-0',key);
            renderCustomSolutions();drawSampleResults();updateControls();
            $('custom-sample-feedback').textContent=`${s.name} diarsipkan. Hasil lama tetap di Riwayat.`;
          });
          item.append(remove);where.row.append(item);
        }
      }
      updateControls();
    };
    renderCustomSolutions();
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
    const xAt=nm=>(38+(nm-start)*370/(end-start)).toFixed(2);
    $('chart-area').setAttribute('d',points.length?`${svgPath(points,start,end,max)} L${xAt(points.at(-1).nm)},176 L${xAt(points[0].nm)},176 Z`:'');
    let labels=points.length?'':'<text x="223" y="103" text-anchor="middle" fill="#aec1ca" font-size="12">Belum ada pemindaian</text>';
    const lam=state.currentScan;
    if (lam?.kind==='lambda' && Number.isFinite(lam.readNm)) {
      const px=38+(lam.readNm-start)*370/(end-start), py=176-lam.readAbs*158/max, anchor=px>300?'end':'start', tx=px+(px>300?-9:9);
      labels+=`<text x="${tx.toFixed(1)}" y="${Math.max(14,py-6).toFixed(1)}" text-anchor="${anchor}" fill="#1c718d" font-size="11" font-weight="600">λmaks = ${formatPeak(lam.readNm)} nm</text>`;
    }
    $('chart-labels').innerHTML=labels;
    if (points.length) {
      const nm=Math.max(start,Math.min(end,state.wavelength)), x=38+(nm-start)*370/(end-start), y=176-interpolatedValue(points,nm)*158/max;
      $('chart-cursor').innerHTML=`<line x1="${x}" y1="16" x2="${x}" y2="176"/><circle cx="${x}" cy="${y}" r="5"/>`;
    } else $('chart-cursor').innerHTML='';
    $('range-start').textContent=`${start} nm`;$('range-end').textContent=`${end} nm`;
    $('chart-title').textContent=state.currentScan?(state.currentScan.baseline?'Baseline · blanko–blanko':state.currentScan.kind==='lambda'?`Scan λmaks · ${state.currentScan.name}`:`Spektrum ilustratif · ${state.currentScan.name||getSolution(state.currentScan.solutionId).name}`):'Spektrum ilustratif';
    updateControls();
  }
  function calibrationPoints() {
    return core.standards.flatMap(s=>{
      const record=state.history.find(r=>r.kind!=='lambda' && r.dataset===core.datasetKey && r.solutionId===s.id && r.readNm===core.peakNm && r.start<=core.peakNm && r.end>=core.peakNm);
      return record?[{ppm:s.ppm,abs:record.absPeak}]:[];
    });
  }
  function usableCalibration() {
    const points=calibrationPoints();
    if(points.length<3) return null;
    const fit=core.regression(points);
    return fit && fit.slope>0 && fit.r2>=.95 ? fit : null;
  }
  function drawCalibration() {
    const measured=calibrationPoints(),fit=usableCalibration();
    $('cal-series').textContent=`Seri ${formatPeak(core.peakNm)} nm · ${core.datasets[core.datasetKey].label}`;
    const yMax=Math.max(1.1,...core.standards.map(s=>s.targetAbs),...measured.map(p=>p.abs))*1.08;
    const x=ppm=>46+ppm/25*356, y=abs=>162-abs/yMax*140, mono='font-family="IBM Plex Mono, monospace"';
    let svg='<rect x="0" y="0" width="420" height="200" fill="white"/>';
    for(const level of [0,yMax/4,yMax/2,yMax*3/4]) svg+=`<line x1="46" y1="${y(level)}" x2="404" y2="${y(level)}" stroke="#e7eff2"/><text x="40" y="${y(level)+3}" text-anchor="end" font-size="9" fill="#9cb1ba">${level.toFixed(1)}</text>`;
    svg+='<line x1="46" y1="162" x2="404" y2="162" stroke="#adc8d3"/>';
    for(const ppm of [0,5,10,15,20,25]) svg+=`<text x="${x(ppm)}" y="177" text-anchor="middle" font-size="9" fill="#91aab5">${ppm}</text>`;
    svg+='<text x="225" y="194" text-anchor="middle" font-size="10" fill="#6f8b99">Konsentrasi tiamin, ppm (mg/L)</text><text transform="translate(11 92) rotate(-90)" text-anchor="middle" font-size="10" fill="#6f8b99">Absorbansi (A)</text>';
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
    for(const s of core.standards){const found=measured.find(p=>p.ppm===s.ppm),el=document.createElement('span');el.className='cal-point'+(found?' done':'');el.textContent=found?`${s.ppm} ppm · ${formatAbs(found.abs)} Abs`:`${s.ppm} ppm · belum scan`;$('cal-points').append(el);}
    let message='Ukur setidaknya tiga standar untuk membuat garis kalibrasi.';
    if(measured.length>=3 && !fit) message='Garis kalibrasi belum layak: diperlukan kemiringan positif dan R² ≥ 0,95.';
    if(fit) {
      message=`A = ${fit.slope.toFixed(4)} × C + ${fit.intercept.toFixed(4)} · R² ${fit.r2.toFixed(4)}`;
      const smp=state.history.find(r=>r.dataset===core.datasetKey && getSolution(r.solutionId).family==='sampel' && r.absPeak!=null);
      if(smp) message+=` · ${smp.name} ≈ ${Math.max(0,(smp.absPeak-fit.intercept)/fit.slope).toFixed(2)} ppm (mg/L)`;
    }
    $('cal-result').textContent=message;
    drawSampleResults();
  }
  function drawSampleResults() {
    const list=$('sample-result-list');list.replaceChildren();
    for (const sample of [...core.samples,...customSamples.filter(s=>s.dataset===core.datasetKey && !s.archived)]) {
      const record=state.history.find(r=>r.kind!=='lambda' && r.dataset===core.datasetKey && r.solutionId===sample.id && r.readNm===core.peakNm && r.absPeak!=null);
      const tr=document.createElement('tr');
      const name=document.createElement('th');name.scope='row';name.textContent=sample.name;
      const mass=document.createElement('td');const weight=record?.weight ?? sample.weight;mass.textContent=weight>0?formatWeight(weight):'—';
      const abs=document.createElement('td');abs.textContent=record?`${recordAbs(record)}${record.origin==='manual'?' · input':''}`:'—';
      tr.append(name,mass,abs);list.append(tr);
    }
  }
  // Rumus perhitungan di bagian bawah monitor, muncul setelah scan.
  function updateFormula(rec) {
    const bar=$('formula-bar');
    if(!rec || rec.baseline || rec.kind==='lambda') { bar.dataset.has='0'; bar.hidden=true; return; }
    const A=rec.readAbs, T=Math.pow(10,-A), fit=usableCalibration(), sol=getSolution(rec.solutionId), f=(v,d)=>v.toFixed(d), digits=absDigits(rec.dataset);
    const aLabel=rec.origin==='manual'?escapeHtml(recordAbs(rec)):f(A,digits);
    let t=`<span class="fm-h">RUMUS · ${escapeHtml(rec.name)} pada ${formatPeak(rec.readNm)} nm</span>`+
      `A = −log T = <b>${aLabel}</b>${rec.origin==='manual'?' <small>(input manual)</small>':''}<br>T = 10<sup>−A</sup> = 10<sup>−${aLabel}</sup> = ${f(T,3)}<br>%T = T × 100 = <b>${f(T*100,1)} %</b><br>Lambert–Beer: A = ε · b · C`;
    if(fit) {
      t+=`<br>Regresi: A = ${f(fit.slope,4)}·C + ${f(fit.intercept,4)} (R² = ${f(fit.r2,4)})`;
      if(sol.family==='sampel' && rec.absPeak!=null && rec.dataset===core.datasetKey) {
        const conc=Math.max(0,(rec.absPeak-fit.intercept)/fit.slope);
        t+=`<br><span class="fm-r">C = (A − ${f(fit.intercept,4)}) / ${f(fit.slope,4)} = ${f(conc,2)} mg/L</span>`;
        if(rec.weight>0) {
          const mgKg=conc*100/rec.weight;
          t+=`<br>V labu = 100 mL · bobot sampel = ${formatWeight(rec.weight)} g`+
            `<br>Kadar = C × V / bobot = ${f(mgKg,2)} mg/kg`+
            `<br>Kadar/tablet = kadar × (0,1778 / 1000) = <b>${f(mgKg*.1778/1000,2)} mg/tablet</b>`;
        }
      }
    } else if(sol.family==='standar') t+='<br>Regresi muncul setelah minimal 3 standar di-scan dengan R² ≥ 0,95.';
    bar.innerHTML=t; bar.dataset.has='1'; bar.hidden=state.tab==='history';
  }
  function drawHistory() {
    const list=$('history-list');list.replaceChildren();
    if(!state.history.length){const empty=document.createElement('div');empty.className='empty-history';empty.textContent='Hasil scan akan muncul di sini.';list.append(empty);return;}
    for(const item of state.history) {
      const row=document.createElement('button');row.type='button';row.className='history-item';row.title='Lihat lagi kurva ini';
      const left=document.createElement('div'), name=document.createElement('strong'),info=document.createElement('small'),value=document.createElement('span');
      name.textContent=(item.kind==='lambda'?'Scan λ · ':'')+item.name;info.textContent=`${new Date(item.ts).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ${item.start}–${item.end} nm · ${core.datasets[item.dataset]?.label||'Simulasi lama'}`;
      if (getSolution(item.solutionId).family==='sampel' && Number.isFinite(item.weight)) info.textContent+=` · Bobot ${formatWeight(item.weight)} g`;
      if(item.origin==='manual')info.textContent+=' · Abs input manual';
      value.textContent=`${recordAbs(item)} Abs`;left.append(name,info);row.append(left,value);
      row.addEventListener('click',()=>{
        if(busy()) return;
        if(core.datasets[item.dataset] && item.dataset!==core.datasetKey) {core.setDataset(item.dataset);applyMassOverrides();updateModelMaterials();}
        state.blanked=false;state.zeroed=false;state.zeroGroup=null;state.requiresSelection=true;
        state.workflow=Number.isFinite(state.confirmedPeaks[core.datasetKey])?'concentration':'lambda';
        state.range=Object.keys(ranges).find(k=>ranges[k][0]===item.start&&ranges[k][1]===item.end)||'uv';
        state.wavelength=Math.max(item.start,Math.min(item.end,item.readNm||core.peakNm));
        state.currentScan=item;state.lastResult=item;updateFormula(item);drawSpectrum();drawCalibration();setTab('scan');status('Hasil riwayat ditampilkan. Pilih seri larutan di baki sebelum pengukuran baru.');
      });
      list.append(row);
    }
  }
  function powerUps() {
    if (busy() || (state.upsOn && (state.instrumentOn||state.pcuOn))) return;
    state.upsOn=!state.upsOn;updateControls();
    status(state.upsOn?'UPS aktif. Nyalakan alat, kemudian PCU.':'UPS mati. Setelah praktik, catat log book dan rapikan area kerja.');
  }
  function powerInstrument() {
    if (busy() || (!state.instrumentOn&&!state.upsOn) || (state.instrumentOn&&state.pcuOn)) return;
    state.instrumentOn=!state.instrumentOn;
    state.blanked=false;state.zeroed=false;state.zeroGroup=null;state.currentScan=null;
    if (!state.instrumentOn) {
      state.confirmedPeaks={};state.workflow='lambda';
      $('operation-progress').hidden=true;
    }
    clearTimeout(beamTimer);showBeam(false);updateModelMaterials();drawSpectrum();
    status(state.instrumentOn?'Alat aktif. Nyalakan PCU untuk menjalankan software.':'Alat mati. Selanjutnya matikan UPS; riwayat tetap tersimpan.');
  }
  function powerPcu() {
    if (busy() || (!state.pcuOn&&(!state.upsOn||!state.instrumentOn)) || (state.pcuOn&&state.softwareOpen)) return;
    state.pcuOn=!state.pcuOn;
    if(!state.pcuOn){state.blanked=false;state.zeroed=false;state.currentScan=null;}
    updateControls();
    status(state.pcuOn?'PCU aktif dan monitor menyala. Buka software lalu pilih seri 1 atau 2.':'PCU shutdown. Tekan tombol daya pada alat, lalu matikan UPS.');
  }
  function changeWorkflow(mode) {
    if (busy() || (mode==='concentration'&&!Number.isFinite(state.confirmedPeaks[core.datasetKey]))) return;
    if(state.workflow===mode)return;
    state.workflow=mode;state.blanked=false;state.zeroGroup=null;state.currentScan=null;
    $('operation-progress').hidden=true;
    state.range='uv';state.wavelength=mode==='concentration'?state.confirmedPeaks[core.datasetKey]:core.peakNm;
    updateFormula(null);drawSpectrum();
    status(mode==='lambda'?'Tekan START scan λmaks untuk mencari panjang gelombang maksimum.':'λ terpasang. Zero blanko dahulu, lalu ukur deret standar dan sampel.');
  }
  // Pilih seri 1 atau 2 sebelum tampilan software muncul. λmaks tidak diketik;
  // ia dicari lewat scan kurva (Abs terhadap panjang gelombang) pada tombol START scan λmaks.
  async function pickSeries(key) {
    if(busy() || !state.softwareOpen || !Object.hasOwn(core.datasets,key))return;
    state.seriesPicked=true;
    updateControls();
    await chooseSolution('std-0',key);
    if(core.datasetKey!==key)return;
    const confirmed=state.confirmedPeaks[key];
    const has=Number.isFinite(confirmed);
    state.workflow=has?'concentration':'lambda';
    state.range='uv';state.wavelength=has?confirmed:core.peakNm;
    state.blanked=false;state.zeroGroup=null;state.currentScan=null;
    updateFormula(null);drawSpectrum();drawCalibration();
    status(has?`Seri ${key==='praktikum'?'1':'2'} dipilih; λmaks ${formatPeak(confirmed)} nm sudah ditemukan. Zero blanko sebelum START ukur.`:`Seri ${key==='praktikum'?'1':'2'} dipilih. Tekan START scan λmaks untuk mencari panjang gelombang maksimum dari puncak kurva.`);
  }
  async function scanLambda() {
    if(busy() || !state.softwareOpen || !state.seriesPicked || !state.upsOn || !state.instrumentOn || !state.pcuOn || state.workflow!=='lambda')return;
    const key=core.datasetKey,[start,end]=ranges.uv;
    let solution=getSolution(state.selected);
    state.measuring=true;state.currentScan=null;state.blanked=false;state.zeroGroup=null;updateControls();
    setWorkProgress(0,'Menyiapkan standar untuk scan λmaks');
    try {
      // Urutan mengikuti instruksi kerja: kedua kuvet aquades → Zero & Baseline → ganti ke standar → START scan.
      await setLid(true);
      if(state.selected!=='aquades')await swapCuvette('Sample','aquades');
      const base=core.spectrum(core.solutions[0],start,end,4);
      status('Zero & Baseline: aquades di kedua kuvet, garis dasar direkam 400–200 nm.');
      let bdrawn=0;
      await opticalSweep(core.solutions[0],1500,'Zero & Baseline',(p,nm)=>{
        const now=performance.now();if(now-bdrawn<90&&p<1)return;bdrawn=now;
        state.currentScan={solutionId:'aquades',name:'Aquades',baseline:true,start,end,points:base};
        state.wavelength=nm;drawSpectrum();
      });
      await setLid(true);
      setWorkProgress(5,'Mengganti kuvet depan dengan Standar 25 ppm');
      await swapCuvette('Sample','std-25');
      solution=getSolution('std-25');
      state.currentScan=null;drawSpectrum();
      const points=core.spectrum(solution,start,end,2);
      status('Scan λmaks: monokromator memindai 200–400 nm, kurva Abs terhadap panjang gelombang digambar.');
      let drawn=0;
      await opticalSweep(solution,3200,'Scan λmaks',(p,nm)=>{
        const now=performance.now();if(now-drawn<90&&p<1)return;drawn=now;
        state.currentScan={solutionId:solution.id,name:solution.name,kind:'lambda',start,end,points:points.filter(q=>q.nm>=nm)};
        state.wavelength=nm;drawSpectrum();
      });
      const top=points.reduce((best,q)=>q.abs>best.abs?q:best,points[0]);
      const record={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,ts:Date.now(),dataset:key,kind:'lambda',solutionId:solution.id,name:solution.name,weight:null,start,end,points,
        readNm:top.nm,readAbs:top.abs,absPeak:null,origin:'praktikum',manualAbsText:null};
      state.history.unshift(record);state.history=state.history.slice(0,60);saveHistory();
      state.confirmedPeaks[key]=top.nm;
      state.currentScan=record;state.lastResult=record;state.wavelength=top.nm;
      setWorkProgress(100,`Selesai · λmaks = ${formatPeak(top.nm)} nm (Abs ${formatAbs(top.abs,key)})`);
      drawSpectrum();drawCalibration();drawHistory();
      status(`λmaks ditemukan: ${formatPeak(top.nm)} nm, titik puncak kurva. Menyiapkan Standar 0 ppm di kuvet depan…`);
      await setLid(true);state.queueId='std-0';
      await swapCuvette('Sample','std-0');
      state.workflow='concentration';state.range='uv';
      status(`λmaks ${formatPeak(top.nm)} nm terpasang untuk seri ${core.datasets[key].label}. Klik tab 2 · Pengukuran, lalu Zero blanko sebelum START ukur.`);
    } finally {state.measuring=false;updateControls();}
  }
  async function zero() {
    if (!state.upsOn||!state.instrumentOn||!state.pcuOn||!state.softwareOpen||state.workflow!=='concentration'||state.requiresSelection||busy()||!Number.isFinite(state.confirmedPeaks[core.datasetKey])) return;
    const target=state.queueId;
    commitManualAbs(getSolution(state.selected));
    state.measuring=true;state.currentScan=null;state.blanked=false;updateControls();
    setWorkProgress(0,'Menyiapkan aquades di kedua kuvet');
    try {
      await setLid(true);
      if(state.selected!=='aquades')await swapCuvette('Sample','aquades');
      await setLid(false);
      await runBlankCorrection(target,'Zero blanko');
    } finally {state.measuring=false;drawSpectrum();}
  }
  async function runBlankCorrection(target,title) {
    const [start,end]=ranges[state.range],base=core.spectrum(core.solutions[0],start,end,4);
    status(`${title}: aquades di kedua kuvet; referensi sedang direkam…`);
    let drawn=0;
    try {
      await opticalSweep(core.solutions[0],1300,title,(p,nm)=>{
        const now=performance.now();if(now-drawn<90&&p<1)return;drawn=now;
        state.currentScan={solutionId:'aquades',name:'Aquades',baseline:true,start,end,points:base};
        state.wavelength=nm;drawSpectrum();
      },state.confirmedPeaks[core.datasetKey]);
      state.currentScan={solutionId:'aquades',name:'Aquades',baseline:true,start,end,points:base};
      state.blanked=true;state.zeroGroup=groupOf(target);
    } finally {
      await setLid(true);
      if(state.selected==='aquades')await swapCuvette('Sample',target);
    }
    state.wavelength=state.confirmedPeaks[core.datasetKey];
    setWorkProgress(100,'Zero selesai · aquades sebagai referensi');
    status(`${title} selesai. Blanko aquades tetap di belakang; ${getSolution(target).name} kembali ke depan. Klik START ukur.`);
  }
  async function scan() {
    if(!state.upsOn||!state.instrumentOn||!state.pcuOn||!state.softwareOpen||state.workflow!=='concentration'||state.requiresSelection||!state.blanked||busy()||!Number.isFinite(state.confirmedPeaks[core.datasetKey]))return;
    const solution=getSolution(state.selected),[start,end]=ranges[state.range];
    let manualText=null;
    if(solution.family==='sampel'){
      const mass=parsePositiveDecimal($('sample-weight').value);
      if(mass===null){status('Isi bobot sampel positif sebelum pengukuran.');return;}
      manualText=manualAbsText(solution);
      if((solution.custom || $('manual-abs').value.trim()) && !manualText){status('Isi Abs manual dengan angka nonnegatif sebelum pengukuran.');updateControls();return;}
      commitManualAbs(solution);
      solution.weight=mass;
      massOverrides[core.datasetKey] ??= {};
      massOverrides[core.datasetKey][solution.id]=mass;
      saveMassOverrides();
    }
    state.measuring=true;updateControls();
    setWorkProgress(0,`Menyiapkan pembacaan ${solution.name}`);
    status(manualText?'Abs input manual digunakan sebagai titik acuan. Jalur cahaya dan kurva ditampilkan sebagai ilustrasi.':'Cahaya melewati sumber → monokromator → kuvet → detektor…');
    const measurement=manualText===null?solution:{...solution,manualAbs:parseNonnegativeDecimal(manualText)};
    const points=core.spectrum(measurement,start,end,4);
    let drawn=0;
    try {
      await opticalSweep(measurement,1600,`Baca λ ${solution.name}`,(p,nm)=>{
        const now=performance.now();if(now-drawn<90&&p<1)return;drawn=now;
        state.currentScan={solutionId:solution.id,name:solution.name,kind:'concentration',start,end,points};
        state.wavelength=nm;drawSpectrum();
      },state.confirmedPeaks[core.datasetKey]);
      const readNm=state.confirmedPeaks[core.datasetKey];
      const abs=interpolatedValue(points,readNm);
      const record={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,ts:Date.now(),dataset:core.datasetKey,kind:'concentration',solutionId:solution.id,name:solution.name,weight:solution.family==='sampel'?solution.weight:null,start,end,points,
        readNm,readAbs:abs,absPeak:abs,origin:manualText===null?'praktikum':'manual',manualAbsText:manualText};
      state.history.unshift(record);state.history=state.history.slice(0,60);saveHistory();
      state.currentScan=record;state.lastResult=record;state.wavelength=readNm;
      updateFormula(record);
      setWorkProgress(100,`Selesai · ${solution.name}: ${recordAbs(record)} Abs${manualText!==null?' (input manual)':''}`);
      const nextId=nextInSequence(solution.id);
      drawSpectrum();drawCalibration();drawHistory();
      if(nextId) {
        const list=sequences[solution.family],next=getSolution(nextId);
        status(`${solution.name} selesai. Menyiapkan ${next.name} di kuvet depan…`);
        await setLid(true);state.queueId=nextId;await swapCuvette('Sample',nextId);
        status(`${solution.name} selesai. ${next.name} sudah di kuvet depan (${list.indexOf(nextId)+1} dari ${list.length}); blanko tetap di belakang. Tekan Mulai scan.`);
      } else if(solution.custom) {
        status(`${solution.name} selesai. Abs ${recordAbs(record)} adalah input manual; kurva di luar titik ukur merupakan ilustrasi. Pilih sampel lain bila ingin melanjutkan.`);
      } else if(sequences[solution.family]) {
        const kurva=solution.family==='standar'?' Lihat Kurva kalibrasi.':'';
        status(`${solution.name} selesai. Semua ${groupLabels[solution.family]} sudah diukur.${kurva} Untuk kelompok lain, pilih larutan di baki lalu Zero lagi.`);
      } else status(`${solution.name} selesai dipindai. Geser penunjuk pada kurva untuk membaca Abs atau %T.`);
    } finally {state.measuring=false;updateControls();}
  }

  $('ups-power').addEventListener('click',powerUps);
  $('instrument-power').addEventListener('click',powerInstrument);
  $('pcu-power').addEventListener('click',powerPcu);
  $('open-software').addEventListener('click',()=>{if(!state.pcuOn||!state.instrumentOn)return;state.softwareOpen=true;state.seriesPicked=false;updateControls();status('Software terbuka. Pilih seri 1 atau seri 2 pada layar monitor.');});
  const closeSoftware=()=>{if(busy())return;state.softwareOpen=false;state.seriesPicked=false;state.blanked=false;state.zeroed=false;updateControls();status('Software ditutup. Shutdown PCU, lalu matikan alat dan UPS.');};
  $('close-software').addEventListener('click',closeSoftware);
  $('chooser-close').addEventListener('click',closeSoftware);
  document.querySelectorAll('.series-option').forEach(button=>button.addEventListener('click',()=>pickSeries(button.dataset.series)));
  $('workflow-lambda').addEventListener('click',()=>changeWorkflow('lambda'));
  $('workflow-concentration').addEventListener('click',()=>changeWorkflow('concentration'));
  $('scan-lambda').addEventListener('click',scanLambda);
  $('sample-weight').addEventListener('input',updateControls);
  $('lid-button').addEventListener('click',()=>setLid(!state.lidOpen));
  $('reset-view').addEventListener('click',resetView);
  // ---- Nomor bagian sesuai callout brosur Cary 100/300. Klik nomor saat animasi dijeda untuk penjelasan dan zoom otomatis.
  const CALLOUTS=[
    ['Biaya kepemilikan rendah','Optik tersegel mencegah paparan lingkungan korosif, memperpanjang umur alat dan menekan biaya servis.','200deg 62deg 1.2m','0m .15m 0m'],
    ['Premonokromator memperluas rentang','Cary 300 memiliki premonokromator yang memperluas rentang fotometrik linear hingga lebih dari 6,0 Abs. Cary 100 bekerja hingga lebih dari 4,0 Abs.','200deg 50deg .40m','.262m .26m .19m'],
    ['Tanpa pergeseran puncak','Penggerak panjang gelombang terkunci fasa mencegah pergeseran puncak dan penekanan puncak pada kecepatan scan tinggi.','160deg 50deg .40m','.31m .13m -.04m'],
    ['Celah variabel','Memberi kontrol optimum atas resolusi spektrum.','195deg 50deg .32m','.136m .26m .17m'],
    ['Kompartemen sampel besar','Memberi fleksibilitas lebih untuk ukuran sampel.','180deg 48deg .62m','-.166m .25m -.027m'],
    ['Optik berlapis kuarsa','Melindungi optik dari lingkungan sehingga kinerja optik terjaga sepanjang umur alat.','200deg 50deg .45m','.36m .27m .25m'],
    ['Pilihan mode','Meski berkas ganda (double beam), alat dapat dioperasikan dalam mode berkas tunggal, ganda, atau dual-single untuk memperluas kapasitas sampling.','180deg 48deg .48m','-.10m .25m -.027m'],
    ['Pengendali aksesori','Pengendali aksesori mengatur aksesori Agilent dan pihak ketiga secara terpusat.','150deg 55deg .55m','-.44m .10m .17m'],
    ['Desain optik unggul','Chopper ganda memastikan berkas sampel dan referensi mengenai detektor pada titik yang sama, sehingga galat akibat ketidakseragaman detektor hilang.','200deg 50deg .32m','.115m .24m .185m'],
  ];
  function openCallout(i) {
    state.callout=i;
    document.querySelectorAll('.callout').forEach(b=>b.classList.toggle('active',Number(b.dataset.callout)===i));
    $('part-number').textContent=`BAGIAN ${i+1} / ${CALLOUTS.length} · BROSUR CARY`;
    $('part-title').textContent=CALLOUTS[i][0]; $('part-copy').textContent=CALLOUTS[i][1];
    const card=$('part-card'); card.hidden=false;
    const w=card.offsetWidth||255; card.style.left=`${Math.max(12,$('stage').clientWidth-w-12)}px`; card.style.top='112px';
    viewer.cameraOrbit=CALLOUTS[i][2]; viewer.cameraTarget=CALLOUTS[i][3];
  }
  function closeCallout() {
    if(state.callout<0)return;
    state.callout=-1;
    document.querySelectorAll('.callout').forEach(b=>b.classList.remove('active'));
    $('part-card').hidden=true;
  }
  document.querySelectorAll('.callout').forEach(b=>b.addEventListener('click',e=>{ if(!state.paused)return; e.stopPropagation(); openCallout(Number(b.dataset.callout)); }));
  $('pause-button').addEventListener('click',()=>setPaused(!state.paused));

  // ---- Panel zoom / putar / geser: tahan tombol untuk bergerak terus, tanpa klik berulang.
  let vpMode='rotate', vpGoal=null, vpLast=0;
  function vpStep(act) {
    const now=performance.now();
    if(!vpGoal || now-vpLast>600) { try { const o=viewer.getCameraOrbit(), t=viewer.getCameraTarget(); vpGoal={th:o.theta,ph:o.phi,r:o.radius,x:t.x,y:t.y,z:t.z}; } catch { return; } }
    vpLast=now;
    const g=vpGoal, k=.05;
    if(act==='zin') g.r=Math.max(.26,g.r*.96);
    else if(act==='zout') g.r=Math.min(3.2,g.r*1.04);
    else if(vpMode==='rotate') {
      if(act==='left') g.th-=k; if(act==='right') g.th+=k;
      if(act==='up') g.ph=Math.max(.15,g.ph-k); if(act==='down') g.ph=Math.min(1.5,g.ph+k);
    } else {
      const d=g.r*.02, rx=Math.cos(g.th), rz=-Math.sin(g.th), ux=-Math.cos(g.ph)*Math.sin(g.th), uy=Math.sin(g.ph), uz=-Math.cos(g.ph)*Math.cos(g.th);
      const sx=act==='left'?-1:act==='right'?1:0, sy=act==='up'?1:act==='down'?-1:0;
      g.x=Math.max(-.7,Math.min(.7,g.x+(rx*sx+ux*sy)*d)); g.y=Math.max(-.1,Math.min(.6,g.y+uy*sy*d)); g.z=Math.max(-.7,Math.min(.7,g.z+(rz*sx+uz*sy)*d));
    }
    viewer.cameraOrbit=`${g.th}rad ${g.ph}rad ${g.r}m`; viewer.cameraTarget=`${g.x}m ${g.y}m ${g.z}m`;
  }
  let vpTimer=null;
  const vpStop=()=>{ clearInterval(vpTimer); vpTimer=null; document.querySelectorAll('#view-pad .hold').forEach(b=>b.classList.remove('hold')); };
  document.querySelectorAll('#view-pad .vp-mode button').forEach(b=>b.addEventListener('click',()=>{
    vpMode=b.dataset.mode; document.querySelectorAll('#view-pad .vp-mode button').forEach(x=>x.classList.toggle('active',x===b));
  }));
  document.querySelectorAll('#view-pad [data-act]').forEach(b=>{
    b.addEventListener('pointerdown',e=>{
      e.preventDefault(); const act=b.dataset.act;
      if(act==='reset') {
        vpGoal=null;
        if(state.paused) { const sv=scanView(); viewer.cameraOrbit=sv.orbit; viewer.cameraTarget=sv.target; } else resetView();
        return;
      }
      b.classList.add('hold'); vpStep(act); vpStop(); b.classList.add('hold'); vpTimer=setInterval(()=>vpStep(act),45);
    });
    for(const ev of ['pointerup','pointerleave','pointercancel']) b.addEventListener(ev,vpStop);
  });

  $('mode-button').addEventListener('click',()=>setTransparent(!state.transparent));
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
  $('close-part').addEventListener('click',()=>{ if(state.callout>=0) closeCallout(); else resetView(); });
  viewer.addEventListener('camera-change',positionPartCard);
  window.addEventListener('resize',positionPartCard);
  viewer.addEventListener('load',()=>{
    state.modelReady=true;
    if(viewer.availableAnimations?.includes('LidMotion')) {
      applyLidPose(state.lidProgress);
    }
    updateModelMaterials();
    showBeam(false);resetView();updateControls();
  });
  viewer.addEventListener('error',()=>{status('Model belum termuat. Periksa berkas spectrophotometer.glb dan jalankan melalui server lokal.');});
  document.querySelectorAll('.software-tabs button').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  $('mode-abs').addEventListener('click',()=>{state.mode='abs';updateControls();});
  $('mode-t').addEventListener('click',()=>{state.mode='t';updateControls();});
  const moveCursor=event=>{
    if(!state.currentScan)return;
    const rect=$('spectrum-chart').getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*420;
    const [start,end]=ranges[state.range];
    state.wavelength=Math.round((start+Math.max(0,Math.min(1,(x-38)/370))*(end-start))*2)/2;
    drawSpectrum();
  };
  $('chart-hit').addEventListener('pointerdown',event=>{event.target.setPointerCapture(event.pointerId);moveCursor(event);});
  $('chart-hit').addEventListener('pointermove',event=>{if(event.buttons)moveCursor(event);});
  $('clear-history').addEventListener('click',()=>{state.history=[];state.currentScan=null;state.lastResult=null;updateFormula(null);saveHistory();drawSpectrum();drawCalibration();drawHistory();});
  applyMassOverrides();makeSolutions();saveHistory();updateControls();drawSpectrum();drawCalibration();drawHistory();
})();
