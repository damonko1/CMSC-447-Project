import { auth } from "../firebase-config.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const logoutBtn = document.getElementById("logout-btn");
const dayDisplay = document.getElementById("dayDisplay");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const scheduleContainer = document.getElementById("scheduleContainer");
const searchInput = document.getElementById("searchInput");

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
let currentDayIndex = new Date().getDay();
let scheduleData = {};

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  dayDisplay.textContent = days[currentDayIndex];

  fetch("../schedule.json")
    .then((res) => res.json())
    .then((data) => {
      scheduleData = data;
      renderDay(days[currentDayIndex]);
    })
    .catch((err) => {
      console.error(err);
      scheduleContainer.innerHTML = "<p>Error loading data.</p>";
    });
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "./index.html";
  } catch (error) {
    console.error("Logout failed:", error);
  }
});

function renderDay(day) {
  scheduleContainer.innerHTML = "";
  const students = scheduleData[day] || [];
  const searchValue = searchInput.value.toLowerCase();

  students
    .filter((student) => student.name.toLowerCase().includes(searchValue))
    .forEach((student) => {
      const row = document.createElement("div");
      row.className = "student-row";

      const nameDiv = document.createElement("div");
      nameDiv.className = "student-name";
      nameDiv.textContent = student.name;

      const shiftsDiv = document.createElement("div");
      shiftsDiv.className = "shifts";

      student.shifts.forEach((shift) => {
        const shiftDiv = document.createElement("div");
        shiftDiv.className = "shift";

        const timeSpan = document.createElement("span");
        timeSpan.textContent = shift.time;

        const statusSelect = document.createElement("select");
        statusSelect.className = "status-dropdown";

        const options = ["In Session", "Late", "Cancelled"];

        options.forEach((option) => {
          const opt = document.createElement("option");
          opt.value = option;
          opt.textContent = option;

          if (
            option.toLowerCase() === shift.status.toLowerCase() ||
            (option === "In Session" && shift.status.toLowerCase() === "on time")
          ) {
            opt.selected = true;
          }

          statusSelect.appendChild(opt);
        });

        updateColor(statusSelect);

        statusSelect.addEventListener("change", () => {
          updateColor(statusSelect);
        });

        shiftDiv.appendChild(timeSpan);
        shiftDiv.appendChild(statusSelect);
        shiftsDiv.appendChild(shiftDiv);
      });

      row.appendChild(nameDiv);
      row.appendChild(shiftsDiv);
      scheduleContainer.appendChild(row);
    });
}

function updateColor(select) {
  select.style.backgroundColor =
    select.value === "In Session" ? "#d4edda" :
    select.value === "Late" ? "#fff3cd" :
    "#f8d7da";
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