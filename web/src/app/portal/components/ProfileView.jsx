'use client';

import { useEffect, useState } from 'react';
import { fetchPortalProfile, fetchPortalProfilePhotoBlob, SessionExpiredError } from 'lib/api';
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
        <p className="text-xs font-medium text-muted-foreground/40">Loading identity...</p>
      </div>
    </div>
  )
});

const normalizeToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const extractPhotoText = (value, depth = 0) => {
  if (depth > 4 || value === null || value === undefined) return '';

  if (typeof value === 'string') {
    const text = String(value).trim();
    return text || '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractPhotoText(item, depth + 1);
      if (extracted) return extracted;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const preferredKeys = [
    'studentphoto',
    'studentimage',
    'profilephoto',
    'photobase64',
    'photo',
    'profileimgurl',
    'profileimageurl',
    'studentphotourl',
    'imageurl',
    'photourl',
    'image',
    'img',
    'url',
    'base64',
    'data'
  ];

  for (const key of preferredKeys) {
    const keyNorm = normalizeToken(key);
    const matchedEntry = Object.entries(value).find(([rawKey]) => normalizeToken(rawKey) === keyNorm);
    if (!matchedEntry) continue;
    const extracted = extractPhotoText(matchedEntry[1], depth + 1);
    if (extracted) return extracted;
  }

  for (const [rawKey, rawValue] of Object.entries(value || {})) {
    const keyNorm = normalizeToken(rawKey);

    // Official payloads sometimes wrap image fields in profile-like nested objects.
    const isDirectMediaKey = /(photo|image|img|base64|avatar|signature)/.test(keyNorm);
    const isProfileContainer = /profile/.test(keyNorm) && (Array.isArray(rawValue) || (rawValue && typeof rawValue === 'object'));
    if (!isDirectMediaKey && !isProfileContainer) continue;

    const extracted = extractPhotoText(rawValue, depth + 1);
    if (extracted) return extracted;
  }

  return '';
};

const normalizePhotoSrc = (rawValue) => {
  let extracted = extractPhotoText(rawValue);
  if (!extracted) return '';

  let text = String(extracted).trim().replace(/^['"]|['"]$/g, '');
  if (!text) return '';

  // Some portal payloads return JSON-encoded strings for image metadata.
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      extracted = extractPhotoText(parsed);
      text = String(extracted || '').trim().replace(/^['"]|['"]$/g, '');
      if (!text) return '';
    } catch (_error) {
      // Keep original text if parsing fails.
    }
  }

  // Some official payloads start with raw JPEG base64 (`/9j/...`) rather than a URL.
  // Detect and convert before treating leading `/` as a path.
  const compact = text.replace(/\s+/g, '');
  if (compact.length > 80 && /^[A-Za-z0-9+/=_-]+$/.test(compact)) {
    return `data:image/jpeg;base64,${compact.replace(/-/g, '+').replace(/_/g, '/')}`;
  }

  if (
    text.startsWith('data:image') ||
    text.startsWith('http://') ||
    text.startsWith('https://') ||
    text.startsWith('/')
  ) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const markerIndex = lowerText.indexOf('base64,');
  if (markerIndex >= 0) {
    const payload = text.slice(markerIndex + 7).replace(/\s+/g, '');
    if (payload.length > 80) {
      return `data:image/jpeg;base64,${payload.replace(/-/g, '+').replace(/_/g, '/')}`;
    }
  }

  if (text.startsWith('www.')) {
    return `https://${text}`;
  }

  if (/^[A-Za-z0-9._/-]+\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(text)) {
    return text.startsWith('/') ? text : `/${text}`;
  }

  return '';
};

const needsPortalPhotoProxy = (src) => {
  const value = String(src || '').trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('data:image') || lower.startsWith('blob:')) return false;
  if (lower.includes('webportal.jiit.ac.in:6011')) return true;
  if (lower.startsWith('/studentportalapi/') || lower.startsWith('/studentportal/')) return true;
  if (lower.startsWith('studentportalapi/') || lower.startsWith('studentportal/')) return true;
  return false;
};

const shouldTryPortalPhotoProxy = (src) => {
  const value = String(src || '').trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('data:image') || lower.startsWith('blob:')) return false;
  if (needsPortalPhotoProxy(value)) return true;
  // Common official relative patterns: StudentPhoto.ashx?id=..., image endpoints with query params.
  if (/\.ashx(\?|$)/i.test(value)) return true;
  if ((value.includes('?') || value.includes('/')) && !/^https?:\/\//i.test(value)) return true;
  return false;
};

export default function ProfileView({ token, onExpired }) {
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState('');
  const [fallbackEnrollment, setFallbackEnrollment] = useState('');
  const [cachedSidebarPhoto, setCachedSidebarPhoto] = useState('');
  const [resolvedPortalPhotoSrc, setResolvedPortalPhotoSrc] = useState('');
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [profileTab, setProfileTab] = useState('personal');

  const hasPhotoInPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return false;

    const keyMap = Object.keys(payload || {}).reduce((acc, key) => {
      acc[String(key).toLowerCase()] = key;
      return acc;
    }, {});

    const keyNorm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const findRawValue = (keys = [], contains = []) => {
      for (const key of keys) {
        const resolved = keyMap[String(key).toLowerCase()] || key;
        const raw = payload?.[resolved];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') return raw;
      }
      const normalizedTokens = contains.flatMap((token) => {
        const normalized = keyNorm(token);
        return normalized ? [normalized] : [];
      });
      for (const [rawKey, rawValue] of Object.entries(payload || {})) {
        if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;
        const normalizedKey = keyNorm(rawKey);
        if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
          return rawValue;
        }
      }
      return null;
    };

    const rawPhoto = findRawValue(
      [
        'studentphoto',
        'studentimage',
        'profilephoto',
        'photobase64',
        'photo',
        'studentphotourl',
        'profileimgurl',
        'profileimageurl',
        'imageurl',
        'photourl'
      ],
      ['student photo', 'profile photo', 'photo base64', 'image base64', 'profile image', 'image url', 'photo url']
    );

    return Boolean(normalizePhotoSrc(rawPhoto));
  };

  useEffect(() => {
    const syncCachedIdentity = () => {
      try {
        setFallbackEnrollment(window.localStorage.getItem(LAST_PORTAL_USER_ID) || '');
      } catch (_error) {
        setFallbackEnrollment('');
      }

      try {
        const cached = window.localStorage.getItem('jaypee_buddy_cached_photo') || '';
        const normalizedCached = normalizePhotoSrc(cached);
        setCachedSidebarPhoto(needsPortalPhotoProxy(normalizedCached) ? '' : normalizedCached);
      } catch (_error) {
        setCachedSidebarPhoto('');
      }
    };

    syncCachedIdentity();
    window.addEventListener('jaypee-buddy-identity-updated', syncCachedIdentity);
    return () => {
      window.removeEventListener('jaypee-buddy-identity-updated', syncCachedIdentity);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setMessage('');
      setProfile(null);
      try {
        // Fast path: render whatever is cached/session-backed immediately.
        const fast = await fetchPortalProfile(token, false);
        const data = fast?.data || null;

        if (!cancelled) {
          setProfile(data || { realData: false, message: 'No direct profile data available.' });
        }

        // Background path: force a realtime refresh when backend says it is still
        // refreshing or when image is currently missing.
        const shouldHydrateInBackground = Boolean(fast?.refreshing) || !hasPhotoInPayload(data);
        if (shouldHydrateInBackground) {
          fetchPortalProfile(token, true)
            .then((freshResponse) => {
              if (cancelled) return;
              const refreshedData = freshResponse?.data || null;
              if (refreshedData) {
                setProfile(refreshedData);
              }
            })
            .catch((err) => {
              if (cancelled) return;
              if (err instanceof SessionExpiredError) {
                onExpired?.();
              }
            });
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

  // Persist Profile Photo cache whenever a valid profile is loaded
  useEffect(() => {
    if (!profile) return;
    
    // Quick parse logic just for caching
    const keyMap = Object.keys(profile || {}).reduce((acc, key) => { acc[String(key).toLowerCase()] = key; return acc; }, {});
    const keyNorm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const findValue = (keys = [], contains = []) => {
      for (const key of keys) {
        const resolved = keyMap[String(key).toLowerCase()] || key;
        const raw = profile?.[resolved];
        if (raw) return typeof raw === 'string' ? raw : String(raw);
      }
      const normalizedTokens = contains.map((token) => keyNorm(token)).filter(Boolean);
      for (const [rawKey, rawValue] of Object.entries(profile || {})) {
        if (!rawValue) continue;
        const normalizedKey = keyNorm(rawKey);
        if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
          return typeof rawValue === 'string' ? rawValue : String(rawValue);
        }
      }
      return '';
    };

    const findRawValue = (keys = [], contains = []) => {
      for (const key of keys) {
        const resolved = keyMap[String(key).toLowerCase()] || key;
        const raw = profile?.[resolved];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') return raw;
      }
      const normalizedTokens = contains.map((token) => keyNorm(token)).filter(Boolean);
      for (const [rawKey, rawValue] of Object.entries(profile || {})) {
        if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;
        const normalizedKey = keyNorm(rawKey);
        if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
          return rawValue;
        }
      }
      return null;
    };

    const rawPhoto = findRawValue(
      ['studentphoto', 'studentimage', 'profilephoto', 'photobase64', 'photo', 'studentphotourl', 'profileimgurl', 'profileimageurl', 'imageurl', 'photourl'],
      ['student photo', 'profile photo', 'photo base64', 'image base64', 'profile image', 'image url', 'photo url']
    );
    const rawName = findValue(
      ['studentname', 'name', 'student_name'],
      ['student name', 'name']
    );

    const src = normalizePhotoSrc(rawPhoto);

    if (src && !needsPortalPhotoProxy(src) && !src.startsWith('blob:') && !src.startsWith('data:image')) {
      try { window.localStorage.setItem('jaypee_buddy_cached_photo', src); } catch (e) {}
    }

    if (rawName) {
      try { window.localStorage.setItem('jaypee_buddy_cached_profile_name', rawName); } catch (e) {}
    }

    const identityMode = String(profile?.source || '').toLowerCase() === 'public-demo' ? 'demo' : 'portal';
    try { window.localStorage.setItem('jaypee_buddy_identity_mode', identityMode); } catch (e) {}
    try { window.dispatchEvent(new Event('jaypee-buddy-identity-updated')); } catch (e) {}
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    let activeBlobUrl = '';

    const resolvePortalPhoto = async () => {
      setResolvedPortalPhotoSrc('');
      if (!profile || profile?.realData === false) return;
      setPhotoLoadFailed(false);

      const keyMap = Object.keys(profile || {}).reduce((acc, key) => {
        acc[String(key).toLowerCase()] = key;
        return acc;
      }, {});

      const keyNorm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const findRawProfileValue = (keys = [], contains = []) => {
        for (const key of keys) {
          const resolved = keyMap[String(key).toLowerCase()] || key;
          const raw = profile?.[resolved];
          if (raw !== undefined && raw !== null && String(raw).trim() !== '') return raw;
        }

        const normalizedTokens = contains.map((token) => keyNorm(token)).filter(Boolean);
        for (const [rawKey, rawValue] of Object.entries(profile || {})) {
          if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;
          const normalizedKey = keyNorm(rawKey);
          if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
            return rawValue;
          }
        }
        return null;
      };

      const rawPhoto = findRawProfileValue(
        ['studentphoto', 'studentimage', 'profilephoto', 'photobase64', 'photo', 'studentphotourl', 'profileimgurl', 'profileimageurl', 'imageurl', 'photourl'],
        ['student photo', 'profile photo', 'photo base64', 'image base64', 'profile image', 'image url', 'photo url']
      );

      const normalizedSrc = normalizePhotoSrc(rawPhoto);
      const rawExtracted = extractPhotoText(rawPhoto);
      const proxySource = String(normalizedSrc || rawExtracted || '').trim();
      if (!shouldTryPortalPhotoProxy(proxySource)) return;

      try {
        const blob = await fetchPortalProfilePhotoBlob(token, proxySource);
        if (cancelled) return;
        activeBlobUrl = URL.createObjectURL(blob);
        setResolvedPortalPhotoSrc(activeBlobUrl);
      } catch (_error) {
        if (!cancelled) {
          setResolvedPortalPhotoSrc('');
        }
      }
    };

    resolvePortalPhoto();
    return () => {
      cancelled = true;
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [profile, token]);

  if (!profile) return (
    <div className="pb-28 sm:pb-24">
      <div className="flex items-center justify-center animate-pulse" style={{ height: '600px' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="size-3 bg-foreground/10 rotate-45" />
          <p className="text-xs font-medium text-muted-foreground/40">Syncing identity...</p>
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

  const findRawProfileValue = (keys = [], contains = []) => {
    for (const key of keys) {
      const resolved = keyMap[String(key).toLowerCase()] || key;
      const raw = profile?.[resolved];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') return raw;
    }

    const normalizedTokens = contains.map((token) => keyNorm(token)).filter(Boolean);
    for (const [rawKey, rawValue] of Object.entries(profile || {})) {
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;
      const normalizedKey = keyNorm(rawKey);
      if (normalizedTokens.some((token) => normalizedKey.includes(token))) {
        return rawValue;
      }
    }
    return null;
  };

  const profilePhotoRaw = findRawProfileValue(
    ['studentphoto', 'studentimage', 'profilephoto', 'photobase64', 'photo', 'studentphotourl', 'profileimgurl', 'profileimageurl', 'imageurl', 'photourl'],
    ['student photo', 'profile photo', 'photo base64', 'image base64', 'profile image', 'image url']
  );

  const profilePhotoSrc = normalizePhotoSrc(profilePhotoRaw);
  const safeProfilePhotoSrc = needsPortalPhotoProxy(profilePhotoSrc) ? '' : profilePhotoSrc;
  const safeCachedPhotoSrc = needsPortalPhotoProxy(cachedSidebarPhoto) ? '' : cachedSidebarPhoto;
  const displayPhotoSrc = resolvedPortalPhotoSrc || safeProfilePhotoSrc || safeCachedPhotoSrc;

  const branchDisplay =
    profile.branchdesc ||
    profile.branch ||
    profile.branchcode ||
    findProfileValue(['branchdesc', 'branch', 'branchname', 'branchcode'], ['branch']);

  const programDisplay =
    profile.program ||
    profile.programdesc ||
    profile.programcode ||
    findProfileValue(['program', 'programdesc', 'programname'], ['program', 'course', 'degree']);

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
    ['Program', programDisplay],
    ['Semester', profile.semester || profile.stynumber || profile.stymax],
    ['Section', profile.sectioncode],
    ['Batch', profile.batch || profile.academicyear || profile.admissionyear],
    ['Branch', branchDisplay],
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
        profilePhotoSrc={displayPhotoSrc}
        profileName={profileName}
        enrollment={(profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment}
      />

    <div className="rounded-2xl border border-border/40 bg-card pb-28 sm:pb-24 shadow-sm">
      <div className="space-y-6 p-6 sm:p-8">
        {/* Advanced Corporate Security ID Interface */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 group">
          {/* Subtle Security Bloom Background Pattern */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-[1500ms]" />
          
          <div className="relative shrink-0">
             <div className="w-28 h-28 sm:size-32 rounded-2xl overflow-hidden border border-border shadow-sm relative z-10 bg-muted">
                {displayPhotoSrc && !photoLoadFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayPhotoSrc}
                    alt="Student Identity"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[800ms] ease-out"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoLoadFailed(true)}
                  />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl font-black text-muted-foreground/50">
                      {String(profileName || 'S').slice(0, 1).toUpperCase()}
                    </div>
                )}
             </div>
             {/* Architectural Security Chip Hook */}
             <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-12 bg-primary/10 border border-primary/20 rounded-r-md z-0 hidden sm:block" />
          </div>
          
          <div className="text-center sm:text-left flex-1 min-w-0 z-10 w-full mt-2 sm:mt-0">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
                <div>
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80 mb-1.5">Corporate Access Identity</p>
                   <h3 className="text-2xl sm:text-3xl font-black tracking-tighter text-foreground truncate">
                     {profileName || 'Student'}
                   </h3>
                </div>
                <div className="hidden sm:flex flex-col items-end">
                   <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Validated
                   </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 mt-5 sm:mt-6 border-t border-border/50 pt-5">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Enrollment ID</span>
                   <span className="text-sm font-mono font-semibold text-foreground truncate">
                      {(profile.enrollmentno && String(profile.enrollmentno).length > 4 ? profile.enrollmentno : '') || fallbackEnrollment}
                   </span>
                </div>
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Classification</span>
                   <span className="text-sm font-bold text-foreground truncate">
                     {branchDisplay || programDisplay || 'Verified Entity'}
                   </span>
                </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex rounded-xl bg-secondary/50 p-1">
          {['personal', 'academic', 'contact'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "flex-1 py-2.5 text-xs font-bold capitalize rounded-lg transition-all",
                profileTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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
            <div key={k} className="rounded-xl border border-border/40 p-4 space-y-1 hover:border-primary/20 transition-colors">
              <span className="block text-[9px] font-medium text-muted-foreground">{k}</span>
              <p className={cn(
                "text-sm font-bold tracking-tight font-[var(--font-archivo)]",
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
                <span className="text-xs font-medium text-muted-foreground/40">Extended Parameters</span>
                <div className="h-px bg-border/20 flex-1" />
             </div>
             <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
               {extraRows.map(([k, v]) => (
                 <div key={`extra-${k}`} className="rounded-lg border-l-2 border-primary/20 bg-secondary/10 px-3 py-2 text-xs">
                   <span className="block font-medium text-muted-foreground/50 mb-0.5">{k}</span>
                   <p className="font-bold text-foreground/80 break-all">{v}</p>
                 </div>
               ))}
             </div>
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}
