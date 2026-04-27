import { db } from "./firebase-config.js";
import { onValue, ref } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  days,
  formatCourseCode,
  formatDayLabel,
  formatStatusLabel,
  formatTimeRange,
  getEffectiveSessionStatus,
  normalizeDayKey,
  normalizeStatus
} from "./schedule-utils.js";

const categoryConfigs = [
  { category: "Biology", containerId: "biologyCourses" },
  { category: "Chemistry", containerId: "chemistryCourses" },
  { category: "Computer Engineering", containerId: "computerEngineeringCourses" },
  { category: "Computer Science", containerId: "computerScienceCourses" },
  { category: "Economics", containerId: "economicsCourses" },
  { category: "Geographical and Environmental Systems", containerId: "gesCourses" },
  { category: "Information Systems", containerId: "informationSystemsCourses" },
  { category: "Math", containerId: "mathCourses" },
  { category: "Physics", containerId: "physicsCourses" },
  { category: "Science", containerId: "scienceCourses" },
  { category: "Spanish", containerId: "spanishCourses" },
  { category: "Statistics", containerId: "statisticsCourses" }
];

const subjectCategoryLookup = {
  BIOL: "Biology",
  CHEM: "Chemistry",
  CMPE: "Computer Engineering",
  CMSC: "Computer Science",
  ECON: "Economics",
  GES: "Geographical and Environmental Systems",
  IS: "Information Systems",
  MATH: "Math",
  PHYS: "Physics",
  SCI: "Science",
  SPAN: "Spanish",
  STAT: "Statistics"
};

const state = {
  rawTutors: {},
  courseLookup: {},
  hasLoadedTutors: false,
  hasLoadedCourses: false,
  tutorsError: false,
  openCourseIds: new Set(),
  searchQuery: "",
  unsubscribers: []
};

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("studentSearchInput");
  const stopStatusRefresh = startStatusRefresh(() => {
    renderSchedule();
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value.trim().toLowerCase();
      renderSchedule();
    });
  }

  renderLoadingState();
  subscribeToLiveData();
  window.addEventListener("beforeunload", () => {
    teardownSubscriptions();
    stopStatusRefresh();
  });
});

function subscribeToLiveData() {
  const tutorsUnsubscribe = onValue(
    ref(db, "tutors"),
    (snapshot) => {
      state.hasLoadedTutors = true;
      state.tutorsError = false;
      state.rawTutors = snapshot.val() || {};
      renderSchedule();
    },
    (error) => {
      console.error(error);
      state.hasLoadedTutors = true;
      state.tutorsError = true;
      renderSchedule();
    }
  );

  const coursesUnsubscribe = onValue(
    ref(db, "courses"),
    (snapshot) => {
      state.hasLoadedCourses = true;
      state.courseLookup = snapshot.val() || {};
      renderSchedule();
    },
    (error) => {
      console.error(error);
      state.hasLoadedCourses = true;
      state.courseLookup = {};
      renderSchedule();
    }
  );

  state.unsubscribers = [tutorsUnsubscribe, coursesUnsubscribe];
}

function teardownSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });

  state.unsubscribers = [];
}

function renderSchedule() {
  if (!state.hasLoadedTutors || !state.hasLoadedCourses) {
    renderLoadingState();
    return;
  }

  if (state.tutorsError) {
    renderAllCategoriesWithMessage("Unable to load the live tutoring schedule right now.");
    updateSearchFeedback(false);
    return;
  }

  captureOpenCourseIds();

  const groupedSchedule = buildCourseSchedule(state.rawTutors, state.courseLookup);
  let hasVisibleResults = false;

  categoryConfigs.forEach(({ category, containerId }) => {
    const container = document.getElementById(containerId);
    const section = container?.closest(".course-section");

    if (!container) {
      return;
    }

    container.innerHTML = "";

    const courses = groupedSchedule.get(category) || [];
    const filteredCourses = filterCourseGroups(courses, state.searchQuery);

    if (section) {
      section.hidden = Boolean(state.searchQuery) && filteredCourses.length === 0;
    }

    if (!filteredCourses.length) {
      if (!state.searchQuery) {
        container.appendChild(createMessageElement("No tutor sessions scheduled."));
      }

      return;
    }

    hasVisibleResults = true;

    filteredCourses.forEach((courseGroup) => {
      container.appendChild(createCourseCard(courseGroup));
    });
  });

  updateSearchFeedback(hasVisibleResults);
}

function renderLoadingState() {
  renderAllCategoriesWithMessage("Loading live schedule...");
}

