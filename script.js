const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQG9-FrBkQidkbUzWgVUUHxK7mFVYyru5RO7EKyfOzomliEn8KBCF_bkagjNw_CK8r/exec";
const NO_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg"; 

let isEditMode = false;
let materialsByFinding = {};
let findingData = [];
const materialCardsMap = new Map();

// Elements
const tableBody = document.querySelector("#materialTable tbody");
const materialCardsContainer = document.getElementById("materialCards");
const findingSelect = document.getElementById("findingSelect");
const findingImage = document.getElementById("findingImage");
const findingDesc = document.getElementById("findingDesc");
const findingAction = document.getElementById("findingAction");

const woNo = document.getElementById("woNo");
const partDesc = document.getElementById("partDesc");
const pn = document.getElementById("pn");
const sn = document.getElementById("sn");
const acReg = document.getElementById("acReg");
const customer = document.getElementById("customer");

// --- INITIAL LOAD ---
async function loadData() {
  const loader = document.getElementById('initial-loader');
  try {
    const res = await fetch(SCRIPT_URL);
    const data = await res.json();

    woNo.value = data.generalData.woNo;
    partDesc.value = data.generalData.partDesc;
    pn.value = data.generalData.pn;
    sn.value = data.generalData.sn;
    acReg.value = data.generalData.acReg;
    customer.value = data.generalData.customer;

    findingData = data.findings;
    materialsByFinding = data.materialsByFinding || {};
    
    findingSelect.innerHTML = '<option value="">-- Select Finding --</option>';
    findingData.forEach((f, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = f.finding;
      findingSelect.appendChild(opt);
    });

    const datalist = document.getElementById("availabilityList");
    datalist.innerHTML = "";
    if (data.availabilityOptions) {
      data.availabilityOptions.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt;
        datalist.appendChild(option);
      });
    }    
    
    setButtonsEnabled(true);
  } catch(err) {
    console.error("Failed to load data:", err);
  } finally {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
  }
}

// --- FINDING SELECTION ---
findingSelect.addEventListener("change", () => {
  const idx = findingSelect.value;
  isEditMode = false; 
  document.getElementById("materialTable").closest(".card").classList.remove("edit-active");
  document.getElementById("editBtn").textContent = "✏️ Edit";

  if (idx === "") {
    findingImage.src = NO_IMAGE_URL;
    findingDesc.value = "";
    findingAction.value = "";
    clearMaterialTable();
    addRow();
    setButtonsEnabled(false);
    document.getElementById("editControls").style.display = "none";
    return;
  }

  const f = findingData[idx];
  showImageSpinner();
  findingImage.src = (f.image && f.image !== "null") ? f.image : NO_IMAGE_URL;
  findingDesc.value = f.description;
  findingAction.value = f.action;

  loadMaterialForFinding(f.finding);
  setButtonsEnabled(true); 
  document.getElementById("editControls").style.display = "none"; 
});

// --- TABLE LOGIC ---
function createRow() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="row-number"></td>
    <td><input></td>
    <td><input></td>
    <td><input type="number"></td>
    <td><input></td>
    <td><input list="availabilityList"></td>
    <td><input></td>
    <td><input></td>
    <td><input></td>
    <td><input type="date"></td>
    <td><button class="btn-row-delete" onclick="deleteSpecificRow(this)">🗑️</button></td>
  `;
  setRowEditable(tr, isEditMode);
  return tr;
}

function addRow() {
  const newRow = createRow();
  tableBody.appendChild(newRow);
  updateTableNumbers();
  if (window.innerWidth <= 768) updateMaterialCards();
  autoFitColumns("materialTable");
}

function toggleEdit() {
  if (findingSelect.value === "") {
    alert("Please select a finding first!");
    return;
  }
  isEditMode = !isEditMode;
  document.getElementById("editBtn").textContent = isEditMode ? "❌ Cancel Edit" : "✏️ Edit";
  document.getElementById("materialTable").closest(".card").classList.toggle("edit-active", isEditMode);
  document.getElementById("editControls").style.display = isEditMode ? "flex" : "none";
  
  tableBody.querySelectorAll("input").forEach(input => {
    input.readOnly = !isEditMode;
    input.disabled = !isEditMode;
  });
  updateMaterialCards();
}

async function saveData() {
  const findingName = findingSelect.options[findingSelect.selectedIndex].text;
  const loader = document.getElementById('initial-loader');
  const loaderText = loader.querySelector('p');

  loader.style.display = 'flex';
  loader.style.opacity = '1';
  loaderText.textContent = "Saving Materials...";

  const materials = Array.from(tableBody.rows).map(row => {
    const inputs = row.querySelectorAll("input");
    return {
      partNo: inputs[0].value.trim(),
      description: inputs[1].value.trim(),
      qty: inputs[2].value.trim(),
      uom: inputs[3].value.trim(),
      availability: inputs[4].value.trim(),
      pr: inputs[5].value.trim(),
      po: inputs[6].value.trim(),
      note: inputs[7].value.trim(),
      dateChange: inputs[8].value 
    };
  }).filter(m => m.partNo !== "" || m.description !== "");

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "save", findingName, materials })
    });
    const result = await res.json();
    if (result.status === "success") {
      await loadData();
      alert("Saved successfully!");
      if (isEditMode) toggleEdit();
    }
  } catch (err) {
    alert("Error saving data");
  } finally {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 500);
  }
}

// --- HELPERS ---
function showImageSpinner() { document.getElementById('imageSpinner').style.display = 'block'; }
function hideImageSpinner() { document.getElementById('imageSpinner').style.display = 'none'; }
function updateTableNumbers() {
  Array.from(tableBody.rows).forEach((row, idx) => { row.querySelector(".row-number").textContent = idx + 1; });
}
function setRowEditable(row, editable) {
  row.querySelectorAll("input").forEach(i => { i.readOnly = !editable; i.disabled = !editable; });
}

// Initial Init
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  addRow();
});
