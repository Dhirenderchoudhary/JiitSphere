const {
  isGoogleCredential,
  assertCollegeSsoUrl,
  mapGoogleRegdata,
  collegeErrorMessage,
} = require('../../services/portalGoogleLogin');

describe('portal Google sign-in', () => {
  test('accepts a three-part Google credential and rejects junk', () => {
    const credential = `${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`;
    expect(isGoogleCredential(credential)).toBe(true);
    expect(isGoogleCredential('not-a-jwt')).toBe(false);
    expect(isGoogleCredential('')).toBe(false);
  });

  test('only allows the college SSO host over https', () => {
    const ok =
      'https://webportal.jiit.ac.in:6013/CLXSSOAPI/token/generate-token-google-signin';
    expect(assertCollegeSsoUrl(ok, 'webportal.jiit.ac.in')).toBe(ok);
    expect(() => assertCollegeSsoUrl('http://webportal.jiit.ac.in/token', 'webportal.jiit.ac.in')).toThrow(
      /portal host/
    );
    expect(() =>
      assertCollegeSsoUrl('https://evil.example/token', 'webportal.jiit.ac.in')
    ).toThrow(/portal host/);
  });

  test('maps the Google session onto the relay auth fields', () => {
    const regdata = mapGoogleRegdata({
      token: 'portal-token',
      clientid: 'c1',
      value: 'inst-9',
      label: 'JIIT',
      name: 'A Student',
      enrollmentno: '9921103001',
      userid: '9921103001',
      memberid: '77',
      membertype: 'S',
    });

    expect(regdata.token).toBe('portal-token');
    expect(regdata.instituteid).toBe('inst-9');
    expect(regdata.institutelist[0].value).toBe('inst-9');
    expect(regdata.memberid).toBe('77');
    expect(regdata.membertype).toBe('S');
    expect(mapGoogleRegdata({ name: 'no token' })).toBeNull();
  });

  test('reads the college error string', () => {
    expect(
      collegeErrorMessage({ status: { errors: [null, 'Email is not registered'] } })
    ).toBe('Email is not registered');
    expect(collegeErrorMessage({ status: { errors: [null] } })).toBe('');
  });
});
