import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    child,
    onValue,
    push,
    ref,
    update
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const validDayKeys = new Set(days.map((day) => day.toLowerCase()));

const baseStatusOptions = [
    { value: "notinsession", label: "Not in Session" },
    { value: "late", label: "Late" },
    { value: "present", label: "In Session" },
    { value: "cancelled", label: "Cancelled" }
];

document.addEventListener("DOMContentLoaded", () => {
    let currentDayIndex = new Date().getDay();

    const dayDisplay = document.getElementById("dayDisplay");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const scheduleContainer = document.getElementById("scheduleContainer");
    const searchInput = document.getElementById("searchInput");
    const logoutBtn = document.getElementById("logoutBtn");

    const state = {
        currentUser: null,
        rawTutors: {},
        courseLookup: {},
        scheduleData: createEmptyScheduleData(),
        hasLoadedTutors: false,
        unsubscribers: []
    };

    onAuthStateChanged(auth, (user) => {
        teardownSubscriptions();

        if (!user) {
            window.location.href = "./login.html";
            return;
        }

        state.currentUser = user;
        dayDisplay.textContent = days[currentDayIndex];
        scheduleContainer.innerHTML = "<p>Loading data...</p>";
        subscribeToLiveData();
    });

    logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;

        try {
            await signOut(auth);
            window.location.href = "./login.html";
        } catch (error) {
            console.error(error);
            logoutBtn.disabled = false;
            window.alert("Unable to log out right now. Please try again.");
        }
    });

    function subscribeToLiveData() {
        const tutorsUnsubscribe = onValue(
            ref(db, "tutors"),
            (snapshot) => {
                state.hasLoadedTutors = true;
                state.rawTutors = snapshot.val() || {};
                rebuildScheduleData();
            },
            (error) => {
                console.error(error);
                state.hasLoadedTutors = true;
                scheduleContainer.innerHTML = "<p>Error loading data.</p>";
            }
        );

        const coursesUnsubscribe = onValue(
            ref(db, "courses"),
            (snapshot) => {
                state.courseLookup = snapshot.val() || {};
                rebuildScheduleData();
            },
            (error) => {
                console.error(error);
                state.courseLookup = {};
                rebuildScheduleData();
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

    function rebuildScheduleData() {
        state.scheduleData = buildScheduleData(state.rawTutors, state.courseLookup);
        renderDay(days[currentDayIndex]);
    }

    function renderDay(day) {
        scheduleContainer.innerHTML = "";

        if (!state.hasLoadedTutors) {
            scheduleContainer.innerHTML = "<p>Loading data...</p>";
            return;
        }

        const tutorsForDay = state.scheduleData[day] || [];
        const searchValue = searchInput.value.trim().toLowerCase();
        const filteredTutors = searchValue
            ? tutorsForDay.filter((tutor) => tutor.searchText.includes(searchValue))
            : tutorsForDay;

        if (!filteredTutors.length) {
            scheduleContainer.innerHTML = searchValue
                ? "<p>No matching tutors found.</p>"
                : "<p>No tutor sessions scheduled.</p>";
            return;
        }

        filteredTutors.forEach((tutor) => {
            const row = document.createElement("div");
            row.className = "student-row";

            const nameDiv = document.createElement("div");
            nameDiv.className = "student-name";
            nameDiv.textContent = tutor.name;

            const shiftsDiv = document.createElement("div");
            shiftsDiv.className = "shifts";

            tutor.shifts.forEach((shift) => {
                const shiftDiv = document.createElement("div");
                shiftDiv.className = "shift";

                const timeSpan = document.createElement("span");
                timeSpan.textContent = shift.time;

                if (shift.courseSummary) {
                    const tooltipText = `Courses: ${shift.courseSummary}`;
                    timeSpan.title = tooltipText;
                    shiftDiv.title = tooltipText;
                }

                const statusSelect = document.createElement("select");
                statusSelect.className = "status-dropdown";

                getStatusOptions(shift.status).forEach((optionConfig) => {
                    const option = document.createElement("option");
                    option.value = optionConfig.value;
                    option.textContent = optionConfig.label;

                    if (optionConfig.value === shift.status) {
                        option.selected = true;
                    }

                    statusSelect.appendChild(option);
                });

                updateColor(statusSelect);

                const lastUpdatedSpan = document.createElement("span");
                lastUpdatedSpan.textContent = formatLastUpdated(shift.lastUpdated);
                lastUpdatedSpan.style.fontSize = "0.8rem";
                lastUpdatedSpan.style.color = "#555";

                statusSelect.addEventListener("change", async () => {
                    const previousStatus = shift.status;
                    const previousStatuses = [...shift.sessionStatuses];
                    const previousLastUpdated = shift.lastUpdated;
                    const nextStatus = normalizeStatus(statusSelect.value);

                    if (nextStatus === previousStatus) {
                        updateColor(statusSelect);
                        return;
                    }

                    statusSelect.disabled = true;
                    updateColor(statusSelect);

                    try {
                        const updatedAt = await updateTutorSessionStatus({
                            tutorId: shift.tutorId,
                            tutorName: shift.tutorName,
                            day: shift.dayKey,
                            sessionIndices: shift.sessionIndices,
                            newStatus: nextStatus,
                            previousStatuses,
                            adminUser: state.currentUser
                        });

                        shift.status = nextStatus;
                        shift.sessionStatuses = shift.sessionIndices.map(() => nextStatus);
                        shift.lastUpdated = updatedAt;
                        lastUpdatedSpan.textContent = formatLastUpdated(updatedAt);
                    } catch (error) {
                        console.error(error);
                        shift.status = previousStatus;
                        shift.sessionStatuses = previousStatuses;
                        shift.lastUpdated = previousLastUpdated;
                        statusSelect.value = previousStatus;
                        updateColor(statusSelect);
                        lastUpdatedSpan.textContent = formatLastUpdated(previousLastUpdated);
                        window.alert(getUpdateErrorMessage(error));
                    } finally {
                        statusSelect.disabled = false;
                    }
                });

                shiftDiv.appendChild(timeSpan);
                shiftDiv.appendChild(statusSelect);
                shiftDiv.appendChild(lastUpdatedSpan);
                shiftsDiv.appendChild(shiftDiv);
            });

            row.appendChild(nameDiv);
            row.appendChild(shiftsDiv);
            scheduleContainer.appendChild(row);
        });
    }

    prevBtn.addEventListener("click", () => {
        currentDayIndex = (currentDayIndex - 1 + 7) % 7;
        dayDisplay.textContent = days[currentDayIndex];
        renderDay(days[currentDayIndex]);
    });

    nextBtn.addEventListener("click", () => {
        currentDayIndex = (currentDayIndex + 1) % 7;
        dayDisplay.textContent = days[currentDayIndex];
        renderDay(days[currentDayIndex]);
    });

    searchInput.addEventListener("input", () => {
        renderDay(days[currentDayIndex]);
    });

    window.addEventListener("beforeunload", teardownSubscriptions);
});

function createEmptyScheduleData() {
    return Object.fromEntries(days.map((day) => [day, []]));
}

function buildScheduleData(tutors, courseLookup) {
    const groupedByDay = createEmptyScheduleData();
    const rowsByDay = Object.fromEntries(days.map((day) => [day, new Map()]));

    Object.entries(tutors || {})
        .sort(([, tutorA], [, tutorB]) => (tutorA?.name || "").localeCompare(tutorB?.name || ""))
        .forEach(([tutorId, tutor]) => {
            const tutorName = tutor?.name || "Unknown Tutor";
            const schedule = tutor?.schedule || {};

            Object.entries(schedule).forEach(([rawDayKey, sessions]) => {
                const dayKey = normalizeDayKey(rawDayKey);
                const dayLabel = formatDayLabel(dayKey);

                if (!dayLabel || !Array.isArray(sessions)) {
                    return;
                }

                let tutorRow = rowsByDay[dayLabel].get(tutorId);

                if (!tutorRow) {
                    tutorRow = {
                        name: tutorName,
                        searchText: tutorName.toLowerCase(),
                        shifts: []
                    };
                    rowsByDay[dayLabel].set(tutorId, tutorRow);
                }

                sessions.forEach((session, sessionIndex) => {
                    const courseIds = session?.courses?.length ? session.courses : tutor?.courses || [];
                    const courseSummary = buildCourseSummary(courseIds, courseLookup);
                    const startTime = session?.startTime || "";
                    const endTime = session?.endTime || "";
                    const sessionStatus = normalizeStatus(session?.status);
                    const sessionLastUpdated = Number(session?.lastUpdated) || 0;
                    const existingShift = tutorRow.shifts.find(
                        (shift) => shift.startTime === startTime && shift.endTime === endTime
                    );

                    if (existingShift) {
                        existingShift.courseIds = mergeCourseIds(existingShift.courseIds, courseIds);
                        existingShift.courseSummary = buildCourseSummary(existingShift.courseIds, courseLookup).displayText;
                        existingShift.sessionIndices.push(sessionIndex);
                        existingShift.sessionStatuses.push(sessionStatus);

                        if (sessionLastUpdated > existingShift.lastUpdated) {
                            existingShift.status = sessionStatus;
                            existingShift.lastUpdated = sessionLastUpdated;
                        }

                        return;
                    }

                    tutorRow.shifts.push({
                        tutorId,
                        tutorName,
                        dayKey,
                        sessionIndices: [sessionIndex],
                        sessionStatuses: [sessionStatus],
                        time: formatTimeRange(startTime, endTime),
                        courseIds: mergeCourseIds([], courseIds),
                        courseSummary: courseSummary.displayText,
                        status: sessionStatus,
                        lastUpdated: sessionLastUpdated,
                        startTime,
                        endTime
                    });
                });

                tutorRow.shifts.sort((shiftA, shiftB) => Number(shiftA.startTime || 0) - Number(shiftB.startTime || 0));
            });
        });

    days.forEach((day) => {
        groupedByDay[day] = Array.from(rowsByDay[day].values()).sort((rowA, rowB) => rowA.name.localeCompare(rowB.name));
    });

    return groupedByDay;
}

function buildCourseSummary(courseIds, courseLookup) {
    const uniqueCourseIds = [...new Set((courseIds || []).filter(Boolean))];

    const courseParts = uniqueCourseIds.map((courseId) => {
        const course = courseLookup?.[courseId];
        return {
            id: courseId,
            code: course?.code || formatCourseCode(courseId),
            name: course?.name || ""
        };
    });

    return {
        displayText: courseParts.map((course) => course.code).join(", "),
        searchText: courseParts
            .flatMap((course) => [course.id, course.code, course.name])
            .join(" ")
            .toLowerCase()
    };
}

function mergeCourseIds(existingCourseIds, nextCourseIds) {
    return [...new Set([...(existingCourseIds || []), ...(nextCourseIds || [])].filter(Boolean))];
}

function normalizeDayKey(dayKey) {
    const normalized = String(dayKey || "").trim().toLowerCase();
    return validDayKeys.has(normalized) ? normalized : "";
}

function formatDayLabel(dayKey) {
    if (!dayKey) {
        return "";
    }

    return dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
}

function formatCourseCode(courseId) {
    return String(courseId || "").replace(/^([A-Za-z]+)(\d+)$/, "$1 $2");
}

function formatTimeRange(startTime, endTime) {
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

function formatTime(rawTime) {
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

function formatLastUpdated(timestamp) {
    const numericTimestamp = Number(timestamp);

    if (!numericTimestamp) {
        return "Updated: --";
    }

    return `Updated: ${new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
    }).format(numericTimestamp)}`;
}

function normalizeStatus(status) {
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

function getStatusOptions(currentStatus) {
    const normalizedStatus = normalizeStatus(currentStatus);

    if (baseStatusOptions.some((option) => option.value === normalizedStatus)) {
        return baseStatusOptions;
    }

    return [{ value: normalizedStatus, label: formatStatusLabel(normalizedStatus) }, ...baseStatusOptions];
}

function formatStatusLabel(status) {
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

function updateColor(select) {
    select.style.backgroundColor =
        select.value === "notinsession" ? "rgb(240, 251, 250)" :
        select.value === "late" ? "#fff3cd" :
        select.value === "present" ? "#d4edda" :
        select.value === "cancelled" ? "#f8d7da" :
        "";
}

function getUpdateErrorMessage(error) {
    const errorCode = String(error?.code || "").toLowerCase();
    const errorMessage = String(error?.message || "").toLowerCase();

    if (errorCode.includes("permission-denied") || errorCode.includes("permission_denied") || errorMessage.includes("permission_denied")) {
        return "Status update was blocked. Refresh the page and make sure you are still signed in.";
    }

    if (
        errorCode.includes("network-error") ||
        errorCode.includes("unavailable") ||
        errorCode.includes("disconnected") ||
        errorMessage.includes("network") ||
        errorMessage.includes("disconnected")
    ) {
        return "Status update failed because the connection was interrupted. Please try again.";
    }

    return "Unable to update status right now. Please try again.";
}

async function updateTutorSessionStatus({
    tutorId,
    tutorName,
    day,
    sessionIndices,
    newStatus,
    previousStatuses,
    adminUser
}) {
    const rootRef = ref(db);
    const now = Date.now();
    const updates = {};

    (sessionIndices || []).forEach((sessionIndex, index) => {
        const previousStatus = previousStatuses?.[index] || previousStatuses?.[0] || "";
        const logId = push(child(rootRef, "statusLog")).key || `log${now}-${sessionIndex}-${index}`;

        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/status`] = newStatus;
        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/lastUpdated`] = now;
        updates[`statusLog/${logId}`] = {
            tutorId,
            tutorName,
            day,
            sessionIndex,
            previousStatus,
            newStatus,
            updatedBy: adminUser?.email || adminUser?.uid || "unknown",
            timestamp: now
        };
    });

    await update(rootRef, updates);
    return now;
}
