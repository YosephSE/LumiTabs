let leads = JSON.parse(localStorage.getItem("leads"))
const input = document.getElementById("input")
const inputBtn = document.getElementById("input-btn")
const list = document.getElementById("list")


inputBtn.addEventListener("click", function() {
    leads.push(inputEl.value)
    localStorage.setItem("leads", JSON.stringify(myLeads))
    inputEl.value = ""
    renderLeads()
})

function renderLeads() {
    let listItems = ""
    for (let i = 0; i < leads.length; i++) {
        listItems += `
            <li>
                <a target='_blank' href='${leads[i]}'>
                    ${leads[i]}
                </a>
            </li>
        `
    }
    list.innerHTML = listItems  
}

function initiate(){
    leads = []
    localStorage.setItem("leads", "")
}
