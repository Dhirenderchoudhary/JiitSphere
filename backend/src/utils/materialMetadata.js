const path = require('path');

const romanToNumber = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
};

const toWords = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const guessBranch = (parts, filename) => {
  const joined = toWords([...parts, filename].join(' '));

  if (joined.includes('smcse') || joined.includes(' cse ') || joined.includes('computer science'))
    return 'CSE';
  if (joined.includes('smece') || joined.includes(' ece ') || joined.includes('electronics'))
    return 'ECE';
  if (joined.includes('ecs')) return 'ECS';
  if (joined.includes(' it ')) return 'IT';
  if (joined.includes('mca')) return 'MCA';
  if (joined.includes('bca')) return 'BCA';
  if (joined.includes('smmaths') || joined.includes('math')) return 'MATHS';
  if (joined.includes('smphy') || joined.includes('physics')) return 'PHY';
  if (joined.includes('smhss') || joined.includes('english') || joined.includes('economics'))
    return 'HSS';
  if (joined.includes('t&p') || joined.includes('tnp') || joined.includes('training')) return 'TNP';

  return 'GENERAL';
};

const guessDegree = (parts, filename, branch) => {
  const joined = toWords([...parts, filename].join(' '));

  if (joined.includes('mtech')) return 'MTech';
  if (joined.includes('mca') || branch === 'MCA') return 'MCA';
  if (joined.includes('bca') || branch === 'BCA') return 'BCA';

  return 'BTech';
};

const guessSemester = (parts, filename) => {
  const joined = toWords([...parts, filename].join(' '));

  const digitMatch = joined.match(/(?:sem|semester)\s*([1-8])/i);
  if (digitMatch) return Number(digitMatch[1]);

  const ordinalMatch = joined.match(/([1-8])(st|nd|rd|th)\s*semester/i);
  if (ordinalMatch) return Number(ordinalMatch[1]);

  const ordinalSemMatch = joined.match(/([1-8])(st|nd|rd|th)\s*sem\b/i);
  if (ordinalSemMatch) return Number(ordinalSemMatch[1]);

  const romanMatch = joined.match(/\b(i|ii|iii|iv|v|vi|vii|viii)\s*semester\b/i);
  if (romanMatch) return romanToNumber[romanMatch[1].toLowerCase()] || null;

  const romanSemMatch = joined.match(/\b(i|ii|iii|iv|v|vi|vii|viii)\s*sem\b/i);
  if (romanSemMatch) return romanToNumber[romanSemMatch[1].toLowerCase()] || null;

  const standaloneSem = joined.match(/\b([1-8])\s*sem\b/i);
  if (standaloneSem) return Number(standaloneSem[1]);

  return null;
};

const guessYearFromSemester = (semester) => {
  if (!semester) return null;
  return Math.ceil(semester / 2);
};

const guessResourceType = (parts, filename, fileType) => {
  const joined = toWords([...parts, filename].join(' '));

  if (
    joined.includes('pyq') ||
    joined.includes('question bank') ||
    joined.includes('question paper')
  )
    return 'PYQs';
  if (joined.includes('solution') || joined.includes('soln') || joined.includes('answer key'))
    return 'Solutions';
  if (fileType === 'mp4' || joined.includes('lecture video')) return 'Lectures';
  if (
    joined.includes('tutorial') ||
    joined.includes('assignment') ||
    joined.includes('quiz') ||
    joined.includes('lab')
  )
    return 'Tutorials';

  return 'Slides';
};

const ignoredFolderNames = new Set(['studymaterial', 'coursefiles']);

const pickSubject = (parts) => {
  const cleaned = parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .filter((p) => !ignoredFolderNames.has(toWords(p)));

  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const candidate = cleaned[i];
    const words = toWords(candidate);
    if (!words) continue;
    if (words.includes('semester') || /\b[1-8](st|nd|rd|th)?\s*sem\b/i.test(words)) continue;
    if (words.includes('odd') || words.includes('even')) continue;
    return candidate;
  }

  return 'General';
};

const inferMaterialMetadata = ({ relativePath, fileType }) => {
  const parts = relativePath.split(path.sep).filter(Boolean);
  const filename = parts[parts.length - 1];
  const folders = parts.slice(0, -1);

  const semester = guessSemester(folders, filename);
  const year = guessYearFromSemester(semester);
  const branch = guessBranch(folders, filename);
  const degree = guessDegree(folders, filename, branch);
  const subject = pickSubject(folders);
  const resourceType = guessResourceType(folders, filename, fileType);

  return {
    title: path.parse(filename).name,
    filename,
    degree,
    branch,
    year,
    semester,
    subject,
    resourceType,
  };
};

module.exports = {
  inferMaterialMetadata,
};
