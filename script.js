/**
 * AIRCRAFT MAINTENANCE WO SYSTEM
 * Pure JS - LocalStorage Persistence - No Frameworks
 */

// --- GLOBAL STATE ---
const STORE_KEY = 'mro_wo_data';
const ACTIVE_TASK_KEY = 'mro_active_task'; // Stores ID of finding currently running
let appData = [];
let timerInterval = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderApp();
    checkGlobalActiveTask();
    
    // Global Event Listeners
    document.getElementById('btnNewWO').addEventListener('click', createNewWO);
    document.getElementById('btnConfirmStatus').addEventListener('click', confirmStopStatus);
    document.getElementById('photoInput').addEventListener('change', handleFileSelect);
    document.getElementById('btnSavePhoto').addEventListener('click', savePhotoAndClose);
    document.getElementById('btnSkipPhoto').addEventListener('click', closeWithoutPhoto);
});

// --- DATA MANAGEMENT ---
function loadData() {
    const stored = localStorage.getItem(STORE_KEY);
    appData = stored ? JSON.parse(stored) : [];
}

function saveData() {
    localStorage.setItem(STORE_KEY, JSON.stringify(appData));
    renderApp(); // Re-render to reflect changes
}

function getActiveTask() {
    return localStorage.getItem(ACTIVE_TASK_KEY);
}

function setActiveTask(findingId) {
    if (findingId) {
        localStorage.setItem(ACTIVE_TASK_KEY, findingId);
    } else {
        localStorage.removeItem(ACTIVE_TASK_KEY);
    }
    checkGlobalActiveTask();
}

// --- CORE LOGIC: TIME TRACKING ---

// Start Logic
function startTask(woId, findingId) {
    const currentActive = getActiveTask();
    if (currentActive && currentActive !== findingId) {
        alert("SYSTEM RULE: Only one active task allowed per session. Please stop the other task first.");
        return;
    }

    const finding = findFinding(woId, findingId);
    
    // Validation
    const empId = document.getElementById(`emp-${findingId}`).value;
    const taskCode = document.getElementById(`task-${findingId}`).value;

    if (!empId || !taskCode) {
        alert("Employee ID and Task Code are required to start.");
        return;
    }

    // Update Data
    finding.progression.employeeId = empId;
    finding.progression.taskCode = taskCode;
    finding.status = 'IN_PROGRESS';
    
    const now = new Date().toISOString();
    finding.progression.currentSession = {
        start: now,
        active: true
    };

    setActiveTask(findingId);
    saveData();
}

// Stop Logic (Triggers Modal)
let tempStopData = null; // Temporary holding for modal logic

function initiateStop(woId, findingId) {
    const finding = findFinding(woId, findingId);
    const now = new Date().toISOString();
    
    // Pause internally
    finding.progression.currentSession.active = false; // Temporarily flag as stopping
    
    // Store context for modal
    tempStopData = { woId, findingId, stopTime: now };
    
    // Show Modal
    document.getElementById('statusModal').style.display = 'block';
}

// Modal: Confirm Status
function confirmStopStatus() {
    if (!tempStopData) return;
    
    const { woId, findingId, stopTime } = tempStopData;
    const finding = findFinding(woId, findingId);
    const selectedStatus = document.querySelector('input[name="taskStatus"]:checked').value; // ON_HOLD or CLOSED
    
    // Calculate Duration
    const startTime = new Date(finding.progression.currentSession.start);
    const stopTimeDate = new Date(stopTime);
    const durationMs = stopTimeDate - startTime;
    
    // Archive Session Log
    finding.progression.logs.push({
        start: finding.progression.currentSession.start,
        stop: stopTime,
        duration: durationMs
    });
    
    // Reset Current Session
    finding.progression.currentSession = null;
    
    // Update Finding Status
    finding.status = selectedStatus;
    
    // Clear Active Lock
    setActiveTask(null);
    
    document.getElementById('statusModal').style.display = 'none';

    if (selectedStatus === 'CLOSED') {
        // Trigger Photo Modal
        tempStopData.isClosed = true; // Flag for photo modal
        document.getElementById('photoModal').style.display = 'block';
        // Reset file input
        document.getElementById('photoInput').value = '';
        document.getElementById('fileNameDisplay').textContent = "No file chosen";
        document.getElementById('btnSavePhoto').disabled = true;
    } else {
        saveData();
    }
}

