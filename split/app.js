(function(){
const $q = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = CP.$;
const wait = ms => new Promise(r=>setTimeout(r, reduced?Math.min(ms,80):ms));

/* ---------- Integrations (mocked adapters) ---------- */
const basiq = {
  // Real version: Basiq Consumer Data Right consent flow, then GET /users/{id}/transactions for the consented accounts.
  async connectAustralianAccounts(){ await wait(900); return {provider:'Basiq',bank:'Harbourside Bank',accounts:['Everyday ••4471','Goal Saver ••9902'],transactions:CP.generateAU()}; }
};
const yodlee = {
  // Real version: Yodlee FastLink via India's Account Aggregator network, consent artefact, then fetch FI data for SBI Savings ••2208.
  async connectOverseasAccounts(){ await wait(1100); return {provider:'Yodlee',bank:'State Bank of India',accounts:['Savings ••2208'],currency:'INR',transactions:CP.generateIN()}; }
};
const tiimely = {
  // Real version: the lender's serviceability calculator. Here the calculation runs locally in the risk engine.
  checkServiceability(scenario, financials){ return CP.risk(financials, scenario); },
  // Real version: POST the risk profile into the lender's decisioning system.
  async sendRiskProfile(profile){ await wait(900); return {status:'received',lender:'Southgate Home Loans',reference:'TMLY-'+profile.applicant.ref.slice(3)+'-0924'}; }
};

/* ---------- State ---------- */
const S = { step:1, reached:1, au:null, india:null, A:null, R:null, sc:{price:550000,deposit:110000,rate:6}, run:0, lastOverall:null };
const STEPS = ['Applicant','Connect','Analyse','Risk report','Send to lender'];
function renderSteps(){
  $q('#steps').innerHTML = STEPS.map((s,i)=>{const n=i+1,cur=n===S.step,done=n<S.reached&&!cur;
    return `<li><button data-step="${n}" ${cur?'aria-current="step"':''} class="${done?'done':''}" ${(n>S.reached||n===3)&&!cur?'disabled':''}><i>${n}</i><span>${s}</span></button></li>`;}).join('');
}
function go(n){
  if(n>=3 && !S.au){ n=2; }
  if(n===4 && !S.A){ n=3; }
  S.step=n; S.reached=Math.max(S.reached,n);
  for(let i=1;i<=5;i++) $q('#s'+i).hidden = i!==n;
  renderSteps(); window.scrollTo({top:0,behavior:'auto'});
  if(n===3) startAnalyse();
  if(n===4) renderReport(false);
  if(n===5) renderSend();
}
document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]'); if(g){go(+g.dataset.go);return;}
  const s=e.target.closest('[data-step]'); if(s&&!s.disabled) go(+s.dataset.step);
});
const toast = msg => { const t=$q('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('show'),2400); };

/* ---------- 2 Connect ---------- */
$q('#au-connect').addEventListener('click', async ()=>{
  $q('#au-status').innerHTML='<div class="status muted">Connecting to Harbourside Bank…</div>';
  const r = await basiq.connectAustralianAccounts(); S.au=r.transactions; S.A=null;
  $q('#au-status').innerHTML=`<div class="status ok"><svg class="ico"><use href="#i-check"/></svg>Connected · ${S.au.length.toLocaleString('en-AU')} transactions</div>`;
  $q('#to-analyse').disabled=false;
});
function inButton(){ $q('#in-status').innerHTML='<button class="btn ghost" id="in-connect">Connect State Bank of India</button>'; $q('#in-connect').addEventListener('click', connectIndia); }
async function connectIndia(){
  $q('#in-status').innerHTML='<div class="status muted">Connecting through Account Aggregator…</div>';
  const r = await yodlee.connectOverseasAccounts(); S.india=r.transactions; S.A=null;
  $q('#in-status').innerHTML=`<div class="status ok"><svg class="ico"><use href="#i-check"/></svg>Connected · ${S.india.length} transactions <button class="btn ghost" id="in-remove" style="margin-left:auto;min-height:44px">Disconnect</button></div>`;
  $q('#in-remove').addEventListener('click',()=>{S.india=null;S.A=null;inButton();toast('State Bank of India disconnected');});
}
$q('#in-connect').addEventListener('click', connectIndia);
$q('#to-analyse').addEventListener('click',()=>go(3));

/* ---------- 3 Analyse ---------- */
const CAT_LABEL = {salary:'Salary',rent:'Rent',bill_share:'Bill share',bill:'Bill',savings_transfer:'Savings',family_support:'Family support',own_funds_overseas:'Own funds from overseas',bnpl:'Pay later',one_off_personal:'One-off, not rent',everyday:'Everyday spending',gambling:'Gambling',other:'Other'};
function labelSource(){ return new URLSearchParams(location.search).get('demo')==='offline' ? 'fallback' : 'fallback'; }
async function startAnalyse(){
  const token=++S.run;
  const tx = S.india ? S.au.concat(S.india) : S.au;
  const groups = CP.buildGroups(tx);
  // AI call would go here (POST /api/label). This prototype uses the saved response.
  const labels = CP.FALLBACK_LABELS, source = labelSource();
  $q('#src-badge').textContent = source==='live' ? 'Live AI' : 'Offline backup';
  $q('#an-rows').innerHTML=''; $q('#to-report').disabled=true;
  const total=tx.length, dur=reduced?0:1600, t0=performance.now();
  await new Promise(res=>{ const tick=now=>{ if(token!==S.run) return; const p=dur?Math.min(1,(now-t0)/dur):1; $q('#an-bar').style.width=(p*100)+'%'; $q('#an-title').textContent=`Reading ${Math.round(p*total).toLocaleString('en-AU')} transactions`; p<1?requestAnimationFrame(tick):res(); }; requestAnimationFrame(tick); });
  if(token!==S.run) return;
  $q('#an-title').textContent=`${total.toLocaleString('en-AU')} transactions in ${groups.length} payee groups`;
  const order = groups.slice().sort((a,b)=>(b.group.startsWith('PAYID')?1:0)-(a.group.startsWith('PAYID')?1:0));
  for(const g of order){
    if(token!==S.run) return;
    const [cat,why] = labels[g.group]||['other','No saved label'];
    const amt = g.india ? '₹'+Math.round(g.typical/CP.INR_AUD).toLocaleString('en-IN') : (g.min!==g.max && g.max/g.min>1.2 ? money(g.min)+'–'+money(g.max) : money(g.typical));
    const pattern = `${g.count}× · ${g.interval} · ${amt}${g.notes.length?' · notes: '+g.notes.map(n=>'"'+esc(n)+'"').join(', '):''}`;
    const tr=document.createElement('tr'); tr.className='reveal'+(g.group.startsWith('PAYID')?' show':'');
    const lvl = cat==='one_off_personal'?'moderate':cat==='gambling'?'high':'low';
    tr.innerHTML=`<td class="payee">${esc(g.group)}${g.india?' <span class="chip mock">India</span>':''}</td><td class="num">${pattern}</td><td><span class="chip ${cat==='rent'?'violet':lvl==='moderate'?'moderate':'grey'}">${CAT_LABEL[cat]}</span></td><td>${esc(why)}</td>`;
    $q('#an-rows').appendChild(tr);
    await wait(170);
  }
  S.A = CP.analyse(S.au, S.india, labels);
  $q('#to-report').disabled=false;
  await wait(1400);
  if(token===S.run && S.step===3) go(4);
}
$q('#to-report').addEventListener('click',()=>{ if(S.A){ S.run++; go(4);} });

/* ---------- 4 Report ---------- */
const sl = {price:$q('#sl-price'),dep:$q('#sl-dep'),rate:$q('#sl-rate')};
function readSliders(){
  let price=+sl.price.value, dep=+sl.dep.value, rate=+sl.rate.value;
  if(dep>price*0.9){ dep=Math.floor(price*0.9/5000)*5000; sl.dep.value=dep; }
  S.sc={price,deposit:dep,rate};
}
Object.values(sl).forEach(x=>x.addEventListener('input',()=>{ readSliders(); renderReport(true); }));
const LVL = {low:'Low',moderate:'Moderate',high:'High'};
const overallTone = o => o==='Low risk'?'low':o==='Higher risk'?'high':'moderate';
function shortSummary(R){
  const attn=R.factors.filter(f=>f.level!=='low').map(f=>({service:'repayments at the assessment rate',shock:'the jump in monthly payments',buffer:'savings left after buying',income:'income stability',housing:'rent history',debts:'existing debts',conduct:'account conduct',history:'how much history can be verified'})[f.key]);
  const lead = attn.length ? `Main things to watch: ${listJoin(attn)}.` : 'No factor needs attention.';
  return `${lead} Every week of rent and every pay day is accounted for${S.india?', across 5.7 years of verified history':''}.`;
}
function listJoin(a){ return a.length<=1?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]; }
function factorHTML(f,isOpen,big){
  let table='';
  if(f.table) table=`<div class="tablewrap"><table><thead><tr>${f.table.head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${f.table.rows.map(r=>`<tr>${r.map((c,i)=>`<td${i>0?' class="num"':''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if(f.rows) table=`<div class="tablewrap"><table><thead><tr><th>Date</th><th>Payee</th><th>Amount</th><th>Status</th></tr></thead><tbody>${f.rows.map(r=>`<tr class="${r[4]?'late':''}"><td class="num" style="white-space:nowrap">${r[0]}</td><td>${esc(r[1])}</td><td class="num" style="white-space:nowrap">${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="factor${big?' big':''}"><button aria-expanded="${isOpen}" data-key="${f.key}" aria-controls="ev-${f.key}">
    <span class="lvl ${f.level}" aria-hidden="true"></span>
    <span style="display:flex;flex-direction:column;gap:2px"><span class="fname">${f.name}</span>${big?`<span class="ffind num">${esc(f.finding)}</span>`:''}</span>
    <span style="display:flex;gap:10px;align-items:center"><span class="chip ${f.level}">${LVL[f.level]}</span><svg class="ico chev"><use href="#i-chev"/></svg></span>
  </button><div class="ev" id="ev-${f.key}" ${isOpen?'':'hidden'}>${big?'':`<p><b>${esc(f.finding)}</b></p>`}<p class="muted">${esc(f.why)}</p>${table}</div></div>`;
}
function renderReport(fromSlider){
  if(!S.A) return;
  S.R = tiimely.checkServiceability(S.sc, S.A);
  const R=S.R, sc=S.sc;
  $q('#o-price').textContent=money(sc.price); $q('#o-dep').textContent=money(sc.deposit)+' ('+Math.round(sc.deposit/sc.price*100)+'%)'; $q('#o-rate').textContent=sc.rate.toFixed(1)+'%';
  $q('#kv').innerHTML=`Loan <b>${money(R.loan)}</b> · repayments <b>${money(R.repActual)}</b> a month · <b>${Math.round(R.sRatio*100)}%</b> of take-home pay when tested at ${R.assessRate.toFixed(1)}%`;
  $q('#r-srcs').innerHTML=`<span class="src">Harbourside Bank · Basiq (mocked)</span>`+(S.india?`<span class="src">State Bank of India · Yodlee (mocked)</span>`:`<span class="src off">India not connected</span>`);
  const ov=$q('#overall'), tone=overallTone(R.overall);
  ov.className='scorebox '+tone;
  $q('#sc-num').textContent=R.score; $q('#sc-rating').textContent=R.overall; $q('#sc-marker').style.left=R.score+'%';
  if(fromSlider && S.lastOverall && S.lastOverall!==R.overall){ ov.classList.remove('pulse'); void ov.offsetWidth; ov.classList.add('pulse'); }
  S.lastOverall=R.overall;
  const target = Math.floor(R.maxPrice/5000)*5000;
  if(R.loan>R.maxLoan){
    $q('#lever-text').innerHTML=`To lower the risk: a property around <b>${money(target)}</b> keeps repayments under 40% of take-home pay.`;
    $q('#lever-btn').hidden=false; $q('#lever-btn').textContent=`Try ${money(target)}`; $q('#lever-btn').dataset.price=target;
  } else {
    $q('#lever-text').innerHTML=`Repayments stay under 40% of take-home pay at the assessment rate.`;
    $q('#lever-btn').hidden=true;
  }
  $q('#summary').textContent = shortSummary(R);
  const open = new Set([...document.querySelectorAll('.factor [aria-expanded="true"]')].map(b=>b.dataset.key));
  const attn=R.factors.filter(f=>f.level!=='low'), good=R.factors.filter(f=>f.level==='low');
  $q('#attn-sec').hidden=!attn.length;
  $q('#attn-title').textContent=`Needs attention (${attn.length})`;
  $q('#good-title').textContent=`Looking good (${good.length})`;
  $q('#factors-attn').innerHTML=attn.map(f=>factorHTML(f,open.has(f.key),true)).join('');
  $q('#factors-good').innerHTML=good.map(f=>factorHTML(f,open.has(f.key),false)).join('');
}
document.querySelector('#s4').addEventListener('click',e=>{
  const b=e.target.closest('.factor > button'); if(!b) return;
  const ev=$q('#ev-'+b.dataset.key), open=ev.hidden; ev.hidden=!open; b.setAttribute('aria-expanded',open);
});
$q('#lever-btn').addEventListener('click',e=>{ sl.price.value=e.currentTarget.dataset.price; readSliders(); renderReport(true); });

/* ---------- 5 Send ---------- */
function profile(){
  const R=S.R, sc=S.sc;
  return {
    applicant:{name:'Priya Sharma',ref:'CP-7Q4K',occupation:'Registered nurse',residency:'Permanent resident'},
    generated:'2026-09-24',
    overall:R.overall,
    riskScore:{value:R.score,outOf:100,note:'Lower is safer'},
    factors:R.factors.map(f=>({name:f.name,level:f.level,finding:f.finding})),
    scenario:{price:sc.price,deposit:sc.deposit,rate:sc.rate,loan:R.loan,assessmentRate:R.assessRate,repaymentAtAssessmentRate:Math.round(R.repAssess),shareOfTakeHome:Math.round(R.sRatio*100)/100},
    verifiedHistory:[{source:'Harbourside Bank via Basiq (CDR)',period:'2025-04 to 2026-09'}].concat(S.india?[{source:'State Bank of India via Yodlee (Account Aggregator)',period:'2021-01 to 2025-02'}]:[]),
    privacy:{everydaySpendingShared:false,housemateName:'hidden',rawDataRetained:false}
  };
}

function lenderView(){
  const A=S.A, R=S.R, sc=S.sc;
  const tone={low:'#2C7A52',moderate:'#A4520F',high:'#B23A3A'}, tint={low:'#E3F4EE',moderate:'#FFEBDC',high:'#FBE3E1'};
  const ov = overallTone(R.overall);
  const chip=l=>`<span class="lchip" style="background:${tint[l]};color:${tone[l]}">${LVL[l]}</span>`;
  const row=f=>`<div class="frow"><span class="dot" style="background:${tone[f.level]}"></span><div class="ft"><b>${f.name}</b><span>${esc(f.finding)}</span></div>${chip(f.level)}</div>`;
  const attn=R.factors.filter(f=>f.level!=='low'), good=R.factors.filter(f=>f.level==='low');
  const logo=`<svg width="30" height="38" viewBox="0 0 44 56" aria-hidden="true"><rect width="44" height="56" rx="7" fill="#173B45"/><path d="M7.5 4v48" stroke="#2E5A63" stroke-width="1.5"/><circle cx="25" cy="23" r="11" fill="none" stroke="#E8EEEA" stroke-width="3.5"/><path d="M19.5 23.5l4.5 4.5 9.5-12" fill="none" stroke="#F59E5B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 40h21M16 46h13" stroke="#4F7A83" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const lock=`<svg class="ic" viewBox="0 0 24 24" stroke="#0E7490"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  const alert=`<svg class="ic" viewBox="0 0 24 24" stroke="#A4520F"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>`;
  const info=`<svg class="ic" viewBox="0 0 24 24" stroke="#56636A"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/></svg>`;
  const sPct=Math.round(R.sRatio*100), sTone=R.sRatio<0.4?tone.low:R.sRatio<=0.5?tone.moderate:tone.high;
  return `<div class="top"><div class="lmark">SH</div><span class="lname">Southgate Home Loans</span><span class="sep">/</span><span>Application review</span>
  <div class="right"><span>Application APP-20931</span><span>Received 24 Sep 2026, 10:42</span><span>Assessor: J. Tran</span></div></div>
  <div class="grid">
   <div class="col">
    <div class="lcard"><div class="lbl">Applicant</div><h2 style="font-size:30px;margin-top:4px">Priya Sharma</h2><div style="color:#56636A">Registered nurse · permanent resident</div>
     <dl><dt>Property</dt><dd>${money(sc.price)}</dd><dt>Deposit</dt><dd>${money(sc.deposit)} (${Math.round(sc.deposit/sc.price*100)}%)</dd><dt>Loan requested</dt><dd>${money(R.loan)}</dd><dt>Rate</dt><dd>${sc.rate.toFixed(2)}%, 30 years</dd></dl></div>
    <div class="lcard"><div class="lbl">Serviceability</div><div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><b class="d" style="font-size:44px;color:${sTone}">${sPct}%</b><span style="color:#56636A">of take-home pay at ${R.assessRate.toFixed(1)}%</span></div>
     <dl><dt>Repayment, tested</dt><dd>${money(R.repAssess)}/mo</dd><dt>Repayment, actual rate</dt><dd>${money(R.repActual)}/mo</dd><dt>Verified take-home</dt><dd>${money(A.takeHome)}/mo</dd></dl>
     <div style="margin-top:16px;background:#ECE9FF;color:#3E329A;border-radius:12px;padding:12px 14px;font-size:16px">A loan up to ${money(Math.floor(R.maxLoan/1000)*1000)} keeps repayments under 40%.</div></div>
   </div>
   <div class="cp">
    <div class="cphead">${logo}<h2>Credit Passport risk profile</h2><span class="ver"><svg class="ic" viewBox="0 0 24 24" stroke="#2C7A52"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5.5-6"/></svg>Bank-sourced · ${S.india?'5.7 years':'18 months'}</span></div>
    <div class="hero"><div><div class="bignum" style="color:${tone[ov]}">${R.score}</div><div class="of">out of 100 risk score</div></div>
     <div><div class="lrating" style="color:${tone[ov]}">${R.overall}</div><div class="lscale"><span class="mk" style="left:${R.score}%"></span></div><div class="sl"><span>Lower risk</span><span>Higher risk</span></div>
     <div class="lsrcs"><span class="lsrc">Harbourside Bank · Consumer Data Right</span>${S.india?'<span class="lsrc">State Bank of India · Account Aggregator</span>':''}</div></div></div>
    ${attn.length?`<div class="fsec2"><h3>Needs attention (${attn.length})</h3>${attn.map(row).join('')}</div>`:''}
    <div class="fsec2" style="padding-bottom:18px"><h3>Looking good (${good.length})</h3>${good.map(row).join('')}</div>
   </div>
   <div class="col">
    <div class="lcard"><h3 style="font-size:21px">Worth knowing</h3><ul>
     <li>${alert}1 bill paid 4 days late, May 2025</li><li>${alert}1 pay-later plan, fully repaid</li><li>${info}${money(A.familyMonthly)} a month to family, counted as an expense</li></ul></div>
    <div class="lcard"><h3 style="font-size:21px">Not shared with you</h3><ul style="color:#3F4C52">
     <li>${lock}Individual everyday purchases</li><li>${lock}The housemate's name</li><li>${lock}Raw bank data (deleted after the profile was built)</li></ul></div>
    <div style="display:flex;flex-direction:column;gap:12px"><div class="lbtn p">Add profile to assessment</div><div class="lbtn g">Ask the applicant a question</div></div>
   </div>
  </div>
  <div class="foot">Mock lender view. Made-up people, banks and data.</div>`;
}
function fitLender(){ const w=$q('#lvwrap'); if(w&&w.clientWidth) $q('#lv').style.transform=`scale(${w.clientWidth/1920})`; }
window.addEventListener('resize', fitLender);
function renderSend(){
  if(!S.R){ if(S.A){ S.R=tiimely.checkServiceability(S.sc,S.A);} else return; }
  $q('#flow-in').className = 'node'+(S.india?'':' off');
  $q('#flow-in').innerHTML = S.india ? '<b>Yodlee</b><span class="muted small">State Bank of India</span>' : '<b>Yodlee</b><span class="small">Not connected</span>';
  const R=S.R;
  $q('#receives').innerHTML=[
    `<b>${R.overall}, risk score ${R.score} out of 100</b>, with all 8 factors`,
    `Verified history: ${S.india?'5.7 years, Australia and India':'18 months, Australia only'}`,
    `Loan scenario: ${money(S.sc.price)} price, ${money(S.sc.deposit)} deposit, ${S.sc.rate.toFixed(1)}% rate`,
    `Serviceability result: ${Math.round(R.sRatio*100)}% of take-home pay at ${R.assessRate.toFixed(1)}%`
  ].map(t=>`<li><svg class="ico" style="color:var(--low)"><use href="#i-check"/></svg><span>${t}</span></li>`).join('');
  $q('#payload').textContent = JSON.stringify(profile(), null, 2);
  $q('#lv').innerHTML = lenderView(); requestAnimationFrame(fitLender);
  $q('#sent').hidden=true; $q('#send').disabled=false; $q('#send').textContent='Send risk profile to lender';
}
$q('#send').addEventListener('click', async ()=>{
  const b=$q('#send'); b.disabled=true; b.textContent='Sending…';
  const res = await tiimely.sendRiskProfile(profile());
  b.textContent='Sent';
  $q('#sent-text').textContent=`Received by ${res.lender} (mock) · ref ${res.reference}`; $q('#sent').hidden=false;
  toast('Sent to lender (mock)');
});
$q('#restart').addEventListener('click',()=>{
  S.run++; Object.assign(S,{step:1,reached:1,au:null,india:null,A:null,R:null,sc:{price:550000,deposit:110000,rate:6},lastOverall:null});
  sl.price.value=550000; sl.dep.value=110000; sl.rate.value=6;
  $q('#au-status').innerHTML='<button class="btn" id="au-connect">Connect Harbourside Bank</button>';
  $q('#au-connect').addEventListener('click', async ()=>{
    $q('#au-status').innerHTML='<div class="status muted">Connecting to Harbourside Bank…</div>';
    const r = await basiq.connectAustralianAccounts(); S.au=r.transactions; S.A=null;
    $q('#au-status').innerHTML=`<div class="status ok"><svg class="ico"><use href="#i-check"/></svg>Connected · ${S.au.length.toLocaleString('en-AU')} transactions</div>`;
    $q('#to-analyse').disabled=false;
  });
  inButton(); $q('#to-analyse').disabled=true;
  go(1);
});

renderSteps();
})();
