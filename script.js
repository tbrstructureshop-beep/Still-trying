const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQG9-FrBkQidkbUzWgVUUHxK7mFVYyru5RO7EKyfOzomliEn8KBCF_bkagjNw_CK8r/exec";

let isEditMode = false;
let materialsByFinding = {};
  
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

let findingData = [];

function toISODate(value) {
  if (!value) return "";

  const d = new Date(value);
  if (isNaN(d)) return "";

  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}


// ----- HELPER -----
function isMobile() {
  return window.innerWidth <= 768;
}

// ---- Fetch Google Sheet Data ----
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
    findingData.forEach((f, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = f.finding;
      findingSelect.appendChild(opt);
    });
    setButtonsEnabled(true); // enable buttons
    
    // HIDE THE INITIAL LOADER HERE
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);

    // NEW: Populate Availability Datalist
    const datalist = document.getElementById("availabilityList");
    datalist.innerHTML = ""; // clear old options
    if (data.availabilityOptions) {
      data.availabilityOptions.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt;
        datalist.appendChild(option);
      });
    }    
    
  } catch(err) {
    console.error("Failed to load data:", err);
    loader.innerHTML = "<p style='color:red;'>Error loading data. Please check your internet or Script URL.</p>";
  } finally {
    // This runs whether the fetch SUCCEEDS or FAILS
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
  }
}

const NO_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg"; 

// ---- Update preview when selection changes ----
findingSelect.addEventListener("change", () => {
  const idx = findingSelect.value;

  // 1. RESET Edit Mode state
  isEditMode = false; 

  // 2. IMPORTANT: Remove the CSS class so the Delete column hides
  const materialCard = document.getElementById("materialTable").closest(".card");
  materialCard.classList.remove("edit-active");
  
  const editBtn = document.getElementById("editBtn");
  if (editBtn) editBtn.textContent = "✏️ Edit";

  if (idx === "") {
    findingImage.src = NO_IMAGE_URL; // Use placeholder
    findingDesc.value = "";
    findingAction.value = "";
    clearMaterialTable();
    addRow();
    setButtonsEnabled(false);
    document.getElementById("editControls").style.display = "none";
    return;
  }

  const f = findingData[idx];
  findingDesc.value = f.description;
  findingAction.value = f.action;

  // SHOW IMAGE SPINNER BEFORE CHANGING SRC
  showImageSpinner();
  
  /** 
   * LOGIC: Check if f.image exists and isn't just an empty string.
   * If it's missing, use the NO_IMAGE_URL.
   **/
  if (f.image && f.image.trim() !== "" && f.image !== "null") {
    findingImage.src = f.image;
  } else {
    findingImage.src = NO_IMAGE_URL;
  }
  
  findingImage.src = f.image || "https://via.placeholder.com/300x200";
  
  findingDesc.value = f.description;
  findingAction.value = f.action;

  // 3. Load materials (they will now be Read-Only because isEditMode is false)
  loadMaterialForFinding(f.finding);

  setButtonsEnabled(true); 
  
  // 4. Ensure controls are hidden until "Edit" is clicked again
  document.getElementById("editControls").style.display = "none"; 
});


