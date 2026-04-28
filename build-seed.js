const fs = require('fs');

const INPUT_FILE = 'index.html';
const OUTPUT_FILE = 'seed.json';

const html = fs.readFileSync(INPUT_FILE, 'utf8');

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function cleanText(str) {
  return (str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|span|p|a|b|strong|em)[^>]*>/gi, '')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(str) {
  return (str || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/&amp;/gi, '&')
    .trim();
}

function slugCourseCode(code) {
  return code.replace(/\s+/g, '');
}

function inferCategory(courseCode) {
  const prefix = courseCode.split(' ')[0].toUpperCase();
  const map = {
    BIOL: 'Biology',
    CHEM: 'Chemistry',
    CMPE: 'Computer Engineering',
    CMSC: 'Computer Science',
    ECON: 'Economics',
    GES: 'Geographical and Environmental Systems',
    IS: 'Information Systems',
    MATH: 'Math',
    PHYS: 'Physics',
    SCI: 'Science',
    SPAN: 'Spanish',
    STAT: 'Statistics'
  };
  return map[prefix] || 'Other';
}

function normalizeDay(day) {
  return day.toLowerCase().trim();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMinutes(value) {
  const hour = parseInt(value.slice(0, 2), 10);
  const minute = parseInt(value.slice(2), 10);
  return hour * 60 + minute;
}

function to24Hour(raw) {
  const t = raw.toLowerCase().replace(/\./g, '').trim();

  if (t === 'noon') return '1200';
  if (t === 'midnight') return '0000';

  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3];

  if (suffix === 'am') {
    if (hour === 12) hour = 0;
  } else if (suffix === 'pm') {
    if (hour !== 12) hour += 12;
  }

  return `${pad2(hour)}${pad2(min)}`;
}

function inferStartTime(startRaw, endRaw) {
  const explicit = to24Hour(startRaw);
  if (explicit) return explicit;

  const bareTime = startRaw.toLowerCase().replace(/\./g, '').trim();
  const endNormalized = endRaw.toLowerCase().replace(/\./g, '').trim();
  const bareMatch = bareTime.match(/^(\d{1,2})(?::(\d{2}))?$/);
  const endSuffix = endNormalized.match(/(am|pm)$/)?.[1];
  const endTime = to24Hour(endRaw);

  if (!bareMatch || !endSuffix || !endTime) return null;

  const samePeriod = to24Hour(`${bareTime} ${endSuffix}`);
  const oppositePeriod = to24Hour(`${bareTime} ${endSuffix === 'am' ? 'pm' : 'am'}`);
  const endMinutes = toMinutes(endTime);

  const candidates = [samePeriod, oppositePeriod]
    .filter(Boolean)
    .map(value => ({ value, delta: endMinutes - toMinutes(value) }))
    .filter(candidate => candidate.delta > 0 && candidate.delta <= 12 * 60)
    .sort((a, b) => a.delta - b.delta);

  return candidates[0]?.value || samePeriod || oppositePeriod || null;
}

function normalizeStartTime(startRaw, endRaw, courseCode) {
  const explicit = to24Hour(startRaw);
  const endTime = to24Hour(endRaw);

  if (explicit && endTime) {
    const explicitDelta = toMinutes(endTime) - toMinutes(explicit);
    if (explicitDelta > 8 * 60) {
      const normalizedStart = startRaw.toLowerCase().replace(/\./g, '').trim();
      if (/\b(am|pm)$/.test(normalizedStart)) {
        const flippedStart = normalizedStart.replace(/\b(am|pm)$/, suffix => (suffix === 'am' ? 'pm' : 'am'));
        const flippedTime = to24Hour(flippedStart);
        if (flippedTime) {
          const flippedDelta = toMinutes(endTime) - toMinutes(flippedTime);
          if (flippedDelta > 0 && flippedDelta <= 8 * 60) {
            return flippedTime;
          }
        }
      }
    }

    return explicit;
  }

  if (courseCode.startsWith('GES')) {
    return inferStartTime(startRaw, endRaw);
  }

  return explicit;
}

function tutorKeyFromName(name, indexMap) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!indexMap.has(base)) {
    indexMap.set(base, `tutor${String(indexMap.size + 1).padStart(3, '0')}`);
  }
  return indexMap.get(base);
}