// --- PHOTO LOGIC ---
let currentPhotoBase64 = null;

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('fileNameDisplay').textContent = file.name;
        const reader = new FileReader();
        reader.onload = function(evt) {
            currentPhotoBase64 = evt.target.result;
            document.getElementById('btnSavePhoto').disabled = false;
        };
        reader.readAsDataURL(file);
    }
}

function savePhotoAndClose() {
    if (tempStopData && currentPhotoBase64) {
        const finding = findFinding(tempStopData.woId, tempStopData.findingId);
        finding.closingPhoto = currentPhotoBase64;
        currentPhotoBase64 = null;
        document.getElementById('photoModal').style.display = 'none';
        saveData();
    }
}

function closeWithoutPhoto() {
    document.getElementById('photoModal').style.display = 'none';
    saveData();
}

// --- RENDERING UI ---

function renderApp() {
    const container = document.getElementById('appContainer');
    container.innerHTML = '';

    appData.forEach(wo => {
        const woEl = document.createElement('div');
        woEl.className = 'wo-card';
        woEl.innerHTML = `
            <div class="wo-header">
                <h3>WO #: ${wo.id}</h3>
                <button class="btn-secondary btn-sm" onclick="addFinding('${wo.id}')">+ Add Finding</button>
            </div>
            <div class="wo-body" id="wo-body-${wo.id}">
                <!-- Findings go here -->
            </div>
        `;
        container.appendChild(woEl);

        const findingContainer = woEl.querySelector(`#wo-body-${wo.id}`);
        wo.findings.forEach(finding => {
            findingContainer.appendChild(createFindingElement(wo.id, finding));
        });
    });

    startGlobalTimer(); // Start the interval engine
}

