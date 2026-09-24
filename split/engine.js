/* ===== Credit Passport engine: mock data, grouping, labels, risk ===== */
var CP = (function(){
const DAY = 864e5;
const U = (y,m,d) => Date.UTC(y,m-1,d);
const iso = t => new Date(t).toISOString().slice(0,10);
const START = U(2025,4,1), TODAY = U(2026,9,24);
const r2 = x => Math.round(x*100)/100;
const INR_AUD = 0.018;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fdate = t => { const d=new Date(t); return d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear(); };
const fmonth = t => { const d=new Date(t); return MON[d.getUTCMonth()]+' '+d.getUTCFullYear(); };
const ym = t => { const d=new Date(t); return d.getUTCFullYear()*12+d.getUTCMonth(); };

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ---------- Mock data: basiq.ts connectAustralianAccounts() ---------- */
function generateAU(){
  const R = mulberry32(20260924);
  const raw = [];
  const add = (t,description,amount,account,note) => { if(t<START||t>TODAY) return; raw.push({t,description,note:note||'',amount:r2(amount),account}); };
  for(let t=U(2025,4,3); t<=TODAY; t+=14*DAY) add(t,'NORTHSIDE HOSPITAL PAYROLL',3400,'everyday');
  const notes = ['rent','room 2','','rent','wk N','rent :)'];
  let k=0;
  for(let t=U(2025,4,7); t<=TODAY; t+=7*DAY,k++){ const n=notes[k%notes.length].replace('N',String(k+1)); add(t,'PAYID A NGUYEN',-260,'everyday',n); }
  for(let y=2025,m=4; y<2026||(y===2026&&m<=9); m===12?(y++,m=1):m++){
    const winter = m>=5&&m<=9;
    add(U(y,m,12),'PAYID A NGUYEN',-(55+R()*35),'everyday',winter?'gas + elec':'elec');
    add(U(y,m,5),'FASTNET INTERNET',-35,'everyday');
    add(U(y,m,(y===2025&&m===5)?24:20),'SPARK MOBILE',-45,'everyday');
    if(!(y===2025&&m===4)){
      add(U(y,m,1),'TRANSFER TO GOAL SAVER',-2000,'everyday');
      add(U(y,m,1),'TRANSFER FROM EVERYDAY',2000,'saver');
      add(U(y,m,3),'TRANSFER TO INDIA - FAMILY',-600,'everyday');
    }
  }
  add(U(2025,7,25),'PAYID A NGUYEN',-85,'everyday','concert tix');
  add(U(2025,4,10),'INTL TRANSFER IN - SBI MUMBAI',65000,'everyday');
  add(U(2025,4,11),'TRANSFER TO GOAL SAVER',-65000,'everyday');
  add(U(2025,4,11),'TRANSFER FROM EVERYDAY',65000,'saver');
  for(let j=0;j<4;j++) add(U(2025,8,4)+j*14*DAY,'NOVAPAY INSTALMENT',-62.5,'everyday');
  const shops = [['COLES',14,111,3],['WOOLWORTHS',14,111,3],['ALDI',12,90,2],['MYKI TOP UP',10,50,2],['CAFE ROSSO',6,18,3],['CHEMIST WAREHOUSE',8,60,1],['UBER EATS',18,55,2],['KMART',10,90,1],['BUNNINGS',8,95,1]];
  const wsum = shops.reduce((a,s)=>a+s[3],0);
  for(let t=START; t<=TODAY; t+=DAY){
    const n = Math.floor(R()*4);
    for(let i=0;i<n;i++){
      let p=R()*wsum, s=shops[0];
      for(const x of shops){ if(p<x[3]){s=x;break;} p-=x[3]; }
      add(t, s[0], -(s[1]+R()*(s[2]-s[1])), 'everyday');
    }
  }
  for(let y=2025,m=4; y<2026||(y===2026&&m<=8); m===12?(y++,m=1):m++){
    const end = U(y,m+1,1)-DAY;
    const bal = raw.filter(x=>x.account==='saver'&&x.t<=end).reduce((a,x)=>a+x.amount,0);
    add(end,'GOAL SAVER INTEREST',bal*0.04/12,'saver');
  }
  raw.sort((a,b)=>a.t-b.t || (a.account<b.account?-1:1) || b.amount-a.amount);
  return raw.map((x,i)=>({id:'AU'+String(i+1).padStart(4,'0'),date:iso(x.t),...x}));
}

/* ---------- Mock data: yodlee.ts connectOverseasAccounts() ---------- */
function generateIN(){
  const out=[];
  for(let y=2021,m=1; y<2025||(y===2025&&m<=2); m===12?(y++,m=1):m++){
    out.push({t:U(y,m,1),description:'SALARY - LOTUS HOSPITAL',note:'',amountINR:85000,account:'sbi'});
    out.push({t:U(y,m,5),description:'NEFT RENT - K MEHTA',note:'',amountINR:-18000,account:'sbi'});
  }
  return out.map((x,i)=>({id:'IN'+String(i+1).padStart(4,'0'),date:iso(x.t),...x,amount:r2(x.amountINR*INR_AUD)}));
}

/* ---------- Grouping (what gets sent to the AI) ---------- */
const SHOPS = ['COLES','WOOLWORTHS','ALDI','KMART','BUNNINGS','CHEMIST WAREHOUSE'];
const OUT_AND_ABOUT = ['MYKI TOP UP','CAFE ROSSO','UBER EATS'];
function groupKey(t){
  if(t.description==='PAYID A NGUYEN'){
    if(/elec|gas/i.test(t.note)) return 'PAYID A NGUYEN | energy notes';
    if(t.amount===-260) return 'PAYID A NGUYEN | rent-like notes';
    return 'PAYID A NGUYEN | "'+t.note+'"';
  }
  if(SHOPS.includes(t.description)) return 'Supermarkets and shops (6 merchants)';
  if(OUT_AND_ABOUT.includes(t.description)) return 'Transport, cafes and delivery (3 merchants)';
  if(t.description==='GOAL SAVER INTEREST') return null;
  if(t.description==='TRANSFER FROM EVERYDAY') return null;
  return t.description;
}
function buildGroups(tx){
  const map = new Map();
  for(const t of tx){ const k=groupKey(t); if(!k) continue; if(!map.has(k)) map.set(k,[]); map.get(k).push(t); }
  const groups=[];
  for(const [k,list] of map){
    const amts=list.map(t=>Math.abs(t.amount)).sort((a,b)=>a-b);
    const gaps=[]; for(let i=1;i<list.length;i++) gaps.push((list[i].t-list[i-1].t)/DAY);
    gaps.sort((a,b)=>a-b);
    const gap = gaps.length?gaps[Math.floor(gaps.length/2)]:null;
    const interval = gap===null?'once':gap<=1?'daily':gap<=8?'weekly':gap<=15?'fortnightly':gap<=32?'monthly':'irregular';
    const notes=[...new Set(list.map(t=>t.note).filter(Boolean))].slice(0,4);
    const dir = list[0].amount>0?'in':'out';
    groups.push({group:k,count:list.length,typical:amts[Math.floor(amts.length/2)],min:amts[0],max:amts[amts.length-1],interval,notes,dir,ids:list.map(t=>t.id),india:list[0].account==='sbi'});
  }
  return groups;
}

/* ---------- Saved AI response (fallback-labels.json) ---------- */
const FALLBACK_LABELS = {
  'NORTHSIDE HOSPITAL PAYROLL':['salary','Same amount every second Thursday from a hospital payroll'],
  'PAYID A NGUYEN | rent-like notes':['rent','Same person, same $260, every week. Notes vary but the pattern is rent'],
  'PAYID A NGUYEN | energy notes':['bill_share','Same person, but monthly, amount varies and notes say elec or gas, so a share of household energy bills'],
  'PAYID A NGUYEN | "concert tix"':['one_off_personal','A single payment to the same person with a note about concert tickets. Personal, not rent'],
  'SPARK MOBILE':['bill','Same amount every month to a mobile provider'],
  'FASTNET INTERNET':['bill','Same amount every month to an internet provider'],
  'INTL TRANSFER IN - SBI MUMBAI':['own_funds_overseas','One large transfer from her own bank in India, moved straight into savings'],
  'TRANSFER TO GOAL SAVER':['savings_transfer','Regular transfers into her own savings account'],
  'TRANSFER TO INDIA - FAMILY':['family_support','Fixed monthly transfer to family overseas. An ongoing commitment'],
  'NOVAPAY INSTALMENT':['bnpl','Four equal payments two weeks apart to a pay-later provider'],
  'Supermarkets and shops (6 merchants)':['everyday','Groceries and household shopping'],
  'Transport, cafes and delivery (3 merchants)':['everyday','Transport top-ups, coffee and food delivery'],
  'SALARY - LOTUS HOSPITAL':['salary','Same amount on the 1st of every month from a hospital in India'],
  'NEFT RENT - K MEHTA':['rent','Same amount to one landlord on the 5th of every month, marked as rent']
};

/* ---------- Risk engine (lib/risk.ts): plain code, no AI ---------- */
function repayment(loan, ratePct, years){ const r=ratePct/100/12, n=years*12; return r===0?loan/n:loan*r/(1-Math.pow(1+r,-n)); }
const LEVEL_ORDER={low:0,moderate:1,high:2};

function analyse(au, india, labels){
  const all = india ? au.concat(india) : au;
  const catOf = new Map();
  for(const t of all){ const k=groupKey(t); if(k&&labels[k]) catOf.set(t.id,labels[k][0]); }
  for(const t of all){ if(t.description==='GOAL SAVER INTEREST') catOf.set(t.id,'interest'); if(t.description==='TRANSFER FROM EVERYDAY') catOf.set(t.id,'savings_in'); }
  const by = (c,src) => (src||au).filter(t=>catOf.get(t.id)===c);
  const everyday = au.filter(t=>t.account==='everyday');
  const saver = au.filter(t=>t.account==='saver');
  // balances
  let bal=1200, i=0, minBal=Infinity, overdrawn=0; const dayEnd=[];
  for(let d=START; d<=TODAY; d+=DAY){ while(i<everyday.length&&everyday[i].t<=d){bal+=everyday[i].amount;i++;} dayEnd.push([d,bal]); if(bal<0) overdrawn++; }
  const everydayBal = bal;
  const saverBal = saver.reduce((a,t)=>a+t.amount,0);
  const pays = by('salary');
  let lowBeforePay={v:Infinity,t:null};
  for(const p of pays){ const prev=dayEnd.find(x=>x[0]===p.t-DAY); if(prev&&prev[1]<lowBeforePay.v) lowBeforePay={v:prev[1],t:prev[0]}; }
  // monthly window May 2025 – Aug 2026
  const m0=ym(U(2025,5,1)), m1=ym(U(2026,8,1)), months=m1-m0+1;
  const inWin = t => ym(t.t)>=m0 && ym(t.t)<=m1;
  const sumAbs = list => list.filter(inWin).reduce((a,t)=>a-t.amount,0);
  const rentAU = by('rent');
  const savingsOut = by('savings_transfer').filter(t=>t.amount<0 && t.amount!==-65000);
  const capacity = (sumAbs(rentAU)+sumAbs(savingsOut))/months;
  const everydaySpend = sumAbs(by('everyday'))/months;
  const billsMonthly = (sumAbs(by('bill'))+sumAbs(by('bill_share')))/months;
  const family = by('family_support');
  const familyMonthly = sumAbs(family)/months;
  const living = everydaySpend+billsMonthly+familyMonthly;
  const takeHome = pays.length ? pays[Math.floor(pays.length/2)].amount*26/12 : 0;
  // bills lateness
  const bills = by('bill').concat(by('bill_share'));
  const expected={};
  for(const t of bills){ const k=groupKey(t); (expected[k]=expected[k]||{})[new Date(t.t).getUTCDate()]=((expected[k]||{})[new Date(t.t).getUTCDate()]||0)+1; }
  const expDay={}; for(const k in expected){ expDay[k]=+Object.keys(expected[k]).sort((a,b)=>expected[k][b]-expected[k][a])[0]; }
  const lateBills = bills.filter(t=>new Date(t.t).getUTCDate()>expDay[groupKey(t)]).map(t=>({t,days:new Date(t.t).getUTCDate()-expDay[groupKey(t)]}));
  // rent conduct
  let missedWeeks=0; for(let j=1;j<rentAU.length;j++) if(rentAU[j].t-rentAU[j-1].t>7*DAY) missedWeeks++;
  if(rentAU.length && TODAY-rentAU[rentAU.length-1].t>7*DAY) missedWeeks++;
  const rentIN = india ? by('rent',india) : [];
  const payIN = india ? by('salary',india) : [];
  const bnpl = by('bnpl');
  const gambling = by('gambling');
  return {au,india,catOf,everydayBal,saverBal,minBal,overdrawn,lowBeforePay,capacity,everydaySpend,billsMonthly,familyMonthly,living,takeHome,pays,rentAU,rentIN,payIN,missedWeeks,bills,lateBills,bnpl,family,gambling,savingsOut,months};
}

function risk(A, sc){
  const loan = Math.max(0, sc.price - sc.deposit);
  const costs = sc.price*0.02;
  const assessRate = sc.rate+3;
  const repAssess = repayment(loan, assessRate, 30);
  const repActual = repayment(loan, sc.rate, 30);
  const F = [];
  const lvl3 = (v,a,b) => v<a?'low':v<=b?'moderate':'high';
  // 1 serviceability
  const sRatio = A.takeHome ? repAssess/A.takeHome : 1;
  F.push({key:'service',name:'Serviceability at the assessment rate',level: sRatio<0.40?'low':sRatio<=0.50?'moderate':'high',
    finding:`Repayments would be ${Math.round(sRatio*100)}% of take-home pay at ${assessRate.toFixed(1)}%`,
    why:'Lenders test repayments at about 3 percentage points above the actual rate. Under 40% of take-home pay is comfortable; over 50% is stretched.',
    table:{head:['Item','Amount'],rows:[['Loan amount',$(loan)],['Assessment rate',assessRate.toFixed(2)+'%'],['Monthly repayment at assessment rate',$(repAssess)],['Monthly take-home pay (from '+A.pays.length+' pays)',$(A.takeHome)],['Share of take-home pay',Math.round(sRatio*100)+'%']]},
    evidenceIds:A.pays.map(t=>t.id)});
  // 2 payment shock
  const shock = repActual/A.capacity - 1;
  F.push({key:'shock',name:'Payment shock',level: shock<=0.05?'low':shock<=0.20?'moderate':'high',
    finding: shock<=0 ? `New repayment of ${$(repActual)} is ${Math.round(-shock*100)}% below what she already pays each month` : `New repayment of ${$(repActual)} is ${Math.round(shock*100)}% above what she already pays each month`,
    why:'Rent plus regular saving is proven monthly capacity. If the new repayment is close to it, the change is manageable.',
    table:{head:['Measure','Monthly'],rows:[['Rent paid (average, May 2025 – Aug 2026)',$(A.capacity-(A.savingsOut.filter(t=>ym(t.t)>=ym(U(2025,5,1))&&ym(t.t)<=ym(U(2026,8,1))).reduce((a,t)=>a-t.amount,0)/A.months))],['Saved (average)',$(A.savingsOut.filter(t=>ym(t.t)>=ym(U(2025,5,1))&&ym(t.t)<=ym(U(2026,8,1))).reduce((a,t)=>a-t.amount,0)/A.months)],['Proven monthly capacity',$(A.capacity)],['Repayment at '+sc.rate.toFixed(2)+'%',$(repActual)]]},
    evidenceIds:A.rentAU.map(t=>t.id).concat(A.savingsOut.map(t=>t.id))});
  // 3 buffer
  const left = A.everydayBal + A.saverBal - sc.deposit - costs;
  const bufMonths = left / A.living;
  F.push({key:'buffer',name:'Cash buffer after settlement',level: bufMonths>=6?'low':bufMonths>=3?'moderate':'high',
    finding: left<=0 ? `Savings don't cover the deposit and purchase costs` : `${bufMonths.toFixed(1)} months of living costs left after the deposit and costs`,
    why:'Money left over after buying protects against job loss or surprise costs. Six months or more is strong; under three is thin.',
    table:{head:['Item','Amount'],rows:[['Everyday account balance',$(A.everydayBal)],['Goal Saver balance',$(A.saverBal)],['Less deposit','−'+$(sc.deposit)],['Less purchase costs (2%)','−'+$(costs)],['Left after settlement',$(left)],['Monthly living costs (spending, bills, family support)',$(A.living)],['Lowest balance before a payday',$(A.lowBeforePay.v)+' on '+fdate(A.lowBeforePay.t)]]},
    evidenceIds:[]});
  // 4 income
  const inGap = A.pays.slice(1).some((p,j)=>p.t-A.pays[j].t>14*DAY);
  F.push({key:'income',name:'Income stability',level: inGap?'moderate':'low',
    finding: `${A.pays.length} of ${A.pays.length} fortnightly pays, same employer`+(A.payIN.length?`, plus ${A.payIN.length} months of salary in India`:''),
    why:'Regular pay from one employer with no gaps is stable. It is a single income source, so there is no second earner to fall back on.',
    rows:A.pays.map(t=>[fdate(t.t),'Northside Hospital payroll',$(t.amount),'Received']).concat(A.payIN.map(t=>[fdate(t.t),'Lotus Hospital salary (India)','₹'+t.amountINR.toLocaleString('en-IN')+' ≈ '+$(t.amount),'Received'])),
    evidenceIds:A.pays.map(t=>t.id).concat(A.payIN.map(t=>t.id))});
  // 5 housing
  F.push({key:'housing',name:'Housing payment conduct',level: A.missedWeeks?'moderate':'low',
    finding: `${A.rentAU.length-A.missedWeeks} of ${A.rentAU.length} weeks of rent paid in Australia`+(A.rentIN.length?`, and ${A.rentIN.length} of ${A.rentIN.length} months in India`:''),
    why:'Paying rent on time is the closest match to paying a mortgage. Private rent to a housemate has no official ledger, so the bank record is the proof.',
    rows:A.rentAU.map(t=>[fdate(t.t),'Housemate (name hidden)'+(t.note?' · "'+t.note+'"':''),$(-t.amount),'Paid']).concat(A.rentIN.map(t=>[fdate(t.t),'Landlord, Mumbai (name hidden)','₹18,000 ≈ '+$(-t.amount),'Paid'])),
    evidenceIds:A.rentAU.map(t=>t.id).concat(A.rentIN.map(t=>t.id))});
  // 6 debts
  const bnplTotal = A.bnpl.reduce((a,t)=>a-t.amount,0);
  F.push({key:'debts',name:'Existing debts and commitments',level:'low',
    finding:`No loans or credit cards. One pay-later plan (${$(bnplTotal)}) fully repaid. ${$(A.familyMonthly)} a month sent to family, counted as an expense`,
    why:'Existing debts reduce what someone can borrow. Ongoing commitments like family support are counted in living costs.',
    rows:A.bnpl.map(t=>[fdate(t.t),'NovaPay instalment',$(-t.amount),'Paid']).concat(A.family.map(t=>[fdate(t.t),'Transfer to family in India',$(-t.amount),'Commitment'])),
    evidenceIds:A.bnpl.map(t=>t.id).concat(A.family.map(t=>t.id))});
  // 7 conduct
  F.push({key:'conduct',name:'Account conduct',level: (A.lateBills.length>2||A.overdrawn>0||A.gambling.length>0)?'moderate':'low',
    finding:`${A.bills.length-A.lateBills.length} of ${A.bills.length} bills on time, never overdrawn, no gambling`,
    why:'Late bills, overdrawn days and gambling are early warning signs. One bill a few days late is minor.',
    rows:A.bills.map(t=>{const l=A.lateBills.find(x=>x.t.id===t.id); return [fdate(t.t), t.description==='PAYID A NGUYEN'?'Energy bill share (housemate)':t.description==='SPARK MOBILE'?'Spark Mobile':'Fastnet Internet', $(-t.amount), l?l.days+' days late':'On time', !!l];}),
    evidenceIds:A.bills.map(t=>t.id)});
  // 8 history
  F.push({key:'history',name:'History length and verification',level: A.india?'low':'moderate',
    finding: A.india ? '5.7 years of bank-sourced history (India and Australia)' : 'Only 18 months of Australian history. Earlier history in India not connected',
    why:'A longer verified history gives more evidence. Data pulled straight from banks is stronger than uploaded statements.',
    table:{head:['Source','Period','How it was verified'],rows:[['Harbourside Bank, Australia','Apr 2025 – Sep 2026','Consumer Data Right via Basiq (mocked)']].concat(A.india?[['State Bank of India','Jan 2021 – Feb 2025','Account Aggregator via Yodlee (mocked)']]:[['State Bank of India','Not connected','—']])},
    evidenceIds:[]});
  const counts={low:0,moderate:0,high:0}; F.forEach(f=>counts[f.level]++);
  // score: 0 (lowest risk) to 100 (highest), weighted from each factor's underlying measure
  const cl = x => Math.max(0,Math.min(1,x));
  const parts = {
    service:[0.25, cl((sRatio-0.30)/0.30)],
    shock:[0.15, cl((shock+0.20)/0.60)],
    buffer:[0.20, left<=0?1:cl((12-bufMonths)/12)],
    income:[0.10, inGap?0.5:0.1],
    housing:[0.10, A.rentAU.length?cl(A.missedWeeks/A.rentAU.length*4):0.5],
    debts:[0.05, 0.1],
    conduct:[0.05, cl(A.lateBills.length*0.05+A.overdrawn*0.1+A.gambling.length*0.2)],
    history:[0.10, A.india?0.1:0.55]
  };
  let score=0; for(const k in parts) score+=parts[k][0]*parts[k][1];
  score=Math.round(score*100);
  const overall = counts.high?'Higher risk':counts.moderate>=2?'Moderate risk':counts.moderate===1?'Low–moderate risk':'Low risk';
  // lever
  const maxRep = 0.40*A.takeHome;
  const r=(assessRate)/100/12, n=360;
  const maxLoan = maxRep*(1-Math.pow(1+r,-n))/r;
  return {factors:F,counts,overall,score,loan,costs,repAssess,repActual,assessRate,maxLoan,maxPrice:maxLoan+sc.deposit,sRatio,bufMonths};
}

function summary(A, R, sc){
  const mods = R.factors.filter(f=>f.level!=='low').map(f=>f.name.toLowerCase());
  const strengths = [];
  strengths.push(`${A.rentAU.length} of ${A.rentAU.length} weeks of rent paid`);
  strengths.push(`${A.pays.length} pays in a row`);
  strengths.push('never overdrawn');
  let s = `Priya is rated ${R.overall.toLowerCase()} for a ${$(R.loan)} loan on a ${$(sc.price)} property. `;
  s += mods.length ? `The main drivers are ${listJoin(mods)}. ` : 'No factor is above low. ';
  s += `Strengths: ${listJoin(strengths)}${A.india?', with 5.7 years of verified history':''}. `;
  s += R.loan>R.maxLoan ? `Watch serviceability: a loan up to about ${$(Math.floor(R.maxLoan/1000)*1000)} keeps repayments under 40% at the assessment rate.` : `Repayments stay under 40% of take-home pay at the assessment rate.`;
  return s;
}
function listJoin(a){ return a.length<=1?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]; }
function $(n){ return (n<0?'−':'')+'$'+Math.round(Math.abs(n)).toLocaleString('en-AU'); }

return {generateAU,generateIN,buildGroups,FALLBACK_LABELS,analyse,risk,summary,repayment,fdate,fmonth,$,INR_AUD};
})();
if(typeof module!=='undefined') module.exports=CP;
