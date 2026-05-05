document.addEventListener("DOMContentLoaded", () => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let currentDayIndex = new Date().getDay();;
    
    const dateText = document.getElementById("dateTxt");
    const dayDisplay = document.getElementById("dayDisplay");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const scheduleContainer = document.getElementById("scheduleContainer");
    const searchInput = document.getElementById("searchInput");
    const dateBtn = document.getElementById("dateBtn");
    const calendarPopup = document.getElementById("calendarPopup");
    const calendarInput = document.getElementById("calendarInput");

    dayDisplay.textContent = days[currentDayIndex];

    const storedData = localStorage.getItem("scheduleData");

    function formatDate(date) {
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric", 
            year: "numeric"
        });
    }
    let currentDate = new Date();
    dateText.textContent = formatDate(currentDate);


    if (storedData){
        scheduleData = JSON.parse(storedData);
        renderDay(days[currentDayIndex]);
    }

    else{ 
        fetch('schedule.json')
            .then(res => res.json())
            .then(data => {
                scheduleData = data;
                renderDay(days[currentDayIndex]);
            })
            .catch(err => {
                console.error(err);
                scheduleContainer.innerHTML = "<p>Error loading data.</p>";
            });}
    

    function isCurrentTimeInShift(timeRange) { //for automatic status updating when in session
        const [startStr, endStr] = timeRange.split(" - ");
        function parseTime(str) {
            const [time, modifier] = str.split(" ");
            let [hours, minutes] = time.split(":").map(Number);

            if (modifier === "PM" && hours !== 12) hours += 12;
            if (modifier === "AM" && hours === 12) hours = 0;

            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }

        const now = new Date();
        const start = parseTime(startStr);
        const end = parseTime(endStr);

        return now >= start && now <= end;
    }

    function renderDay(day) {
        scheduleContainer.innerHTML = "";
        const students = scheduleData[day] || [];

        const searchValue = searchInput.value.toLowerCase();

        students
            .filter(student => student.name.toLowerCase().includes(searchValue))
            .forEach(student => {
                const row = document.createElement("div");
                row.className = "student-row";

                const nameDiv = document.createElement("div");
                nameDiv.className = "student-name";
                nameDiv.textContent = student.name;

                const shiftsDiv = document.createElement("div");
                shiftsDiv.className = "shifts";

                student.shifts.forEach(shift => {
                    if (isCurrentTimeInShift(shift.time)) {
                        shift.status = "In Session";
                    }
                    const shiftDiv = document.createElement("div");
                    shiftDiv.className = "shift";

                    const timeSpan = document.createElement("span");
                    timeSpan.textContent = shift.time;

                    const statusSelect = document.createElement("select"); //HTML element that creates dropdown menus
                    statusSelect.className = "status-dropdown";

                    const options = ["Not in Session", "Late", "In Session", "Cancelled"];

                    options.forEach(option => {
                        const opt = document.createElement("option");
                        opt.value = option;
                        opt.textContent = option;

                        if (option.toLowerCase() === shift.status.toLowerCase()) {
                            opt.selected = true;
                        }

                        statusSelect.appendChild(opt);
                    });

                    function updateColor(select) {
                        select.style.backgroundColor =
                            select.value === "Not in Session" ? "rgb(240, 251, 250)" :
                            select.value === "Late" ? "#fff3cd" :
                            select.value === "In Session" ? "#d4edda":
                            "#f8d7da";
                    }

                    updateColor(statusSelect);

                    statusSelect.addEventListener("change", () => {
                        updateColor(statusSelect);
                        shift.status = statusSelect.value;
                        localStorage.setItem("scheduleData", JSON.stringify(scheduleData));
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

    prevBtn.addEventListener("click", () => {
        currentDate.setDate(currentDate.getDate()-1);
        currentDayIndex = (currentDate.getDay());
        dayDisplay.textContent = days[currentDayIndex];
        dateText.textContent = formatDate(currentDate);
        calendarInput.value = currentDate;
        renderDay(days[currentDayIndex]);
    });

    nextBtn.addEventListener("click", () => {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDayIndex = currentDate.getDay()
        dayDisplay.textContent = days[currentDayIndex];
        dateText.textContent = formatDate(currentDate);
        calendarInput.value = currentDate;
        renderDay(days[currentDayIndex]);
    });

    dateBtn.addEventListener("click", () => {
        calendarPopup.classList.toggle("hidden");
    });

    calendarInput.addEventListener("change", () => {
        const [year, month, day] = calendarInput.value.split("-").map(Number);
        currentDate = new Date(year, month - 1, day); // local time
        currentDayIndex = currentDate.getDay();
        dayDisplay.textContent = days[currentDayIndex];
        dateText.textContent = formatDate(currentDate);
        renderDay(days[currentDayIndex]);
        calendarPopup.classList.add("hidden");
    });

    searchInput.addEventListener("input", () => {
        renderDay(days[currentDayIndex]);
    });

    setInterval(() => {
        renderDay(days[currentDayIndex]);
    }, 60000); // every 60 seconds
});
