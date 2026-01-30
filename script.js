/* 
 * AIRCRAFT MAINTENANCE SYSTEM
 * Work Order + Findings + Detailed Log
 * Pure JS / LocalStorage
 */

const STORAGE_KEY = 'mro_sys_data_v2';
const ACTIVE_LOCK_KEY = 'mro_active_lock'; 

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

    // Resume Timer
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
    const woID = Date.now().toString().slice(-6); 
    
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

    // Auto-create 5 findings
    for (let i = 1; i <= 5; i++) {
        const fNum = i.toString().padStart(2, '0');
        newWO.findings.push({
            id: `${woID}-${fNum}`, 
            displayId: fNum,
            description: "",
            status: "OPEN",
            materials: [],
            manhours: {
                empId: "",
                taskCode: "",
                // 'logs' stores completed sessions: { start, stop, duration, empId, taskCode }
                logs: [], 
                // 'currentSession' stores active state: { start, empId, taskCode }
                currentSession: null 
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workOrders)); // Quick save
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
        alert("SYSTEM ALERT: Another task is currently running. Please stop it first.");
        return;
    }

    const finding = findFinding(woId, fId);
    const empInput = document.getElementById(`emp-${fId}`);
    const taskInput = document.getElementById(`task-${fId}`);

    if (!empInput.value || !taskInput.value) {
        alert("Enter Employee ID and Task Code to start.");
        return;
    }

    finding.manhours.empId = empInput.value;
    finding.manhours.taskCode = taskInput.value;
    finding.status = "IN_PROGRESS";
    finding.manhours.currentSession = {
        start: new Date().toISOString(),
        empId: empInput.value,
        taskCode: taskInput.value
    };

    setActiveLock(fId);
    persistSystemData();
}

let pendingStop = null; 

function stopTaskRequest(woId, fId) {
    // Just trigger modal, don't stop logical timer yet
    const stopTime = new Date().toISOString();
    pendingStop = { woId, fId, stopTime };
    document.getElementById('statusModal').style.display = 'block';
}

