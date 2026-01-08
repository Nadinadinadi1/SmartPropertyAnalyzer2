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

function computeGrade(monthlyCashFlow, netYield, grossYield, roi, dscr, irr){
  // Dubai-weighted (updated): ROI 25, Net 25, DSCR 20, IRR(5y) 15, Gross 10, CashFlow 5
  const B={
    gross:{excellent:8,good:6,avg:4},
    net:{excellent:6,good:4,avg:2},
    roi:{excellent:60,good:45,avg:30},
    dscr:{excellent:1.3,good:1.2,avg:1.0},
    irr:{excellent:15,good:12,avg:8},
    cash:{excellent:2000,good:1000,avg:500}
  };
  let score=0;
  if(roi>=B.roi.excellent) score+=25; else if(roi>=B.roi.good) score+=20; else if(roi>=B.roi.avg) score+=15; else score+=10;
  if(netYield>=B.net.excellent) score+=25; else if(netYield>=B.net.good) score+=20; else if(netYield>=B.net.avg) score+=15; else score+=10;
  if(dscr>=B.dscr.excellent) score+=20; else if(dscr>=B.dscr.good) score+=16; else if(dscr>=B.dscr.avg) score+=12; else score+=8;
  if(isFinite(irr)){
    if(irr>=B.irr.excellent) score+=15; else if(irr>=B.irr.good) score+=12; else if(irr>=B.irr.avg) score+=9; else score+=6;
  }else{
    // if IRR unavailable, give neutral mid score
    score+=9;
  }
  if(grossYield>=B.gross.excellent) score+=10; else if(grossYield>=B.gross.good) score+=8; else if(grossYield>=B.gross.avg) score+=6; else score+=4;
  if(monthlyCashFlow>=B.cash.excellent) score+=5; else if(monthlyCashFlow>=B.cash.good) score+=4; else if(monthlyCashFlow>=B.cash.avg) score+=3; else if(monthlyCashFlow>=0) score+=2; else score+=1;
  const grade = score>=90?'A+':score>=85?'A':score>=80?'A-':score>=75?'B+':score>=70?'B':score>=65?'B-':score>=60?'C+':score>=55?'C':score>=50?'C-':score>=40?'D':'F';
  const desc = grade.startsWith('A')?'Excellent investment potential': grade.startsWith('B')?'Solid investment verify assumptions': grade.startsWith('C')?'Borderline; negotiate price/terms': grade==='D'?'Weak; high risk':'Not recommended';
  return {score, grade, description:desc};
}

// IRR helpers (Newton-Raphson)
function calculateIRR(cashFlows, guess = 0.10){
  const maxIterations = 100;
  const tolerance = 1e-5;
  let rate = guess;
  for(let i=0;i<maxIterations;i++){
    let npv = 0;
    let derivative = 0;
    for(let j=0;j<cashFlows.length;j++){
      const denom = Math.pow(1+rate, j);
      npv += cashFlows[j] / denom;
      derivative -= (j * cashFlows[j]) / Math.pow(1+rate, j+1);
    }
    const newRate = rate - (npv/derivative);
    if(Math.abs(newRate - rate) < tolerance) return newRate;
    rate = newRate;
  }
  return rate;
}

