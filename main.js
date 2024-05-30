// DOM Variables
let myLeads = []
const inputEl = document.getElementById("input-el")
const inputBtn = document.getElementById("input-btn")
const olEl = document.getElementById("ol-el")
const deleteBtn = document.getElementById("delete-btn")
const leadsFromLocalStorage = JSON.parse( localStorage.getItem("myLeads"))
const tabBtn = document.getElementById("tab-btn")
const alltabBtn = document.getElementById("alltab-btn")
const exportBtn = document.getElementById("export-btn")

// Load from localstorage
if (leadsFromLocalStorage) {
    myLeads = leadsFromLocalStorage
    render()
}

// Input button event
inputBtn.addEventListener("click", function() {
    myLeads.push(inputEl.value)
    inputEl.value = ""
    localStorage.setItem("myLeads", JSON.stringify(myLeads) )
    render()
})

// Tab button event
tabBtn.addEventListener("click", function(){    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        myLeads.push(tabs[0].url)
        localStorage.setItem("myLeads", JSON.stringify(myLeads) )
        render()
    })
})

// All tabs button event
alltabBtn.addEventListener("click", function(){    
    chrome.tabs.query({currentWindow: true}, function(tabs){
        for (let tab of tabs) {
            myLeads.push(tab.url);
        }
        localStorage.setItem("myLeads", JSON.stringify(myLeads));
        render();
    });
})

// Delete button event
deleteBtn.addEventListener("click", function() {
    localStorage.clear()
    myLeads = []
    render()
})

// Export button event
exportBtn.addEventListener("click", function() {
    exportToCSV(myLeads);
})

// Render function
function render(leads = myLeads) {
    let listItems = "";
    for (let i = 0; i < leads.length; i++) {
        listItems += `
            <li>
                <a target='_blank' href='${leads[i]}'>
                    ${leads[i]}
                </a>
                <img src="D.png" class='delete-btn' index='${i}'>
            </li>
        `;
    }
    olEl.innerHTML = listItems;

    // Add event listeners to all delete buttons
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const index = this.getAttribute('index');
            deleteI(index);
        });
    });
}

// Export to CSV function
function exportToCSV(leads) {
    const csvContent = "data:text/csv;charset=utf-8," + leads.map(lead => lead).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Delete function
function deleteI(i){
    myLeads.splice(i, 1)
    localStorage.setItem("myLeads", JSON.stringify(myLeads));
    render()
}