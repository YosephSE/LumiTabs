// DOM Variables
let myLeads = {}
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

// Tab button event
tabBtn.addEventListener("click", function(){    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        myLeads[tabs[0].url] = tabs[0].title
        localStorage.setItem("myLeads", JSON.stringify(myLeads) )
        render()
    })
})

// All tabs button event
alltabBtn.addEventListener("click", function(){    
    chrome.tabs.query({currentWindow: true}, function(tabs){
        for (let tab of tabs) {
            myLeads[tab.url] = tab.title
        }
        localStorage.setItem("myLeads", JSON.stringify(myLeads));
        render();
    });
})

// Delete all button event
deleteBtn.addEventListener("click", function() {
    localStorage.clear()
    myLeads = {}
    render()
})

// Export button event
exportBtn.addEventListener("click", function() {
    exportToCSV(myLeads);
})

// Render function
function render(leads = myLeads) {
    let listItems = "";
    Object.keys(leads).reverse().forEach(key => {
        listItems += `
            <li class="flex justify-between py-2 my-1">
                <a class="w-4/5 hover:text-green-500" target='_blank' href='${key}'>
                    ${leads[key]}
                </a>
                <img src="assets/img/D.png" class='delete-btn hover:scale-125' index='${key}'></li>
        `;
    });

    // Insert list items
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
    const csvRows = [
        "URL,Title",
        ...Object.entries(leads).map(([key, value]) => `${key},${value}`)
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



// Delete function
function deleteI(key){
    delete myLeads[key]
    localStorage.setItem("myLeads", JSON.stringify(myLeads));
    render()
}