// Dubai property IRR with appreciation and exit
function calculatePropertyIRR(inputs){
  const {
    totalInitialInvestment,
    monthlyCashFlow,
    loanAmount,
    interestRate,       // decimal (e.g., 0.045)
    loanTermYears,
    propertyPrice,
    appreciationRate,   // decimal (e.g., 0.03)
    years
  } = inputs;
  const cashFlows = [];
  cashFlows.push(-totalInitialInvestment); // Year 0
  const monthlyRate = interestRate/12;
  const numPayments = loanTermYears*12;
  const monthlyPayment = (loanAmount>0 && numPayments>0)
    ? (monthlyRate===0 ? loanAmount/numPayments
      : loanAmount * (monthlyRate*Math.pow(1+monthlyRate, numPayments)) / (Math.pow(1+monthlyRate, numPayments)-1))
    : 0;
  // Iterate years
  for(let year=1; year<=years; year++){
    let annualCashFlow = monthlyCashFlow * 12;
    // Compute equity build-up for the year
    let startingBalance = loanAmount;
    // advance to start of this year
    for(let m=0; m<(year-1)*12; m++){
      const interestPayment = startingBalance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      startingBalance = Math.max(0, startingBalance - principalPayment);
    }
    let equityBuildup = 0;
    for(let m=0; m<12; m++){
      const interestPayment = startingBalance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      equityBuildup += principalPayment;
      startingBalance = Math.max(0, startingBalance - principalPayment);
    }
    // Add exit proceeds at final year
    if(year === years){
      const appreciatedValue = propertyPrice * Math.pow(1 + appreciationRate, years);
      const remainingLoan = startingBalance;
      const exitProceeds = Math.max(0, appreciatedValue - remainingLoan);
      annualCashFlow += exitProceeds;
    }
    cashFlows.push(annualCashFlow);
  }
  const irr = calculateIRR(cashFlows);
  return {
    irr,
    irrPercentage: (irr*100),
    cashFlows
  };
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

  // Growth (Basic: fixed defaults, Pro exposes controls)
  const rentGrowth = 0;           // %/yr
  const appreciation = 3;         // %/yr
  const expenseInflation = 2;     // %/yr

  safeSetText('downPaymentVal', formatPercent(downPct,0));
  safeSetText('vacancyRateVal', formatPercent(vacancyRate,0));

  const statusVal_calc = (document.getElementById('status')||{}).value || 'ready';
  let downPayment = pv * (downPct/100);
  const agentFee = pv * (agentFeePct/100);
  const dldFee = dldFeeEnabled ? pv * 0.04 : 0;
  let loanAmount = Math.max(0, pv - downPayment);
  let totalInitial = downPayment + agentFee + dldFee + additionalCosts;
  // Off-plan handling: split pre-handover cash and down at handover
  if(statusVal_calc==='offplan'){
    const prePct = valNum('preHandoverPct');
    const preCash = pv * (prePct/100);
    const remain = Math.max(0, pv - preCash);
    const downAtHandover = remain * (downPct/100);
    loanAmount = Math.max(0, remain - downAtHandover);
    downPayment = downAtHandover;
    totalInitial = preCash + downAtHandover + agentFee + dldFee + additionalCosts;
    // update offplan chips
    const oc=document.getElementById('offplanChips');
    if(oc){ oc.style.display='flex'; }
    safeSetText('chipPre', `Pre-handover: ${formatCurrencyAED(preCash)}`);
    safeSetText('chipDown', `Handover down: ${formatCurrencyAED(downAtHandover)}`);
    safeSetText('chipLoan', `Loan after handover: ${formatCurrencyAED(loanAmount)}`);
    const warn = (prePct + downPct) > 100 + 1e-6;
    const cw = document.getElementById('chipWarn'); if(cw){ cw.style.display = warn? 'inline-flex':'none'; cw.textContent = 'Pre + handover down > 100%'; }
  }else{
    const oc=document.getElementById('offplanChips');
    if(oc){ oc.style.display='none'; }
  }
  // Wizard step 2 mini-summary
  safeSetText('summaryLoan', formatCurrencyAED(loanAmount));
  safeSetText('summaryInitial', formatCurrencyAED(totalInitial));
  // Input Summary totals (Financing)
  safeSetText('sumLoanAmt', formatCurrencyAED(loanAmount));
  safeSetText('sumTotalInitial', formatCurrencyAED(totalInitial));

  const r = ratePct/100/12, n = years*12;
  const monthlyPayment = (loanAmount>0 && n>0) ? (r===0 ? loanAmount/n : loanAmount * r / (1 - Math.pow(1+r, -n))) : 0;

  const grossMonthlyIncome = rent + addInc;
  const effectiveIncome = grossMonthlyIncome * (1 - vacancyRate/100);
  const monthlyMaint = effectiveIncome * (maintRate/100);
  const monthlyMgmt  = effectiveIncome * (mgmtRate/100);
  const monthlyOpex  = monthlyMaint + monthlyMgmt + baseFee + (annualInsurance/12) + (otherExpenses/12);
  const monthlyCashFlow = effectiveIncome - monthlyOpex - monthlyPayment;
  const annualCashFlow = monthlyCashFlow * 12;
  const cashOnCash = totalInitial>0 ? (annualCashFlow / totalInitial) * 100 : NaN;

  const annualRentGross = (rent + addInc) * 12;
  const annualEffective = effectiveIncome * 12;
  const annualOpex = monthlyMaint*12 + monthlyMgmt*12 + baseFee*12 + annualInsurance + otherExpenses;
  const NOI = annualEffective - annualOpex;
  const grossYield = pv>0 ? (annualRentGross/pv)*100 : NaN;
  const netYield   = pv>0 ? (NOI/pv)*100 : NaN;
  const noiMonthly = effectiveIncome - (monthlyMaint + monthlyMgmt + baseFee + (annualInsurance/12) + (otherExpenses/12));
  const dscr = monthlyPayment>0 ? (noiMonthly / monthlyPayment) : NaN;
  // Revenue and Expenses summaries (now that values are computed)
  // Wizard step 3/4 mini-summaries
  safeSetText('summaryGrossInc', formatCurrencyAED(grossMonthlyIncome));
  safeSetText('summaryEffInc', formatCurrencyAED(effectiveIncome));
  safeSetText('summaryOpex', formatCurrencyAED(monthlyOpex));
  safeSetText('summaryOpexY', formatCurrencyAED(annualOpex));
  // Input Summary totals (Revenue/Expenses)
  safeSetText('sumGrossMo', formatCurrencyAED(grossMonthlyIncome));
  safeSetText('sumEffMo', formatCurrencyAED(effectiveIncome)); // row removed from DOM; harmless no-op
  safeSetText('sumGrossYr', formatCurrencyAED(annualRentGross));
  safeSetText('sumOpexMo', formatCurrencyAED(monthlyOpex));
  safeSetText('sumOpexYr', formatCurrencyAED(annualOpex));

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
  safeSetText('dscrVal', isFinite(dscr)? dscr.toFixed(2): '—');
  // Compact strip values
  safeSetText('valPI', formatCurrencyAED(monthlyPayment));
  safeSetText('valDSCR', isFinite(dscr)? dscr.toFixed(2)+'x':'—');
  safeSetText('valNet', formatPercent(netYield,1));
  safeSetText('valGross', formatPercent(grossYield,1));
  safeSetText('valCF', formatCurrencyAED(monthlyCashFlow)+'/mo');
  safeSetText('valROI', formatPercent(roi5,0));
  // Grade compact quick badges
  safeSetText('gcPI', `P&I: ${formatCurrencyAED(monthlyPayment)}/mo`);
  safeSetText('gcCF', `Cash flow: ${formatCurrencyAED(monthlyCashFlow)}/mo`);
  const w=(v,t)=> Math.max(0, Math.min(100, (isFinite(v)&&t>0)? (v/t*100):0));
  const setW=(id,p)=>{ const el=$(id); if(el){ el.style.width = Math.round(p)+'%'; } };
  setW('barDSCR', w(dscr,1.2));
  setW('barNet', w(netYield,6));
  setW('barGross', w(grossYield,8));
  setW('barCF', w(Math.max(0, monthlyCashFlow), 2000));
  setW('barROI', w(roi5,60));
  const setStateKt=(ktId,state)=>{ const el=document.getElementById(ktId); if(el){ el.classList.remove('good','warn','bad'); if(state) el.classList.add(state); } };
  setStateKt('ktDSCR', dscr>=1.2?'good':dscr>=1.0?'warn':'bad');
  setStateKt('ktNet', netYield>=6?'good':netYield>=4?'warn':'bad');
  setStateKt('ktGross', grossYield>=8?'good':grossYield>=6?'warn':'bad');
  setStateKt('ktCF', monthlyCashFlow>=0?'good':monthlyCashFlow>=-200?'warn':'bad');
  setStateKt('ktROI', roi5>=60?'good':roi5>=40?'warn':'bad');
  // Delta chips vs healthy targets
  const setDeltaChip=(id, delta, fmt, warnBand)=>{
    const el=$(id); if(!el) return;
    let cls='bad', arrow='↓';
    if(delta >= 0){ cls='good'; arrow='↑'; }
    else if(delta >= -warnBand){ cls='warn'; arrow='→'; }
    el.className = 'kt-delta ' + cls;
    el.innerHTML = `${fmt(delta)} <span class="arr">${arrow}</span>`;
  };
  const fmtPct = (v)=> (v>=0?'+':'')+Math.abs(v).toFixed(1)+'%';
  const fmtPct0 = (v)=> (v>=0?'+':'')+Math.round(Math.abs(v))+'%';
  const fmtX   = (v)=> (v>=0?'+':'')+Math.abs(v).toFixed(2)+'x';
  const fmtAED = (v)=> (v>=0?'+':'−')+Math.abs(Math.round(v)).toLocaleString('en-US');
  setDeltaChip('deltaDSCR', dscr-1.2, fmtX, 0.2);
  setDeltaChip('deltaNet',  netYield-6.0, fmtPct, 2.0);
  setDeltaChip('deltaGross',grossYield-8.0, fmtPct, 2.0);
  setDeltaChip('deltaROI',  roi5-60.0, fmtPct0, 20.0);
  // Cash flow: target 0, warn band 200
  (function(){
    const id='deltaCF'; const el=$(id); if(!el) return;
    const delta = monthlyCashFlow;
    let cls='bad', arrow='↓';
    if(delta>=0){ cls='good'; arrow='↑'; }
    else if(delta>=-200){ cls='warn'; arrow='→'; }
    el.className='kt-delta '+cls;
    el.innerHTML = `${fmtAED(delta)} <span class="arr">${arrow}</span>`;
  })();
  // Rental price recommendation
  (function(){
    const sel=document.getElementById('recTarget');
    const targetPct = sel ? parseFloat(sel.value||'6') : 6;
    const t = targetPct/100;
    const v = vacancyRate/100;
    const varPct = (mgmtRate+maintRate)/100;
    const k = 12 * (1 - v - varPct);
    const fixed = baseFee*12 + annualInsurance + otherExpenses;
    const b = 12*(1 - v)*addInc - fixed;
    let recR = NaN;
    if(k>0){
      recR = (pv*t - b) / k;
      if(!isFinite(recR) || recR<0) recR=0;
    }
    const cur = rent;
    // Populate new compact layout
    const curValEl=$('recCurVal'); if(curValEl) curValEl.textContent = formatCurrencyAED(cur);
    const curNetEl=$('recCurNet'); 
    if(curNetEl){
      curNetEl.textContent = `Net yield: ${formatPercent(netYield,1)}`;
      curNetEl.classList.remove('good','warn','bad');
      if(isFinite(netYield)){
        if(netYield>=6) curNetEl.classList.add('good');
        else if(netYield>=4) curNetEl.classList.add('warn');
        else curNetEl.classList.add('bad');
      }
    }
    const recValEl=$('recRecVal'); if(recValEl) recValEl.textContent = formatCurrencyAED(recR);
    // Update target label next to "Target rent (...)"
    const targetLbl=$('recTargetLbl'); if(targetLbl) targetLbl.textContent = (isFinite(targetPct)? targetPct.toFixed(1): '—') + '%';
    const st=$('recStatus');
    if(st){
      if(isFinite(recR) && cur<recR-1){
        st.textContent='Below recommended'; st.className='recc-status bad';
      }else if(isFinite(recR) && cur>recR+1){
        st.textContent='Above recommended'; st.className='recc-status good';
      }else{
        st.textContent='At or near recommended'; st.className='recc-status';
      }
    }
    {
      // Color by "above/below target" (gap to target net yield), not by rent direction
      const diff = recR - cur; // AED delta to target rent (positive → raise)
      const pctGap = (isFinite(netYield) && isFinite(targetPct)) ? (netYield - targetPct) : NaN; // pp vs target
      let cls='warn', text='—';
      if(isFinite(pctGap)){
        if(pctGap >= 0.1){
          // Above target → green, clarify it's above target (even if target rent < current)
          cls='good';
          text = `Above target by ${pctGap.toFixed(1)}%`;
        }else if(pctGap <= -0.1){
          // Below target → red, show raise amount to reach target
          cls='bad';
          const amt = 'AED '+Math.abs(Math.round(diff)).toLocaleString('en-US');
          text = `Below target by ${Math.abs(pctGap).toFixed(1)}% • Raise ${amt} ↑`;
        }else{
          cls='warn';
          text = 'Near target';
        }
      }
      const diffEl=$('recDiff'); if(diffEl){ diffEl.className='rec-diff '+cls; diffEl.textContent = text; }
    }
    // expose for recommendations section
    window._recSuggestRent = recR;
    window._recRentDiff = (isFinite(recR)? recR - cur : 0);
    window._recTargetPct = targetPct;
    if(sel && !sel._bound){
      sel._bound=true; sel.addEventListener('change', calculate);
    }
  })();
  safeSetText('dpOut', formatCurrencyAED(downPayment));
  safeSetText('loanOut', formatCurrencyAED(loanAmount));
  safeSetText('piOut', formatCurrencyAED(monthlyPayment));
  safeSetText('mcfOut', formatCurrencyAED(monthlyCashFlow));
  safeSetText('acfOut', formatCurrencyAED(annualCashFlow));
  const debtService5 = monthlyPayment*12*5;
  const netCashOutlay5 = totalInitial + (monthlyOpex + monthlyPayment - effectiveIncome) * 60;
  safeSetText('ncoOut', formatCurrencyAED(netCashOutlay5));
  safeSetText('dsiOut', formatCurrencyAED(totalInitial + debtService5));

  // IRR (5y & 10y) compute (exposed + optional UI update)
  try{
    const irr5 = calculatePropertyIRR({
      totalInitialInvestment: totalInitial,
      monthlyCashFlow,
      loanAmount,
      interestRate: ratePct/100,
      loanTermYears: years,
      propertyPrice: pv,
      appreciationRate: 0.05,
      years: 5
    });
    const irr10 = calculatePropertyIRR({
      totalInitialInvestment: totalInitial,
      monthlyCashFlow,
      loanAmount,
      interestRate: ratePct/100,
      loanTermYears: years,
      propertyPrice: pv,
      appreciationRate: 0.05,
      years: 10
    });
    window._irr5 = irr5.irrPercentage;
    window._irr10 = irr10.irrPercentage;
    if(typeof displayIRR==='function'){
      displayIRR(irr5.irrPercentage, irr10.irrPercentage);
    }else{
      // safe inline display if elements exist
      const set=(id,val)=>{ const el=document.getElementById(id); if(el){ el.textContent = isFinite(val)? val.toFixed(2)+'%':'—'; } };
      set('irr5Val', irr5.irrPercentage);
      set('irr10Val', irr10.irrPercentage);
    }
  }catch(_){}

  // Input Summary (top of results)
  const statusVal = (document.getElementById('status')||{}).value || 'ready';
  const handoverSel = document.getElementById('handover');
  const handoverVal = (handoverSel && handoverSel.value) ? ` (${handoverSel.value})` : '';
  safeSetText('sumProject', (document.getElementById('projectName')||{}).value || '—');
  safeSetText('sumStatus', statusVal==='offplan' ? ('Off-plan'+handoverVal) : 'Ready');
  safeSetText('sumType', (document.getElementById('propertyType')||{}).value || '—');
  safeSetText('sumCommunity', (document.getElementById('community')||{}).value || '—');
  safeSetText('sumBedsBaths', `${(document.getElementById('bedrooms')||{}).value || '-'}/${(document.getElementById('bathrooms')||{}).value || '-'}`);
  safeSetText('sumSize', `${(document.getElementById('size')||{}).value || '-'} ft²`);
  safeSetText('sumPrice', formatCurrencyAED(pv));
  safeSetText('sumDown', formatPercent(downPct,0));
  safeSetText('sumAgent', formatPercent(agentFeePct,1));
  safeSetText('sumDLD', dldFeeEnabled ? 'On' : 'Off');
  safeSetText('sumTerm', `${years} yrs`);
  safeSetText('sumRate', formatPercent(ratePct,2));
  safeSetText('sumAddCosts', formatCurrencyAED(additionalCosts));
  safeSetText('sumRent', formatCurrencyAED(rent));
  safeSetText('sumInc', formatCurrencyAED(addInc));
  safeSetText('sumVac', formatPercent(vacancyRate,0));
  safeSetText('sumMgmt', formatPercent(mgmtRate,1));
  safeSetText('sumMaint', formatPercent(maintRate,1));
  safeSetText('sumIns', formatCurrencyAED(annualInsurance));
  safeSetText('sumOther', formatCurrencyAED(otherExpenses));
  // Hide zero/empty rows
  const hideIfZero=(strongId, val)=>{
    const el=document.getElementById(strongId);
    if(!el) return;
    const li=el.closest('li');
    if(!li) return;
    const isZero = !isFinite(val) || Number(val)===0;
    li.style.display = isZero ? 'none' : '';
  };
  hideIfZero('sumAddCosts', additionalCosts);
  hideIfZero('sumInc', addInc);
  hideIfZero('sumIns', annualInsurance);
  hideIfZero('sumOther', otherExpenses);

  // IRR (5y & 10y) compute (exposed + optional UI update)
  let irr5Pct=NaN, irr10Pct=NaN;
  try{
    const irr5 = calculatePropertyIRR({
      totalInitialInvestment: totalInitial,
      monthlyCashFlow,
      loanAmount,
      interestRate: ratePct/100,
      loanTermYears: years,
      propertyPrice: pv,
      appreciationRate: 0.05,
      years: 5
    });
    const irr10 = calculatePropertyIRR({
      totalInitialInvestment: totalInitial,
      monthlyCashFlow,
      loanAmount,
      interestRate: ratePct/100,
      loanTermYears: years,
      propertyPrice: pv,
      appreciationRate: 0.05,
      years: 10
    });
    irr5Pct = irr5.irrPercentage;
    irr10Pct = irr10.irrPercentage;
    window._irr5 = irr5Pct;
    window._irr10 = irr10Pct;
    if(typeof displayIRR==='function'){
      displayIRR(irr5Pct, irr10Pct);
    }else{
      const set=(id,val)=>{ const el=document.getElementById(id); if(el){ el.textContent = isFinite(val)? val.toFixed(2)+'%':'—'; } };
      set('irr5Val', irr5Pct);
      set('irr10Val', irr10Pct);
    }
  }catch(_){}

  // Grade
  const g = computeGrade(monthlyCashFlow, netYield, grossYield, roi5, dscr, irr5Pct);
  window._lastGradeInfo = g;
  safeSetText('gradeLetter', g.grade);
  safeSetText('gradeDesc', g.description);
  // color class and score pin
  const box=document.querySelector('.grade-box');
  if(box){ box.classList.remove('A','B','C','D','F'); box.classList.add((g.grade||'')[0]||''); }
  const pin=document.getElementById('gradePin'); if(pin){ pin.style.left = Math.min(100, Math.max(0, Math.round((g.score||0)))) + '%'; }
  // compact card preview populate
  const cg=document.getElementById('gradeCompact');
  if(cg){
    cg.classList.remove('A','B','C','D','F'); cg.classList.add((g.grade||'')[0]||'');
    const title=document.getElementById('gcLetter'); if(title) title.textContent = (g.grade||'—')[0]||'—';
    const sc=document.getElementById('gcScore'); if(sc) sc.textContent = String(Math.round(g.score||0));
    const vd=document.getElementById('gcVerdict'); if(vd) vd.textContent = g.description || '—';
    const fill=document.getElementById('gcFill'); if(fill) fill.style.width = Math.min(100, Math.round(g.score||0)) + '%';
    const drivers=document.getElementById('gcDrivers');
    if(drivers){
      const roiStr = isFinite(roi5)? formatPercent(roi5,0):'—';
      const irrStr = isFinite(irr5Pct)? irr5Pct.toFixed(2)+'%':'—';
      const dscrStr = isFinite(dscr)? dscr.toFixed(2)+'x':'—';
      const netStr = isFinite(netYield)? formatPercent(netYield,1):'—';
      drivers.textContent = `Top drivers: ROI ${roiStr}, IRR ${irrStr}, DSCR ${dscrStr}, Net ${netStr}`;
    }
  }
  // Inline validation warnings (soft)
  (function(){
    const msgs=[];
    if(downPct>100) msgs.push('Down payment > 100%');
    if(isFinite(dscr) && dscr<0.8) msgs.push(`Low DSCR ${dscr.toFixed(2)} (target ≥ 1.20)`);
    const bar=document.getElementById('limitNote');
    if(bar){
      if(msgs.length){
        bar.style.display='block';
        bar.textContent = 'Check inputs: ' + msgs.join(' • ');
      }else{
        bar.style.display='none';
        bar.textContent='';
      }
    }
  })();
  // Build current deal object for comparison save
  (function(){
    const name = (document.getElementById('projectName')||{}).value || 'Deal';
    const deal = {
      id: Date.now(),
      name,
      grade: g.grade,
      gradeScore: g.score,
      price: pv,
      loanAmount,
      totalInitial,
      monthlyPayment,
      cashFlow: monthlyCashFlow,
      dscr,
      netYield,
      grossYield,
      roi5,
      irr5: (typeof window._irr5==='number')? window._irr5: NaN,
      irr10: (typeof window._irr10==='number')? window._irr10: NaN
    };
    window._currentDealComparison = deal;
    const btn=document.getElementById('saveDealBtn'); if(btn){ btn.style.display='inline-flex'; }
    // refresh chips/table if any existing deals
    if(typeof window._cmpRender==='function'){ window._cmpRender(); }
  })();
  // Update Down label depending on status
  (function(){
    const lab=document.getElementById('downLabel');
    const st=(document.getElementById('status')||{}).value||'ready';
    if(lab) lab.textContent = (st==='offplan') ? 'Handover down payment (%)' : 'Down Payment (%)';
    const dh=document.getElementById('downApplyHint');
    if(dh){ dh.style.display = (st==='offplan') ? 'block':'none'; }
  })();
  // chips/flags removed as requested
  // populate grade rationale: show how each metric contributed to the score
  const contrib=document.getElementById('gradeContrib');
  if(contrib){
    contrib.innerHTML='';
    const items=[
      {name:'ROI (5y)', weight:25, value:roi5, target:60, unit:'%', achieved: Math.max(0, Math.min(1, roi5/60))},
      {name:'Net Yield', weight:25, value:netYield, target:6, unit:'%', achieved: Math.max(0, Math.min(1, netYield/6))},
      {name:'DSCR', weight:20, value:dscr, target:1.2, unit:'x', achieved: Math.max(0, Math.min(1, dscr/1.2))},
      {name:'IRR (5y)', weight:15, value:irr5Pct, target:12, unit:'%', achieved: Math.max(0, Math.min(1, (isFinite(irr5Pct)? irr5Pct:0)/12))},
      {name:'Gross Yield', weight:10, value:grossYield, target:8, unit:'%', achieved: Math.max(0, Math.min(1, grossYield/8))},
      {name:'Cash Flow', weight:5, value:monthlyCashFlow, target:2000, unit:' AED/mo', achieved: Math.max(0, Math.min(1, monthlyCashFlow/2000))}
    ];
    let totalScore=0;
    items.forEach(it=>{ totalScore += it.weight * it.achieved; });
    safeSetText('gradeScore', String(Math.round(totalScore)));
    const bar=document.getElementById('gradeBar'); if(bar){ bar.style.width = Math.min(100, Math.round(totalScore)) + '%'; }
    items.forEach(it=>{
      const li=document.createElement('li'); li.className='gitem ' + (it.achieved>=1?'good':it.achieved>=0.7?'warn':'bad');
      li.innerHTML = `<div class="head"><span class="name">${it.name}</span><span class="pct"><span class="pct-tag">${Math.round(it.achieved*100)}%</span><span class="pct-text">of target</span></span></div>`;
      const bar=document.createElement('div'); bar.className='bar'; const fill=document.createElement('i'); fill.style.width=(Math.min(100, Math.round(it.achieved*100)))+'%'; bar.appendChild(fill); li.appendChild(bar);
      const sub=document.createElement('div'); sub.className='sub';
      const val = it.unit==='%'? formatPercent(it.value,1): (it.unit==='x'? (isFinite(it.value)? it.value.toFixed(2)+'x':'—'): (isFinite(it.value)? ('AED '+Math.round(it.value).toLocaleString('en-US')+'/mo'):'—'));
      sub.textContent = `${val} • Target: ${it.target}${it.unit}`;
      // delta chip vs healthy thresholds (Cash Flow uses 0 not 2000)
      let dVal=0, warnBand=0, unit=it.unit, goodThresh=0;
      if(it.name==='ROI (5y)'){ dVal = (isFinite(roi5)? roi5-60:0); warnBand=20; unit='%'; }
      else if(it.name==='Net Yield'){ dVal = (isFinite(netYield)? netYield-6:0); warnBand=2; unit='%'; }
      else if(it.name==='DSCR'){ dVal = (isFinite(dscr)? dscr-1.2:0); warnBand=0.2; unit='x'; }
      else if(it.name==='Gross Yield'){ dVal = (isFinite(grossYield)? grossYield-8:0); warnBand=2; unit='%'; }
      else if(it.name==='IRR (5y)'){ dVal = (isFinite(irr5Pct)? irr5Pct-12:0); warnBand=3; unit='%'; }
      else if(it.name==='Cash Flow'){ dVal = (isFinite(monthlyCashFlow)? monthlyCashFlow:0); warnBand=200; unit='AED'; }
      const chip=document.createElement('span'); chip.className='dchip';
      let cls='bad', arrow='↓', text='';
      if(it.name==='Cash Flow'){
        if(dVal>=0){ cls='good'; arrow='↑'; text = (dVal>=0?'+':'−')+Math.abs(Math.round(dVal)).toLocaleString('en-US'); }
        else if(dVal>=-warnBand){ cls='warn'; arrow='→'; text = (dVal>=0?'+':'−')+Math.abs(Math.round(dVal)).toLocaleString('en-US'); }
        else { text = (dVal>=0?'+':'−')+Math.abs(Math.round(dVal)).toLocaleString('en-US'); }
        chip.textContent = `${text} ${arrow}`;
      }else{
        if(dVal>=0){ cls='good'; arrow='↑'; }
        else if(dVal>=-warnBand){ cls='warn'; arrow='→'; }
        const fmt = (unit==='x')? ((v)=>(v>=0?'+':'')+Math.abs(v).toFixed(2)+'x') : ((v)=>(v>=0?'+':'')+Math.abs(v).toFixed(1)+'%');
        chip.textContent = `${fmt(dVal)} ${arrow}`;
      }
      chip.className += ' '+cls;
      sub.appendChild(chip);
      li.appendChild(sub);
      // Tooltip bottom-right per KPI
      const tip=document.createElement('span'); tip.className='info'; tip.textContent='i';
      const tipBox=document.createElement('span'); tipBox.className='itip';
      let tipText='Metric info';
      if(it.name==='ROI (5y)') tipText='Total 5‑year return on equity. Healthy: ≥ 60% (Dubai benchmark).';
      else if(it.name==='Net Yield') tipText='NOI ÷ price (after vacancy & opex). Healthy: ≥ 6%.';
      else if(it.name==='DSCR') tipText='NOI ÷ monthly P&I. Healthy: ≥ 1.20× (borderline 1.0–1.2).';
      else if(it.name==='Gross Yield') tipText='(Rent + extra) ÷ price before opex. Healthy: ≥ 8%.';
      else if(it.name==='Cash Flow') tipText='Monthly NOI − P&I. Healthy: ≥ AED 0/month.';
      tipBox.textContent = tipText;
      tip.appendChild(tipBox);
      li.appendChild(tip);
      contrib.appendChild(li);
    });
    // Populate compact details list too
    const c2=document.getElementById('gcContrib');
    if(c2){
      c2.innerHTML='';
      items.forEach(it=>{
        const li=document.createElement('li'); li.className='gitem ' + (it.achieved>=1?'good':it.achieved>=0.7?'warn':'bad');
        li.innerHTML = `<div class="head"><span class="name">${it.name}</span><span class="pct"><span class="pct-tag">${Math.round(it.achieved*100)}%</span><span class="pct-text">of target</span></span></div>`;
        const bar=document.createElement('div'); bar.className='bar'; const fill=document.createElement('i'); fill.style.width=(Math.min(100, Math.round(it.achieved*100)))+'%'; bar.appendChild(fill); li.appendChild(bar);
        const sub=document.createElement('div'); sub.className='sub';
        const val = it.unit==='%'? formatPercent(it.value,1): (it.unit==='x'? (isFinite(it.value)? it.value.toFixed(2)+'x':'—'): (isFinite(it.value)? ('AED '+Math.round(it.value).toLocaleString('en-US')+'/mo'):'—'));
        sub.textContent = `${val} • Target: ${it.target}${it.unit}`;
        // delta chip (same as above)
        let dVal=0, warnBand=0, unit=it.unit;
        if(it.name==='ROI (5y)'){ dVal = (isFinite(roi5)? roi5-60:0); warnBand=20; unit='%'; }
        else if(it.name==='Net Yield'){ dVal = (isFinite(netYield)? netYield-6:0); warnBand=2; unit='%'; }
        else if(it.name==='DSCR'){ dVal = (isFinite(dscr)? dscr-1.2:0); warnBand=0.2; unit='x'; }
        else if(it.name==='IRR (5y)'){ dVal = (isFinite(irr5Pct)? irr5Pct-12:0); warnBand=3; unit='%'; }
        else if(it.name==='Gross Yield'){ dVal = (isFinite(grossYield)? grossYield-8:0); warnBand=2; unit='%'; }
        else if(it.name==='Cash Flow'){ dVal = (isFinite(monthlyCashFlow)? monthlyCashFlow:0); warnBand=200; unit='AED'; }
        const chip=document.createElement('span'); chip.className='dchip';
        let cls='bad', arrow='↓', text='';
        if(it.name==='Cash Flow'){
          if(dVal>=0){ cls='good'; arrow='↑'; text = (dVal>=0?'+':'−')+Math.abs(Math.round(dVal)).toLocaleString('en-US'); }
          else if(dVal>=-warnBand){ cls='warn'; arrow='→'; text = (dVal>=0?'+':'−')+Math.abs(Math.round(dVal)).toLocaleString('en-US'); }
          else { text = (dVal>=0?'+':'−')+Math.abs(Math.round(dVal)).toLocaleString('en-US'); }
          chip.textContent = `${text} ${arrow}`;
        }else{
          if(dVal>=0){ cls='good'; arrow='↑'; }
          else if(dVal>=-warnBand){ cls='warn'; arrow='→'; }
          const fmt = (unit==='x')? ((v)=>(v>=0?'+':'')+Math.abs(v).toFixed(2)+'x') : ((v)=>(v>=0?'+':'')+Math.abs(v).toFixed(1)+'%');
          chip.textContent = `${fmt(dVal)} ${arrow}`;
        }
        chip.className += ' '+cls;
        sub.appendChild(chip);
        li.appendChild(sub);
        // Tooltip bottom-right per KPI
        const tip=document.createElement('span'); tip.className='info'; tip.textContent='i';
        const tipBox=document.createElement('span'); tipBox.className='itip';
        let tipText='Metric info';
        if(it.name==='ROI (5y)') tipText='Total 5‑year return on equity. Healthy: ≥ 60% (Dubai benchmark).';
        else if(it.name==='Net Yield') tipText='NOI ÷ price (after vacancy & opex). Healthy: ≥ 6%.';
        else if(it.name==='DSCR') tipText='NOI ÷ monthly P&I. Healthy: ≥ 1.20× (borderline 1.0–1.2).';
        else if(it.name==='Gross Yield') tipText='(Rent + extra) ÷ price before opex. Healthy: ≥ 8%.';
        else if(it.name==='Cash Flow') tipText='Monthly NOI − P&I. Healthy: ≥ AED 0/month.';
        tipBox.textContent = tipText;
        tip.appendChild(tipBox);
        li.appendChild(tip);
        c2.appendChild(li);
      });
    }
  }
  // Grade action chips
  const acts=document.getElementById('gradeActions');
  if(acts){
    acts.innerHTML='';
    const shortAED=(v)=>{ const n=Math.abs(v); if(n>=1_000_000) return 'AED '+(v/1_000_000).toFixed(1)+'M'; if(n>=1_000) return 'AED '+(v/1_000).toFixed(1)+'k'; return 'AED '+Math.round(v).toLocaleString('en-US'); };
    const addChip=(text, step)=>{ const b=document.createElement('button'); b.className='act'; b.textContent=text; b.addEventListener('click',()=>{ const calc=document.getElementById('calcStart'); if(typeof setStep==='function'){ setStep(step); } if(calc) calc.scrollIntoView({behavior:'smooth'}); }); acts.appendChild(b); };
    if(isFinite(dscr) && dscr<1.2){
      // Reuse rentNeeded and priceTarget computed above
      if(typeof rentNeeded!=='undefined' && rentNeeded>rent){ addChip(`Rent +${shortAED(rentNeeded-rent)} → DSCR 1.2`,3); }
      if(typeof priceTarget!=='undefined' && priceTarget>0 && priceTarget<pv){ addChip(`Price ≈ ${shortAED(priceTarget)}`,2); }
      addChip('Increase down payment',2);
    }
  }

  // Thresholds toggle
  const tbtn=document.getElementById('viewThresholds'), tbox=document.getElementById('gThresh');
  if(tbtn && tbox && !tbtn._bound){
    tbtn._bound=true;
    tbtn.addEventListener('click',()=>{ tbox.style.display = tbox.style.display==='none' ? 'block':'none'; });
  }

  // Populate previews (radial, stacked, heatband, donut)
  const setPct=(el, pct)=>{ if(el){ el.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct)))); } };
  // radial
  const gr=document.getElementById('gradeRadial');
  if(gr){
    const pct = Math.round((g.score||0));
    const gauge=gr.querySelector('.gr-gauge');
    setPct(gauge, pct);
    safeSetText('grLetter', (g.grade||'—')[0]||'—');
    safeSetText('grScore', String(pct));
    safeSetText('grVerdict', g.description||'—');
    const chips=document.getElementById('grChips');
    if(chips){
      chips.innerHTML='';
      const mk=(t)=>{ const b=document.createElement('span'); b.className='chip'; b.textContent=t; chips.appendChild(b); };
      mk(`ROI ${isFinite(roi5)? roi5.toFixed(0)+'%':'—'}`);
      mk(`Net ${isFinite(netYield)? netYield.toFixed(1)+'%':'—'}`);
      mk(`DSCR ${isFinite(dscr)? dscr.toFixed(2)+'x':'—'}`);
    }
  }
  // stacked
  const gs=document.getElementById('gradeStacked');
  if(gs){
    safeSetText('gsLetter', (g.grade||'—')[0]||'—');
    safeSetText('gsScore', String(Math.round(g.score||0)));
    safeSetText('gsVerdict', g.description||'—');
    // mini bars values
    const setBar=(id,val,pct)=>{ const em=$(id); if(em){ em.style.width=Math.max(0,Math.min(100,pct))+'%'; } };
    safeSetText('gsRoiVal', isFinite(roi5)? roi5.toFixed(0)+'%':'—'); setBar('gsRoiVal', roi5, (roi5/60)*100);
    safeSetText('gsNetVal', isFinite(netYield)? netYield.toFixed(1)+'%':'—'); setBar('gsNetVal', netYield, (netYield/6)*100);
    safeSetText('gsDscrVal', isFinite(dscr)? dscr.toFixed(2)+'x':'—'); setBar('gsDscrVal', dscr, (dscr/1.2)*100);
  }
  // heatband
  const gh=document.getElementById('gradeHeat');
  if(gh){
    const dot=gh.querySelector('#ghDot'); if(dot){ dot.style.left = Math.min(100, Math.max(0, Math.round((g.score||0)))) + '%'; }
    safeSetText('ghVerdict', g.description||'—');
    const icon=$( 'ghIcon'); if(icon){ icon.textContent = g.grade && g.grade[0]<'C' ? '✓' : (g.grade && g.grade[0]==='C' ? '!' : '!'); }
  }
  // donut
  const gd=document.getElementById('gradeDonut');
  if(gd){
    const chart=gd.querySelector('.gd-chart'); setPct(chart, Math.round((g.score||0)));
    safeSetText('gdLetter', (g.grade||'—')[0]||'—');
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
  setState('kROI', roi5>=60?'good':roi5>=40?'warn':'bad', 'Assumptions: 3% appreciation, 0% rent growth, +2% expenses/yr. Healthy: ≥ 60% total over 5 years.');
  setState('kNet', netYield>=6?'good':netYield>=4?'warn':'bad', 'Healthy: ≥ 6% net yield (Dubai avg 3–6%).');
  setState('kGross', grossYield>=8?'good':grossYield>=6?'warn':'bad', 'Healthy: ≥ 8% gross yield (Dubai avg 4–8%).');
  setState('kDSCR', dscr>=1.2?'good':dscr>=1.0?'warn':'bad', 'Healthy: ≥ 1.2 DSCR. Borderline: 1.0–1.2.');

  // AI text (simple)
  const recs=[];
  if(monthlyCashFlow<0) recs.push({type:'danger',text:'Negative monthly cash flow. Consider higher down payment or rent.'});
  else if(monthlyCashFlow<500) recs.push({type:'warn',text:'Low cash flow. Account for vacancy and unexpected expenses.'});
  if(netYield<4) recs.push({type:'warn',text:'Net yield below typical Dubai averages. Revisit price or fees.'});
  if(grossYield<6) recs.push({type:'warn',text:'Gross yield is modest; ensure rent assumptions are realistic.'});
  if(roi5>80) recs.push({type:'success',text:'Strong 5-year ROI; deal looks attractive under current assumptions.'});
  // Rental recommendation action item
  if(typeof window._recSuggestRent!=='undefined'){
    const diff = (window._recSuggestRent||0) - rent;
    if(diff>50){
      recs.push({type:'info', text:`Current rent is below recommended — consider +AED ${Math.round(diff).toLocaleString('en-US')} to target ~${(window._recTargetPct||6)}% net yield.`});
    }else if(diff<-50){
      recs.push({type:'info', text:`Rent appears above recommended by ~AED ${Math.abs(Math.round(diff)).toLocaleString('en-US')}; evaluate competitiveness and assumptions.`});
    }else{
      recs.push({type:'success', text:'Current rent is near recommended for your target net yield.'});
    }
  }
  // DSCR insights
  if(isFinite(dscr)){
    if(dscr<1.0) recs.push({type:'danger',text:`DSCR ${dscr.toFixed(2)}: debt service exceeds NOI. Improve rent or terms.`});
    else if(dscr<1.2) recs.push({type:'warn',text:`DSCR ${dscr.toFixed(2)}: tight coverage. Target ≥ 1.20.`});
    // Break-even rent to reach DSCR 1.2
    const varPct=(maintRate+mgmtRate)/100;
    const fixed=(baseFee + (annualInsurance/12) + (otherExpenses/12));
    const target=1.2;
    const effNeeded = (target*monthlyPayment + fixed) / Math.max(0.0001, (1 - varPct));
    const grossNeeded = effNeeded / Math.max(0.0001, (1 - vacancyRate/100));
    const rentNeeded = Math.max(0, Math.round(grossNeeded - addInc));
    if(rentNeeded>rent) recs.push({type:'info',text:`Break-even rent for DSCR 1.2: AED ${rentNeeded.toLocaleString('en-US')} (current AED ${Math.round(rent).toLocaleString('en-US')}).`});
    // Break-even price via loan amount inversion
    const r = ratePct/100/12, n = years*12;
    if(r>0 && n>0){
      const pmtAllowed = Math.max(0, (effNeeded - (monthlyMaint+monthlyMgmt+fixed))); // NOI target = target*P&I -> already used
      const pmtTarget = (noiMonthly)/target; // allowed payment for DSCR target
      const loanTarget = (pmtTarget>0)? pmtTarget * (1 - Math.pow(1+r, -n)) / r : 0;
      const priceTarget = (1 - (downPct/100))>0 ? loanTarget / (1 - (downPct/100)) : 0;
      if(priceTarget>0 && pv>0){
        const delta = Math.round(priceTarget - pv);
        if(delta < 0) recs.push({type:'success',text:`At current inputs, DSCR 1.2 could be met around price AED ${(Math.round(priceTarget)).toLocaleString('en-US')} (−${Math.abs(delta).toLocaleString('en-US')} vs current).`});
      }
    }
    // +0.5% rate sensitivity
    const rate2 = ratePct + 0.5;
    const r2 = rate2/100/12;
    const pmt2 = (loanAmount>0 && n>0) ? (r2===0 ? loanAmount/n : loanAmount * r2 / (1 - Math.pow(1+r2, -n))) : 0;
    const cf2 = effectiveIncome - monthlyOpex - pmt2;
    const deltaCF = Math.round(cf2 - monthlyCashFlow);
    recs.push({type: deltaCF<0?'warn':'info', text:`+0.50% rate → monthly cash flow ${deltaCF<0?'-':'+'} AED ${Math.abs(deltaCF).toLocaleString('en-US')}.`});
  }
  // Prioritize and limit to top 3 unique
  const prio={danger:3,warn:2,info:1,success:0};
  const seen=new Set();
  const ranked = recs
    .sort((a,b)=> (prio[b.type]??0)-(prio[a.type]??0))
    .filter(r=>{ if(seen.has(r.text)) return false; seen.add(r.text); return true; })
    .slice(0,3);
  const recEl=document.getElementById('recs');
  if(recEl){
    recEl.classList.remove('muted');
    recEl.classList.add('compact');
    const icon=(t)=> t==='danger'?'!':t==='warn'?'!':t==='success'?'✓':'i';
    recEl.innerHTML = ranked.map(r=>`<div class="rec ${r.type}"><span class="ico">${icon(r.type)}</span><span class="txt">${r.text}</span></div>`).join('') || 'No special notes.';
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  // Wizard navigation
  let step=1; const maxStep=4;
  const setStepsMinHeight=()=>{
    const cont=document.querySelector('.steps');
    if(!cont) return;
    let maxH=0;
    document.querySelectorAll('.wstep').forEach(el=>{
      const wasShow = el.classList.contains('show');
      if(!wasShow){
        el.classList.add('show');
        el.style.position='absolute'; el.style.visibility='hidden'; el.style.left='-9999px';
      }
      maxH = Math.max(maxH, el.offsetHeight||0);
      if(!wasShow){
        el.classList.remove('show');
        el.style.position=''; el.style.visibility=''; el.style.left='';
      }
    });
    cont.style.minHeight = (maxH+16)+'px';
  };
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
    segs.forEach((s,i)=>{
      s.classList.remove('active','done');
      if(i < step-1) s.classList.add('done');
      else if(i === step-1) s.classList.add('active');
    });
    const caps=document.querySelectorAll('#segCaps .cap');
    caps.forEach((c,i)=> c.classList.toggle('active', i===step-1));
    const sc=document.getElementById('stepCounter'); if(sc) sc.textContent = `Step ${step}/4`;
    setStepsMinHeight();
  };
  // Make progress segments clickable
  document.querySelectorAll('#segBar .seg').forEach((s,i)=> s.addEventListener('click', ()=> setStep(i+1)));
  const segCaps=document.querySelectorAll('#segCaps .cap');
  segCaps.forEach((c,i)=> c.addEventListener('click', ()=> setStep(i+1)));
  const prev=$("prevStep"), next=$("nextStep");
  if(prev) prev.addEventListener('click', ()=> setStep(step-1));
  if(next) next.addEventListener('click', ()=> setStep(step+1));
  setStep(1);
  setStepsMinHeight();
  window.addEventListener('resize', ()=>{ setStepsMinHeight(); });

  // Mobile hamburger nav
  (function(){
    const header=document.querySelector('header.nav');
    const btn=document.getElementById('navToggle');
    if(!header || !btn) return;
    btn.addEventListener('click', ()=>{
      const isOpen = header.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
    // close when clicking a menu link
    header.querySelectorAll('.menu a').forEach(a=>{
      a.addEventListener('click', ()=>{
        header.classList.remove('open');
        btn.setAttribute('aria-expanded','false');
      });
    });
    // close on outside click
    document.addEventListener('click', (e)=>{
      if(!header.contains(e.target)){
        header.classList.remove('open');
        btn.setAttribute('aria-expanded','false');
      }
    });
  })();
  // "What are the 4 steps?" link → scroll & pulse progress
  const stepsLink=document.querySelector('.promo-steps-link');
  if(stepsLink){
    stepsLink.addEventListener('click', (e)=>{
      const href = stepsLink.getAttribute('href') || '';
      // Only intercept if it's an in-page anchor; otherwise allow navigation
      if(href.startsWith('#')){
        e.preventDefault();
        const target=document.getElementById(href.replace('#',''));
        if(target){ target.scrollIntoView({behavior:'smooth', block:'start'}); }
        const bar=document.getElementById('segBar');
        if(bar){
          bar.classList.add('pulse');
          setTimeout(()=> bar.classList.remove('pulse'), 2600);
        }
      }
    });
  }
  // Hero "Get Started" smooth scroll to calculator
  const heroStart=document.getElementById('heroStart');
  if(heroStart){
    heroStart.addEventListener('click',(e)=>{
      const href = heroStart.getAttribute('href')||'';
      if(href.startsWith('#')){
        e.preventDefault();
        const target=document.getElementById(href.slice(1));
        if(target){ target.scrollIntoView({behavior:'smooth', block:'start'}); }
        const bar=document.getElementById('segBar');
        if(typeof setStep==='function'){ setStep(1); }
        if(bar){ bar.classList.add('pulse'); setTimeout(()=> bar.classList.remove('pulse'), 1600); }
      }
    });
  }

  // Move calculator out of hero into white section on load (keeps markup DRY)
  const calcHost=document.getElementById('calcSection');
  const calcNode=document.getElementById('calcStart');
  if(calcHost && calcNode){
    try{ calcHost.querySelector('.wrap')?.appendChild(calcNode); }catch(_){}
  }

  // Edit links in Input Summary → jump to step
  document.querySelectorAll('.goto-step').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      const step = parseInt(a.getAttribute('data-step')||'1',10);
      const bar=document.getElementById('segBar');
      if(typeof setStep==='function'){ setStep(step); }
      else if(typeof window._setStep==='function'){ window._setStep(step); }
      const calc=document.getElementById('calcStart'); if(calc) calc.scrollIntoView({behavior:'smooth', block:'start'});
      if(bar){ bar.classList.add('pulse'); setTimeout(()=>bar.classList.remove('pulse'), 1600); }
    });
  });
  // Recalc on input changes
  ['propertyValue','propertyValueNum','downPayment','downPaymentNum','agentFee','loanTerm','interestRate','interestRateNum','dldFeeEnabled','additionalCosts','monthlyRent','monthlyRentNum','additionalIncome','vacancyRate','vacancyRateNum','maintenanceRate','maintenanceRateNum','managementFee','managementFeeNum','baseFee','annualInsurance','otherExpenses','bedrooms','bathrooms','size','statusToggle','projectName']
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

  const proBtn=document.getElementById('downloadBtn');
  if(proBtn){
    proBtn.addEventListener('click', ()=>{
      alert('PDF export is currently disabled.');
    });
  }

  // Beta feedback form: store in localStorage
  const fbBtn=document.getElementById('openFeedback');
  if(fbBtn){
    fbBtn.addEventListener('click',()=>{
      // 1) probeer uit data-attribute
      let url = fbBtn.getAttribute('data-url') || '';
      // 2) probeer uit localStorage
      if(!url){ url = localStorage.getItem('feedbackFormUrl') || ''; }
      // 3) als nog leeg: vraag om Google Forms URL (eenmalig)
      if(!url){
        const input = prompt('Plak hier je Google Forms link voor beta feedback:');
        if(input && /^https?:\/\//i.test(input)){
          localStorage.setItem('feedbackFormUrl', input);
          url = input;
        } else {
          alert('Geen geldige link opgegeven.');
          return;
        }
      }
      // Optioneel: prefill projectnaam indien Forms dat ondersteunt (qs blijft generiek)
      try{
        window.open(url, '_blank');
      }catch(e){
        location.href = url;
      }
    });
  }
  

  // Shareable link: encode current inputs into URL
  const encodeState = (obj)=> btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  const collectState = ()=>{
    const ids=['propertyValue','downPayment','agentFee','loanTerm','interestRate','additionalCosts','monthlyRent','additionalIncome','vacancyRate','maintenanceRate','managementFee','baseFee','annualInsurance','otherExpenses','propertyType','community','bedrooms','bathrooms','size','projectName','handover','preHandoverPct'];
    const o={};
    ids.forEach(id=>{ const el=document.getElementById(id); if(el){ o[id]= (el.type==='checkbox')? el.checked : el.value; }});
    const st=document.getElementById('status'); if(st) o['status']=st.value;
    const dld=document.getElementById('dldFeeEnabled'); if(dld) o['dldFeeEnabled']=!!dld.checked;
    return o;
  };
  const shareBtn=document.getElementById('shareBtn');
  if(shareBtn){
    shareBtn.addEventListener('click', async ()=>{
      const q=encodeState(collectState());
      const url = `${location.origin}${location.pathname}?q=${q}`;
      try{
        await navigator.clipboard.writeText(url);
        const prev=shareBtn.textContent; shareBtn.textContent='Link copied!'; setTimeout(()=>shareBtn.textContent=prev, 1500);
      }catch(e){
        prompt('Copy this link:', url);
      }
    });
  }
  const shareWA=document.getElementById('shareWA');
  if(shareWA){
    shareWA.addEventListener('click', ()=>{
      closeShareMenu();
      const q=encodeState(collectState());
      const url = `${location.origin}${location.pathname}?q=${q}`;
      const msg = `Smart Property Analyzer - Dubai%0AProperty analysis link:%0A${encodeURIComponent(url)}`;
      const wa = `https://wa.me/?text=${msg}`;
      window.open(wa,'_blank');
    });
  }
  const shareEmail=document.getElementById('shareEmail');
  if(shareEmail){
    shareEmail.addEventListener('click', ()=>{
      closeShareMenu();
      const q=encodeState(collectState());
      const url = `${location.origin}${location.pathname}?q=${q}`;
      const subject = encodeURIComponent('Dubai Property Analysis');
      const body = encodeURIComponent(`Hi,\n\nHere is the analysis link:\n${url}\n\nGenerated with Smart Property Analyzer - Dubai.`);
      const mailto = `mailto:?subject=${subject}&body=${body}`;
      window.location.href = mailto;
    });
  }
  // Newsletter form (simple validation + success message)
  (function(){
    const form=document.getElementById('newsletterForm');
    if(!form || form._bound) return; form._bound=true;
    const email=document.getElementById('nlEmail');
    const consent=document.getElementById('nlConsent');
    const msg=document.getElementById('nlMsg');
    const emailOk=(v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v||'');
    form.addEventListener('submit',(e)=>{
      e.preventDefault();
      const v=(email&&email.value||'').trim();
      if(!emailOk(v)){ if(msg){ msg.className='nl-msg err'; msg.textContent='Please enter a valid email address.'; } return; }
      if(!consent || !consent.checked){ if(msg){ msg.className='nl-msg err'; msg.textContent='Please confirm consent to subscribe.'; } return; }
      try{ localStorage.setItem('nl_email', v); }catch(_){}
      if(msg){ msg.className='nl-msg ok'; msg.textContent='Thanks! Please check your inbox for confirmation.'; }
      if(email) email.value='';
      if(consent) consent.checked=false;
    });
  })();
  // Testimonials horizontal scroller
  (function(){
    const strip=document.getElementById('tstrip');
    const prev=document.querySelector('.tbtn.tprev');
    const next=document.querySelector('.tbtn.tnext');
    if(!strip || !prev || !next) return;
    const cardWidth=320;
    prev.addEventListener('click', ()=> strip.scrollBy({left:-cardWidth, behavior:'smooth'}));
    next.addEventListener('click', ()=> strip.scrollBy({left: cardWidth, behavior:'smooth'}));
  })();
  // Dropdown toggle and outside click
  const shareToggle=document.getElementById('shareToggle');
  const shareMenu=document.getElementById('shareMenu');
  const shareDD=document.getElementById('shareDD');
  function closeShareMenu(){ if(shareDD){ shareDD.classList.remove('open'); if(shareToggle){ shareToggle.setAttribute('aria-expanded','false'); } if(shareMenu){ shareMenu.setAttribute('aria-hidden','true'); } } }
  if(shareToggle && shareDD){
    shareToggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isOpen = shareDD.classList.toggle('open');
      shareToggle.setAttribute('aria-expanded', String(isOpen));
      if(shareMenu) shareMenu.setAttribute('aria-hidden', String(!isOpen));
    });
    document.addEventListener('click', (e)=>{
      if(!shareDD.contains(e.target)){ closeShareMenu(); }
    });
  }

  // If URL contains ?q=..., apply inputs and calculate
  const params=new URLSearchParams(location.search);
  const q=params.get('q');
  if(q){
    try{
      const decode=(s)=> JSON.parse(decodeURIComponent(escape(atob(s))));
      const data=decode(q);
      Object.entries(data).forEach(([k,v])=>{
        const el=document.getElementById(k);
        if(!el) return;
        if(el.type==='checkbox') el.checked=!!v; else el.value = v;
        try{ el.dispatchEvent(new Event('input',{bubbles:true})); }catch(_){}
        try{ el.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){}
      });
      // apply status toggle visual
      const stVal = data['status'];
      const seg = document.getElementById('statusSeg');
      if(seg && (stVal==='offplan' || stVal==='ready')){
        const btn = seg.querySelector(`.seg-btn[data-status="${stVal}"]`);
        if(btn){ btn.click(); }
      }
      // recalc after applying
      setTimeout(()=>{ try{ calculate(); }catch(_){} }, 50);
    }catch(e){
      console.warn('Failed to apply shared state', e);
    }
  }

  // quick inline feedback
  const setFb=(msg)=>{const el=$("fbMsg"); if(el) el.textContent=msg};

  // Typography variant switch
  (function(){
    const key='typoVariant';
    const setVariant=(v)=>{
      document.body.classList.remove('fontA','fontB','fontC');
      if(v) document.body.classList.add(v);
      try{ localStorage.setItem(key, v||''); }catch(_){}
    };
    const saved = (typeof localStorage!=='undefined') ? localStorage.getItem(key) : '';
    if(saved) setVariant(saved); else setVariant('fontB'); // default to Variant B (Inter Tight)
    const toggle=document.getElementById('typoToggle');
    if(toggle){
      toggle.querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', ()=> setVariant(btn.getAttribute('data-variant')));
      });
    }
  })();
  const fbGood=$("fbGood"), fbOk=$("fbOk"), fbBad=$("fbBad");
  if(fbGood) fbGood.addEventListener('click',()=>{localStorage.setItem('fb_inline','helpful'); setFb('Thanks for your feedback! 👍')});
  if(fbOk) fbOk.addEventListener('click',()=>{localStorage.setItem('fb_inline','okay'); setFb('Thanks! 👌')});
  if(fbBad) fbBad.addEventListener('click',()=>{localStorage.setItem('fb_inline','confusing'); setFb('Thanks, we will improve this. 👎')});

  // Deal comparison logic
  (function(){
    const key='spa_deal_compare';
    const byId=(id)=>document.getElementById(id);
    const getList=()=>{ try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(_){ return []; } };
    const setList=(arr)=>{ try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(_){} };
    const render=()=>{
      const list=getList();
      const none=byId('noDealsMessage'), wrap=byId('comparisonTableWrapper'), chips=byId('savedDealsContainer');
      if(!chips) return;
      // chips row
      chips.innerHTML='';
      if(list.length===0){
        if(none) none.style.display='block';
      }else{
        if(none) none.style.display='none';
        list.forEach((d,i)=>{
          const el=document.createElement('div'); el.className='saved-chip';
          el.innerHTML = `<span class="name">${d.name||('Deal '+(i+1))}</span><span class="meta">${(d.grade||'–')} • ${d.netYield!=null? d.netYield.toFixed(1)+'% net':'–'}</span><button class="rm" title="Remove">×</button>`;
          el.querySelector('.rm').addEventListener('click',()=>{
            const next=getList().filter(x=>x.id!==d.id); setList(next); render(); buildTable();
          });
          chips.appendChild(el);
        });
      }
      if(wrap) wrap.style.display = list.length>0 ? 'block' : 'none';
      buildTable();
    };
    const fmtAED=(v)=> isFinite(v)? 'AED '+Math.round(v).toLocaleString('en-US'):'—';
    const fmtPct=(v, d=1)=> isFinite(v)? v.toFixed(d)+'%':'—';
    const fmtX=(v)=> isFinite(v)? v.toFixed(2)+'x':'—';
    const setHeader=(i,text)=>{ const el=byId('dealHeader'+i); if(el) el.textContent=text; };
    const buildTable=()=>{
      const list=getList();
      setHeader(1, list[0]?.name||'Deal 1');
      setHeader(2, list[1]?.name||'Deal 2');
      setHeader(3, list[2]?.name||'Deal 3');
      const classify=(name,val)=>{
        if(name==='DSCR'){ if(!isFinite(val)) return 'warn'; return val>=1.2?'good':val>=1.0?'warn':'bad'; }
        if(name==='Net yield'){ if(!isFinite(val)) return 'warn'; return val>=6?'good':val>=4?'warn':'bad'; }
        if(name==='IRR (5y)'){ if(!isFinite(val)) return 'warn'; return val>=12?'good':val>=9?'warn':'bad'; }
        if(name==='Cash flow / mo'){ if(!isFinite(val)) return 'warn'; return val>=0?'good':val>=-200?'warn':'bad'; }
        if(name==='Grade'){ if(!isFinite(val)) return 'warn'; return val>=80?'good':val>=65?'warn':'bad'; }
        return '';
      };
      const bar=(pct)=> `<div class="bar-mini"><i style="width:${Math.max(0,Math.min(100, pct))}%"></i></div>`;
      const chip=(cls,text)=> `<span class="chip-val ${cls}">${text}</span>`;
      const rows=[
        {label:'Grade', render:d=> (d? `${chip(classify('Grade', d.gradeScore),' '+(d.grade||'—'))} <span class="val-muted">(${isFinite(d.gradeScore)? Math.round(d.gradeScore):'—'}/100)</span> ${bar(Math.min(100, d.gradeScore||0))}`:'—')},
        {label:'Price', render:d=> d? fmtAED(d.price):'—'},
        {label:'Loan amount', render:d=> d? fmtAED(d.loanAmount):'—'},
        {label:'Total initial', render:d=> d? fmtAED(d.totalInitial):'—'},
        {label:'Monthly P&I', render:d=> d? fmtAED(d.monthlyPayment):'—'},
        {label:'Cash flow / mo', render:d=> d? chip(classify('Cash flow / mo', d.cashFlow), fmtAED(d.cashFlow)):'—'},
        {label:'DSCR', render:d=> d? chip(classify('DSCR', d.dscr), fmtX(d.dscr)):'—'},
        {label:'Net yield', render:d=> d? `${chip(classify('Net yield', d.netYield), fmtPct(d.netYield,1))} ${bar(Math.min(100, (d.netYield||0)/6*100))}`:'—'},
        {label:'Gross yield', render:d=> d? fmtPct(d.grossYield,1):'—'},
        {label:'ROI (5y)', render:d=> d? fmtPct(d.roi5,0):'—'},
        {label:'IRR (5y)', render:d=> d? `${chip(classify('IRR (5y)', d.irr5), fmtPct(d.irr5,2))} ${bar(Math.min(100, (d.irr5||0)/12*100))}`:'—'}
      ];
      const body=byId('comparisonTableBody'); if(!body) return;
      body.innerHTML='';
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        const td0=document.createElement('td'); td0.textContent=r.label; tr.appendChild(td0);
        for(let i=0;i<3;i++){
          const td=document.createElement('td');
          const d=list[i];
          td.innerHTML = d? r.render(d): '—';
          tr.appendChild(td);
        }
        body.appendChild(tr);
      });
      buildSummary(list);
    };
    const buildSummary=(list)=>{
      const el=byId('cmpSummary'); if(!el) return;
      if(!list.length){ el.innerHTML=''; return; }
      const best = [...list].sort((a,b)=> (b.gradeScore||0) - (a.gradeScore||0))[0];
      const bestCF = [...list].sort((a,b)=> (b.cashFlow||-1e9) - (a.cashFlow||-1e9))[0];
      const risks = list.filter(d=> (isFinite(d.dscr) && d.dscr<1.0) || (isFinite(d.netYield) && d.netYield<4));
      const riskNames = risks.map(d=> d.name).join(', ');
      const bestLine = best ? `${best.name} • Grade ${best.grade||'-'} (${Math.round(best.gradeScore||0)}/100)` : '';
      const cfLine = bestCF ? `${bestCF.name} • ${fmtAED(bestCF.cashFlow)}/mo` : '';
      const riskLine = risks.length ? `${riskNames} • check DSCR and Net` : '';
      el.innerHTML = `
        <div class="cmp-lines">
          ${best ? `<div class="cmp-line good"><span class="k">Best overall</span><span class="v">${bestLine}</span></div>`:''}
          ${bestCF ? `<div class="cmp-line good"><span class="k">Best cash flow</span><span class="v">${cfLine}</span></div>`:''}
          ${risks.length ? `<div class="cmp-line warn"><span class="k">Risk flags</span><span class="v">${riskLine}</span><span class="sub">DSCR ≥ 1.20 • Net ≥ 6%</span></div>`:''}
        </div>
      `;
    };
    const bind=()=>{
      const save=byId('saveDealBtn'); const clear=byId('clearComparisonBtn');
      if(save && !save._bound){ save._bound=true; save.addEventListener('click', ()=>{
        const cur=window._currentDealComparison; if(!cur) return;
        const list=getList();
        const next=[...list, cur].slice(-3); setList(next); render();
      });}
      if(clear && !clear._bound){ clear._bound=true; clear.addEventListener('click', ()=>{ setList([]); render(); });}
      render();
    };
    bind();
    // expose helpers for debug
    window._cmpRender = render;
  })();

  // show live values for sliders
  const bindVal=(id,label,fmt=(v)=>v)=>{const el=$(id); const out=$(label); if(el&&out){ const fn=()=> out.textContent=fmt(el.value); el.addEventListener('input',fn); fn(); }}
  bindVal('propertyValue','priceVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  // sync helpers between slider and number for key fields
  const syncPair=(sliderId, numberId, formatter)=>{
    const s=$(sliderId), n=$(numberId); if(!s||!n) return;
    const toNumber=()=>{ n.value = s.value; if(formatter) formatter(s.value); calculate(); };
    const toSlider=()=>{ s.value = n.value; if(formatter) formatter(n.value); calculate(); };
    s.addEventListener('input', toNumber);
    n.addEventListener('input', toSlider);
    toNumber();
  };
  syncPair('propertyValue','propertyValueNum', (v)=>{ const out=$('priceVal'); if(out) out.textContent='AED '+parseInt(v).toLocaleString('en-US'); });
  bindVal('bedrooms','bedroomsVal');
  bindVal('bathrooms','bathroomsVal');
  bindVal('size','sizeVal',(v)=>v+' ft²');
  bindVal('preHandoverPct','preHandoverPctVal',(v)=>v+'%');
  bindVal('agentFee','agentFeeVal',(v)=>v+'%');
  bindVal('loanTerm','loanTermVal',(v)=>v+' years');
  // sync interest rate slider <-> number and value hint
  syncPair('interestRate','interestRateNum', (v)=>{ const out=$('interestRateVal'); if(out) out.textContent=parseFloat(v).toFixed(2)+'%'; });
  // sync down payment slider <-> number and update hint
  syncPair('downPayment','downPaymentNum', (v)=>{ const out=$('downPaymentVal'); if(out) out.textContent = parseFloat(v).toFixed(0)+'%'; });
  bindVal('downPayment','downPaymentVal',(v)=>parseFloat(v).toFixed(0)+'%');
  document.querySelectorAll('.step-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const targetId=btn.getAttribute('data-target'); const delta=parseFloat(btn.getAttribute('data-delta')||'0');
      const s=$(targetId); const n=$(targetId+'Num');
      if(!s) return;
      const min=parseFloat(s.min||0), max=parseFloat(s.max||1000000);
      const next = Math.min(max, Math.max(min, parseFloat(s.value||0)+delta));
      s.value = String(next);
      if(n) n.value = String(next);
      if(targetId==='interestRate'){ const out=$('interestRateVal'); if(out) out.textContent=parseFloat(next).toFixed(2)+'%'; }
      if(targetId==='bedrooms'){ const out=$('bedroomsVal'); if(out) out.textContent=String(next); }
      if(targetId==='bathrooms'){ const out=$('bathroomsVal'); if(out) out.textContent=String(next); }
      calculate();
    });
  });
  bindVal('additionalCosts','additionalCostsVal',(v)=>'AED '+parseInt(v||0).toLocaleString('en-US'));
  // sync monthly rent slider <-> number, with chips
  syncPair('monthlyRent','monthlyRentNum', (v)=>{ const out=$('monthlyRentVal'); if(out) out.textContent='AED '+parseInt(v).toLocaleString('en-US'); });
  const chipSet=(containerId, targetId)=>{
    const box=document.getElementById(containerId); const s=$(targetId), n=$(targetId+'Num'); if(!box||!s||!n) return;
    box.querySelectorAll('.chip').forEach(c=>{
      c.addEventListener('click', ()=>{ const v=c.getAttribute('data-val'); if(!v) return; s.value=v; n.value=v; calculate(); });
    });
  };
  chipSet('priceChips','propertyValue');
  chipSet('rentChips','monthlyRent');
  bindVal('additionalIncome','additionalIncomeVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  // vacancy, maintenance, management sync number <-> slider (with microcopy)
  syncPair('vacancyRate','vacancyRateNum', (v)=>{ const out=$('vacancyRateVal'); if(out) out.textContent=`${parseFloat(v).toFixed(0)}% • typical 2–8%`; });
  syncPair('maintenanceRate','maintenanceRateNum', (v)=>{ const out=$('maintenanceRateVal'); if(out) out.textContent=`${parseFloat(v).toFixed(0)}% • typical 5–10%`; });
  syncPair('managementFee','managementFeeNum', (v)=>{ const out=$('managementFeeVal'); if(out) out.textContent=`${parseFloat(v).toFixed(0)}% • typical 5–8%`; });
  bindVal('baseFee','baseFeeVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('annualInsurance','annualInsuranceVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  bindVal('otherExpenses','otherExpensesVal',(v)=>'AED '+parseInt(v).toLocaleString('en-US'));
  // Growth bindings removed in Basic; fixed defaults are applied in calculations

  // segmented toggle behavior
  const seg=$("statusSeg");
  if(seg){
    seg.querySelectorAll('.seg-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        seg.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const hidden=$("status"); if(hidden) hidden.value = btn.dataset.status;
        const op=$("offplanFields"); if(op) op.style.display = (hidden && hidden.value==='offplan') ? 'block':'none';
        calculate();
        setStepsMinHeight();
      });
    });
    // set initial visibility
    const hidden=$("status"); const op=$("offplanFields"); if(op && hidden){ op.style.display = hidden.value==='offplan' ? 'block':'none'; }
  }
});

