'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalProfile, SessionExpiredError } from 'lib/api';
import { cn } from 'lib/utils';
import { LAST_PORTAL_USER_ID, SHOW_TECHNICAL_DETAILS } from '../constants';
import { toPrettyValue, toLabel, flattenScalarPairs } from '../utils';
import dynamic from 'next/dynamic';

const LanyardBadge = dynamic(() => import('components/LanyardBadge'), { 
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center" style={{ height: '600px' }}>
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <div className="size-3 bg-foreground/10 rotate-45" />
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">Loading Identity</p>
      </div>
    </div>
  )
});

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

  if (!profile) return (
    <div className="pb-28 sm:pb-24">
      <div className="flex items-center justify-center animate-pulse" style={{ height: '600px' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="size-3 bg-foreground/10 rotate-45" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">Syncing Identity</p>
        </div>
      </div>
    </div>
  );

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
    <div className="space-y-0">
      {/* Interactive 3D Identity Lanyard — rendered outside Card to avoid overflow:hidden clipping */}
      <LanyardBadge 
        profilePhotoSrc={profilePhotoSrc}
        profileName={profileName}
        enrollment={(profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment}
      />

    <Card className={`rounded-none border-border/60 bg-card/60 pb-28 sm:pb-24 shadow-2xl spotlight-card`}>
      <CardContent className="space-y-6 p-6 sm:p-8">
        {/* Profile Identity */}
        <div className={`flex flex-col sm:flex-row items-center gap-6 p-6 border border-border/50 bg-muted/10`}>
          <div className="relative group shrink-0">
             {profilePhotoSrc ? (
                <Image
                  src={profilePhotoSrc}
                  alt="Student Identity"
                  width={96}
                  height={96}
                  unoptimized
                  className="size-24 rounded-none border-2 border-primary/20 object-cover shadow-[4px_4px_0px_rgba(0,0,0,0.1)] group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="size-24 flex items-center justify-center rounded-none border-2 border-primary/20 bg-background text-2xl font-black text-primary shadow-[4px_4px_0px_rgba(0,0,0,0.1)]">
                  {String(profileName || 'S').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 size-4 bg-primary animate-pulse" />
          </div>
          
          <div className="text-center sm:text-left space-y-1 flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">OFFICIAL IDENTITY</p>
            <h3 className="text-2xl font-black tracking-tightest text-foreground font-[var(--font-instrument-sans)] truncate uppercase">
              {profileName || 'Student'}
            </h3>
            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest break-all">
              ID // {(profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex border border-border bg-muted/20 p-1">
          {['personal', 'academic', 'contact'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all",
                profileTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setProfileTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Data Grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleRows.map(([k, v]) => (
            <div key={k} className="border border-border/40 p-4 space-y-1 hover:border-primary/30 transition-colors group">
              <span className="block text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">{k}</span>
              <p className={cn(
                "text-sm font-bold tracking-tight uppercase font-[var(--font-archivo)]",
                v ? "text-foreground" : "text-muted-foreground italic"
              )}>
                {v || 'Not Provided'}
              </p>
            </div>
          ))}
        </div>

        {/* Metadata section (Technical) */}
        {SHOW_TECHNICAL_DETAILS && extraRows.length ? (
          <div className="mt-8 space-y-4">
             <div className="flex items-center gap-3">
                <div className="h-px bg-border/20 flex-1" />
                <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">Extended Parameters</span>
                <div className="h-px bg-border/20 flex-1" />
             </div>
             <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
               {extraRows.map(([k, v]) => (
                 <div key={`extra-${k}`} className="border-l border-primary/20 bg-muted/5 px-3 py-2 text-[10px]">
                   <span className="block font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5">{k}</span>
                   <p className="font-bold text-foreground/80 break-all">{v}</p>
                 </div>
               ))}
             </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
    </div>
  );
}