function createFindingElement(woId, finding) {
    const div = document.createElement('div');
    const isClosed = finding.status === 'CLOSED';
    const isActive = finding.status === 'IN_PROGRESS';
    div.className = `finding-item ${isClosed ? 'closed' : ''}`;
    
    // Status Badge Logic
    let badgeClass = 'status-open';
    if(finding.status === 'IN_PROGRESS') badgeClass = 'status-active';
    if(finding.status === 'ON_HOLD') badgeClass = 'status-hold';
    if(finding.status === 'CLOSED') badgeClass = 'status-closed';

    // Calculate Totals
    const totalPreviousMs = finding.progression.logs.reduce((acc, log) => acc + log.duration, 0);
    const totalDurationStr = formatTime(totalPreviousMs);

    // Initial inputs values
    const empVal = finding.progression.employeeId || '';
    const taskVal = finding.progression.taskCode || '';
    
    // Disable inputs if running or closed
    const inputsDisabled = isActive || isClosed ? 'disabled' : '';
    const descDisabled = isClosed ? 'disabled' : '';

    div.innerHTML = `
        <div class="finding-header">
            <strong>ID: ${finding.id}</strong>
            <span class="status-badge ${badgeClass}">${finding.status.replace('_', ' ')}</span>
        </div>
        
        <textarea class="finding-desc" placeholder="Describe finding..." onchange="updateDesc('${woId}', '${finding.id}', this.value)" ${descDisabled}>${finding.description}</textarea>
        
        <!-- Materials Section -->
        <div class="materials-section">
            <h4 style="font-size:0.8rem; color:#666;">Materials</h4>
            <table class="material-table">
                <thead><tr><th>Part Name</th><th width="80">Qty</th><th width="50">Action</th></tr></thead>
                <tbody id="mat-list-${finding.id}">
                    ${finding.materials.map((m, idx) => `
                        <tr>
                            <td>${m.name}</td>
                            <td>${m.qty}</td>
                            <td>${!isClosed ? `<i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="deleteMaterial('${woId}', '${finding.id}', ${idx})"></i>` : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${!isClosed ? `
            <div style="display:flex; gap:5px; margin-top:5px;">
                <input type="text" placeholder="Part Name" class="input-sm" id="new-mat-name-${finding.id}">
                <input type="number" placeholder="Qty" class="input-sm" style="width:60px" id="new-mat-qty-${finding.id}">
                <button class="btn-secondary" style="padding:2px 8px;" onclick="addMaterial('${woId}', '${finding.id}')">Add</button>
            </div>` : ''}
        </div>

        <!-- PROGRESS SECTION -->
        <div class="progression-panel">
            <div class="panel-title">Task Progression</div>
            <div class="progression-grid">
                <div class="form-group">
                    <label>Employee ID</label>
                    <input type="text" id="emp-${finding.id}" value="${empVal}" ${inputsDisabled}>
                </div>
                <div class="form-group">
                    <label>Task Code</label>
                    <input type="text" id="task-${finding.id}" value="${taskVal}" ${inputsDisabled}>
                </div>
                <div class="form-group">
                    <div class="timer-display" id="timer-${finding.id}">00:00:00</div>
                    <div style="text-align:center; font-size:0.7rem; color:#888;">Live Consuming Hours</div>
                </div>
            </div>

            <div class="controls-row">
                ${!isActive && !isClosed ? 
                    `<button class="btn-success" onclick="startTask('${woId}', '${finding.id}')"><i class="fas fa-play"></i> START</button>` : 
                    `<button class="btn-success" disabled style="opacity:0.3"><i class="fas fa-play"></i> START</button>`
                }
                
                ${isActive ? 
                    `<button class="btn-danger" onclick="initiateStop('${woId}', '${finding.id}')"><i class="fas fa-stop"></i> STOP</button>` : 
                    `<button class="btn-danger" disabled style="opacity:0.3"><i class="fas fa-stop"></i> STOP</button>`
                }

                <div class="timestamp-display">
                    <div>Total Duration: <strong>${totalDurationStr}</strong></div>
                    ${isActive ? `<div>Started: ${new Date(finding.progression.currentSession.start).toLocaleTimeString()}</div>` : ''}
                </div>
            </div>

            ${finding.closingPhoto ? `
                <div style="margin-top:10px;">
                    <div style="font-size:0.75rem; font-weight:bold;">Evidence:</div>
                    <img src="${finding.closingPhoto}" class="image-preview">
                </div>
            ` : ''}
        </div>
    `;
    return div;
}

// --- HELPER FUNCTIONS ---

function createNewWO() {
    const id = 'WO-' + Math.floor(1000 + Math.random() * 9000);
    appData.unshift({
        id: id,
        findings: []
    });
    saveData();
}

function addFinding(woId) {
    const wo = appData.find(w => w.id === woId);
    if(wo) {
        wo.findings.push({
            id: 'F-' + Math.floor(1000 + Math.random() * 9000),
            description: '',
            status: 'OPEN',
            materials: [],
            progression: {
                employeeId: '',
                taskCode: '',
                logs: [], // History
                currentSession: null // { start: ISOString, active: Bool }
            },
            closingPhoto: null
        });
        saveData();
    }
}

function updateDesc(woId, fId, val) {
    const f = findFinding(woId, fId);
    if(f) {
        f.description = val;
        saveData();
    }
}

function addMaterial(woId, fId) {
    const name = document.getElementById(`new-mat-name-${fId}`).value;
    const qty = document.getElementById(`new-mat-qty-${fId}`).value;
    if(name && qty) {
        const f = findFinding(woId, fId);
        f.materials.push({name, qty});
        saveData();
    }
}

function deleteMaterial(woId, fId, idx) {
    const f = findFinding(woId, fId);
    f.materials.splice(idx, 1);
    saveData();
}

function findFinding(woId, fId) {
    const wo = appData.find(w => w.id === woId);
    return wo ? wo.findings.find(f => f.id === fId) : null;
}

// --- TIMER ENGINE ---

function formatTime(ms) {
    if(!ms) return "00:00:00";
    let seconds = Math.floor((ms / 1000) % 60);
    let minutes = Math.floor((ms / (1000 * 60)) % 60);
    let hours = Math.floor((ms / (1000 * 60 * 60)));

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return hours + ":" + minutes + ":" + seconds;
}

function startGlobalTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const activeTaskID = getActiveTask();
        
        if (activeTaskID) {
            // Find the active data
            let activeFinding = null;
            let activeWO = null;
            
            for(let w of appData) {
                const f = w.findings.find(x => x.id === activeTaskID);
                if (f && f.progression.currentSession && f.progression.currentSession.active) {
                    activeFinding = f;
                    break;
                }
            }
            
            if (activeFinding) {
                const start = new Date(activeFinding.progression.currentSession.start);
                const now = new Date();
                const diff = now - start;
                
                const timerEl = document.getElementById(`timer-${activeTaskID}`);
                if (timerEl) {
                    timerEl.textContent = formatTime(diff);
                }
            }
        }
    }, 1000);
}

function checkGlobalActiveTask() {
    const active = getActiveTask();
    const indicator = document.getElementById('globalTaskIndicator');
    if (active) {
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}
