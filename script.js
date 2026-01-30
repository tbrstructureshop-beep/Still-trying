/**
 * MRO WORK ORDER SYSTEM
 * Supports Multi-User "Department Team" Workflow
 */

const DB_KEY = 'mro_team_db';
const ACTIVE_KEY = 'mro_active_task_id';

let appData = [];
let clockInterval = null;

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderApp();
    
    // Listeners
    document.getElementById('btnNewWO').addEventListener('click', createNewWorkOrder);
    document.getElementById('btnConfirmStatus').addEventListener('click', finalizeStopTask);
    document.getElementById('photoInput').addEventListener('change', previewImage);
    document.getElementById('btnSavePhoto').addEventListener('click', saveEvidence);
    document.getElementById('btnSkipPhoto').addEventListener('click', closeWithoutEvidence);

    // Start Clock
    startSystemClock();
});

// --- DATA HANDLERS ---
function loadData() {
    const json = localStorage.getItem(DB_KEY);
    appData = json ? JSON.parse(json) : [];
}
function saveData() {
    localStorage.setItem(DB_KEY, JSON.stringify(appData));
    renderApp();
}
function getActiveTaskID() { return localStorage.getItem(ACTIVE_KEY); }
function setActiveTaskID(id) { 
    if(id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
    updateGlobalIndicator();
}

// --- LOGIC: WORK ORDER ---
function createNewWorkOrder() {
    const uid = Date.now().toString().slice(-6);
    const newSheet = {
        uid: uid,
        header: { wo: '000000', cust: '', reg: 'PK-GLL', desc: '', pn: '', sn: '' },
        findings: []
    };
    
    // Auto-generate 5 Findings
    for(let i=1; i<=5; i++) {
        newSheet.findings.push({
            id: `${uid}-F${i}`,
            num: `0${i}`,
            desc: '',
            status: 'OPEN',
            materials: [],
            // Manhours Logic
            mh: {
                lastEmp: '', // Default for input field
                lastTask: '',
                activeSession: null, // { start, emp, task }
                history: [] // { start, stop, duration, emp, task }
            },
            photo: null
        });
    }
    appData.unshift(newSheet);
    saveData();
}

function updateHeader(uid, field, val) {
    const wo = appData.find(w => w.uid === uid);
    if(wo) { wo.header[field] = val; localStorage.setItem(DB_KEY, JSON.stringify(appData)); }
}

// --- LOGIC: FINDINGS & MATERIALS ---
function updateDesc(uid, fid, val) {
    const f = findFinding(uid, fid);
    if(f) { f.desc = val; saveData(); }
}
function addMat(uid, fid) {
    const name = document.getElementById(`m-name-${fid}`).value;
    const qty = document.getElementById(`m-qty-${fid}`).value;
    if(name && qty) {
        findFinding(uid, fid).materials.push({name, qty});
        saveData();
    }
}
function delMat(uid, fid, idx) {
    findFinding(uid, fid).materials.splice(idx, 1);
    saveData();
}

// --- CORE: MANHOURS (MULTI-USER SUPPORT) ---

function startTask(uid, fid) {
    // 1. Check Lock
    const running = getActiveTaskID();
    if(running && running !== fid) {
        alert("System Busy: Another task is running. Please stop it first.");
        return;
    }

    const f = findFinding(uid, fid);
    const empInput = document.getElementById(`emp-${fid}`).value.trim();
    const taskInput = document.getElementById(`task-${fid}`).value.trim();

    if(!empInput || !taskInput) {
        alert("Operator ID and Task Code are required.");
        return;
    }

    // 2. Start Session (Capture SPECIFIC User ID)
    f.mh.activeSession = {
        start: new Date().toISOString(),
        emp: empInput,  // <-- Captures whoever is currently logged in/typing
        task: taskInput
    };
    
    // Update defaults for next time (convenience)
    f.mh.lastEmp = empInput;
    f.mh.lastTask = taskInput;
    f.status = 'IN_PROGRESS';

    setActiveTaskID(fid);
    saveData();
}

// Temp storage for Modal interaction
let tempStopContext = null;

function requestStop(uid, fid) {
    const f = findFinding(uid, fid);
    tempStopContext = { uid, fid, stopTime: new Date().toISOString() };
    document.getElementById('statusModal').style.display = 'block';
}

function finalizeStopTask() {
    if(!tempStopContext) return;
    
    const { uid, fid, stopTime } = tempStopContext;
    const f = findFinding(uid, fid);
    const sess = f.mh.activeSession;

    // 1. Commit to History
    const duration = new Date(stopTime) - new Date(sess.start);
    f.mh.history.push({
        start: sess.start,
        stop: stopTime,
        duration: duration,
        emp: sess.emp, // <-- Saves the ID of the person who did THIS block
        task: sess.task
    });

    // 2. Clear Active State
    f.mh.activeSession = null;
    setActiveTaskID(null);

    // 3. Set Status
    const statusChoice = document.querySelector('input[name="taskStatus"]:checked').value;
    f.status = statusChoice;

    document.getElementById('statusModal').style.display = 'none';

    // 4. Handle Photo if Closed
    if(statusChoice === 'CLOSED') {
        tempStopContext.closed = true;
        document.getElementById('photoModal').style.display = 'block';
        resetPhotoModal();
    } else {
        saveData();
    }
}

// --- PHOTO HANDLERS ---
let tempImg = null;
function resetPhotoModal() {
    document.getElementById('photoInput').value = '';
    document.getElementById('fileNameDisplay').innerText = 'No file';
    document.getElementById('btnSavePhoto').disabled = true;
    tempImg = null;
}
function previewImage(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempImg = ev.target.result;
            document.getElementById('fileNameDisplay').innerText = file.name;
            document.getElementById('btnSavePhoto').disabled = false;
        };
        reader.readAsDataURL(file);
    }
}
function saveEvidence() {
    if(tempStopContext && tempImg) {
        findFinding(tempStopContext.uid, tempStopContext.fid).photo = tempImg;
        document.getElementById('photoModal').style.display = 'none';
        saveData();
    }
}
function closeWithoutEvidence() {
    document.getElementById('photoModal').style.display = 'none';
    saveData();
}

