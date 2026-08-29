import { describe, it, expect } from 'vitest';
import {
  toMinutesOfDay, fmtShiftRange, shiftDurationMinutes, calcAutoOTHours,
  generateShiftTimesLine, syncShiftTimesIntoForm, SHIFT_TIMES_MARKER,
} from './shiftTimes.js';

describe('toMinutesOfDay', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(toMinutesOfDay('00:00')).toBe(0);
    expect(toMinutesOfDay('07:30')).toBe(450);
    expect(toMinutesOfDay('23:59')).toBe(1439);
  });
});

describe('shiftDurationMinutes', () => {
  it('computes a same-day duration', () => {
    expect(shiftDurationMinutes('07:00', '15:00')).toBe(480); // 8h
  });
  it('rolls over midnight for an overnight shift (end <= start)', () => {
    expect(shiftDurationMinutes('22:00', '06:00')).toBe(480); // 8h overnight
  });
  it('returns 0 when either time is missing', () => {
    expect(shiftDurationMinutes('', '06:00')).toBe(0);
    expect(shiftDurationMinutes('22:00', '')).toBe(0);
  });
});

describe('calcAutoOTHours', () => {
  it('is the difference between actual and rostered duration on a normal duty', () => {
    const f = { dutyType:'normal', rosteredStart:'07:00', rosteredEnd:'15:00', actualStart:'07:00', actualEnd:'19:00' };
    expect(calcAutoOTHours(f)).toBe(4); // 12h actual - 8h rostered
  });

  it('never returns negative overtime when the actual shift was shorter than rostered', () => {
    const f = { dutyType:'normal', rosteredStart:'07:00', rosteredEnd:'15:00', actualStart:'07:00', actualEnd:'13:00' };
    expect(calcAutoOTHours(f)).toBe(0);
  });

  it('counts the WHOLE actual shift as overtime on a Rest Day Working (RDW) duty', () => {
    const f = { dutyType:'rdw', actualStart:'08:00', actualEnd:'16:00' };
    expect(calcAutoOTHours(f)).toBe(8);
  });

  it('handles an overnight actual shift correctly', () => {
    const f = { dutyType:'normal', rosteredStart:'22:00', rosteredEnd:'06:00', actualStart:'22:00', actualEnd:'08:00' };
    expect(calcAutoOTHours(f)).toBe(2); // 10h actual - 8h rostered
  });
});

describe('fmtShiftRange', () => {
  it('formats a same-day range plainly', () => {
    expect(fmtShiftRange('07:00', '15:00')).toBe('07:00–15:00');
  });
  it('flags an overnight range', () => {
    expect(fmtShiftRange('22:00', '06:00')).toBe('22:00–06:00 (next day)');
  });
  it('returns null when either time is missing', () => {
    expect(fmtShiftRange('', '06:00')).toBeNull();
    expect(fmtShiftRange('06:00', '')).toBeNull();
  });
});

describe('generateShiftTimesLine', () => {
  it('returns null when recordShiftTimes is off', () => {
    expect(generateShiftTimesLine({ recordShiftTimes:false })).toBeNull();
  });

  it('describes an RDW shift by its actual times only', () => {
    const f = { recordShiftTimes:true, dutyType:'rdw', actualStart:'08:00', actualEnd:'16:00' };
    expect(generateShiftTimesLine(f)).toBe(SHIFT_TIMES_MARKER + 'Rest Day Working (RDW)  |  Actual: 08:00–16:00');
  });

  it('describes a normal duty with both rostered and actual times', () => {
    const f = { recordShiftTimes:true, dutyType:'normal', rosteredStart:'07:00', rosteredEnd:'15:00', actualStart:'07:00', actualEnd:'19:00' };
    expect(generateShiftTimesLine(f)).toBe(SHIFT_TIMES_MARKER + 'Rostered: 07:00–15:00  |  Actual: 07:00–19:00');
  });
});

describe('syncShiftTimesIntoForm', () => {
  it('prepends the generated line above any existing notes', () => {
    const f = { recordShiftTimes:true, dutyType:'rdw', actualStart:'08:00', actualEnd:'16:00', comments:'Called out for a burglary.' };
    const result = syncShiftTimesIntoForm(f);
    expect(result.comments.startsWith(SHIFT_TIMES_MARKER)).toBe(true);
    expect(result.comments).toContain('Called out for a burglary.');
  });

  it('replaces a previously-generated line rather than duplicating it', () => {
    const first = syncShiftTimesIntoForm({ recordShiftTimes:true, dutyType:'rdw', actualStart:'08:00', actualEnd:'16:00', comments:'' });
    const second = syncShiftTimesIntoForm({ ...first, actualEnd:'18:00' });
    const markerCount = (second.comments.match(new RegExp(SHIFT_TIMES_MARKER.trim(), 'g')) || []).length;
    expect(markerCount).toBe(1);
    expect(second.comments).toContain('18:00');
  });

  it('leaves comments untouched (minus any marker line) when times are not being recorded', () => {
    const result = syncShiftTimesIntoForm({ recordShiftTimes:false, comments:'Just a note.' });
    expect(result.comments).toBe('Just a note.');
  });
});
