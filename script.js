// Helpers
function $(id){return document.getElementById(id)}
function formatCurrencyAED(value){return isFinite(value)? 'AED ' + Math.round(value).toLocaleString('en-US'): '—'}
function formatPercent(v,d=1){return isFinite(v)? v.toFixed(d)+'%':'—'}
function safeSetText(id, t){const el=$(id); if(el) el.textContent=t}
function valNum(id){const el=$(id); const v=parseFloat(el && el.value); return isFinite(v)? v:0}

function remainingBalance(principal, annualRatePct, years, monthsElapsed){
  const r=annualRatePct/100/12, n=years*12;
  if(!isFinite(principal)||!isFinite(r)||!isFinite(n)||n<=0) return 0;
  if(r===0) return Math.max(0, principal*(1-monthsElapsed/n));
  const pmt = principal * r / (1 - Math.pow(1+r, -n));
  const bal = principal * Math.pow(1+r, monthsElapsed) - pmt * (Math.pow(1+r, monthsElapsed)-1)/r;
  return Math.max(0, bal);
}

function computeGrade(cashOnCash, netYield, grossYield, roi){
  // roi = total ROI over 5 years (%)
  const B={gross:{excellent:8,good:6,avg:4}, net:{excellent:6,good:4,avg:2}, roi:{excellent:60,good:45,avg:30}, cash:{excellent:2000,good:1000,avg:500}};
  let score=0;
  if(roi>=B.roi.excellent) score+=30; else if(roi>=B.roi.good) score+=24; else if(roi>=B.roi.avg) score+=18; else score+=12;
  if(cashOnCash>=B.cash.excellent) score+=25; else if(cashOnCash>=B.cash.good) score+=20; else if(cashOnCash>=B.cash.avg) score+=15; else if(cashOnCash>=0) score+=10;
  if(netYield>=B.net.excellent) score+=25; else if(netYield>=B.net.good) score+=20; else if(netYield>=B.net.avg) score+=15; else score+=10;
  if(grossYield>=B.gross.excellent) score+=20; else if(grossYield>=B.gross.good) score+=16; else if(grossYield>=B.gross.avg) score+=12; else score+=8;
  const grade = score>=90?'A+':score>=85?'A':score>=80?'A-':score>=75?'B+':score>=70?'B':score>=65?'B-':score>=60?'C+':score>=55?'C':score>=50?'C-':score>=40?'D':'F';
  const desc = grade.startsWith('A')?'Excellent investment potential': grade.startsWith('B')?'Solid investment verify assumptions': grade.startsWith('C')?'Borderline; negotiate price/terms': grade==='D'?'Weak; high risk':'Not recommended';
  return {score, grade, description:desc};
}