// --- Beta soft invite gate (soft gating for testers) ---
(function(){
  try{
    const ok = localStorage.getItem('spa_beta_access')==='1';
    const params=new URLSearchParams(location.search);
    const code=(params.get('invite')||'').toUpperCase();
    const allow=['SPA2026','BETA','SMART'];
    if(!ok){
      if(code && allow.includes(code)){ localStorage.setItem('spa_beta_access','1'); return; }
      const overlay=document.createElement('div');
      Object.assign(overlay.style,{position:'fixed',inset:'0',background:'rgba(10,15,35,.85)',zIndex:'10000',display:'flex',alignItems:'center',justifyContent:'center'});
      overlay.innerHTML=`<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;max-width:360px;width:92%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <h3 style="margin:0 0 8px;color:#0b1e47">Beta access</h3>
        <p style="margin:0 0 10px;color:#334155">Enter your invite code to continue.</p>
        <input id="inviteCode" type="text" placeholder="Invite code" style="width:100%;padding:.7rem .8rem;border:1px solid #dbe4ff;border-radius:10px;margin-bottom:8px" />
        <button id="inviteGo" class="btn" style="width:100%">Unlock</button>
      </div>`;
      document.body.appendChild(overlay);
      const go=overlay.querySelector('#inviteGo');
      const inp=overlay.querySelector('#inviteCode');
      const valid=(v)=> allow.includes((v||'').toUpperCase());
      go.addEventListener('click',()=>{ if(valid(inp.value)){ localStorage.setItem('spa_beta_access','1'); overlay.remove(); } else { inp.style.borderColor='#ef4444'; }});
      inp.addEventListener('keydown',(e)=>{ if(e.key==='Enter') go.click(); });
    }
  }catch(_){}
})();

