import { auth, db } from "./firebase-config.js";
import {
    days,
    formatCourseCode,
    formatDateKey,
    formatDateLabel,
    formatDayLabel,
    formatStatusLabel,
    formatTimeRange,
    getFirstOccurrenceOnOrAfterDateKey,
    getSessionStatusDetails,
    getUpcomingDateForDayIndex,
    normalizeDayKey,
    normalizeStatus
} from "./schedule-utils.js";
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
    const persistenceDialog = document.getElementById("persistenceDialog");
    const persistenceForm = document.getElementById("persistenceForm");
    const persistenceDescription = document.getElementById("persistenceDescription");
    const persistUntilInput = document.getElementById("persistUntilInput");
    const persistenceCancelBtn = document.getElementById("persistenceCancelBtn");
    const durationModeInputs = Array.from(document.querySelectorAll('input[name="durationMode"]'));

    const state = {
        currentUser: null,
        rawTutors: {},
        courseLookup: {},
        scheduleData: createEmptyScheduleData(),
        hasLoadedTutors: false,
        unsubscribers: [],
        persistencePromptResolver: null
    };
    const stopStatusRefresh = startStatusRefresh(() => {
        rebuildScheduleData();
    });

    durationModeInputs.forEach((input) => {
        input.addEventListener("change", updatePersistenceDateFieldState);
    });

    persistenceCancelBtn.addEventListener("click", () => {
        resolvePersistencePrompt(null);
    });

    persistenceDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        resolvePersistencePrompt(null);
    });

    persistenceForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const durationMode = getSelectedDurationMode();

        if (durationMode === "multi") {
            const persistUntil = persistUntilInput.value;

            if (!persistUntil) {
                persistUntilInput.focus();
                return;
            }

            resolvePersistencePrompt({ mode: "multi", persistUntil });
            return;
        }

        resolvePersistencePrompt({ mode: "single", persistUntil: "" });
    });

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

    window.addEventListener("beforeunload", () => {
        teardownSubscriptions();
        stopStatusRefresh();
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
        resolvePersistencePrompt(null);

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

                const shiftMeta = document.createElement("div");
                shiftMeta.className = "shift-meta";

                const lastUpdatedSpan = document.createElement("span");
                lastUpdatedSpan.textContent = formatLastUpdated(shift.lastUpdated);
                lastUpdatedSpan.style.fontSize = "0.8rem";
                lastUpdatedSpan.style.color = "#555";
                shiftMeta.appendChild(lastUpdatedSpan);

                let clearPersistenceBtn = null;

                if (shift.hasVisiblePersistence) {
                    const persistenceChip = document.createElement("span");
                    persistenceChip.className = "persistence-chip";
                    persistenceChip.textContent = `Persists until ${formatDateLabel(shift.persistUntil)}`;
                    shiftMeta.appendChild(persistenceChip);

                    clearPersistenceBtn = document.createElement("button");
                    clearPersistenceBtn.type = "button";
                    clearPersistenceBtn.className = "clear-persistence-btn";
                    clearPersistenceBtn.textContent = "Clear Persistence";
                    shiftMeta.appendChild(clearPersistenceBtn);

                    clearPersistenceBtn.addEventListener("click", async () => {
                        statusSelect.disabled = true;
                        clearPersistenceBtn.disabled = true;

                        try {
                            const result = await clearTutorStatusOverride({
                                tutorId: shift.tutorId,
                                tutorName: shift.tutorName,
                                schedule: state.rawTutors?.[shift.tutorId]?.schedule || {},
                                day: shift.dayKey,
                                sessionIndices: shift.sessionIndices,
                                persistenceBatchUpdatedAt: shift.persistenceBatchUpdatedAt,
                                persistUntil: shift.persistUntil,
                                clearEntireBatch: shift.persistMultipleDays,
                                adminUser: state.currentUser
                            });

                            applySessionPatchesToState(shift.tutorId, result.sessionPatches);
                        } catch (error) {
                            console.error(error);
                            window.alert(getUpdateErrorMessage(error));
                        } finally {
                            statusSelect.disabled = false;

                            if (clearPersistenceBtn) {
                                clearPersistenceBtn.disabled = false;
                            }
                        }
                    });
                }

                statusSelect.addEventListener("change", async () => {
                    const previousDisplayedStatus = shift.status;
                    const nextStatus = normalizeStatus(statusSelect.value);

                    if (nextStatus === previousDisplayedStatus) {
                        updateColor(statusSelect);
                        return;
                    }

                    if (nextStatus === "present") {
                        statusSelect.disabled = true;

                        if (clearPersistenceBtn) {
                            clearPersistenceBtn.disabled = true;
                        }

                        try {
                            if (shift.hasOverride || shift.hasVisiblePersistence) {
                                const result = await clearTutorStatusOverride({
                                    tutorId: shift.tutorId,
                                    tutorName: shift.tutorName,
                                    schedule: state.rawTutors?.[shift.tutorId]?.schedule || {},
                                    day: shift.dayKey,
                                    sessionIndices: shift.sessionIndices,
                                    persistenceBatchUpdatedAt: shift.persistenceBatchUpdatedAt,
                                    persistUntil: shift.persistUntil,
                                    clearEntireBatch: shift.persistMultipleDays,
                                    adminUser: state.currentUser
                                });

                                applySessionPatchesToState(shift.tutorId, result.sessionPatches);
                            } else {
                                rebuildScheduleData();
                            }
                        } catch (error) {
                            console.error(error);
                            statusSelect.value = previousDisplayedStatus;
                            updateColor(statusSelect);
                            window.alert(getUpdateErrorMessage(error));
                        } finally {
                            statusSelect.disabled = false;

                            if (clearPersistenceBtn) {
                                clearPersistenceBtn.disabled = false;
                            }
                        }

                        return;
                    }

                    const persistenceSelection = await promptForStatusDuration({
                        tutorName: shift.tutorName,
                        nextStatus,
                        currentDayLabel: days[currentDayIndex],
                        currentPersistUntil: shift.persistUntil,
                        currentPersistMultipleDays: shift.persistMultipleDays
                    });

                    if (!persistenceSelection) {
                        statusSelect.value = previousDisplayedStatus;
                        updateColor(statusSelect);
                        return;
                    }

                    statusSelect.disabled = true;

                    if (clearPersistenceBtn) {
                        clearPersistenceBtn.disabled = true;
                    }

                    try {
                        const result = persistenceSelection.mode === "multi"
                            ? await updateTutorStatusWithPersistence({
                                tutorId: shift.tutorId,
                                tutorName: shift.tutorName,
                                schedule: state.rawTutors?.[shift.tutorId]?.schedule || {},
                                selectedDayIndex: currentDayIndex,
                                newStatus: nextStatus,
                                persistUntil: persistenceSelection.persistUntil,
                                adminUser: state.currentUser
                            })
                            : await updateTutorSessionStatus({
                                tutorId: shift.tutorId,
                                tutorName: shift.tutorName,
                                schedule: state.rawTutors?.[shift.tutorId]?.schedule || {},
                                selectedDayIndex: currentDayIndex,
                                day: shift.dayKey,
                                sessionIndices: shift.sessionIndices,
                                newStatus: nextStatus,
                                previousStatuses: shift.sessionStatuses,
                                adminUser: state.currentUser
                            });

                        applySessionPatchesToState(shift.tutorId, result.sessionPatches);
                    } catch (error) {
                        console.error(error);
                        statusSelect.value = previousDisplayedStatus;
                        updateColor(statusSelect);
                        window.alert(getUpdateErrorMessage(error));
                    } finally {
                        statusSelect.disabled = false;

                        if (clearPersistenceBtn) {
                            clearPersistenceBtn.disabled = false;
                        }
                    }
                });

                shiftDiv.appendChild(timeSpan);
                shiftDiv.appendChild(statusSelect);
                shiftDiv.appendChild(shiftMeta);
                shiftsDiv.appendChild(shiftDiv);
            });

            row.appendChild(nameDiv);
            row.appendChild(shiftsDiv);
            scheduleContainer.appendChild(row);
        });
    }

    function applySessionPatchesToState(tutorId, sessionPatches) {
        const tutor = state.rawTutors?.[tutorId];

        if (!tutor?.schedule) {
            rebuildScheduleData();
            return;
        }

        sessionPatches.forEach(({ dayKey, sessionIndex, patch }) => {
            const session = tutor.schedule?.[dayKey]?.[sessionIndex];

            if (!session) {
                return;
            }

            Object.assign(session, patch);
        });

        rebuildScheduleData();
    }

    function promptForStatusDuration({
        tutorName,
        nextStatus,
        currentDayLabel,
        currentPersistUntil,
        currentPersistMultipleDays
    }) {
        const dayStart = getUpcomingDateForDayIndex(currentDayIndex);
        const minimumDateKey = dayStart ? formatDateKey(dayStart) : formatDateKey(new Date());

        persistenceDescription.textContent = `${tutorName} is being marked as ${formatStatusLabel(nextStatus)} for ${currentDayLabel}.`;
        persistUntilInput.min = minimumDateKey;

        const shouldDefaultToMulti = currentPersistMultipleDays && Boolean(currentPersistUntil);
        const initialDateValue = currentPersistUntil && currentPersistUntil >= minimumDateKey
            ? currentPersistUntil
            : minimumDateKey;

        persistUntilInput.value = initialDateValue;
        setSelectedDurationMode(shouldDefaultToMulti ? "multi" : "single");
        updatePersistenceDateFieldState();

        persistenceDialog.showModal();

        return new Promise((resolve) => {
            state.persistencePromptResolver = resolve;
        });
    }

    function resolvePersistencePrompt(result) {
        if (typeof state.persistencePromptResolver === "function") {
            const resolver = state.persistencePromptResolver;
            state.persistencePromptResolver = null;
            resolver(result);
        }

        if (persistenceDialog.open) {
            persistenceDialog.close();
        }
    }

    function setSelectedDurationMode(mode) {
        durationModeInputs.forEach((input) => {
            input.checked = input.value === mode;
        });
    }

    function getSelectedDurationMode() {
        return durationModeInputs.find((input) => input.checked)?.value || "single";
    }

    function updatePersistenceDateFieldState() {
        const isMultiDay = getSelectedDurationMode() === "multi";
        persistUntilInput.disabled = !isMultiDay;

        if (!isMultiDay) {
            persistUntilInput.blur();
        }
    }
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
                    const statusDetails = getSessionStatusDetails({
                        ...session,
                        dayKey
                    });
                    const existingShift = tutorRow.shifts.find(
                        (shift) => shift.startTime === startTime && shift.endTime === endTime
                    );

                    if (existingShift) {
                        existingShift.courseIds = mergeCourseIds(existingShift.courseIds, courseIds);
                        existingShift.courseSummary = buildCourseSummary(existingShift.courseIds, courseLookup).displayText;
                        existingShift.sessionIndices.push(sessionIndex);
                        existingShift.sessionStatuses.push(sessionStatus);

                        if (sessionLastUpdated > existingShift.lastUpdated) {
                            existingShift.status = statusDetails.effectiveStatus;
                            existingShift.lastUpdated = sessionLastUpdated;
                            existingShift.persistMultipleDays = statusDetails.persistMultipleDays;
                            existingShift.persistFrom = statusDetails.persistFrom;
                            existingShift.persistUntil = statusDetails.persistUntil;
                            existingShift.hasVisiblePersistence = statusDetails.hasVisiblePersistence;
                            existingShift.hasOverride = statusDetails.hasOverride;
                            existingShift.overrideStatus = statusDetails.overrideStatus;
                            existingShift.persistenceBatchUpdatedAt = sessionLastUpdated;
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
                        status: statusDetails.effectiveStatus,
                        lastUpdated: sessionLastUpdated,
                        startTime,
                        endTime,
                        persistMultipleDays: statusDetails.persistMultipleDays,
                        persistFrom: statusDetails.persistFrom,
                        persistUntil: statusDetails.persistUntil,
                        hasVisiblePersistence: statusDetails.hasVisiblePersistence,
                        hasOverride: statusDetails.hasOverride,
                        overrideStatus: statusDetails.overrideStatus,
                        persistenceBatchUpdatedAt: sessionLastUpdated
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

function getStatusOptions(currentStatus) {
    const normalizedStatus = normalizeStatus(currentStatus);

    if (baseStatusOptions.some((option) => option.value === normalizedStatus)) {
        return baseStatusOptions;
    }

    return [{ value: normalizedStatus, label: formatStatusLabel(normalizedStatus) }, ...baseStatusOptions];
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
    schedule,
    selectedDayIndex,
    day,
    sessionIndices,
    newStatus,
    previousStatuses,
    adminUser
}) {
    const rootRef = ref(db);
    const now = Date.now();
    const updates = {};
    const sessionPatches = [];
    const targetDate = getUpcomingDateForDayIndex(selectedDayIndex);
    const targetDateKey = targetDate ? formatDateKey(targetDate) : formatDateKey(new Date());

    (sessionIndices || []).forEach((sessionIndex, index) => {
        const previousStatus = previousStatuses?.[index] || previousStatuses?.[0] || "";
        const logId = push(child(rootRef, "statusLog")).key || `log${now}-${sessionIndex}-${index}`;
        const patch = {
            status: newStatus,
            defaultStatus: "present",
            lastUpdated: now,
            persistMultipleDays: false,
            persistFrom: targetDateKey,
            persistUntil: targetDateKey
        };

        sessionPatches.push({ dayKey: day, sessionIndex, patch });

        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/status`] = patch.status;
        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/defaultStatus`] = patch.defaultStatus;
        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/lastUpdated`] = patch.lastUpdated;
        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/persistMultipleDays`] = false;
        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/persistFrom`] = targetDateKey;
        updates[`tutors/${tutorId}/schedule/${day}/${sessionIndex}/persistUntil`] = targetDateKey;
        updates[`statusLog/${logId}`] = {
            tutorId,
            tutorName,
            day,
            sessionIndex,
            previousStatus,
            newStatus,
            persistMultipleDays: false,
            persistFrom: targetDateKey,
            persistUntil: targetDateKey,
            updatedBy: adminUser?.email || adminUser?.uid || "unknown",
            timestamp: now
        };
    });

    await update(rootRef, updates);
    return { updatedAt: now, sessionPatches };
}

async function updateTutorStatusWithPersistence({
    tutorId,
    tutorName,
    schedule,
    selectedDayIndex,
    newStatus,
    persistUntil,
    adminUser
}) {
    const rootRef = ref(db);
    const now = Date.now();
    const updates = {};
    const sessionPatches = [];
    const rangeStartDate = getUpcomingDateForDayIndex(selectedDayIndex);
    const rangeStartDateKey = rangeStartDate ? formatDateKey(rangeStartDate) : formatDateKey(new Date());

    Object.entries(schedule || {}).forEach(([rawDayKey, sessions]) => {
        const dayKey = normalizeDayKey(rawDayKey);

        if (!dayKey || !Array.isArray(sessions)) {
            return;
        }

        const persistFrom = getFirstOccurrenceOnOrAfterDateKey(dayKey, rangeStartDateKey);

        if (!persistFrom || persistFrom > persistUntil) {
            return;
        }

        sessions.forEach((session, sessionIndex) => {
            const existingStatus = normalizeStatus(session?.status);
            const logId = push(child(rootRef, "statusLog")).key || `persist${now}-${dayKey}-${sessionIndex}`;
            const patch = {
                status: newStatus,
                defaultStatus: "present",
                lastUpdated: now,
                persistMultipleDays: true,
                persistFrom,
                persistUntil
            };

            sessionPatches.push({ dayKey, sessionIndex, patch });

            updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/status`] = patch.status;
            updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/defaultStatus`] = patch.defaultStatus;
            updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/lastUpdated`] = patch.lastUpdated;
            updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistMultipleDays`] = true;
            updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistFrom`] = persistFrom;
            updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistUntil`] = persistUntil;
            updates[`statusLog/${logId}`] = {
                tutorId,
                tutorName,
                day: dayKey,
                sessionIndex,
                previousStatus: existingStatus,
                newStatus,
                persistMultipleDays: true,
                persistFrom,
                persistUntil,
                updatedBy: adminUser?.email || adminUser?.uid || "unknown",
                timestamp: now
            };
        });
    });

    if (!sessionPatches.length) {
        throw new Error("No scheduled sessions fall within the selected persistence range.");
    }

    await update(rootRef, updates);
    return { updatedAt: now, sessionPatches };
}

async function clearTutorStatusOverride({
    tutorId,
    tutorName,
    schedule,
    day,
    sessionIndices,
    persistenceBatchUpdatedAt,
    persistUntil,
    clearEntireBatch,
    adminUser
}) {
    const rootRef = ref(db);
    const now = Date.now();
    const updates = {};
    const sessionPatches = [];

    if (clearEntireBatch) {
        Object.entries(schedule || {}).forEach(([rawDayKey, sessions]) => {
            const dayKey = normalizeDayKey(rawDayKey);

            if (!dayKey || !Array.isArray(sessions)) {
                return;
            }

            sessions.forEach((session, sessionIndex) => {
                const sessionLastUpdated = Number(session?.lastUpdated) || 0;

                if (
                    !session?.persistMultipleDays ||
                    sessionLastUpdated !== persistenceBatchUpdatedAt ||
                    String(session?.persistUntil || "") !== String(persistUntil || "") ||
                    normalizeStatus(session?.status) === "present"
                ) {
                    return;
                }

                const logId = push(child(rootRef, "statusLog")).key || `clear${now}-${dayKey}-${sessionIndex}`;
                const patch = {
                    status: "present",
                    defaultStatus: "present",
                    lastUpdated: now,
                    persistMultipleDays: false,
                    persistFrom: "",
                    persistUntil: ""
                };

                sessionPatches.push({ dayKey, sessionIndex, patch });

                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/status`] = patch.status;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/defaultStatus`] = patch.defaultStatus;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/lastUpdated`] = patch.lastUpdated;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistMultipleDays`] = false;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistFrom`] = "";
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistUntil`] = "";
                updates[`statusLog/${logId}`] = {
                    tutorId,
                    tutorName,
                    day: dayKey,
                    sessionIndex,
                    previousStatus: normalizeStatus(session?.status),
                    newStatus: "present",
                    persistMultipleDays: false,
                    persistFrom: "",
                    persistUntil: "",
                    clearedPersistence: true,
                    updatedBy: adminUser?.email || adminUser?.uid || "unknown",
                    timestamp: now
                };
            });
        });
    } else {
        const dayKey = normalizeDayKey(day);
        const daySessions = schedule?.[dayKey];

        if (dayKey && Array.isArray(daySessions)) {
            (sessionIndices || []).forEach((sessionIndex) => {
                const session = daySessions?.[sessionIndex];

                if (!session) {
                    return;
                }

                const hasRangeOverride = String(session?.persistFrom || "") && String(session?.persistUntil || "");
                const previousStatus = normalizeStatus(session?.status);

                if (!hasRangeOverride && previousStatus === "present") {
                    return;
                }

                const logId = push(child(rootRef, "statusLog")).key || `clear${now}-${dayKey}-${sessionIndex}`;
                const patch = {
                    status: "present",
                    defaultStatus: "present",
                    lastUpdated: now,
                    persistMultipleDays: false,
                    persistFrom: "",
                    persistUntil: ""
                };

                sessionPatches.push({ dayKey, sessionIndex, patch });

                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/status`] = patch.status;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/defaultStatus`] = patch.defaultStatus;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/lastUpdated`] = patch.lastUpdated;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistMultipleDays`] = false;
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistFrom`] = "";
                updates[`tutors/${tutorId}/schedule/${dayKey}/${sessionIndex}/persistUntil`] = "";
                updates[`statusLog/${logId}`] = {
                    tutorId,
                    tutorName,
                    day: dayKey,
                    sessionIndex,
                    previousStatus,
                    newStatus: "present",
                    persistMultipleDays: false,
                    persistFrom: "",
                    persistUntil: "",
                    clearedPersistence: true,
                    updatedBy: adminUser?.email || adminUser?.uid || "unknown",
                    timestamp: now
                };
            });
        }
    }

    if (!sessionPatches.length) {
        throw new Error("No active persistence window was found to clear.");
    }

    await update(rootRef, updates);
    return { updatedAt: now, sessionPatches };
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
