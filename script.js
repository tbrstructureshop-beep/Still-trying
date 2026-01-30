/* 
 * AIRCRAFT MAINTENANCE SYSTEM
 * Work Order + Findings + Manhours Tracker
 * Pure JS / LocalStorage
 */

const STORAGE_KEY = 'mro_sys_data';
const ACTIVE_LOCK_KEY = 'mro_active_lock'; // Holds ID of finding currently running

let workOrders = [];
let timerInterval = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadSystemData();
    renderSystem();
    
    // Global Listeners
    document.getElementById('btnNewWO').addEventListener('click', createWorkOrder);
    document.getElementById('btnConfirmStatus').addEventListener('click', finalizeStop);
    document.getElementById('photoInput').addEventListener('change', handleImageSelect);
    document.getElementById('btnSavePhoto').addEventListener('click', saveImage);
    document.getElementById('btnSkipPhoto').addEventListener('click', skipImage);

    // Resume Timer if page reloaded
    startGlobalClock();
});

// --- DATA LAYER ---
function loadSystemData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    workOrders = raw ? JSON.parse(raw) : [];
}

function persistSystemData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workOrders));
    renderSystem();
}

function getActiveLock() {
    return localStorage.getItem(ACTIVE_LOCK_KEY);
}

function setActiveLock(findingId) {
    if (findingId) localStorage.setItem(ACTIVE_LOCK_KEY, findingId);
    else localStorage.removeItem(ACTIVE_LOCK_KEY);
    toggleGlobalIndicator();
}

// --- WORK ORDER LOGIC ---

function createWorkOrder() {
    const woID = Date.now().toString().slice(-6); // Simple Unique ID suffix
    
    const newWO = {
        internalId: woID,
        generalData: {
            woNumber: "000000000",
            partDesc: "",
            pn: "",
            sn: "",
            acReg: "PK-GLL",
            customer: ""
        },
        findings: []
    };

    // Requirement: Automatically create 5 findings (01 - 05)
    for (let i = 1; i <= 5; i++) {
        const fNum = i.toString().padStart(2, '0');
        newWO.findings.push({
            id: `${woID}-${fNum}`, // Unique ID
            displayId: fNum,       // Visual ID (01, 02...)
            description: "",
            status: "OPEN", // OPEN, IN_PROGRESS, ON_HOLD, CLOSED
            materials: [],
            manhours: {
                empId: "",
                taskCode: "",
                logs: [], // {start, stop, duration}
                currentSession: null // {start: ISO}
            },
            photo: null
        });
    }

    workOrders.unshift(newWO);
    persistSystemData();
}

function updateGeneralData(woInternalId, field, value) {
    const wo = workOrders.find(w => w.internalId === woInternalId);
    if (wo) {
        wo.generalData[field] = value;
        // Optimization: Don't re-render everything on keystroke, just save
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workOrders));
    }
}

// --- FINDING LOGIC ---

function updateFindingDesc(woId, fId, val) {
    const f = findFinding(woId, fId);
    if(f) { f.description = val; persistSystemData(); }
}

function addMaterial(woId, fId) {
    const nameInput = document.getElementById(`mat-name-${fId}`);
    const qtyInput = document.getElementById(`mat-qty-${fId}`);
    
    if (nameInput.value && qtyInput.value) {
        const f = findFinding(woId, fId);
        f.materials.push({ name: nameInput.value, qty: qtyInput.value });
        persistSystemData();
    }
}

function removeMaterial(woId, fId, idx) {
    const f = findFinding(woId, fId);
    f.materials.splice(idx, 1);
    persistSystemData();
}

// --- TIMER / MANHOURS LOGIC ---

function startTask(woId, fId) {
    const active = getActiveLock();
    if (active && active !== fId) {
        alert("SYSTEM ALERT: Another task is currently running. You must stop it first.");
        return;
    }

    const finding = findFinding(woId, fId);
    const empInput = document.getElementById(`emp-${fId}`);
    const taskInput = document.getElementById(`task-${fId}`);

    if (!empInput.value || !taskInput.value) {
        alert("Enter Employee ID and Task Code to start.");
        return;
    }

    // Lock Data
    finding.manhours.empId = empInput.value;
    finding.manhours.taskCode = taskInput.value;
    finding.status = "IN_PROGRESS";
    finding.manhours.currentSession = {
        start: new Date().toISOString()
    };

    setActiveLock(fId);
    persistSystemData();
}

// Temporary state for the Modal interaction
let pendingStop = null; 

function stopTaskRequest(woId, fId) {
    const finding = findFinding(woId, fId);
    const stopTime = new Date().toISOString();
    
    // Store context for Modal
    pendingStop = {
        woId, 
        fId,
        stopTime
    };

    // Show Modal
    document.getElementById('statusModal').style.display = 'block';
}

