// ─── Record Shift Times (optional Notes convenience) ──────────────────────────
export const toMinutesOfDay = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };

// A blank end-time equal to or earlier than start is treated as finishing the
// following day — matches how the app already handles overnight night-work.
export const fmtShiftRange = (start, end) => {
  if (!start || !end) return null;
  const overnight = toMinutesOfDay(end) <= toMinutesOfDay(start);
  return `${start}–${end}${overnight ? ' (next day)' : ''}`;
};

export const SHIFT_TIMES_MARKER = '⏱ ';

export const generateShiftTimesLine = f => {
  if (!f.recordShiftTimes) return null;
  if (f.dutyType === 'rdw') {
    const a = fmtShiftRange(f.actualStart, f.actualEnd);
    if (!a) return null;
    return SHIFT_TIMES_MARKER + `Rest Day Working (RDW)  |  Actual: ${a}`;
  }
  const r = fmtShiftRange(f.rosteredStart, f.rosteredEnd);
  const a = fmtShiftRange(f.actualStart, f.actualEnd);
  if (!r && !a) return null;
  const parts = [];
  if (r) parts.push(`Rostered: ${r}`);
  if (a) parts.push(`Actual: ${a}`);
  return SHIFT_TIMES_MARKER + parts.join('  |  ');
};

// ─── Overtime auto-calculation from rostered vs actual shift times ───
// Overtime = how much longer the actual shift ran than the rostered one
// (duration comparison, not a clock-window comparison — an early start that's
// offset by an early finish of the same size produces zero overtime). On a
// Rest Day Working (RDW) shift there's no roster to compare against, so the
// whole actual shift is overtime.
export const shiftDurationMinutes = (start, end) => {
  if (!start || !end) return 0;
  let s = toMinutesOfDay(start), e = toMinutesOfDay(end);
  if (e <= s) e += 1440; // overnight
  return e - s;
};

export const calcAutoOTHours = f => {
  const actualDur = shiftDurationMinutes(f.actualStart, f.actualEnd);
  if (f.dutyType === 'rdw') return actualDur / 60;
  const rosteredDur = shiftDurationMinutes(f.rosteredStart, f.rosteredEnd);
  return Math.max(0, (actualDur - rosteredDur) / 60);
};

// Keeps the auto-generated shift-times line in sync with the top of Notes,
// without disturbing anything else the person has typed underneath it.
export const syncShiftTimesIntoForm = f => {
  const lines = (f.comments||'').split('\n');
  const hasMarker = lines[0] && lines[0].startsWith(SHIFT_TIMES_MARKER);
  const rest = hasMarker ? lines.slice(1).join('\n').replace(/^\n+/,'') : (f.comments||'');
  const line = generateShiftTimesLine(f);
  // Always a blank line after the generated line, even with nothing typed yet
  // below it — that blank line is where the cursor gets placed once the
  // actual shift end time is set.
  const comments = line ? `${line}\n\n${rest}` : rest;
  return { ...f, comments };
};
