/* Measured A at λmax comes from the supplied workbook. The Gaussian shape
   outside that point is a teaching illustration, not measured spectral data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UVVisCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const datasets = {
    praktikum: {
      label:'Standar/Sampel 1', peakNm:246.5, sourcePeakNm:246.5,
      series:'Seri 246,5 nm', sampleMass:'≈0,005 g',
      standards:[.002,.212,.402,.620,.811,1.035],
      samples:[.672,.664,.575,.609,.584,.864],
      weights:[.0053,.0051,.005,.005,.0051,.0057],
    },
    jena: {
      label:'Standar/Sampel 2', peakNm:248, sourcePeakNm:248,
      series:'Seri 248,0 nm', sampleMass:'≈0,010 g',
      standards:[.0029,.2032,.3541,.5373,.6999,.8788],
      samples:[1.2434,1.1572,1.0936,1.0851,1.1759,1.2986],
      weights:[.01,.01,.01,.01,.0104,.01],
    },
  };
  let datasetKey='praktikum';
  const standards = [0, 5, 10, 15, 20, 25].map(ppm => ({
    id:`std-${ppm}`,name:`Standar ${ppm} ppm`,family:'standar',ppm,
    color:'#dcedf4',alpha:.5,peaks:[],
  }));
  const samples = ['Presisi 1','Presisi 2','Presisi 3','Presisi 4','Presisi 5','Akurasi'].map((name,i)=>({
    id:i===5?'akurasi':`presisi-${i+1}`,name,family:'sampel',
    color:'#dcedf4',alpha:.5,peaks:[],weight:0,
  }));
  const sample = samples[5];
  const solutions = [
    {id:'aquades',name:'Aquades',family:'blanko',color:'#e3f2f7',alpha:.45,peaks:[]},
    ...standards, ...samples,
  ];
  function setDataset(key) {
    if (!(key in datasets)) return false;
    datasetKey=key;
    const data=datasets[key];
    standards.forEach((s,i)=>{s.targetAbs=data.standards[i];s.peaks=[[data.peakNm,Math.max(0,s.targetAbs-.002),23]];});
    samples.forEach((s,i)=>{s.targetAbs=data.samples[i];s.peaks=[[data.peakNm,Math.max(0,s.targetAbs-.002),24]];s.weight=data.weights[i];});
    return true;
  }
  setDataset(datasetKey);

  function gaussian(x, center, width) {
    return Math.exp(-.5 * Math.pow((x-center)/width,2));
  }
  function absorbance(solution, nm, noise = 0) {
    if (!solution || solution.id === 'aquades') return 0;
    // Manual data is an explicitly supplied reading at λmax. Only the shape
    // around that point is generated, so the input is not mistaken for a scan.
    if (Number.isFinite(solution.manualAbs) && solution.manualAbs >= 0) {
      const baseline=Math.min(.002,solution.manualAbs);
      return Math.max(0,baseline+(solution.manualAbs-baseline)*gaussian(nm,datasets[datasetKey].peakNm,24)+noise);
    }
    let result = .002;
    for (const [peak,height,width] of solution.peaks) result += height * gaussian(nm,peak,width);
    return Math.max(0, result + noise);
  }
  function transmittance(abs) { return Math.pow(10,-abs)*100; }
  function spectrum(solution, start, end, step = 4) {
    const points = [];
    for (let nm=start; nm<=end; nm+=step) points.push({nm,abs:absorbance(solution,nm)});
    if (points.at(-1).nm !== end) points.push({nm:end,abs:absorbance(solution,end)});
    const peak=datasets[datasetKey].peakNm;
    if (peak>=start && peak<=end && !points.some(p=>p.nm===peak)) {
      points.push({nm:peak,abs:absorbance(solution,peak)});
      points.sort((a,b)=>a.nm-b.nm);
    }
    return points;
  }
  function regression(points) {
    if (points.length < 2) return null;
    const n=points.length, sx=points.reduce((s,p)=>s+p.ppm,0), sy=points.reduce((s,p)=>s+p.abs,0);
    const sxx=points.reduce((s,p)=>s+p.ppm*p.ppm,0), sxy=points.reduce((s,p)=>s+p.ppm*p.abs,0);
    const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx);
    if (!Number.isFinite(slope) || Math.abs(slope)<1e-10) return null;
    const intercept=(sy-slope*sx)/n, mean=sy/n;
    const ssTotal=points.reduce((s,p)=>s+(p.abs-mean)**2,0);
    const ssError=points.reduce((s,p)=>s+(p.abs-(slope*p.ppm+intercept))**2,0);
    return {slope,intercept,r2:ssTotal ? Math.max(0,1-ssError/ssTotal) : 1};
  }
  return {solutions,standards,samples,sample,datasets,setDataset,
    get datasetKey(){return datasetKey;},get peakNm(){return datasets[datasetKey].peakNm;},
    absorbance,transmittance,spectrum,regression};
});
