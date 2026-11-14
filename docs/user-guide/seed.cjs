module.exports = (theme) => {
  localStorage.setItem('ajs_ot_settings', JSON.stringify({ rank:'Sergeant', service:'SGT 3', deductions:[
    {id:'a',name:'Federation subs',amount:'23.94',when:'after'},{id:'b',name:'ATOC',amount:'41.67',when:'after'},
    {id:'c',name:'Police Mutual',amount:'28.50',when:'after',off:['December 2026']},{id:'d',name:'Cycle2Work',amount:'50.00',when:'before'}]}));
  const E = (id, date, h, rate, pa) => ({ id, date, reason:'Event', hours133:'', hours150: rate==='hours150'?String(h):'', hours200: rate==='hours200'?String(h):'', paRate: pa||'None', comments:'', recordShiftTimes:false, dutyType:'normal', otRateTier:rate, takeAs:'pay', otSubmitted:true, otSubmittedDate:date, paSubmitted:!!pa, paSubmittedDate: pa?date:'' });
  const list=[]; let n=0;
  const days=['2026-04-04','2026-04-18','2026-05-02','2026-05-16','2026-05-30','2026-06-13','2026-06-27','2026-07-11','2026-07-25','2026-08-08','2026-08-22','2026-09-05','2026-09-19','2026-10-03','2026-10-17','2026-10-31','2026-11-07'];
  days.forEach((d,i)=>{ list.push(E('e'+(n++), d, i%4===3?10:8, i%5===2?'hours200':'hours150', i%3===0?'PA2':null)); });
  // The last two still to submit, so Awaits Submission has something in it.
  list.slice(-2).forEach(e=>{ e.otSubmitted=false; e.otSubmittedDate=''; if (e.paRate!=='None') { e.paSubmitted=false; e.paSubmittedDate=''; } });
  // One shift taken as TOIL, and half a day of it used.
  list.push({ ...E('e'+(n++), '2026-09-26', 6, 'hours150'), reason:'Football', takeAs:'toil' });
  localStorage.setItem('ajs_ot_entries', JSON.stringify(list));
  localStorage.setItem('ajs_ot_toilTaken', JSON.stringify([{ id:'t1', date:'2026-10-23', hours:4, note:'Half day' }]));
  localStorage.setItem('ajs_ot_themeMode', JSON.stringify(theme||'light'));
};