// --- Analytics helpers and events (Plausible) ---
window._track=function(name, props){ try{ if(window.plausible){ window.plausible(name, props? {props}: undefined); } }catch(_){} };

// CTA clicks: Analyze a deal
document.addEventListener('click',(e)=>{
  const a=e.target.closest('a');
  if(a && (a.getAttribute('href')==='#calcStart' || (a.getAttribute('href')||'').includes('#calcStart'))){
    window._track('analyze_cta_click');
  }
});
// Wizard next/prev
(function(){
  const n=document.getElementById('nextStep'), p=document.getElementById('prevStep');
  if(n) n.addEventListener('click',()=> window._track('wizard_next'));
  if(p) p.addEventListener('click',()=> window._track('wizard_prev'));
  document.querySelectorAll('.segcaps .cap,[data-step]').forEach(el=>{
    el.addEventListener('click',()=>{ const s=el.getAttribute('data-step'); if(s) window._track('wizard_step_view',{step:s}); });
  });
})();
// Share menu
(function(){
  const open=document.getElementById('shareToggle'); if(open) open.addEventListener('click',()=> window._track('share_open'));
  const copy=document.getElementById('shareBtn'); if(copy) copy.addEventListener('click',()=> window._track('share_copy'));
  const wa=document.getElementById('shareWA'); if(wa) wa.addEventListener('click',()=> window._track('share_whatsapp'));
  const em=document.getElementById('shareEmail'); if(em) em.addEventListener('click',()=> window._track('share_email'));
})();