function extractCourseBlocks(source) {
  const blockRegex = /<div class="sights-expander-wrapper[\s\S]*?<div id="sights-expander-header-[^"]+"[\s\S]*?<div class="mceEditable">([\s\S]*?)<\/div>[\s\S]*?<div id="sights-expander-content-[^"]+"[\s\S]*?<div class="mceEditable">([\s\S]*?)<\/div>[\s\S]*?<\/div>\s*<\/div>/gi;
  const blocks = [];
  let match;

  while ((match = blockRegex.exec(source)) !== null) {
    const rawHeader = cleanText(stripTags(match[1]));
    const rawContent = match[2];

    const courseMatch = rawHeader.match(/^([A-Z]{2,5}\s*\d{3}[A-Z]?)\s*-\s*(.+)$/i);
    if (!courseMatch) continue;

    const courseCode = courseMatch[1].replace(/\s+/g, ' ').trim().toUpperCase();
    const courseName = courseMatch[2].trim();

    blocks.push({ courseCode, courseName, rawContent });
  }

  return blocks;
}

function parseSessionsFromContent(rawContent, courseCode) {
  const text = stripTags(rawContent)
    .replace(/\r/g, '')
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '\n$1\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const sessions = [];
  let currentDay = null;

  for (const line of text) {
    const normalized = normalizeDay(line);

    if (DAY_NAMES.includes(normalized)) {
      currentDay = normalized;
      continue;
    }

    if (/^tutors for\b/i.test(line)) continue;

    const m = line.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/);
    if (!m || !currentDay) continue;

    const startRaw = m[1].trim();
    const endRaw = m[2].trim();
    const tutorName = m[3].trim();

    const startTime = normalizeStartTime(startRaw, endRaw, courseCode);
    const endTime = to24Hour(endRaw);

    if (!startTime || !endTime || !tutorName) continue;

    sessions.push({
      day: currentDay,
      startTime,
      endTime,
      tutorName
    });
  }

  return sessions;
}

const courseBlocks = extractCourseBlocks(html);

const courses = {};
const tutorIdMap = new Map();
const tutorAccumulator = {};

for (const block of courseBlocks) {
  const courseKey = slugCourseCode(block.courseCode);

  courses[courseKey] = {
    code: block.courseCode,
    name: block.courseName,
    category: inferCategory(block.courseCode)
  };

  const sessions = parseSessionsFromContent(block.rawContent, block.courseCode);

  for (const s of sessions) {
    const tutorId = tutorKeyFromName(s.tutorName, tutorIdMap);

    if (!tutorAccumulator[tutorId]) {
      tutorAccumulator[tutorId] = {
        name: s.tutorName,
        courses: new Set(),
        schedule: {}
      };
    }

    tutorAccumulator[tutorId].courses.add(courseKey);

    if (!tutorAccumulator[tutorId].schedule[s.day]) {
      tutorAccumulator[tutorId].schedule[s.day] = {};
    }

    const blockKey = `${s.startTime}-${s.endTime}`;

    if (!tutorAccumulator[tutorId].schedule[s.day][blockKey]) {
      tutorAccumulator[tutorId].schedule[s.day][blockKey] = {
        startTime: s.startTime,
        endTime: s.endTime,
        courses: new Set(),
        status: 'present',
        lastUpdated: 0,
        persistMultipleDays: false
      };
    }

    tutorAccumulator[tutorId].schedule[s.day][blockKey].courses.add(courseKey);
  }
}

const tutors = {};

for (const [tutorId, tutorData] of Object.entries(tutorAccumulator)) {
  const finalSchedule = {};

  for (const [day, blocks] of Object.entries(tutorData.schedule)) {
    finalSchedule[day] = Object.values(blocks)
      .map(block => ({
        startTime: block.startTime,
        endTime: block.endTime,
        courses: Array.from(block.courses).sort(),
        status: block.status,
        lastUpdated: block.lastUpdated,
        persistMultipleDays: block.persistMultipleDays
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  tutors[tutorId] = {
    name: tutorData.name,
    courses: Array.from(tutorData.courses).sort(),
    schedule: finalSchedule
  };
}

const seed = {
  courses,
  tutors,
  statusLog: {}
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(seed, null, 2));
console.log(`Done. Wrote ${OUTPUT_FILE}`);
console.log(`Courses: ${Object.keys(courses).length}`);
console.log(`Tutors: ${Object.keys(tutors).length}`);