// ---- MATERIAL TABLE / CARD FUNCTIONS ----
function createRow() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="row-number"></td>
    <td><input></td>
    <td><input></td>
    <td><input type="number"></td>
    <td><input></td>
    <td><input list="availabilityList"></td> <!-- Added list attribute here (Index 4) -->
    <td><input></td>
    <td><input></td>
    <td><input></td>
    <td><input type="date"></td>
    <td>
      <button class="btn-row-delete" onclick="deleteSpecificRow(this)">🗑️</button>
    </td>
  `;
  // Apply edit mode state immediately
  setRowEditable(tr, isEditMode);
  return tr;
}

// Apply readOnly/disabled to a row
function setRowEditable(row, editable) {
  row.querySelectorAll("input").forEach(input => {
    input.readOnly = !editable;
    input.disabled = !editable;
  });
}


function updateTableNumbers() {
  Array.from(tableBody.rows).forEach((row, idx) => {
    row.querySelector(".row-number").textContent = idx + 1;
  });
}

const materialCardsMap = new Map(); // rowIndex -> card element

function createOrUpdateCard(rowIndex) {
  const row = tableBody.rows[rowIndex];
  if (!row) return;

  let card = materialCardsMap.get(rowIndex);

  if (!card) {
    card = document.createElement("div");
    card.className = "material-card";

    // Column Mapping:
    // 0: Part No, 1: Desc, 2: Qty, 3: UoM, 4: Availability, 5: PR, 6: PO, 7: Note, 8: Entry Date
    card.innerHTML = `
      <div class="card-title"><strong>Material ${rowIndex + 1}</strong></div>
      <div class="main">
        <div><strong>Part No</strong>: <input data-col="0" data-row="${rowIndex}"></div>
        <div><strong>Material Description</strong>: <input data-col="1" data-row="${rowIndex}"></div>
      </div>
      <div class="detail">
        <div><strong>Qty</strong>: <input type="number" data-col="2" data-row="${rowIndex}"></div>
        <div><strong>UoM</strong>: <input data-col="3" data-row="${rowIndex}"></div>
        <div><strong>Availability</strong>: <input data-col="4" data-row="${rowIndex}" list="availabilityList"></div>
        <div><strong>PR</strong>: <input data-col="5" data-row="${rowIndex}"></div>
        <div><strong>PO</strong>: <input data-col="6" data-row="${rowIndex}"></div>
        <div><strong>Entry Date</strong>: <input type="date" data-col="8" data-row="${rowIndex}"></div>
      </div>
      <div style="margin-top:8px;">
        <strong>Note</strong>: <input data-col="7" data-row="${rowIndex}">
      </div>
      <div class="card-delete-container">
        <button class="btn-row-delete" onclick="deleteSpecificRow(null, ${rowIndex})" style="font-size: 14px; width: 100%; margin-top:10px;">🗑️ Remove Material</button>
      </div>
    `;

    // Sync card → table
    card.querySelectorAll("input").forEach(input => {
      const col = Number(input.dataset.col);
      
      input.readOnly = !isEditMode;

      input.addEventListener("input", e => {
        // row.cells[col + 1] because column 0 in table is "No"
        const tInput = row.cells[col + 1]?.querySelector("input");
        if (tInput) {
          tInput.value = e.target.value;
        }
      });
    });

    materialCardsContainer.appendChild(card);
    materialCardsMap.set(rowIndex, card);
  }

  // Sync table → card (Update values if they changed in the table)
  const cardInputs = card.querySelectorAll("input");
  cardInputs.forEach((input) => {
    const col = Number(input.dataset.col);
    const tableValue = row.cells[col + 1]?.querySelector("input")?.value || "";
    if (input.value !== tableValue) input.value = tableValue;
    
    // Ensure read-only state is synced
    input.readOnly = !isEditMode;
    input.disabled = !isEditMode;
  });
}


function updateCardNumbers() {
  materialCardsMap.forEach((card, idx) => {
    const title = card.querySelector(".card-title");
    if (title) title.textContent = `Material ${idx + 1}`;
  });
}
  
function updateMaterialCards() {
  if (!isMobile()) {
    materialCardsContainer.innerHTML = "";
    materialCardsMap.clear();
    return;
  }

  for (let i = 0; i < tableBody.rows.length; i++) {
    createOrUpdateCard(i);
  }
}

function clearMaterialTable() {
  tableBody.innerHTML = "";
  materialCardsContainer.innerHTML = "";
  materialCardsMap.clear();
}

function loadMaterialForFinding(findingNo) {
  clearMaterialTable();

  const materials = materialsByFinding[findingNo] || [];

  if (materials.length === 0) {
    addRow();
    return;
  }

  materials.forEach(mat => {
    const row = createRow();
    tableBody.appendChild(row);

    const inputs = row.querySelectorAll("input");
    inputs[0].value = mat.partNo || "";
    inputs[1].value = mat.description || "";
    inputs[2].value = mat.qty || "";
    inputs[3].value = mat.uom || "";
    inputs[4].value = mat.availability || "";
    inputs[5].value = mat.pr || "";
    inputs[6].value = mat.po || "";
    inputs[7].value = mat.note || "";

    // ✅ Convert Date object or string to YYYY-MM-DD
    inputs[8].value = formatDateForInput(mat.dateChange);
  });

  // ✅ Update numbers for the table
  updateTableNumbers();

  // Update mobile cards
  updateMaterialCards();

  // <-- Call auto-fit
  autoFitColumns("materialTable");
}

// Replace your existing formatDateForInput with this robust version
function formatDateForInput(value) {
  if (!value) return "";

  // 1. Try to create a date object
  let d = new Date(value);

  // 2. If it's an invalid date (like dd/mm/yyyy strings), try manual parsing
  if (isNaN(d.getTime())) {
    if (typeof value === "string" && value.includes("/")) {
      const parts = value.split("/");
      if (parts.length === 3) {
        // Assume dd/mm/yyyy -> yyyy-mm-dd
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return ""; // Still invalid
  }

  // 3. Return strictly YYYY-MM-DD for the input[type=date]
  return d.toISOString().split("T")[0];
}

// ---- BUTTON FUNCTIONS ----

// Add a new row and create a corresponding material card (mobile)
function addRow() {
  const newRow = createRow();
  tableBody.appendChild(newRow);
  updateTableNumbers(); // ✅ update numbering

  // Only create card if on mobile
  if (isMobile()) {
    const rowIndex = tableBody.rows.length - 1;
    createOrUpdateCard(rowIndex);
  }
  // <-- Call auto-fit
  autoFitColumns("materialTable");
}

// Remove last row and remove its corresponding material card (mobile)
function removeLastRow() {
  const lastIndex = tableBody.rows.length - 1;
  if (lastIndex < 0) return;

  const lastRow = tableBody.rows[lastIndex];

  // 🔒 Check if row is empty before removing
  const inputs = Array.from(lastRow.querySelectorAll("input"));
  const isEmpty = inputs.every(input => !input.value.trim());

  if (!isEmpty) {
    alert("Cannot remove a row that has data filled in.");
    return;
  }

  // Remove row from table
  tableBody.deleteRow(lastIndex);

  // Remove corresponding card (mobile)
  if (isMobile()) {
    const card = materialCardsMap.get(lastIndex);
    if (card) {
      materialCardsContainer.removeChild(card);
      materialCardsMap.delete(lastIndex);
    }

    // Rebuild cards map
    const newMap = new Map();
    Array.from(materialCardsContainer.children).forEach((card, idx) => {
      card.querySelectorAll("input").forEach(input => input.dataset.row = idx);
      card.querySelector(".card-title").textContent = `Material ${idx + 1}`;
      newMap.set(idx, card);
    });
    materialCardsMap.clear();
    newMap.forEach((v, k) => materialCardsMap.set(k, v));
  }

  updateTableNumbers();
}



// Reset table to a single row and sync cards, with confirmation and backend deletion
async function resetTable() {
  const idx = findingSelect.selectedIndex;
  const findingName = findingSelect.options[idx]?.text || "";
  
  if (!findingName || findingName.includes("--")) {
    alert("Please select a finding first.");
    return;
  }

  if (!confirm(`Are you sure you want to PERMANENTLY DELETE all material records for: "${findingName}"?`)) {
    return;
  }

  // 1. Get the loader element
  const loader = document.getElementById('initial-loader');
  const loaderText = loader.querySelector('p');

  try {
    // 2. Show the loader with your custom message
    loaderText.textContent = `Deleting Material List for ${findingName}`;
    loader.style.display = 'flex';
    loader.style.opacity = '1';

    // 3. Send the delete request to the backend
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "delete",
        findingName: findingName
      })
    });

    const result = await response.json();

    if (result.status === "success") {
      // 4. Update loader text for the refresh phase
      loaderText.textContent = "Refreshing data...";
      
      // 5. Clear UI locally
      clearMaterialTable();
      addRow(); 
      if (isEditMode) toggleEdit();

      // 6. Refresh data from Google Sheets
      await loadData(); 
      
      // 7. Hide loader FIRST before showing the alert
      loader.style.opacity = '0';
      setTimeout(() => { loader.style.display = 'none'; }, 500);

      // 8. Now show the success message
      setTimeout(() => { alert("Materials deleted successfully!"); }, 600);
      
    } else {
      throw new Error(result.message || "Unknown error from server");
    }

  } catch (error) {
    console.error("Delete error:", error);
    alert("Failed to delete: " + error.message);
    
    // Ensure loader hides even on error
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 500);
  }
}

// Toggle button to edit data material
function toggleEdit() {
  const findingVal = findingSelect.value;
  
  if (findingVal === "" || findingVal === null) {
    // Make the hint blink red to grab attention
    const hint = document.getElementById("editHint");
    hint.style.display = "inline";
    hint.style.color = "red";
    setTimeout(() => { hint.style.color = "#c0392b"; }, 500);
    
    alert("Please select a finding from the dropdown first!");
    return;
  }

  isEditMode = !isEditMode;

  const editBtn = document.getElementById("editBtn");
  // Target only the card that contains the material table
  const materialCard = document.getElementById("materialTable").closest(".card");

  editBtn.textContent = isEditMode ? "❌ Cancel Edit" : "✏️ Edit";

  if (isEditMode) {
    materialCard.classList.add("edit-active");
  } else {
    materialCard.classList.remove("edit-active");
  }

  document.getElementById("editControls").style.display = isEditMode ? "flex" : "none";
  setMaterialEditable(isEditMode);
  updateMaterialCards();
  
  // Refresh table layout
  requestAnimationFrame(() => autoFitColumns("materialTable"));
}


// Editable Controller
function setMaterialEditable(editable) {
  // TABLE inputs
  tableBody.querySelectorAll("input").forEach(input => {
    input.readOnly = !editable;
    input.disabled = !editable;
  });

  // CARD inputs (mobile)
  materialCardsContainer.querySelectorAll("input").forEach(input => {
    input.readOnly = !editable;
    input.disabled = !editable;
  });
}

// Trigger save (you can implement backend logic here)
async function saveData() {
  const findingName = findingSelect.options[findingSelect.selectedIndex].text;
  
  if (!findingName || findingName.includes("--")) {
    alert("Please select a finding first.");
    return;
  }

  // --- 1. PREPARE LOADER, BUTTON & DATA ---
  const loader = document.getElementById('initial-loader');
  const loaderText = loader.querySelector('p');  
  const saveBtn = document.querySelector(".btn-primary");

  // Disable button and show loader
  saveBtn.disabled = true;
  saveBtn.textContent = "Processing...";
  loader.style.display = 'flex';
  loader.style.opacity = '1';
  
  // Map table rows to the JSON structure
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
  }).filter(m => m.partNo !== "" || m.description !== ""); // Optional: filter out empty rows

  try {
    // --- 2. STEP ONE: REMOVING OLD DATA ---
    loaderText.textContent = `Removing old Material Entry for ${findingName}...`;
    await new Promise(resolve => setTimeout(resolve, 800)); // Delay for visual feedback

    // --- 3. STEP TWO: UPDATING NEW DATA ---
    loaderText.textContent = `Updating New Material Entry for ${findingName}...`;

    const payload = {
      action: "save", // Action trigger for Google Apps Script
      findingName: findingName,
      materials: materials
    };

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === "success") {
      // --- 4. STEP THREE: REFRESHING ---
      loaderText.textContent = "Refreshing page data...";
      
      await loadData(); // Re-fetch from sheet
      loadMaterialForFinding(findingName); // Re-populate UI
      
      if (isEditMode) toggleEdit(); // Close edit mode

      await new Promise(resolve => setTimeout(resolve, 500));
      alert("Data updated successfully!");

    } else {
      throw new Error(result.message || "Unknown server error");
    }

  } catch (error) {
    console.error("Save error:", error);
    alert("Failed to save data: " + error.message);
  } finally {
    // --- 5. CLEAN UP (CRITICAL) ---
    // Hide the loader so the user can use the app again
    loader.style.opacity = '0';
    setTimeout(() => { 
      loader.style.display = 'none';
      loaderText.textContent = "Loading Material Requirement..."; // Reset for next use
    }, 500);

    // Reset button
    saveBtn.textContent = "💾 Save";
    saveBtn.disabled = false;
  }
}

function setButtonsEnabled(enabled) {
  const editBtn = document.getElementById("editBtn");
  const editHint = document.getElementById("editHint"); // Target the new hint
  document.querySelectorAll("#editControls button").forEach(btn => {
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "1" : "0.6"; // optional visual cue
    btn.style.cursor = enabled ? "pointer" : "not-allowed";
  });

  // Pastikan edit button hanya aktif setelah finding dipilih
  if (!enabled) {
    // When disabled: Show tooltip and the red text hint
    editBtn.title = "Please select a finding first";
    editBtn.style.opacity = "0.6";
    editBtn.style.cursor = "not-allowed";
    editHint.style.display = "inline"; 
  } else {
    // When enabled: Clear tooltip and hide the red text hint
    editBtn.title = "";
    editBtn.style.opacity = "1";
    editBtn.style.cursor = "pointer";
    editHint.style.display = "none";
  }
}

  
async function deleteSpecificRow(btn, cardIdx = null) {
  if (!isEditMode) return;

  // 1. Identify which row index to delete
  let rowIndex;
  if (btn) {
    // From Desktop Table Button
    rowIndex = btn.closest("tr").rowIndex - 1; 
  } else {
    // From Mobile Card
    rowIndex = cardIdx;
  }

  const row = tableBody.rows[rowIndex];
  if (!row) return;

  // Get info for confirmation
  const partNo = row.cells[1].querySelector("input").value || "this item";
  const findingName = findingSelect.options[findingSelect.selectedIndex].text;

  if (!confirm(`Are you sure you want to PERMANENTLY remove ${partNo} from the spreadsheet?`)) return;

  // 2. Show Loader
  const loader = document.getElementById('initial-loader');
  const loaderText = loader.querySelector('p');
  loaderText.textContent = `Removing ${partNo}...`;
  loader.style.display = 'flex';
  loader.style.opacity = '1';

  try {
    // 3. Call Backend to delete from Spreadsheet
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "delete_row",
        findingName: findingName,
        rowIndex: rowIndex
      })
    });

    const result = await response.json();

    if (result.status === "success") {
      // 4. Refresh data from the sheet so the UI matches perfectly
      loaderText.textContent = "Refreshing data...";
      await loadData(); // This re-fetches everything
      
      // Update UI state
      const currentFinding = findingSelect.options[findingSelect.selectedIndex].text;
      loadMaterialForFinding(currentFinding); 
      
      // Ensure we stay in edit mode visual state if needed
      const materialCard = document.getElementById("materialTable").closest(".card");
      if (isEditMode) materialCard.classList.add("edit-active");

    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    console.error(err);
    alert("Failed to connect to spreadsheet.");
  } finally {
    // 5. Hide Loader
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 500);
  }
}

/* TABLE SIZING LINE */
  
function autoFitColumns(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const colCount = table.rows[0]?.cells.length;
  if (!colCount) return;

  for (let c = 0; c < colCount; c++) {
    const widths = [];

    for (let r = 0; r < table.rows.length; r++) {
      const cell = table.rows[r].cells[c];
      if (!cell) continue;

      const input = cell.querySelector("input");
      if (input) {
        // Include padding in measurement
        const computedStyle = window.getComputedStyle(input);
        const padding = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
        widths.push(input.scrollWidth + padding);
      }
    }

    if (!widths.length) continue;

    // Take median to avoid extreme values affecting column
    widths.sort((a, b) => a - b);
    const mid = Math.floor(widths.length / 2);
    const medianWidth = widths.length % 2 ? widths[mid] : (widths[mid - 1] + widths[mid]) / 2;

    // Apply sensible caps per column
    const colCaps = [
      {min:40, max:40},       // No
      {min:120, max:200},     // Part No
      {min:180, max:350},     // Description
      {min:60, max:80},       // Qty
      {min:60, max:80},       // UoM
      {min:100, max:150},     // Availability
      {min:80, max:120},      // PR
      {min:80, max:120},      // PO
      {min:150, max:300},     // Note
      {min:140, max:160},      // Entry Date
      {min:80, max:100} // 11th Column (Delete)
    ];

    const finalWidth = Math.min(Math.max(medianWidth, colCaps[c].min), colCaps[c].max);

    // Apply width to all cells in the column
    for (let r = 0; r < table.rows.length; r++) {
      const cell = table.rows[r].cells[c];
      if (cell) {
        cell.style.width = finalWidth + "px";
        const input = cell.querySelector("input");
        if (input) input.style.width = "100%"; // let input fill cell
      }
    }
  }
}

// ---- LOADING SPINNER -----

function showImageSpinner() {
  document.getElementById('imageSpinner').style.display = 'block';
  document.getElementById('findingImage').style.opacity = '0.3';
}

function hideImageSpinner() {
  document.getElementById('imageSpinner').style.display = 'none';
  document.getElementById('findingImage').style.opacity = '1';
}
  
// ---- RESIZE HANDLER ----
window.addEventListener("resize", () => {
  updateMaterialCards();
  requestAnimationFrame(() => autoFitColumns("materialTable"));
});

// ---- INIT ----
document.addEventListener("DOMContentLoaded", async () => {
  addRow(); // optional: keep an empty row for initial table
  await loadData(); // ensure data is loaded before sizing

  setButtonsEnabled(false); // disable buttons initially

  updateTableNumbers();
  updateMaterialCards();

  // ✅ Wait a tick to ensure DOM updates, then auto-fit columns
  requestAnimationFrame(() => {
    autoFitColumns("materialTable");
  });
});
