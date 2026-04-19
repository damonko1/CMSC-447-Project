const biologyCourses = document.getElementById("biologyCourses");

const biologyData = {
  "BIOL 101 – Concepts of Biology": [
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
  ],
  "BIOL 140 – Foundations of Biology: Ecology and Evolution": [
    {
      tutorName: "Shakib",
      day: "Tuesday",
      time: "Noon - 2:00 p.m.",
      status: "Present"
    }
  ],
  "BIOL 141 – Foundations of Biology: Cells, Energy and Organisms": [
    {
      tutorName: "Zoya",
      day: "Tuesday",
      time: "1:00 p.m. - 4:00 p.m.",
      status: "Not Present"
    }
  ]
};

function formatStatusClass(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function renderCourses(container, data) {
  container.innerHTML = Object.entries(data).map(([courseName, sessions]) => `
    <details class="course-card">
      <summary>${courseName}</summary>
      <div class="course-content">
        <div class="session-list">
          ${sessions.map(session => `
            <div class="session-row">
              <span class="session-tutor">${session.tutorName}</span>
              <span>${session.day} | ${session.time}</span>
              <span class="status ${formatStatusClass(session.status)}">${session.status}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </details>
  `).join("");
}

renderCourses(biologyCourses, biologyData);
