export const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const validDayKeys = new Set(days.map((day) => day.toLowerCase()));

export function normalizeDayKey(dayKey) {
  const normalized = String(dayKey || "").trim().toLowerCase();
  return validDayKeys.has(normalized) ? normalized : "";
}

export function formatDayLabel(dayKey) {
  if (!dayKey) {
    return "";
  }

  return dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
}

export function formatCourseCode(courseId) {
  return String(courseId || "").replace(/^([A-Za-z]+)(\d+)$/, "$1 $2");
}

export function formatTimeRange(startTime, endTime) {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

export function formatTime(rawTime) {
  const timeString = String(rawTime || "").padStart(4, "0");

  if (!/^\d{4}$/.test(timeString)) {
    return rawTime || "Time TBD";
  }

  const hours24 = Number(timeString.slice(0, 2));
  const minutes = timeString.slice(2);
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes} ${suffix}`;
}

export function parseTimeToMinutes(rawTime) {
  const timeString = String(rawTime || "").padStart(4, "0");

  if (!/^\d{4}$/.test(timeString)) {
    return Number.NaN;
  }

  const hours24 = Number(timeString.slice(0, 2));
  const minutes = Number(timeString.slice(2));

  if (hours24 < 0 || hours24 > 23 || minutes < 0 || minutes > 59) {
    return Number.NaN;
  }

  return (hours24 * 60) + minutes;
}

export function normalizeStatus(status) {
  const collapsed = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (!collapsed) {
    return "notinsession";
  }

  if (collapsed === "present" || collapsed === "insession" || collapsed === "ontime") {
    return "present";
  }

  if (collapsed === "late") {
    return "late";
  }

  if (collapsed === "cancelled" || collapsed === "canceled") {
    return "cancelled";
  }

  if (collapsed === "notinsession" || collapsed === "notpresent" || collapsed === "absent") {
    return "notinsession";
  }

  return collapsed;
}

export function formatStatusLabel(status) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "present") {
    return "In Session";
  }

  if (normalizedStatus === "late") {
    return "Late";
  }

  if (normalizedStatus === "cancelled") {
    return "Cancelled";
  }

  if (normalizedStatus === "notinsession") {
    return "Not in Session";
  }

  return normalizedStatus.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function startOfLocalDay(date = new Date()) {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
}

export function formatDateKey(date = new Date()) {
  const normalizedDate = startOfLocalDay(date);
  const year = normalizedDate.getFullYear();
  const month = String(normalizedDate.getMonth() + 1).padStart(2, "0");
  const day = String(normalizedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey) {
  const normalized = normalizeDateKey(dateKey);

  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function getUpcomingDateForDayIndex(dayIndex, fromDate = new Date()) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return null;
  }

  const startDate = startOfLocalDay(fromDate);
  const dayOffset = (dayIndex - startDate.getDay() + 7) % 7;
  const targetDate = new Date(startDate);
  targetDate.setDate(startDate.getDate() + dayOffset);
  return targetDate;
}

export function getUpcomingDateForDayKey(dayKey, fromDate = new Date()) {
  const normalizedDayKey = normalizeDayKey(dayKey);

  if (!normalizedDayKey) {
    return null;
  }

  const dayIndex = days.indexOf(formatDayLabel(normalizedDayKey));
  return getUpcomingDateForDayIndex(dayIndex, fromDate);
}

export function getUpcomingDateKeyForDayKey(dayKey, fromDate = new Date()) {
  const date = getUpcomingDateForDayKey(dayKey, fromDate);
  return date ? formatDateKey(date) : "";
}

export function getFirstOccurrenceOnOrAfterDateKey(dayKey, dateKey) {
  const startDate = parseDateKey(dateKey);

  if (!startDate) {
    return "";
  }

  const occurrence = getUpcomingDateForDayKey(dayKey, startDate);
  return occurrence ? formatDateKey(occurrence) : "";
}

export function getStoredDefaultStatus(session) {
  const defaultStatusValue = String(session?.defaultStatus || "").trim();

  if (defaultStatusValue) {
    return normalizeStatus(defaultStatusValue);
  }

  const currentStatus = normalizeStatus(session?.status);
  return currentStatus === "notinsession" ? "present" : currentStatus;
}

export function getSessionPersistenceInfo(session, referenceDate = new Date()) {
  const dayKey = normalizeDayKey(session?.dayKey);
  const persistMultipleDays = Boolean(session?.persistMultipleDays);
  const persistFrom = normalizeDateKey(session?.persistFrom);
  const persistUntil = normalizeDateKey(session?.persistUntil);
  const overrideStatus = normalizeStatus(session?.status);
  const upcomingOccurrenceDateKey = dayKey ? getUpcomingDateKeyForDayKey(dayKey, referenceDate) : "";
  const hasValidRange = Boolean(persistFrom) && Boolean(persistUntil) && persistFrom <= persistUntil;
  const spansMultipleDates = hasValidRange && persistFrom < persistUntil;
  const isActive = hasValidRange && Boolean(upcomingOccurrenceDateKey) && upcomingOccurrenceDateKey >= persistFrom && upcomingOccurrenceDateKey <= persistUntil;
  const hasExpired = hasValidRange && Boolean(upcomingOccurrenceDateKey) && upcomingOccurrenceDateKey > persistUntil;
  const hasLegacyOverride = !hasValidRange && overrideStatus !== "present";

  return {
    persistMultipleDays,
    persistFrom,
    persistUntil,
    overrideStatus,
    upcomingOccurrenceDateKey,
    hasValidRange,
    spansMultipleDates,
    isActive,
    hasExpired,
    hasLegacyOverride
  };
}

export function isSessionOccurringNow(session, referenceDate = new Date()) {
  const dayKey = normalizeDayKey(session?.dayKey);
  const occurrenceDateKey = dayKey ? getUpcomingDateKeyForDayKey(dayKey, referenceDate) : "";
  const todayDateKey = formatDateKey(referenceDate);
  const startMinutes = parseTimeToMinutes(session?.startTime);
  const endMinutes = parseTimeToMinutes(session?.endTime);

  if (!occurrenceDateKey || occurrenceDateKey !== todayDateKey || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return false;
  }

  const currentMinutes = (referenceDate.getHours() * 60) + referenceDate.getMinutes();
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getBaseSessionStatus(session, referenceDate = new Date()) {
  return isSessionOccurringNow(session, referenceDate) ? "present" : "notinsession";
}

export function getSessionStatusDetails(session, referenceDate = new Date()) {
  const persistence = getSessionPersistenceInfo(session, referenceDate);
  const baseStatus = getBaseSessionStatus(session, referenceDate);
  const isInTimeBlock = isSessionOccurringNow(session, referenceDate);
  const hasRangeOverride = persistence.isActive;
  const hasOverride = hasRangeOverride || persistence.hasLegacyOverride;
  let effectiveStatus = baseStatus;

  if (hasOverride) {
    if (
      persistence.overrideStatus === "present" ||
      persistence.overrideStatus === "late" ||
      persistence.overrideStatus === "cancelled" ||
      persistence.overrideStatus === "notinsession"
    ) {
      effectiveStatus = persistence.overrideStatus;
    }
  }

  return {
    ...persistence,
    baseStatus,
    effectiveStatus,
    hasOverride,
    isInTimeBlock,
    hasVisiblePersistence: persistence.persistMultipleDays &&
      persistence.spansMultipleDates &&
      Boolean(persistence.upcomingOccurrenceDateKey) &&
      persistence.upcomingOccurrenceDateKey <= persistence.persistUntil
  };
}

export function getEffectiveSessionStatus(session, referenceDate = new Date()) {
  return getSessionStatusDetails(session, referenceDate).effectiveStatus;

}

export function hasVisiblePersistence(session, referenceDate = new Date()) {
  return getSessionStatusDetails(session, referenceDate).hasVisiblePersistence;
}

function normalizeDateKey(dateKey) {
  const normalized = String(dateKey || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}