// --- RENDERERS ---

function renderApp() {
    const container = document.getElementById('appContainer');
    container.innerHTML = '';

    appData.forEach(wo => {
        const div = document.createElement('div');
        div.className = 'wo-sheet';
        
        // Header Grid
        div.innerHTML = `
            <div class="wo-header-grid">
                <div class="input-group"><label>WO No</label><input value="${wo.header.wo}" onchange="updateHeader('${wo.uid}','wo',this.value)"></div>
                <div class="input-group"><label>Customer</label><input value="${wo.header.cust}" onchange="updateHeader('${wo.uid}','cust',this.value)"></div>
                <div class="input-group"><label>A/C Reg</label><input value="${wo.header.reg}" onchange="updateHeader('${wo.uid}','reg',this.value)"></div>
                <div class="input-group"><label>Part Desc</label><input value="${wo.header.desc}" onchange="updateHeader('${wo.uid}','desc',this.value)"></div>
                <div class="input-group"><label>P/N</label><input value="${wo.header.pn}" onchange="updateHeader('${wo.uid}','pn',this.value)"></div>
                <div class="input-group"><label>S/N</label><input value="${wo.header.sn}" onchange="updateHeader('${wo.uid}','sn',this.value)"></div>
            </div>
            <div class="findings-list" id="f-list-${wo.uid}"></div>
        `;
        container.appendChild(div);

        // Findings
        const fList = div.querySelector(`#f-list-${wo.uid}`);
        wo.findings.forEach(f => {
            fList.appendChild(createFindingCard(wo.uid, f));
        });
    });
    updateGlobalIndicator();
}

