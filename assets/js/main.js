// DOM Variables
let myLeads = {};
const olEl = document.getElementById("ol-el");
const deleteBtn = document.getElementById("delete-btn");
const leadsFromLocalStorage = JSON.parse(localStorage.getItem("myLeads"));
const tabBtn = document.getElementById("tab-btn");
const alltabBtn = document.getElementById("alltab-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const openAllBtn = document.getElementById("openall-btn");

// Load from local storage
if (leadsFromLocalStorage) {
  myLeads = leadsFromLocalStorage;
  render();
}

// Tab button event
tabBtn.addEventListener("click", function () {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    myLeads[tabs[0].url] = tabs[0].title;
    localStorage.setItem("myLeads", JSON.stringify(myLeads));
    render();
  });
});

// All tabs button event
alltabBtn.addEventListener("click", function () {
  chrome.tabs.query({ currentWindow: true }, function (tabs) {
    for (let tab of tabs) {
      myLeads[tab.url] = tab.title;
    }
    localStorage.setItem("myLeads", JSON.stringify(myLeads));
    render();
  });
});

// Delete all button event
deleteBtn.addEventListener("click", function () {
  localStorage.removeItem("myLeads");
  myLeads = {};
  render();
});

// Export button event
exportBtn.addEventListener("click", function () {
  exportToCSV(myLeads);
});

// Import button event
importBtn.addEventListener("click", function () {
  // Create a file input for CSV import
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".csv";
  fileInput.addEventListener("change", function (event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
      const csvContent = e.target.result;
      importFromCSV(csvContent);
    };

    reader.readAsText(file);
  });

  // Trigger the file input click
  fileInput.click();
});

// Open all button event
openAllBtn.addEventListener("click", function () {
  Object.keys(myLeads).forEach((url) => {
    window.open(url, "_blank");
  });
});
// Render function
function render(leads = myLeads) {
  let listItems = "";
  Object.keys(leads)
    .reverse()
    .forEach((key) => {
      listItems += `
            <li class="flex justify-between items-center py-2 my-1 bg-white p-2 rounded">
                <a class="flex-grow text-black hover:text-green-500 break-words" target='_blank' href='${key}'>
                    ${leads[key]}
                </a>
                <img src="assets/img/D.png" class='delete-btn ml-2 cursor-pointer w-5 h-5 hover:w-4 hover:h-4' index='${key}'>
            </li>
            
        `;
    });

  // Insert list items
  olEl.innerHTML = listItems;

  // Add event listeners to all delete buttons
  const deleteButtons = document.querySelectorAll(".delete-btn");
  deleteButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const index = this.getAttribute("index");
      deleteI(index);
    });
  });
}

// Export to CSV function
function exportToCSV(leads) {
  const csvRows = [
    "URL,Title",
    ...Object.entries(leads).map(
      ([key, value]) => `${quoteCSV(key)},${quoteCSV(value)}`
    ),
  ];
  const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "leads.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Import from CSV function
function importFromCSV(csvContent) {
  const rows = parseCSV(csvContent);

  for (let i = 1; i < rows.length; i++) {
    const [url, title] = rows[i];
    const cleanUrl = url?.trim();
    const cleanTitle = title?.trim();

    if (cleanUrl && cleanTitle) {
      myLeads[cleanUrl] = cleanTitle;
    }
  }

  localStorage.setItem("myLeads", JSON.stringify(myLeads));
  render();
}

function quoteCSV(value = "") {
  const safeValue = String(value);
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function parseCSV(csvContent) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];

    if (char === '"') {
      if (inQuotes && csvContent[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (currentField || currentRow.length) {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      }

      if (char === "\r" && csvContent[i + 1] === "\n") {
        i++;
      }
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

// Delete function
function deleteI(key) {
  delete myLeads[key];
  localStorage.setItem("myLeads", JSON.stringify(myLeads));
  render();
}

// Toggle dropdown menu
const moreBtn = document.getElementById("more-btn");
const dropdownMenu = document.getElementById("dropdown-menu");

moreBtn.addEventListener("click", () => {
  dropdownMenu.classList.toggle("hidden");
});

// Optional: Close the dropdown if clicking outside
document.addEventListener("click", (event) => {
  if (!moreBtn.contains(event.target) && !dropdownMenu.contains(event.target)) {
    dropdownMenu.classList.add("hidden");
  }
});