function finalizeStop() {
    if (!pendingStop) return;

    const { woId, fId, stopTime } = pendingStop;
    const finding = findFinding(woId, fId);
    const sessionStart = finding.manhours.currentSession.start;
    
    // Calculate duration
    const duration = new Date(stopTime) - new Date(sessionStart);
    
    // Save to Log
    finding.manhours.logs.push({
        start: sessionStart,
        stop: stopTime,
        duration: duration
    });
    
    // Clear Session
    finding.manhours.currentSession = null;
    setActiveLock(null); // Release lock

    // Determine Status
    const choice = document.querySelector('input[name="taskStatus"]:checked').value;
    finding.status = choice; // ON_HOLD or CLOSED

    document.getElementById('statusModal').style.display = 'none';

    if (choice === 'CLOSED') {
        // Trigger Photo Flow
        pendingStop.isClosed = true; // Flag
        document.getElementById('photoModal').style.display = 'block';
        resetPhotoModal();
    } else {
        persistSystemData();
    }
}

// --- PHOTO HANDLER ---
let tempImgData = null;

function resetPhotoModal() {
    document.getElementById('photoInput').value = '';
    document.getElementById('fileNameDisplay').innerText = 'No file chosen';
    document.getElementById('btnSavePhoto').disabled = true;
    tempImgData = null;
}

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            tempImgData = evt.target.result;
            document.getElementById('fileNameDisplay').innerText = file.name;
            document.getElementById('btnSavePhoto').disabled = false;
        };
        reader.readAsDataURL(file);
    }
}

function saveImage() {
    if (pendingStop && tempImgData) {
        const finding = findFinding(pendingStop.woId, pendingStop.fId);
        finding.photo = tempImgData;
        document.getElementById('photoModal').style.display = 'none';
        persistSystemData();
    }
}

function skipImage() {
    document.getElementById('photoModal').style.display = 'none';
    persistSystemData();
}

// --- RENDERING ---

function renderSystem() {
    const container = document.getElementById('appContainer');
    container.innerHTML = '';

    workOrders.forEach(wo => {
        const woEl = document.createElement('div');
        woEl.className = 'wo-sheet';
        
        // 1. General Data Grid
        woEl.innerHTML = `
            <div class="wo-general-data">
                <div class="data-field">
                    <label>WO Number</label>
                    <input type="text" value="${wo.generalData.woNumber}" onchange="updateGeneralData('${wo.internalId}', 'woNumber', this.value)">
                </div>
                <div class="data-field">
                    <label>Customer</label>
                    <input type="text" value="${wo.generalData.customer}" onchange="updateGeneralData('${wo.internalId}', 'customer', this.value)">
                </div>
                <div class="data-field">
                    <label>A/C Reg (ex PK-GLL)</label>
                    <input type="text" value="${wo.generalData.acReg}" onchange="updateGeneralData('${wo.internalId}', 'acReg', this.value)">
                </div>
                <div class="data-field">
                    <label>Part Description</label>
                    <input type="text" value="${wo.generalData.partDesc}" onchange="updateGeneralData('${wo.internalId}', 'partDesc', this.value)">
                </div>
                <div class="data-field">
                    <label>P/N</label>
                    <input type="text" value="${wo.generalData.pn}" onchange="updateGeneralData('${wo.internalId}', 'pn', this.value)">
                </div>
                <div class="data-field">
                    <label>S/N</label>
                    <input type="text" value="${wo.generalData.sn}" onchange="updateGeneralData('${wo.internalId}', 'sn', this.value)">
                </div>
            </div>
            <div class="wo-findings-container" id="findings-${wo.internalId}">
                <!-- Findings Injected Here -->
            </div>
        `;
        
        container.appendChild(woEl);
        
        // 2. Render Findings
        const fContainer = document.getElementById(`findings-${wo.internalId}`);
        wo.findings.forEach(f => {
            fContainer.appendChild(createFindingCard(wo.internalId, f));
        });
    });

    toggleGlobalIndicator();
}

