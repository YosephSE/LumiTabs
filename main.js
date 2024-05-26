let input = document.getElementById("input");
let savei = document.getElementById("savei");
let savet = document.getElementById("savet");
let list = document.getElementById("list");
let leads = []

savei.addEventListener("click", function(){
    leads.push(input.value)
    
});

for(i of leads){
    list.innerHTML += `<li class="list-group-item"><a href="${i}">${i}</a></li>`
}
    