function finalizeStop() {
    if (!pendingStop) return;

    const { woId, fId, stopTime } = pendingStop;
    const finding = findFinding(woId, fId);
    const session = finding.manhours.currentSession;
    
    const duration = new Date(stopTime) - new Date(session.start);
    
    // Save to Log History
    finding.manhours.logs.push({
        start: session.start,
        stop: stopTime,
        duration: duration,
        empId: session.empId,
        taskCode: session.taskCode
    });
    
    // Clear Session
    finding.manhours.currentSession = null;
    setActiveLock(null); 

    // Status Update
    const choice = document.querySelector('input[name="taskStatus"]:checked').value;
    finding.status = choice;

    document.getElementById('statusModal').style.display = 'none';

    if (choice === 'CLOSED') {
        pendingStop.isClosed = true;
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
    // Note: We need to preserve dropdown states if re-rendering
    // But since this is a simple app, we might close them on full render.
    // For better UX, let's keep it simple: Re-render closes dropdowns.
    
    const container = document.getElementById('appContainer');
    container.innerHTML = '';

    workOrders.forEach(wo => {
        const woEl = document.createElement('div');
        woEl.className = 'wo-sheet';
        
        woEl.innerHTML = `
            <div class="wo-general-data">
                <div class="data-field"><label>WO Number</label><input type="text" value="${wo.generalData.woNumber}" onchange="updateGeneralData('${wo.internalId}', 'woNumber', this.value)"></div>
                <div class="data-field"><label>Customer</label><input type="text" value="${wo.generalData.customer}" onchange="updateGeneralData('${wo.internalId}', 'customer', this.value)"></div>
                <div class="data-field"><label>A/C Reg</label><input type="text" value="${wo.generalData.acReg}" onchange="updateGeneralData('${wo.internalId}', 'acReg', this.value)"></div>
                <div class="data-field"><label>Part Desc</label><input type="text" value="${wo.generalData.partDesc}" onchange="updateGeneralData('${wo.internalId}', 'partDesc', this.value)"></div>
                <div class="data-field"><label>P/N</label><input type="text" value="${wo.generalData.pn}" onchange="updateGeneralData('${wo.internalId}', 'pn', this.value)"></div>
                <div class="data-field"><label>S/N</label><input type="text" value="${wo.generalData.sn}" onchange="updateGeneralData('${wo.internalId}', 'sn', this.value)"></div>
            </div>
            <div class="wo-findings-container" id="findings-${wo.internalId}"></div>
        `;
        
        container.appendChild(woEl);
        
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
    
    const isRunning = f.status === 'IN_PROGRESS';
    const isClosed = f.status === 'CLOSED';
    
    // Badge
    let badgeClass = 'bg-open';
    if(isRunning) badgeClass = 'bg-active';
    if(f.status === 'ON_HOLD') badgeClass = 'bg-hold';
    if(isClosed) badgeClass = 'bg-closed';

    // Total Duration Calc
    const historyMs = f.manhours.logs.reduce((acc, l) => acc + l.duration, 0);
    
    // --- BUILD LOG EVENTS (START/STOP Transactional View) ---
    // We break down logs into individual events
    let events = [];
    
    // Add completed sessions
    f.manhours.logs.forEach(l => {
        events.push({ type: 'STOP', time: l.stop, emp: l.empId, task: l.taskCode });
        events.push({ type: 'START', time: l.start, emp: l.empId, task: l.taskCode });
    });
    
    // Add current session if running
    if (f.manhours.currentSession) {
        const s = f.manhours.currentSession;
        events.push({ type: 'START', time: s.start, emp: s.empId, task: s.taskCode });
    }
    
    // Sort by time descending (newest first)
    events.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Generate Table Rows
    const logRows = events.map(e => `
        <tr>
            <td>${formatDateSimple(e.time)}</td>
            <td>${e.emp}</td>
            <td>${e.task}</td>
            <td><span class="badge-action ${e.type === 'START' ? 'badge-start' : 'badge-stop'}">${e.type}</span></td>
        </tr>
    `).join('');

    card.innerHTML = `
        <div class="fc-header">
            <div class="fc-title">Finding #${f.displayId}</div>
            <div class="fc-status ${badgeClass}">${f.status.replace('_', ' ')}</div>
        </div>
        <div class="fc-body">
            <div class="fc-left">
                <textarea placeholder="Description..." ${isClosed ? 'disabled' : ''} 
                    onchange="updateFindingDesc('${woId}', '${f.id}', this.value)">${f.description}</textarea>
                
                <table class="mat-table">
                    <thead><tr><th>P/N or Name</th><th>Qty</th><th></th></tr></thead>
                    <tbody>
                        ${f.materials.map((m, i) => `
                        <tr><td>${m.name}</td><td>${m.qty}</td>
                            <td>${!isClosed ? `<i class="fas fa-times" style="color:red; cursor:pointer;" onclick="removeMaterial('${woId}', '${f.id}', ${i})"></i>` : ''}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                ${!isClosed ? `
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" id="mat-name-${f.id}" placeholder="Part" style="flex:1; padding:4px;">
                    <input type="number" id="mat-qty-${f.id}" placeholder="Qty" style="width:50px; padding:4px;">
                    <button class="btn-secondary" onclick="addMaterial('${woId}', '${f.id}')">+</button>
                </div>` : ''}
            </div>

            <div class="fc-right">
                <div class="progression-header">Manhours Record</div>
                <div class="mh-inputs">
                    <input type="text" id="emp-${f.id}" placeholder="Emp ID" value="${f.manhours.empId}" ${isRunning || isClosed ? 'disabled' : ''}>
                    <input type="text" id="task-${f.id}" placeholder="Task No" value="${f.manhours.taskCode}" ${isRunning || isClosed ? 'disabled' : ''}>
                </div>
                <div class="timer-box" id="timer-${f.id}">00:00:00</div>
                
                <div class="ctrl-buttons">
                    ${!isRunning && !isClosed ? 
                        `<button class="btn-success" onclick="startTask('${woId}', '${f.id}')"><i class="fas fa-play"></i> START</button>` : 
                        `<button class="btn-success" disabled style="opacity:0.3">START</button>`
                    }
                    ${isRunning ? 
                        `<button class="btn-danger" onclick="stopTaskRequest('${woId}', '${f.id}')"><i class="fas fa-stop"></i> STOP</button>` : 
                        `<button class="btn-danger" disabled style="opacity:0.3">STOP</button>`
                    }
                </div>

                <div class="log-summary-container">
                    <div style="text-align:right; font-size:0.8rem; margin-bottom:5px;">Total Duration: <strong>${formatMs(historyMs)}</strong></div>
                    
                    <button class="log-toggle-btn" onclick="toggleLogView('${f.id}')">
                        See Performing Log <i class="fas fa-chevron-down"></i>
                    </button>
                    
                    <div id="log-content-${f.id}" class="log-dropdown-content">
                        <table class="log-table">
                            <thead><tr><th>Time Stamp</th><th>ID</th><th>Task</th><th>Action</th></tr></thead>
                            <tbody>${logRows}</tbody>
                        </table>
                    </div>
                </div>

                ${f.photo ? `<div class="photo-evidence"><img src="${f.photo}"><span class="photo-badge">EVIDENCE</span></div>` : ''}
            </div>
        </div>
    `;
    return card;
}

// --- VIEW HELPERS ---

function toggleLogView(id) {
    const el = document.getElementById(`log-content-${id}`);
    if (el.style.display === 'block') {
        el.style.display = 'none';
    } else {
        el.style.display = 'block';
    }
}

function formatDateSimple(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} <br> <span style="color:#777">${timePart}</span>`;
}

function findFinding(woInternalId, fId) {
    const wo = workOrders.find(w => w.internalId === woInternalId);
    return wo ? wo.findings.find(f => f.id === fId) : null;
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
            let activeF = null;
            for(const w of workOrders) {
                const f = w.findings.find(x => x.id === activeId);
                if(f) { activeF = f; break; }
            }
            if (activeF && activeF.manhours.currentSession) {
                const diff = new Date() - new Date(activeF.manhours.currentSession.start);
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
        document.getElementById('activeTaskLabel').innerText = "Running: #" + activeId.split('-')[1];
    } else {
        ind.style.display = 'none';
    }
}
