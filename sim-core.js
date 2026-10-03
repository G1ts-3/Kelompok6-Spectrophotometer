/* Small, deterministic teaching model. The numbers are illustrative, not analytical data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UVVisCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const standards = [0, 5, 10, 15, 20, 25].map(ppm => ({
    id: `std-${ppm}`, name: `Standar ${ppm} ppm`, family: 'standar', ppm,
    color: '#dcedf4', alpha: .5, peaks: [[246, ppm * .0218, 23]],
  }));
  const samples = [
    {id:'presisi-1', name:'Presisi 1', family:'sampel', ppm:12.0, weight:0.050, color:'#dcedf4', alpha:.5, peaks:[[246,.262,24]]},
    {id:'presisi-2', name:'Presisi 2', family:'sampel', ppm:12.1, weight:0.050, color:'#dcedf4', alpha:.5, peaks:[[246,.264,24]]},
    {id:'presisi-3', name:'Presisi 3', family:'sampel', ppm:12.2, weight:0.050, color:'#dcedf4', alpha:.5, peaks:[[246,.266,24]]},
    {id:'presisi-4', name:'Presisi 4', family:'sampel', ppm:12.3, weight:0.050, color:'#dcedf4', alpha:.5, peaks:[[246,.268,24]]},
    {id:'presisi-5', name:'Presisi 5', family:'sampel', ppm:12.4, weight:0.050, color:'#dcedf4', alpha:.5, peaks:[[246,.270,24]]},
    {id:'akurasi', name:'Akurasi', family:'sampel', ppm:12.4, weight:0.050, color:'#dcedf4', alpha:.5, peaks:[[246,.272,24],[294,.045,32]]}
  ];
  const sample = samples[5];
  const others = [
    ['Kalium permanganat','#ad79b9',525,.76],['Biru metilen','#75a9d7',664,.82],
    ['Metil jingga','#efad6b',464,.60],['Metil merah','#e89491',525,.55],
    ['Kristal violet','#b193c9',590,.72],['Riboflavin','#eed073',445,.64],
    ['Klorofil a','#87b88a',663,.55],['Klorofil b','#a4c883',645,.51],
    ['Kafein','#e3eff4',273,.34],['Asam benzoat','#e3eff4',230,.40],
    ['Asam salisilat','#e3eff4',298,.46],['Natrium dikromat','#efbf88',350,.67],
    ['Tembaga sulfat','#a9c9de',800,.42],['Kobalt klorida','#d9a3ba',510,.40],
    ['Nikel sulfat','#aed0ab',720,.39],['Besi(III) klorida','#ddb778',420,.58],
    ['Fenolftalein','#dba4c1',552,.59],['Eosin Y','#eba1a3',517,.68],
    ['Tartrazin','#eed377',428,.55],['Allura Red','#e8998d',504,.61],
    ['Brilliant Blue','#83a6d5',630,.66],['Indigo karmin','#86a7d0',610,.62],
    ['Fluorescein','#e9d878',490,.72],['Pewarna ungu','#b8a3d1',565,.54],
    ['Pewarna hijau','#94c5ac',635,.49],['Pewarna biru','#8dbbdc',615,.51],
    ['Ekstrak kunyit','#eec279',425,.48],['Ekstrak teh','#c8a779',380,.43],
    ['Ekstrak bit','#d69aab',535,.57],['Ekstrak rosela','#d7a4b4',520,.53],
  ].map(([name,color,center,height],i) => ({id:`other-${i}`,name,family:'lainnya',color,
    peaks:[[center,height,center>700?65:38]]}));
  others.forEach(o=>{ if(o.color==='#e3eff4') o.alpha=.45; });
  const solutions = [
    {id:'aquades',name:'Aquades',family:'blanko',color:'#e3f2f7',alpha:.45,peaks:[]},
    ...standards, ...samples, ...others,
  ];

  function gaussian(x, center, width) {
    return Math.exp(-.5 * Math.pow((x-center)/width,2));
  }
  function absorbance(solution, nm, noise = 0) {
    if (!solution || solution.id === 'aquades') return 0;
    let result = .004;
    for (const [peak,height,width] of solution.peaks) result += height * gaussian(nm,peak,width);
    return Math.max(0, result + noise);
  }
  function transmittance(abs) { return Math.pow(10,-abs)*100; }
  function spectrum(solution, start, end, step = 4) {
    const points = [];
    for (let nm=start; nm<=end; nm+=step) points.push({nm,abs:absorbance(solution,nm)});
    if (points.at(-1).nm !== end) points.push({nm:end,abs:absorbance(solution,end)});
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
  return {solutions,standards,samples,sample,absorbance,transmittance,spectrum,regression};
});