function renderAllCategoriesWithMessage(message) {
  categoryConfigs.forEach(({ containerId }) => {
    const container = document.getElementById(containerId);
    const section = container?.closest(".course-section");

    if (!container) {
      return;
    }

    if (section) {
      section.hidden = false;
    }

    container.innerHTML = "";
    container.appendChild(createMessageElement(message));
  });
}

function buildCourseSchedule(tutors, courseLookup) {
  const groupedSchedule = new Map(categoryConfigs.map(({ category }) => [category, new Map()]));

  Object.entries(tutors || {})
    .sort(([, tutorA], [, tutorB]) => (tutorA?.name || "").localeCompare(tutorB?.name || ""))
    .forEach(([tutorId, tutor]) => {
      const tutorName = tutor?.name || "Unknown Tutor";
      const tutorCourses = Array.isArray(tutor?.courses) ? tutor.courses : [];
      const schedule = tutor?.schedule || {};

      Object.entries(schedule).forEach(([rawDayKey, sessions]) => {
        const dayKey = normalizeDayKey(rawDayKey);
        const dayLabel = formatDayLabel(dayKey);

        if (!dayLabel || !Array.isArray(sessions)) {
          return;
        }

        sessions.forEach((session) => {
          const courseIds = Array.isArray(session?.courses) && session.courses.length
            ? session.courses
            : tutorCourses;
          const uniqueCourseIds = [...new Set(courseIds.filter(Boolean))];

          if (!uniqueCourseIds.length) {
            return;
          }

          const startTime = session?.startTime || "";
          const endTime = session?.endTime || "";
          const storedStatus = normalizeStatus(session?.status);
          const lastUpdated = Number(session?.lastUpdated) || 0;
          const formattedTime = formatTimeRange(startTime, endTime);
          const effectiveStatus = getEffectiveSessionStatus({
            ...session,
            dayKey
          });

          uniqueCourseIds.forEach((courseId) => {
            const courseInfo = getCourseInfo(courseId, courseLookup);
            const courseBucket = groupedSchedule.get(courseInfo.category);

            if (!courseBucket) {
              return;
            }

            let courseGroup = courseBucket.get(courseId);

            if (!courseGroup) {
              courseGroup = {
                courseId,
                courseCode: courseInfo.code,
                courseName: courseInfo.name,
                title: buildCourseTitle(courseInfo.code, courseInfo.name),
                sessionsByKey: new Map()
              };
              courseBucket.set(courseId, courseGroup);
            }

            const sessionKey = [tutorId, dayKey, startTime, endTime].join("|");
            const existingSession = courseGroup.sessionsByKey.get(sessionKey);

            if (existingSession) {
              if (lastUpdated >= existingSession.lastUpdated) {
                existingSession.status = effectiveStatus;
                existingSession.storedStatus = storedStatus;
                existingSession.lastUpdated = lastUpdated;
              }

              return;
            }

            courseGroup.sessionsByKey.set(sessionKey, {
              tutorId,
              tutorName,
              tutorSearchText: tutorName.toLowerCase(),
              dayKey,
              dayLabel,
              startTime,
              endTime,
              formattedTime,
              status: effectiveStatus,
              storedStatus,
              lastUpdated
            });
          });
        });
      });
    });

  categoryConfigs.forEach(({ category }) => {
    const courseBucket = groupedSchedule.get(category);

    if (!courseBucket) {
      return;
    }

    const sortedCourses = Array.from(courseBucket.values())
      .map((courseGroup) => ({
        ...courseGroup,
        sessions: Array.from(courseGroup.sessionsByKey.values()).sort(compareSessions)
      }))
      .sort(compareCourseGroups);

    groupedSchedule.set(category, sortedCourses);
  });

  return groupedSchedule;
}

function createCourseCard(courseGroup) {
  const details = document.createElement("details");
  details.className = "course-card";
  details.dataset.courseId = courseGroup.courseId;

  if (state.searchQuery || state.openCourseIds.has(courseGroup.courseId)) {
    details.open = true;
  }

  const summary = document.createElement("summary");
  summary.textContent = courseGroup.title;

  const content = document.createElement("div");
  content.className = "course-content";

  const sessionList = document.createElement("div");
  sessionList.className = "session-list";

  courseGroup.sessions.forEach((session) => {
    sessionList.appendChild(createSessionRow(session));
  });

  content.appendChild(sessionList);
  details.appendChild(summary);
  details.appendChild(content);

  details.addEventListener("toggle", () => {
    if (details.open) {
      state.openCourseIds.add(courseGroup.courseId);
      return;
    }

    state.openCourseIds.delete(courseGroup.courseId);
  });

  return details;
}