function calculate(){
  // Financing inputs
  const pv = valNum('propertyValue');
  const downPct = valNum('downPayment');
  const agentFeePct = valNum('agentFee');
  const years = valNum('loanTerm');
  const ratePct = valNum('interestRate');
  const dldFeeEnabled = (document.getElementById('dldFeeEnabled')||{}).checked;
  const additionalCosts = valNum('additionalCosts');

  // Income inputs
  const rent = valNum('monthlyRent');
  const addInc = valNum('additionalIncome');
  const vacancyRate = valNum('vacancyRate');

  // Expense inputs
  const maintRate = valNum('maintenanceRate');
  const mgmtRate  = valNum('managementFee');
  const baseFee   = valNum('baseFee');
  const annualInsurance = valNum('annualInsurance');
  const otherExpenses = valNum('otherExpenses');

  // Growth
  const rentGrowth = valNum('rentGrowth');
  const appreciation = valNum('propertyAppreciation');

  safeSetText('downPaymentVal', formatPercent(downPct,0));
  safeSetText('vacancyRateVal', formatPercent(vacancyRate,0));

  const downPayment = pv * (downPct/100);
  const agentFee = pv * (agentFeePct/100);
  const dldFee = dldFeeEnabled ? pv * 0.04 : 0;
  const loanAmount = Math.max(0, pv - downPayment);
  const totalInitial = downPayment + agentFee + dldFee + additionalCosts;
  safeSetText('summaryLoan', formatCurrencyAED(loanAmount));
  safeSetText('summaryInitial', formatCurrencyAED(totalInitial));

  const r = ratePct/100/12, n = years*12;
  const monthlyPayment = (loanAmount>0 && n>0) ? (r===0 ? loanAmount/n : loanAmount * r / (1 - Math.pow(1+r, -n))) : 0;

  const grossMonthlyIncome = rent + addInc;
  const effectiveIncome = grossMonthlyIncome * (1 - vacancyRate/100);
  const monthlyMaint = rent * (maintRate/100);
  const monthlyMgmt  = rent * (mgmtRate/100);
  const monthlyOpex  = monthlyMaint + monthlyMgmt + baseFee + (annualInsurance/12) + (otherExpenses/12);
  const monthlyCashFlow = effectiveIncome - monthlyOpex - monthlyPayment;
  const annualCashFlow = monthlyCashFlow * 12;
  const cashOnCash = downPayment>0 ? (annualCashFlow / downPayment) * 100 : NaN;

  const annualRentGross = (rent + addInc) * 12;
  const annualVacancy = annualRentGross * (vacancyRate/100);
  const annualOpex = monthlyMaint*12 + monthlyMgmt*12 + baseFee*12 + annualInsurance + otherExpenses;
  const NOI = annualRentGross - annualVacancy - annualOpex;
  const grossYield = pv>0 ? (annualRentGross/pv)*100 : NaN;
  const netYield   = pv>0 ? (NOI/pv)*100 : NaN;

  // 5-year ROI approximation
  const remaining5 = remainingBalance(loanAmount, ratePct, years, 60);
  const principalPaid5 = Math.max(0, loanAmount - remaining5);
  const futureValue = pv * Math.pow(1 + appreciation/100, 5);
  const appreciationGain = Math.max(0, futureValue - pv);
  const totalGain5 = annualCashFlow*5 + principalPaid5 + appreciationGain;
  const roi5 = downPayment>0 ? (totalGain5 / downPayment) * 100 : NaN;

  // Update KPIs & breakdown
  safeSetText('monthlyPayment', formatCurrencyAED(monthlyPayment));
  safeSetText('cashOnCash', formatPercent(cashOnCash,1));
  safeSetText('totalROI', formatPercent(roi5,1));
  safeSetText('netYield', formatPercent(netYield,1));
  safeSetText('grossYield', formatPercent(grossYield,1));
  safeSetText('dpOut', formatCurrencyAED(downPayment));
  safeSetText('loanOut', formatCurrencyAED(loanAmount));
  safeSetText('piOut', formatCurrencyAED(monthlyPayment));
  safeSetText('mcfOut', formatCurrencyAED(monthlyCashFlow));
  safeSetText('acfOut', formatCurrencyAED(annualCashFlow));
  const totalInvestment5 = totalInitial + monthlyPayment*12*5;
  safeSetText('tiOut', formatCurrencyAED(totalInvestment5));

  // Grade
  const g = computeGrade(monthlyCashFlow, netYield, grossYield, roi5);
  window._lastGradeInfo = g;
  safeSetText('gradeLetter', g.grade);
  safeSetText('gradeDesc', g.description);
  // chips/flags removed as requested
  // populate grade rationale: show how each metric contributed to the score
  const contrib=document.getElementById('gradeContrib');
  if(contrib){
    contrib.innerHTML='';
    const items=[
      {name:'ROI (5y)', weight:30, value:roi5, target:60, unit:'%', achieved: Math.max(0, Math.min(1, roi5/60))},
      {name:'Cash Flow', weight:25, value:monthlyCashFlow, target:2000, unit:' AED/mo', achieved: Math.max(0, Math.min(1, monthlyCashFlow/2000))},
      {name:'Net Yield', weight:25, value:netYield, target:6, unit:'%', achieved: Math.max(0, Math.min(1, netYield/6))},
      {name:'Gross Yield', weight:20, value:grossYield, target:8, unit:'%', achieved: Math.max(0, Math.min(1, grossYield/8))}
    ];
    let totalScore=0;
    items.forEach(it=>{ totalScore += it.weight * it.achieved; });
    safeSetText('gradeScore', String(Math.round(totalScore)));
    const bar=document.getElementById('gradeBar'); if(bar){ bar.style.width = Math.min(100, Math.round(totalScore)) + '%'; }
    items.forEach(it=>{
      const li=document.createElement('li'); li.className='gitem ' + (it.achieved>=1?'good':it.achieved>=0.7?'warn':'bad');
      li.innerHTML = `<div class="head"><span class="name">${it.name}</span><span class="chip">${it.weight}% weight</span><span class="pct">${Math.round(it.achieved*100)}% of target</span></div>`;
      const bar=document.createElement('div'); bar.className='bar'; const fill=document.createElement('i'); fill.style.width=(Math.min(100, Math.round(it.achieved*100)))+'%'; bar.appendChild(fill); li.appendChild(bar);
      const sub=document.createElement('div'); sub.className='sub';
      const val = it.unit==='%'? formatPercent(it.value,1): (isFinite(it.value)? ('AED '+Math.round(it.value).toLocaleString('en-US')+'/mo'):'—');
      sub.textContent = `Value: ${val} • Target: ${it.target}${it.unit}`;
      li.appendChild(sub);
      contrib.appendChild(li);
    });
  }

  // KPI coloring + healthy tooltips
  const setState=(id,cls,healthyText)=>{
    const el=document.getElementById(id); if(!el) return;
    el.classList.remove('good','warn','bad'); if(cls) el.classList.add(cls);
    const label = el.querySelector('.klabel');
    if(label){
      let info = label.querySelector('.info');
      if(!info){ info=document.createElement('span'); info.className='info'; info.textContent='i'; const tip=document.createElement('span'); tip.className='itip'; info.appendChild(tip); label.appendChild(info); }
      const tip=info.querySelector('.itip');
      tip.textContent = healthyText;
    }
  };
  setState('kMonthly', monthlyCashFlow>0?'good':monthlyCashFlow>-200?'warn':'bad', 'Healthy: ≥ AED 0/month cash flow (buffer ≥ AED 500 preferred).');
  setState('kCoC', cashOnCash>=8?'good':cashOnCash>=5?'warn':'bad', 'Healthy: ≥ 8% CoC (Dubai typical 5–10%).');
  setState('kROI', roi5>=60?'good':roi5>=40?'warn':'bad', 'Healthy: ≥ 60% total over 5 years (incl. appreciation).');
  setState('kNet', netYield>=6?'good':netYield>=4?'warn':'bad', 'Healthy: ≥ 6% net yield (Dubai avg 3–6%).');
  setState('kGross', grossYield>=8?'good':grossYield>=6?'warn':'bad', 'Healthy: ≥ 8% gross yield (Dubai avg 4–8%).');

  // AI text (simple)
  const recs=[];
  if(monthlyCashFlow<0) recs.push({type:'danger',text:'Negative monthly cash flow. Consider higher down payment or rent.'});
  else if(monthlyCashFlow<500) recs.push({type:'warn',text:'Low cash flow. Account for vacancy and unexpected expenses.'});
  if(netYield<4) recs.push({type:'warn',text:'Net yield below typical Dubai averages. Revisit price or fees.'});
  if(grossYield<6) recs.push({type:'warn',text:'Gross yield is modest; ensure rent assumptions are realistic.'});
  if(roi5>80) recs.push({type:'success',text:'Strong 5-year ROI; deal looks attractive under current assumptions.'});
  const recEl=document.getElementById('recs');
  if(recEl){
    recEl.classList.remove('muted');
    recEl.innerHTML = recs.map(r=>`<div class="rec ${r.type}">${r.text}</div>`).join('') || 'No special notes.';
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  // Wizard navigation
  let step=1; const maxStep=5;
  const setStep=(n)=>{
    step=Math.max(1, Math.min(maxStep, n));
    document.querySelectorAll('.wstep').forEach(s=>s.classList.remove('show'));
    const cur=document.getElementById('step-'+step); if(cur) cur.classList.add('show');
    document.querySelectorAll('.stepper .step').forEach(el=> el.classList.toggle('active', +el.dataset.step===step));
    if($("prevStep")) $("prevStep").style.display = step===1? 'none':'inline-flex';
    if($("nextStep")) $("nextStep").style.display = step===maxStep? 'none':'inline-flex';
    if($("analyzeBtn")) $("analyzeBtn").style.display = step===maxStep? 'inline-flex':'none';
    // segmented bar updates
    const segs=document.querySelectorAll('#segBar .seg');
    segs.forEach((s,i)=> s.classList.toggle('active', i<step));
    const sc=document.getElementById('stepCounter'); if(sc) sc.textContent = `Step ${step}/5`;
  };
  const prev=$("prevStep"), next=$("nextStep");
  if(prev) prev.addEventListener('click', ()=> setStep(step-1));
  if(next) next.addEventListener('click', ()=> setStep(step+1));
  setStep(1);

  // Recalc on input changes
  ['propertyValue','downPayment','agentFee','loanTerm','interestRate','dldFeeEnabled','additionalCosts','monthlyRent','additionalIncome','vacancyRate','maintenanceRate','managementFee','baseFee','annualInsurance','otherExpenses','rentGrowth','propertyAppreciation','expenseInflation','exitCapRate','sellingCosts','bedrooms','bathrooms','size','statusToggle','projectName']
  .forEach(id=>{ const el=$(id); if(el){ el.addEventListener('input', calculate); el.addEventListener('change', calculate); }});

  // Extra safety: recalc on any input/select change throughout the wizard
  document.querySelectorAll('input, select').forEach(el=>{
    el.addEventListener('input', calculate);
    el.addEventListener('change', calculate);
  });

  // No usage limits during testing
  const limit=$("limitNote"); if(limit){ limit.textContent=''; limit.style.display='none'; }
  const analyze=$("analyzeBtn");
  if(analyze) analyze.addEventListener('click', ()=>{ calculate(); });

  // remove legacy print handler; PDF export added below
  // Professional PDF export using jsPDF + autotable
  const proBtn=document.getElementById('downloadBtn');
  if(proBtn){
    proBtn.addEventListener('click', ()=>{
      try{
        const { jsPDF } = window.jspdf || {};
        if(!jsPDF || !window.jspdf || !window.jspdf.jsPDF){
          // fallback to print if jsPDF not loaded
          window.print();
          return;
        }
        const doc=new jsPDF();
        const pageWidth=doc.internal.pageSize.width;
        const pageHeight=doc.internal.pageSize.height;

        // Header
        doc.setFillColor(31,41,55); doc.rect(0,0,pageWidth,25,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold');
        doc.text('Smart Property Analyzer',20,15);
        doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.text('Dubai Real Estate Investment Analysis',20,20);
        doc.setTextColor(0,0,0);

        // Collect user inputs
        const getVal = (id)=>{ const el=document.getElementById(id); return el? el.value: '' };
        const propertyData = {
          projectName: getVal('projectName'),
          propertyType: getVal('propertyType'),
          bedrooms: getVal('bedrooms'),
          bathrooms: getVal('bathrooms'),
          size: getVal('size'),
          completionStatus: (document.getElementById('status')||{}).value || 'ready'
        };

        let y=40;
        doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.text('EXECUTIVE SUMMARY',20,y); y+=10;
        doc.setDrawColor(59,130,246); doc.setLineWidth(0.5); doc.roundedRect(20,y,pageWidth-40,36,3,3);
        doc.setFont('helvetica','normal'); doc.setFontSize(10);
        doc.text(`Project: ${propertyData.projectName||'—'}`,25,y+8);
        doc.text(`Type: ${propertyData.propertyType||'—'} | ${propertyData.bedrooms||'-'} Bed ${propertyData.bathrooms||'-'} Bath`,25,y+16);
        doc.text(`Size: ${propertyData.size||'-'} sqft | Status: ${propertyData.completionStatus}`,25,y+24);
        doc.text(`Property Value: ${formatCurrencyAED(+document.getElementById('propertyValue')?.value||0)}`,25,y+32);
        y+=46;

        // Grade box
        doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.text('INVESTMENT GRADE',20,y); y+=10;
        doc.setFillColor(16,185,129); doc.roundedRect(20,y,70,28,4,4,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(22); doc.text(document.getElementById('gradeLetter')?.textContent||'—',48,y+18);
        doc.setTextColor(0,0,0); doc.setFontSize(12); doc.text(`Score: ${document.getElementById('gradeScore')?.textContent||'—'}/100`,100,y+10);
        doc.setFontSize(10); doc.text(document.getElementById('gradeDesc')?.textContent||'',100,y+16);
        y+=36;

        // Mini chips row (Price, Equity, Loan, Monthly P&I)
        const chipsRowY = y;
        const makeChip=(label, value)=>{
          const txt = `${label}: ${value}`;
          doc.setFontSize(9); doc.setFont('helvetica','normal');
          const tw = doc.getTextWidth(txt) + 8; const h=8;
          doc.setDrawColor(232,236,244); doc.setFillColor(248,250,252);
          doc.roundedRect(x, chipsRowY, tw, h, 2, 2, 'FD');
          doc.setTextColor(17,24,39); doc.text(txt, x+4, chipsRowY+5.5);
          x += tw + 4;
        };
        let x = 20;
        makeChip('Price', formatCurrencyAED(pv));
        makeChip('Equity', formatCurrencyAED(downPayment));
        makeChip('Loan', formatCurrencyAED(loanAmount));
        makeChip('Monthly P&I', formatCurrencyAED(monthlyPayment));
        y = chipsRowY + 14;

        // Metrics table
        const auto = (doc).autoTable; // plugin
        if(auto){
          doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('KEY METRICS',20,y); y+=6;
          doc.autoTable({
            startY:y,
            head:[['Metric','Value']],
            body:[
              ['Cash on Cash ROI', document.getElementById('cashOnCash')?.textContent||'-'],
              ['ROI (5y)', document.getElementById('totalROI')?.textContent||'-'],
              ['Net Yield', document.getElementById('netYield')?.textContent||'-'],
              ['Gross Yield', document.getElementById('grossYield')?.textContent||'-']
            ],
            theme:'grid', headStyles:{ fillColor:[59,130,246], textColor:255 }, styles:{ fontSize:9 }
          });
          y = doc.lastAutoTable.finalY + 10;

          // User Inputs (key)
          doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('USER INPUTS (KEY)',20,y); y+=6;
          doc.autoTable({
            startY:y,
            head:[['Input','Value']],
            body:[
              ['Down Payment (%)', getVal('downPayment')||'-'],
              ['Agent Fee (%)', getVal('agentFee')||'-'],
              ['Loan Term (years)', getVal('loanTerm')||'-'],
              ['Interest Rate (%)', getVal('interestRate')||'-'],
              ['Additional Costs (AED)', getVal('additionalCosts')||'-'],
              ['Monthly Rent (AED)', getVal('monthlyRent')||'-'],
              ['Additional Income (AED)', getVal('additionalIncome')||'-'],
              ['Vacancy Rate (%)', getVal('vacancyRate')||'-']
            ],
            theme:'grid', headStyles:{ fillColor:[31,41,55], textColor:255 }, styles:{ fontSize:9 }
          });
          y = doc.lastAutoTable.finalY + 10;
        }

        // Page 2: Financial Breakdown & Cashflow
        doc.addPage();
        // Header repeat
        doc.setFillColor(31,41,55); doc.rect(0,0,pageWidth,25,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold');
        doc.text('Smart Property Analyzer',20,15);
        doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.text('Dubai Real Estate Investment Analysis',20,20);
        doc.setTextColor(0,0,0);
        y = 40;
        doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.text('FINANCIAL BREAKDOWN',20,y); y+=6;
        if((doc).autoTable){
          doc.autoTable({
            startY:y,
            head:[['Component','Amount (AED)','%']],
            body:[
              ['Property Value', Math.round(pv).toLocaleString('en-US'), '100%'],
              ['Down Payment', Math.round(downPayment).toLocaleString('en-US'), `${downPct||0}%`],
              ['Agent Fee', Math.round(agentFee).toLocaleString('en-US'), `${agentFeePct||0}%`],
              ['DLD Fee', Math.round(dldFee).toLocaleString('en-US'), '4%'],
              ['Additional Costs', Math.round(additionalCosts).toLocaleString('en-US'), '-']
            ],
            foot:[['Total Investment', Math.round(totalInitial).toLocaleString('en-US'), '-']],
            theme:'grid', headStyles:{ fillColor:[31,41,55], textColor:255 }, footStyles:{ fillColor:[243,244,246] }, styles:{ fontSize:9 }
          });
          y = doc.lastAutoTable.finalY + 12;
          doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.text('MONTHLY INCOME & EXPENSES',20,y); y+=6;
          const monthlyData=[
            ['Gross Rental Income', Math.round(rent).toLocaleString('en-US')],
            ['Additional Income', Math.round(addInc).toLocaleString('en-US')],
            ['Management Fee', `(${Math.round(monthlyMgmt).toLocaleString('en-US')})`],
            ['Maintenance', `(${Math.round(monthlyMaint).toLocaleString('en-US')})`],
            ['Insurance & Other', `(${Math.round((annualInsurance/12)+(otherExpenses/12)).toLocaleString('en-US')})`],
            ['Mortgage Payment', `(${Math.round(monthlyPayment).toLocaleString('en-US')})`]
          ];
          doc.autoTable({
            startY:y,
            head:[['Item','Amount (AED)']],
            body: monthlyData,
            foot:[['Net Cash Flow', Math.round(monthlyCashFlow).toLocaleString('en-US')]],
            theme:'grid', headStyles:{ fillColor:[31,41,55], textColor:255 },
            footStyles:{ fillColor: (monthlyCashFlow>=0?[16,185,129]:[239,68,68]), textColor:255, fontStyle:'bold' },
            styles:{ fontSize:9 }
          });
        }

        // Footer
        const footerY = pageHeight-10; doc.setFontSize(8); doc.setTextColor(107,114,128);
        doc.text('Smart Property Analyzer - Dubai',20,footerY);
        doc.save(`property-analysis-${Date.now()}.pdf`);
      }catch(e){ console.error(e); window.print(); }
    });
  }

  // Beta feedback form: store in localStorage
  const fbBtn=document.getElementById('openFeedback');
  if(fbBtn){
    fbBtn.addEventListener('click',()=>{
      // TODO: vervangen door Google Forms URL zodra beschikbaar
      const prefillProject = encodeURIComponent(document.getElementById('projectName')?.value||'');
      const url = `https://forms.gle/`;
      alert('Beta feedback opent binnenkort als Google Form. Voor nu: maak alvast een Google Form en plak de URL in script.js.');
      window.open(url,'_blank');
    });
  }
  

  // quick inline feedback
  const setFb=(msg)=>{const el=$("fbMsg"); if(el) el.textContent=msg};
  const fbGood=$("fbGood"), fbOk=$("fbOk"), fbBad=$("fbBad");
  if(fbGood) fbGood.addEventListener('click',()=>{localStorage.setItem('fb_inline','helpful'); setFb('Thanks for your feedback! 👍')});
  if(fbOk) fbOk.addEventListener('click',()=>{localStorage.setItem('fb_inline','okay'); setFb('Thanks! 👌')});
  if(fbBad) fbBad.addEventListener('click',()=>{localStorage.setItem('fb_inline','confusing'); setFb('Thanks, we will improve this. 👎')});

  // show live values for sliders
  const bindVal=(id,label,fmt=(v)=>v)=>{const el=$(id); const out=$(label); if(el&&out){ const fn=()=> out.textContent=fmt(el.value); el.addEventListener('input',fn); fn(); }}
  bindVal('propertyValue','priceVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('bedrooms','bedroomsVal');
  bindVal('bathrooms','bathroomsVal');
  bindVal('size','sizeVal',(v)=>v+' ft²');
  bindVal('agentFee','agentFeeVal',(v)=>v+'%');
  bindVal('loanTerm','loanTermVal',(v)=>v+' years');
  bindVal('interestRate','interestRateVal',(v)=>parseFloat(v).toFixed(2)+'%');
  bindVal('additionalCosts','additionalCostsVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('monthlyRent','monthlyRentVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('additionalIncome','additionalIncomeVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('maintenanceRate','maintenanceRateVal',(v)=>v+'%');
  bindVal('managementFee','managementFeeVal',(v)=>v+'%');
  bindVal('baseFee','baseFeeVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('annualInsurance','annualInsuranceVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('otherExpenses','otherExpensesVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('rentGrowth','rentGrowthVal',(v)=>v+'%');
  bindVal('propertyAppreciation','propertyAppreciationVal',(v)=>v+'%');
  bindVal('expenseInflation','expenseInflationVal',(v)=>v+'%');
  bindVal('exitCapRate','exitCapRateVal',(v)=>v+'%');
  bindVal('sellingCosts','sellingCostsVal',(v)=>v+'%');

  // segmented toggle behavior
  const seg=$("statusSeg");
  if(seg){
    seg.querySelectorAll('.seg-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        seg.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const hidden=$("status"); if(hidden) hidden.value = btn.dataset.status;
        calculate();
      });
    });
  }
});
