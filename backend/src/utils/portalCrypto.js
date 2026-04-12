// SPDX-License-Identifier: GPL-3.0-or-later
const crypto = require('crypto');

const PORTAL_AES_IV = 'dcek9wb8frty1pnm';
const LOCAL_NAME_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PORTAL_TIME_ZONE = 'Asia/Kolkata';

const toTwoDigits = (value) => String(value).padStart(2, '0');

const datePartsForTimeZone = (date, timeZone) => {
  if (!timeZone) {
    return {
      dayOfMonth: toTwoDigits(date.getDate()),
      dayOfWeek: String(date.getDay()),
      month: toTwoDigits(date.getMonth() + 1),
      yearShort: String(date.getFullYear()).slice(2)
    };
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type) => parts.find((item) => item.type === type)?.value || '';
  const weekdayLabel = partValue('weekday').toLowerCase();
  const weekdayMap = { sun: '0', mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6' };

  return {
    dayOfMonth: partValue('day'),
    dayOfWeek: weekdayMap[weekdayLabel] || String(date.getDay()),
    month: partValue('month'),
    yearShort: String(partValue('year')).slice(2)
  };
};

const buildPortalAesKey = (date = new Date(), timeZone) => {
  const { dayOfMonth, dayOfWeek, month, yearShort } = datePartsForTimeZone(date, timeZone);

  // Mirrors the key generation used by the official frontend bundle.
  return `qa8y${dayOfMonth.charAt(0)}${month.charAt(0)}${yearShort.charAt(0)}${dayOfWeek}${dayOfMonth.charAt(1)}${month.charAt(1)}${yearShort.charAt(1)}ty1pn`;
};

const encryptPortalPayload = (plainText, date = new Date(), timeZone) => {
  const key = buildPortalAesKey(date, timeZone);
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(PORTAL_AES_IV, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
};

const encryptPortalPayloadVariants = (plainText, date = new Date()) => {
  const timeZones = [undefined, 'Asia/Kolkata', 'UTC'];
  const variants = [];
  const seen = new Set();

  for (const timeZone of timeZones) {
    const encrypted = encryptPortalPayload(plainText, date, timeZone);
    if (seen.has(encrypted)) continue;
    seen.add(encrypted);
    variants.push({ encrypted, timeZone: timeZone || 'local' });
  }

  return variants;
};

const randomChars = (length) => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * LOCAL_NAME_CHARSET.length);
    out += LOCAL_NAME_CHARSET[idx];
  }
  return out;
};

const generateDateSeq = (date = new Date(), timeZone = PORTAL_TIME_ZONE) => {
  const { dayOfMonth, dayOfWeek, month, yearShort } = datePartsForTimeZone(date, timeZone);
  return `${dayOfMonth.charAt(0)}${month.charAt(0)}${yearShort.charAt(0)}${dayOfWeek}${dayOfMonth.charAt(1)}${month.charAt(1)}${yearShort.charAt(1)}`;
};

const generatePortalLocalName = (date = new Date(), timeZone = PORTAL_TIME_ZONE) => {
  const plain = `${randomChars(4)}${generateDateSeq(date, timeZone)}${randomChars(5)}`;
  return encryptPortalPayload(plain, date, timeZone);
};

module.exports = {
  buildPortalAesKey,
  encryptPortalPayload,
  encryptPortalPayloadVariants,
  generatePortalLocalName
};