function createSessionRow(session) {
  const row = document.createElement("div");
  row.className = "session-row";

  const tutorName = document.createElement("span");
  tutorName.className = "session-tutor";
  tutorName.textContent = session.tutorName;

  const sessionDetails = document.createElement("span");
  sessionDetails.textContent = `${session.dayLabel} | ${session.formattedTime}`;

  const statusBadge = document.createElement("span");
  const statusDisplay = getStatusDisplay(session.status);
  statusBadge.className = `status ${statusDisplay.className}`;
  statusBadge.textContent = statusDisplay.label;

  row.appendChild(tutorName);
  row.appendChild(sessionDetails);
  row.appendChild(statusBadge);

  return row;
}

function createMessageElement(message) {
  const messageElement = document.createElement("p");
  messageElement.className = "section-message";
  messageElement.textContent = message;
  return messageElement;
}

function captureOpenCourseIds() {
  const openCards = document.querySelectorAll(".course-card[open][data-course-id]");
  state.openCourseIds = new Set(Array.from(openCards, (card) => card.dataset.courseId).filter(Boolean));
}

function updateSearchFeedback(hasVisibleResults) {
  const feedbackElement = document.getElementById("studentSearchFeedback");

  if (!feedbackElement) {
    return;
  }

  if (!state.searchQuery) {
    feedbackElement.hidden = true;
    feedbackElement.textContent = "";
    return;
  }

  feedbackElement.hidden = hasVisibleResults;
  feedbackElement.textContent = hasVisibleResults ? "" : "No matching tutors or courses found.";
}

function filterCourseGroups(courseGroups, searchQuery) {
  if (!searchQuery) {
    return courseGroups;
  }

  return courseGroups.reduce((filteredCourses, courseGroup) => {
    const courseSearchText = `${courseGroup.courseCode} ${courseGroup.courseName}`.toLowerCase();

    if (courseSearchText.includes(searchQuery)) {
      filteredCourses.push(courseGroup);
      return filteredCourses;
    }

    const matchingSessions = courseGroup.sessions.filter((session) => session.tutorSearchText.includes(searchQuery));

    if (!matchingSessions.length) {
      return filteredCourses;
    }

    filteredCourses.push({
      ...courseGroup,
      sessions: matchingSessions
    });

    return filteredCourses;
  }, []);
}

function getCourseInfo(courseId, courseLookup) {
  const course = courseLookup?.[courseId];
  const inferredCategory = inferCategoryFromCourseId(courseId);

  return {
    category: course?.category || inferredCategory,
    code: course?.code || formatCourseCode(courseId),
    name: course?.name || ""
  };
}

function inferCategoryFromCourseId(courseId) {
  const subjectCodeMatch = String(courseId || "").trim().toUpperCase().match(/^[A-Z]+/);
  const subjectCode = subjectCodeMatch ? subjectCodeMatch[0] : "";
  return subjectCategoryLookup[subjectCode] || "";
}

function buildCourseTitle(code, name) {
  return name ? `${code} - ${name}` : code;
}

function getStatusDisplay(status) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "present") {
    return { label: formatStatusLabel(normalizedStatus), className: "present" };
  }

  if (normalizedStatus === "late") {
    return { label: formatStatusLabel(normalizedStatus), className: "late" };
  }

  if (normalizedStatus === "cancelled") {
    return { label: formatStatusLabel(normalizedStatus), className: "cancelled" };
  }

  if (normalizedStatus === "notinsession") {
    return { label: formatStatusLabel(normalizedStatus), className: "notinsession" };
  }

  return {
    label: formatUnknownStatusLabel(normalizedStatus),
    className: "status-unknown"
  };
}

function formatUnknownStatusLabel(status) {
  return String(status || "Status Unknown").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compareCourseGroups(courseA, courseB) {
  return courseA.courseCode.localeCompare(courseB.courseCode, undefined, { numeric: true });
}

function compareSessions(sessionA, sessionB) {
  const dayDifference = days.indexOf(sessionA.dayLabel) - days.indexOf(sessionB.dayLabel);

  if (dayDifference !== 0) {
    return dayDifference;
  }

  const startTimeDifference = Number(sessionA.startTime || 0) - Number(sessionB.startTime || 0);

  if (startTimeDifference !== 0) {
    return startTimeDifference;
  }

  return sessionA.tutorName.localeCompare(sessionB.tutorName);
}

function startStatusRefresh(refreshFn) {
  let intervalId = 0;
  const timeoutDelay = Math.max(1000, 60000 - (Date.now() % 60000));
  const timeoutId = window.setTimeout(() => {
    refreshFn();
    intervalId = window.setInterval(refreshFn, 60000);
  }, timeoutDelay);

  return () => {
    window.clearTimeout(timeoutId);

    if (intervalId) {
      window.clearInterval(intervalId);
    }
  };
}
