'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalProfile, SessionExpiredError } from 'lib/api';
import { LAST_PORTAL_USER_ID, SHOW_TECHNICAL_DETAILS } from '../constants';
import { toPrettyValue, toLabel, flattenScalarPairs } from '../utils';

export default function ProfileView({ token, onExpired }) {
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState('');
  const [fallbackEnrollment, setFallbackEnrollment] = useState('');
  const [profileTab, setProfileTab] = useState('personal');

  useEffect(() => {
    try {
      setFallbackEnrollment(window.localStorage.getItem(LAST_PORTAL_USER_ID) || '');
    } catch (_error) {
      setFallbackEnrollment('');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setMessage('');
      setProfile(null);
      try {
        const fresh = await fetchPortalProfile(token, false);
        const data = fresh?.data || null;

        if (!cancelled) {
          setProfile(data || { realData: false, message: 'No direct profile data available.' });
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof SessionExpiredError) { onExpired?.(); return; }
          setProfile({ realData: false, message: err?.message || 'Unable to load profile' });
          setMessage(err?.message || 'Unable to load profile');
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [token, onExpired]);

  if (!profile) return <p className="pb-24 text-sm text-muted-foreground">Loading profile...</p>;

  if (profile?.realData === false) {
    return <p className="pb-24 text-sm text-muted-foreground">{profile.message || message || 'No direct profile data available.'}</p>;
  }

  const keyMap = Object.keys(profile || {}).reduce((acc, key) => {
    acc[String(key).toLowerCase()] = key;
    return acc;
  }, {});

  const keyNorm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const findProfileValue = (keys = [], contains = []) => {
    for (const key of keys) {
      const resolved = keyMap[String(key).toLowerCase()] || key;
      const pretty = toPrettyValue(profile?.[resolved]);
      if (pretty) return pretty;
    }

    const normalizedTokens = contains.map((token) => keyNorm(token)).filter(Boolean);
    for (const [rawKey, rawValue] of Object.entries(profile || {})) {
      const pretty = toPrettyValue(rawValue);
      if (!pretty) continue;
      const normalizedKey = keyNorm(rawKey);
      if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
        return pretty;
      }
    }
    return '';
  };

  const profilePhotoRaw = findProfileValue(
    ['studentphoto', 'studentimage', 'profilephoto', 'photobase64', 'photo'],
    ['student photo', 'profile photo', 'photo base64', 'image base64']
  );

  const profilePhotoSrc = (() => {
    if (!profilePhotoRaw) return '';
    if (profilePhotoRaw.startsWith('data:image') || profilePhotoRaw.startsWith('http://') || profilePhotoRaw.startsWith('https://')) {
      return profilePhotoRaw;
    }
    if (/^[A-Za-z0-9+/=]+$/.test(profilePhotoRaw) && profilePhotoRaw.length > 120) {
      return `data:image/jpeg;base64,${profilePhotoRaw}`;
    }
    return '';
  })();

  const profileName = findProfileValue(['studentname', 'name'], ['student name']) || profile.studentname;

  const rows = [
    ['Name', profileName],
    ['Enrollment', (profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment],
    ['Program', profile.program],
    ['Semester', profile.semester],
    ['Section', profile.sectioncode],
    ['Batch', profile.batch],
    ['Email', profile.instituteemail],
    ...(SHOW_TECHNICAL_DETAILS
      ? [
          ['Student ID', profile.studentid],
          ['Member ID', profile.memberid],
          ['User ID', profile.userid],
          ['Branch ID', profile.branchid],
          ['Branch Code', profile.branchcode],
          ['Program ID', profile.programid],
          ['Institute ID', profile.instituteid],
          ['Client ID', profile.clientid]
        ]
      : [])
  ];

  const knownKeys = new Set([
    'studentname',
    'enrollmentno',
    'program',
    'semester',
    'sectioncode',
    'batch',
    'instituteemail',
    'dateofbirth',
    'gender',
    'bloodgroup',
    'nationality',
    'category',
    'fathersname',
    'fathername',
    'mothersname',
    'mothername',
    'registrationno',
    'institutecode',
    'academicyear',
    'admissionyear',
    'studentpersonalemailid',
    'studentcellno',
    'parentcellno',
    'parenttelephoneno',
    'ccityname',
    'cstatename',
    'cpostalcode',
    'cdistrict',
    'pdistrict',
    'pcityname',
    'pstatename',
    'ppostalcode',
    'studentemailid',
    'parentemailid',
    'apaarid',
    'programcode',
    'programdesc',
    'branch',
    'branchdesc',
    'designation',
    'stymax',
    'caddress1',
    'caddress2',
    'caddress3',
    'paddress1',
    'paddress2',
    'paddress3',
    'personalemail',
    'mobile',
    'alternatecontact',
    'address',
    'city',
    'state',
    'pincode',
    'studentid',
    'memberid',
    'userid',
    'branchid',
    'branchcode',
    'programid',
    'instituteid',
    'clientid',
    'studentphoto',
    'studentimage',
    'profilephoto',
    'photobase64',
    'photo',
    'realData',
    'message',
    'source'
  ]);

  const extraRows = flattenScalarPairs(profile || {})
    .filter(([key]) => !knownKeys.has(String(key).toLowerCase()) && !String(key).startsWith('raw.'))
    .filter(([key, value]) => {
      const keyText = String(key || '').toLowerCase();
      const valueText = String(value || '').trim();
      if (!valueText) return false;
      if (/(token|jwt|cookie|session|captcha|checksum|hash|photoevent|eventcode|raw)/.test(keyText)) return false;
      if (valueText.length > 120 && !valueText.includes(' ')) return false;
      return true;
    })
    .slice(0, 12)
    .map(([key, value]) => [toLabel(String(key).replace(/\./g, ' ')), value]);

  const personalRows = [
    ['Name', profileName],
    ['APAAR ID', profile.apaarid || findProfileValue([], ['apaar id'])],
    ['Date of Birth', profile.dateofbirth || profile.dob || findProfileValue(['birthdate', 'studentdob'], ['date of birth', 'dob'])],
    ['Gender', profile.gender || findProfileValue([], ['gender'])],
    ['Blood Group', profile.bloodgroup || findProfileValue([], ['blood group', 'bloodgroup'])],
    ['Nationality', profile.nationality || findProfileValue([], ['nationality'])],
    ['Category', profile.category || findProfileValue([], ['category'])],
    ['Father Name', profile.fathersname || profile.fathername || findProfileValue(['fathername'], ['father name'])],
    ['Mother Name', profile.mothersname || profile.mothername || findProfileValue(['mothername'], ['mother name'])]
  ];

  const academicRows = [
    ['Enrollment', (profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment],
    ['Program', profile.program || profile.programdesc || profile.programcode || findProfileValue([], ['program'])],
    ['Semester', profile.semester || profile.stynumber || profile.stymax],
    ['Section', profile.sectioncode],
    ['Batch', profile.batch || profile.academicyear || profile.admissionyear],
    ['Branch', profile.branchcode || profile.branch || profile.branchdesc || findProfileValue([], ['branch'])],
    ['Registration No.', profile.registrationno],
    ['Institute Code', profile.institutecode],
    ['Academic Year', profile.academicyear],
    ['Admission Year', profile.admissionyear],
    ['Designation', profile.designation || findProfileValue([], ['designation'])]
  ];

  const addressFromParts = [
    profile.caddress,
    profile.currentaddress,
    profile.address,
    profile.caddress1,
    profile.caddress2,
    profile.caddress3,
    profile.paddress1,
    profile.paddress2,
    profile.paddress3,
    profile.permanentaddress,
    profile.addr1,
    profile.addressline1
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, idx, arr) => arr.indexOf(value) === idx)
    .join(', ');

  const contactRows = [
    ['Institute Email', profile.instituteemail || profile.studentemail || profile.studentemailid || profile.emailid || findProfileValue([], ['institute email'])],
    ['Personal Email', profile.personalemail || profile.studentpersonalemailid || profile.parentemailid || profile.fatheremailid || profile.guardianemailid || findProfileValue([], ['personal email', 'parent email'])],
    ['Mobile', profile.mobile || profile.studentcellno || profile.studentmobileno || profile.contactno || findProfileValue([], ['mobile', 'cell no'])],
    ['Alternate Contact', profile.alternatecontact || profile.parentmobileno || profile.fathermobileno || profile.guardianmobileno || profile.parentcellno || findProfileValue([], ['alternate contact', 'guardian mobile'])],
    ['Telephone', profile.studenttelephoneno || profile.parenttelephoneno || findProfileValue([], ['telephone', 'phone'])],
    ['Address', addressFromParts || null],
    ['City', profile.city || profile.cityname || profile.ccityname || profile.pcityname || findProfileValue([], ['city'])],
    ['State', profile.state || profile.statename || profile.cstatename || profile.cstate || profile.pstatename || findProfileValue([], ['state'])],
    ['Pincode', profile.pincode || profile.postalcode || profile.cpostalcode || profile.ppostalcode || findProfileValue([], ['postal code', 'pincode'])],
    ['District', profile.cdistrict || profile.pdistrict || findProfileValue([], ['district'])]
  ];

  const visibleRowsRaw = profileTab === 'personal'
    ? personalRows
    : profileTab === 'academic'
      ? academicRows
      : contactRows;

  const visibleRows = [
    ...visibleRowsRaw.filter(([, value]) => Boolean(toPrettyValue(value))),
    ...visibleRowsRaw.filter(([, value]) => !toPrettyValue(value)).slice(0, 3)
  ];

  return (
    <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70 pb-28 sm:pb-24">
      <CardContent className="space-y-3 p-4">
        <div className="mb-1 flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-3">
          {profilePhotoSrc ? (
            <Image
              src={profilePhotoSrc}
              alt="Student"
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-lg font-bold text-slate-600 dark:text-slate-300">
              {String(profileName || 'S').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Student Profile</p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">{profileName || 'Student'}</p>
            <p className="text-xs text-muted-foreground">{(profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment || 'Enrollment unavailable'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-1 text-xs">
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${profileTab === 'personal' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setProfileTab('personal')}
          >
            Personal
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${profileTab === 'academic' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setProfileTab('academic')}
          >
            Academic
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${profileTab === 'contact' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setProfileTab('contact')}
          >
            Contact
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {visibleRows.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border/70 bg-background/45 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{k}</p>
              <p className={`mt-1 text-sm ${v ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>{v || 'Not Available'}</p>
            </div>
          ))}
        </div>
        {SHOW_TECHNICAL_DETAILS ? (
          <>
            {rows.map(([k, v]) => (
              <div key={`tech-${k}`} className="flex flex-col gap-1 border-b border-border/60 pb-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-semibold break-all sm:break-normal">{v || 'Not Available'}</span>
              </div>
            ))}
          </>
        ) : null}
        {extraRows.length ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/55 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Additional Details</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {extraRows.map(([k, v]) => (
                <div key={`extra-${k}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs">
                  <p className="text-muted-foreground">{k}</p>
                  <p className="font-semibold text-slate-700 dark:text-slate-200 break-all">{v}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
