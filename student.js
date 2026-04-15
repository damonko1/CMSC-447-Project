console.log("student.js is running");

const biologyCourses = document.getElementById("biologyCourses");

const mockData = {
  "BIOL 302 - Molecular and General Genetics": [
    {
      tutorName: "Susanna",
      day: "Monday",
      time: "11:00 a.m. - 1:00 p.m.",
      status: "Present"
    },
    {
      tutorName: "Angela",
      day: "Monday",
      time: "4:00 p.m. - 5:00 p.m.",
      status: "Late"
    }
  ]
};

function formatStatusClass(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function renderCourseSection(container, courses) {
  container.innerHTML = Object.entries(courses).map(([courseName, sessions]) => `
    <details class="course-card">
      <summary>${courseName}</summary>
      <div class="course-content">
        <div class="session-list">
          ${sessions.map(session => `
            <div class="session-row">
              <span class="session-tutor">${session.tutorName}</span>
              <span class="session-time">${session.day} | ${session.time}</span>
              <span class="status ${formatStatusClass(session.status)}">${session.status}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </details>
  `).join("");
}

renderCourseSection(biologyCourses, mockData);
