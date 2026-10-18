const { computeCountsFromDaily } = require('../../services/portalAttendanceService');

const day = (present, classtype = 'Regular') => ({
  present,
  classtype,
  attendancestatus: 'Current',
});
const repeat = (n, entry) => Array.from({ length: n }, () => entry);

describe('computeCountsFromDaily', () => {
  it('leaves extra classes out of the total but counts them as attended', () => {
    const rows = [
      ...repeat(22, day('Present')),
      ...repeat(4, day('Present', 'Extra')),
      ...repeat(7, day('Absent')),
      ...repeat(1, day('Absent', 'Extra')),
    ];
    // The portal shows 89.7% for this subject, which is 26 / 29.
    expect(computeCountsFromDaily(rows)).toEqual({ attended: 26, total: 29 });
  });

  it('counts make-up classes like regular ones', () => {
    const rows = [
      ...repeat(31, day('Present')),
      day('Present', 'Makup'),
      ...repeat(8, day('Absent')),
      day('Absent', 'Extra'),
    ];
    // The portal shows 80%.
    expect(computeCountsFromDaily(rows)).toEqual({ attended: 32, total: 40 });
  });

  it('caps attended at the total, as the portal caps the percentage at 100', () => {
    const rows = [
      ...repeat(11, day('Present')),
      ...repeat(2, day('Present', 'Extra')),
      day('Absent'),
    ];
    expect(computeCountsFromDaily(rows)).toEqual({ attended: 12, total: 12 });
  });

  it('returns zero classes when the portal has no day-by-day records', () => {
    expect(computeCountsFromDaily([])).toEqual({ attended: 0, total: 0 });
  });
});