function createFindingCard(uid, f) {
    const card = document.createElement('div');
    card.className = 'finding-card';
    card.setAttribute('data-status', f.status);

    const isRun = f.status === 'IN_PROGRESS';
    const isClosed = f.status === 'CLOSED';
    
    // Inputs: Disabled if Running OR Closed. Enabled if Stopped (Ready for new user)
    const lockInput = isRun || isClosed; 

    // Badge Logic
    let bClass = 'open';
    if(isRun) bClass = 'active';
    if(f.status === 'ON_HOLD') bClass = 'hold';
    if(isClosed) bClass = 'closed';

    // Logs & History Calculation
    let logRows = [];
    let totalMs = 0;

    // 1. Process Historical Logs
    f.mh.history.forEach(h => {
        totalMs += h.duration;
        logRows.push(createLogRow(h.start, h.stop, h.emp, h.task, 'STOP'));
        logRows.push(createLogRow(h.start, h.start, h.emp, h.task, 'START'));
    });

    // 2. Process Active Session
    if(f.mh.activeSession) {
        const s = f.mh.activeSession;
        logRows.push(createLogRow(s.start, s.start, s.emp, s.task, 'START'));
    }

    // Sort newest first
    logRows.sort((a,b) => b.sortTime - a.sortTime);
    const historyHtml = logRows.map(r => r.html).join('');
    const totalTimeStr = formatMs(totalMs);

    card.innerHTML = `
        <div class="fc-top">
            <h3>Finding #${f.num}</h3>
            <span class="badge ${bClass}">${f.status.replace('_',' ')}</span>
        </div>
        <div class="fc-content">
            <!-- Left: Description & Materials -->
            <div>
                <textarea class="desc-area" placeholder="Describe defect..." ${isClosed?'disabled':''} onchange="updateDesc('${uid}','${f.id}',this.value)">${f.desc}</textarea>
                
                <table class="mat-table">
                    <tr><th>Item</th><th width="50">Qty</th><th width="30"></th></tr>
                    ${f.materials.map((m,i) => `
                        <tr><td>${m.name}</td><td>${m.qty}</td>
                        <td>${!isClosed ? `<i class="fas fa-trash" style="color:red;cursor:pointer" onclick="delMat('${uid}','${f.id}',${i})"></i>` : ''}</td></tr>
                    `).join('')}
                </table>
                
                ${!isClosed ? `
                <div style="display:flex; gap:5px;">
                    <input id="m-name-${f.id}" placeholder="Part Name" style="flex:1; padding:5px; border:1px solid #ccc;">
                    <input id="m-qty-${f.id}" type="number" placeholder="#" style="width:50px; padding:5px; border:1px solid #ccc;">
                    <button class="btn-secondary" onclick="addMat('${uid}','${f.id}')">+</button>
                </div>` : ''}
            </div>

            <!-- Right: Manhours (Team Ready) -->
            <div class="manhours-panel">
                <div class="mh-title"><i class="fas fa-user-clock"></i> Manhours Recording</div>
                
                <!-- OPERATOR INPUTS: These unlock when stopped, allowing User B to take over -->
                <div class="operator-inputs">
                    <input type="text" id="emp-${f.id}" 
                           value="${f.mh.lastEmp}" 
                           placeholder="Enter Operator ID" 
                           ${lockInput ? 'disabled' : ''} 
                           title="Change this ID if you are a different operator">
                           
                    <input type="text" id="task-${f.id}" 
                           value="${f.mh.lastTask}" 
                           placeholder="Task Code" 
                           ${lockInput ? 'disabled' : ''}>
                </div>

                <div class="live-timer" id="timer-${f.id}">00:00:00</div>

                <div class="action-btns">
                    ${!isRun && !isClosed ? 
                        `<button class="btn-success" onclick="startTask('${uid}','${f.id}')"><i class="fas fa-play"></i> START</button>` :
                        `<button class="btn-success" disabled>START</button>`
                    }
                    ${isRun ? 
                        `<button class="btn-danger" onclick="requestStop('${uid}','${f.id}')"><i class="fas fa-stop"></i> STOP</button>` :
                        `<button class="btn-danger" disabled>STOP</button>`
                    }
                </div>

                <!-- LOG SECTION -->
                <div class="log-section">
                    <div style="text-align:right; font-size:0.8rem; font-weight:bold; margin-bottom:5px;">
                        Total: ${totalTimeStr}
                    </div>
                    <button class="log-toggle" onclick="toggleLog('${f.id}')">
                        See Performing Log <i class="fas fa-caret-down"></i>
                    </button>
                    <div id="log-box-${f.id}" class="log-data">
                        <table class="log-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Emp ID</th> <!-- Crucial for Team View -->
                                    <th>Task</th>
                                    <th>Act</th>
                                </tr>
                            </thead>
                            <tbody>${historyHtml}</tbody>
                        </table>
                    </div>
                </div>

                ${f.photo ? `<div class="photo-preview"><img src="${f.photo}"><div style="font-size:0.7rem; color:green; text-align:center;"><b>EVIDENCE ATTACHED</b></div></div>` : ''}
            </div>
        </div>
    `;
    return card;
}

// --- UTILS ---
function createLogRow(rawTime, sortTime, emp, task, type) {
    const d = new Date(rawTime);
    const dateStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
    const timeStr = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    
    // Styling the Emp ID to make it stand out
    const empDisplay = `<span style="font-weight:bold; color:#0d6efd;">${emp}</span>`;
    const typeBadge = `<span style="background:${type=='START'?'#198754':'#dc3545'}; color:white; padding:1px 4px; border-radius:3px; font-size:0.6rem;">${type}</span>`;

    return {
        sortTime: new Date(sortTime),
        html: `<tr>
            <td>${dateStr} <span style="color:#777">${timeStr}</span></td>
            <td>${empDisplay}</td>
            <td>${task}</td>
            <td>${typeBadge}</td>
        </tr>`
    };
}

function findFinding(uid, fid) {
    const wo = appData.find(w => w.uid === uid);
    return wo ? wo.findings.find(f => f.id === fid) : null;
}

function toggleLog(fid) {
    const el = document.getElementById(`log-box-${fid}`);
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
}

function formatMs(ms) {
    if(!ms) return "00:00:00";
    let s = Math.floor((ms/1000)%60);
    let m = Math.floor((ms/(1000*60))%60);
    let h = Math.floor(ms/(1000*60*60));
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function pad(n){return n<10?'0'+n:n}

// --- GLOBAL TIMER ENGINE ---
function startSystemClock() {
    if(clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(() => {
        const activeID = getActiveTaskID();
        if(activeID) {
            // Find active session
            let activeSess = null;
            for(let w of appData) {
                const f = w.findings.find(x => x.id === activeID);
                if(f && f.mh.activeSession) { activeSess = f.mh.activeSession; break; }
            }
            if(activeSess) {
                const diff = new Date() - new Date(activeSess.start);
                const el = document.getElementById(`timer-${activeID}`);
                if(el) el.innerText = formatMs(diff);
            }
        }
    }, 1000);
}

function updateGlobalIndicator() {
    const aid = getActiveTaskID();
    const ind = document.getElementById('globalTaskIndicator');
    const lbl = document.getElementById('activeTaskLabel');
    if(aid) {
        ind.style.display = 'flex';
        lbl.innerText = `Running: Finding #${aid.split('-F')[1]}`;
    } else {
        ind.style.display = 'none';
    }
}
