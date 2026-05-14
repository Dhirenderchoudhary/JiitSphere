
/* eslint-disable no-console */
const mongoose = require('mongoose');
const connectDb = require('../config/db');
const Material = require('../models/Material');

const APPLY = process.argv.includes('--apply');

const canonicalizeSubject = (input) => {
  if (input === undefined || input === null) {
    return '';
  }

  const raw = String(input).trim();
  const compact = raw
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  let match = compact.match(/^lab test-?(\d+)$/i) || compact.match(/^lab test\s+(\d+)$/i);
  if (match) return `Lab Test ${Number(match[1])}`;
  if (/^lab test-?$/i.test(compact)) return 'Lab Test';

  match = compact.match(/^week-?(\d+)$/i) || compact.match(/^week\s+(\d+)$/i);
  if (match) return `Week ${Number(match[1])}`;

  match = compact.match(/^eval-?(\d+)$/i) || compact.match(/^eval\s+(\d+)$/i);
  if (match) return `Eval ${Number(match[1])}`;

  match = compact.match(/^evaluation-?(\d+)$/i) || compact.match(/^evaluation\s+(\d+)$/i);
  if (match) return `Evaluation ${Number(match[1])}`;

  match = compact.match(/^lab-?(\d+)$/i) || compact.match(/^lab\s+(\d+)$/i);
  if (match) return `Lab ${Number(match[1])}`;

  match = compact.match(/^lab evaluation-?(\d+)$/i) || compact.match(/^lab evaluation\s+(\d+)$/i);
  if (match) return `Lab Evaluation ${Number(match[1])}`;

  match = compact.match(/^test-?(\d+)$/i) || compact.match(/^test\s+(\d+)$/i);
  if (match) return `Test ${Number(match[1])}`;

  match = compact.match(/^tue\s*(\d{1,2})-(\d{1,2})$/i);
  if (match) return `Tue ${match[1]}-${match[2]}`;

  if (/^course description$/i.test(compact)) return 'Course Description';
  if (/^lectures?$/i.test(compact)) return 'Lectures';
  if (/^tutorials?$/i.test(compact)) return 'Tutorials';
  if (/^submission$/i.test(compact)) return 'Submission';
  if (/^submissions$/i.test(compact)) return 'Submissions';

  match = compact.match(/^t([123])$/i);
  if (match) return `T${match[1]}`;

  return raw;
};

const run = async () => {
  await connectDb();

  const cursor = Material.find({}, { _id: 1, subject: 1 }).cursor();
  let scanned = 0;
  let changed = 0;
  const sampleChanges = [];

  for await (const doc of cursor) {
    scanned += 1;
    const previous = doc.subject || '';
    const canonical = canonicalizeSubject(previous);

    if (canonical !== previous) {
      changed += 1;

      if (sampleChanges.length < 25) {
        sampleChanges.push({ from: previous, to: canonical });
      }

      if (APPLY) {
        await Material.updateOne({ _id: doc._id }, { $set: { subject: canonical } });
      }
    }
  }

  const distinctSubjects = await Material.distinct('subject');

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    scanned,
    changed,
    distinctSubjectCount: distinctSubjects.length,
    sampleChanges
  }, null, 2));

  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