function createFindingCard(woId, f) {
    const card = document.createElement('div');
    card.className = 'finding-card';
    card.setAttribute('data-status', f.status);
    
    // Status visual helpers
    const isRunning = f.status === 'IN_PROGRESS';
    const isClosed = f.status === 'CLOSED';
    const isLocked = isRunning || isClosed; // Inputs locked
    
    // Status Badge Color
    let badgeClass = 'bg-open';
    if(isRunning) badgeClass = 'bg-active';
    if(f.status === 'ON_HOLD') badgeClass = 'bg-hold';
    if(isClosed) badgeClass = 'bg-closed';

    // Time Calculation
    const historyMs = f.manhours.logs.reduce((acc, l) => acc + l.duration, 0);
    const historyStr = formatMs(historyMs);

    card.innerHTML = `
        <div class="fc-header">
            <div class="fc-title">Finding #${f.displayId}</div>
            <div class="fc-status ${badgeClass}">${f.status.replace('_', ' ')}</div>
        </div>
        
        <div class="fc-body">
            <!-- Left Side -->
            <div class="fc-left">
                <textarea placeholder="Description of Finding..." 
                    ${isClosed ? 'disabled' : ''} 
                    onchange="updateFindingDesc('${woId}', '${f.id}', this.value)">${f.description}</textarea>
                
                <div style="font-size:0.8rem; font-weight:bold; margin-bottom:4px;">Materials Consumed:</div>
                <table class="mat-table">
                    <thead><tr><th>P/N or Name</th><th width="50">Qty</th><th width="30"></th></tr></thead>
                    <tbody>
                        ${f.materials.map((m, i) => `
                        <tr>
                            <td>${m.name}</td>
                            <td>${m.qty}</td>
                            <td>${!isClosed ? `<i class="fas fa-times" style="color:red; cursor:pointer;" onclick="removeMaterial('${woId}', '${f.id}', ${i})"></i>` : ''}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                ${!isClosed ? `
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" id="mat-name-${f.id}" placeholder="Part Name" style="flex:1; padding:4px;">
                    <input type="number" id="mat-qty-${f.id}" placeholder="Qty" style="width:50px; padding:4px;">
                    <button class="btn-secondary" onclick="addMaterial('${woId}', '${f.id}')">+</button>
                </div>` : ''}
            </div>

            <!-- Right Side (Manhours) -->
            <div class="fc-right">
                <div class="progression-header">Manhours Record</div>
                
                <div class="mh-inputs">
                    <input type="text" id="emp-${f.id}" placeholder="Emp ID" value="${f.manhours.empId}" ${isLocked ? 'disabled' : ''}>
                    <input type="text" id="task-${f.id}" placeholder="Task Code" value="${f.manhours.taskCode}" ${isLocked ? 'disabled' : ''}>
                </div>

                <div class="timer-box" id="timer-${f.id}">00:00:00</div>

                <div class="ctrl-buttons">
                    ${!isRunning && !isClosed ? 
                        `<button class="btn-success" onclick="startTask('${woId}', '${f.id}')"><i class="fas fa-play"></i> START</button>` : 
                        `<button class="btn-success" disabled><i class="fas fa-play"></i> START</button>`
                    }
                    ${isRunning ? 
                        `<button class="btn-danger" onclick="stopTaskRequest('${woId}', '${f.id}')"><i class="fas fa-stop"></i> STOP</button>` : 
                        `<button class="btn-danger" disabled><i class="fas fa-stop"></i> STOP</button>`
                    }
                </div>

                <div class="log-summary">
                    Total: <strong>${historyStr}</strong>
                    ${f.manhours.logs.length > 0 ? `<br><span style="font-size:0.7em">(${f.manhours.logs.length} sessions)</span>` : ''}
                </div>

                ${f.photo ? `
                    <div class="photo-evidence">
                        <img src="${f.photo}" alt="Evidence">
                        <span class="photo-badge">EVIDENCE ATTACHED</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    return card;
}

// --- UTILS & HELPERS ---

function findFinding(woInternalId, fId) {
    const wo = workOrders.find(w => w.internalId === woInternalId);
    if (!wo) return null;
    return wo.findings.find(f => f.id === fId);
}

function formatMs(ms) {
    if(!ms) return "00:00:00";
    let secs = Math.floor((ms / 1000) % 60);
    let mins = Math.floor((ms / (1000 * 60)) % 60);
    let hrs = Math.floor((ms / (1000 * 60 * 60)));
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}
function pad(n) { return n < 10 ? '0'+n : n; }

function startGlobalClock() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const activeId = getActiveLock();
        if (activeId) {
            // Find finding in memory
            let activeF = null;
            for(const w of workOrders) {
                const f = w.findings.find(x => x.id === activeId);
                if(f) { activeF = f; break; }
            }

            if (activeF && activeF.manhours.currentSession) {
                const start = new Date(activeF.manhours.currentSession.start);
                const now = new Date();
                const diff = now - start;
                const el = document.getElementById(`timer-${activeId}`);
                if(el) el.innerText = formatMs(diff);
            }
        }
    }, 1000);
}

function toggleGlobalIndicator() {
    const activeId = getActiveLock();
    const ind = document.getElementById('globalTaskIndicator');
    if(activeId) {
        ind.style.display = 'flex';
        // Optional: show which finding is running
        document.getElementById('activeTaskLabel').innerText = "Running: Finding " + activeId.split('-')[1];
    } else {
        ind.style.display = 'none';
    }
}
