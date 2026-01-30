/**
 * MRO COLLABORATIVE WORK ORDER SYSTEM
 * Supports Concurrent Users on Same Finding
 */

const DB_KEY = 'mro_collab_data';
let appData = [];
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderApp();
    
    // Global Listeners
    document.getElementById('btnNewWO').addEventListener('click', createWorkOrder);
    
    // Modal Listeners
    document.getElementById('btnConflictYes').addEventListener('click', confirmJoinTeam);
    document.getElementById('btnConflictNo').addEventListener('click', cancelJoinTeam);
    document.getElementById('btnConfirmStatus').addEventListener('click', confirmFinalStatus);
    
    document.getElementById('photoInput').addEventListener('change', previewPhoto);
    document.getElementById('btnSavePhoto').addEventListener('click', savePhoto);
    document.getElementById('btnSkipPhoto').addEventListener('click', skipPhoto);

    // Live Clock Update
    timerInterval = setInterval(updateLiveTimers, 1000);
});

// --- DATA LAYER ---
function loadData() {
    const raw = localStorage.getItem(DB_KEY);
    appData = raw ? JSON.parse(raw) : [];
}
function saveData() {
    localStorage.setItem(DB_KEY, JSON.stringify(appData));
    renderApp();
}

// --- WORK ORDER LOGIC ---
function createWorkOrder() {
    const uid = Date.now().toString().slice(-5);
    const newWO = {
        uid: uid,
        header: { wo: '000000', cust: '', reg: 'PK-GLL', desc: '', pn: '', sn: '' },
        findings: []
    };
    
    for(let i=1; i<=5; i++) {
        newWO.findings.push({
            id: `${uid}-F${i}`,
            num: `0${i}`,
            desc: '',
            status: 'OPEN',
            materials: [],
            // Manhours Logic (Array for Multi-User)
            mh: {
                activeSessions: [], // [{ start, emp, task }]
                logs: [] // [{ start, stop, duration, emp, task }]
            },
            photo: null
        });
    }
    appData.unshift(newWO);
    saveData();
}

function updateHeader(uid, field, val) {
    const wo = appData.find(w => w.uid === uid);
    if(wo) { wo.header[field] = val; localStorage.setItem(DB_KEY, JSON.stringify(appData)); }
}

function updateFindingDesc(uid, fid, val) {
    const f = findFinding(uid, fid);
    if(f) { f.desc = val; saveData(); }
}

function addMat(uid, fid) {
    const n = document.getElementById(`m-name-${fid}`).value;
    const q = document.getElementById(`m-qty-${fid}`).value;
    if(n && q) { findFinding(uid, fid).materials.push({name:n, qty:q}); saveData(); }
}

function delMat(uid, fid, idx) {
    findFinding(uid, fid).materials.splice(idx, 1);
    saveData();
}

// --- CONCURRENT TASK ENGINE ---

// Temporary holder for conflicts
let pendingStart = null; 

function initiateStart(uid, fid) {
    const f = findFinding(uid, fid);
    const emp = document.getElementById(`emp-${fid}`).value.trim();
    const task = document.getElementById(`task-${fid}`).value.trim();

    if(!emp || !task) { alert("Enter Employee ID and Task Code first."); return; }

    // Check if THIS employee is already in the active list
    const alreadyWorking = f.mh.activeSessions.find(s => s.emp.toLowerCase() === emp.toLowerCase());
    if(alreadyWorking) {
        alert(`Employee ${emp} is already clocked in on this finding!`);
        return;
    }

    // Check if ANYONE ELSE is working
    if(f.mh.activeSessions.length > 0) {
        // Trigger Conflict Modal
        pendingStart = { uid, fid, emp, task };
        
        const listEl = document.getElementById('activeUserList');
        listEl.innerHTML = f.mh.activeSessions.map(s => `<li><i class="fas fa-user-cog"></i> <b>${s.emp}</b> (Started: ${formatTimeSimple(s.start)})</li>`).join('');
        
        document.getElementById('conflictModal').style.display = 'block';
    } else {
        // No conflict, just start
        executeStart(uid, fid, emp, task);
    }
}

function confirmJoinTeam() {
    if(pendingStart) {
        executeStart(pendingStart.uid, pendingStart.fid, pendingStart.emp, pendingStart.task);
        pendingStart = null;
    }
    document.getElementById('conflictModal').style.display = 'none';
}

function cancelJoinTeam() {
    alert("Action cancelled. Please perform other finding.");
    pendingStart = null;
    document.getElementById('conflictModal').style.display = 'none';
}

function executeStart(uid, fid, emp, task) {
    const f = findFinding(uid, fid);
    
    f.mh.activeSessions.push({
        start: new Date().toISOString(),
        emp: emp,
        task: task
    });
    
    f.status = 'IN_PROGRESS'; // Force status to Active
    saveData();
}

// --- STOP LOGIC (HANDLE MULTIPLE USERS) ---
let pendingStop = null; // { uid, fid, emp, stopTime }

function initiateStop(uid, fid) {
    const f = findFinding(uid, fid);
    
    if(f.mh.activeSessions.length === 0) return;

    // If only 1 person working, stop them automatically
    if(f.mh.activeSessions.length === 1) {
        prepareStopFlow(uid, fid, f.mh.activeSessions[0].emp);
    } 
    else {
        // Multiple people working: Ask WHO is stopping
        const container = document.getElementById('stopUserButtons');
        container.innerHTML = f.mh.activeSessions.map(s => 
            `<button class="user-btn" onclick="prepareStopFlow('${uid}','${fid}','${s.emp}')">
                <i class="fas fa-user-check"></i><br><b>${s.emp}</b>
             </button>`
        ).join('');
        document.getElementById('stopSelectModal').style.display = 'block';
    }
}

function prepareStopFlow(uid, fid, empId) {
    document.getElementById('stopSelectModal').style.display = 'none'; // Close selector if open
    
    pendingStop = {
        uid, fid, emp: empId, stopTime: new Date().toISOString()
    };

    const f = findFinding(uid, fid);
    
    // Check if this is the LAST person
    if(f.mh.activeSessions.length === 1) {
        // Ask for final status
        document.getElementById('statusModal').style.display = 'block';
    } else {
        // Not the last person, so just log it and remove session
        finalizeStopLogic(false); // false = not closing item
    }
}

function confirmFinalStatus() {
    const status = document.querySelector('input[name="taskStatus"]:checked').value;
    finalizeStopLogic(status === 'CLOSED', status); // Pass selected status
}

function finalizeStopLogic(isClosing, finalStatus = 'ON_HOLD') {
    if(!pendingStop) return;

    const { uid, fid, emp, stopTime } = pendingStop;
    const f = findFinding(uid, fid);

    // 1. Find the session
    const sessionIdx = f.mh.activeSessions.findIndex(s => s.emp === emp);
    if(sessionIdx > -1) {
        const session = f.mh.activeSessions[sessionIdx];
        const duration = new Date(stopTime) - new Date(session.start);

        // 2. Log it
        f.mh.logs.push({
            start: session.start,
            stop: stopTime,
            duration: duration,
            emp: session.emp,
            task: session.task
        });

        // 3. Remove session
        f.mh.activeSessions.splice(sessionIdx, 1);
    }

    document.getElementById('statusModal').style.display = 'none';

    // 4. Update Status based on logic
    if (f.mh.activeSessions.length > 0) {
        // Still people working
        f.status = 'IN_PROGRESS';
        saveData();
    } else {
        // Nobody left working
        f.status = finalStatus;
        
        if (isClosing) {
            // Open Photo Modal
            document.getElementById('photoModal').style.display = 'block';
            resetPhotoModal();
        } else {
            saveData();
        }
    }
}

// --- PHOTO LOGIC ---
let tempImg = null;
function resetPhotoModal() {
    document.getElementById('photoInput').value = ''; 
    document.getElementById('fileNameDisplay').textContent = 'No file';
    document.getElementById('btnSavePhoto').disabled = true;
    tempImg = null;
}
function previewPhoto(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempImg = ev.target.result;
            document.getElementById('fileNameDisplay').textContent = file.name;
            document.getElementById('btnSavePhoto').disabled = false;
        };
        reader.readAsDataURL(file);
    }
}
function savePhoto() {
    if(pendingStop && tempImg) {
        findFinding(pendingStop.uid, pendingStop.fid).photo = tempImg;
        document.getElementById('photoModal').style.display = 'none';
        saveData();
    }
}
function skipPhoto() {
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
        div.innerHTML = `
            <div class="wo-header-grid">
                <div class="input-group"><label>WO No</label><input value="${wo.header.wo}" onchange="updateHeader('${wo.uid}','wo',this.value)"></div>
                <div class="input-group"><label>Customer</label><input value="${wo.header.cust}" onchange="updateHeader('${wo.uid}','cust',this.value)"></div>
                <div class="input-group"><label>A/C Reg</label><input value="${wo.header.reg}" onchange="updateHeader('${wo.uid}','reg',this.value)"></div>
                <div class="input-group"><label>Desc</label><input value="${wo.header.desc}" onchange="updateHeader('${wo.uid}','desc',this.value)"></div>
                <div class="input-group"><label>P/N</label><input value="${wo.header.pn}" onchange="updateHeader('${wo.uid}','pn',this.value)"></div>
                <div class="input-group"><label>S/N</label><input value="${wo.header.sn}" onchange="updateHeader('${wo.uid}','sn',this.value)"></div>
            </div>
            <div class="findings-list" id="flist-${wo.uid}"></div>
        `;
        container.appendChild(div);

        const list = div.querySelector(`#flist-${wo.uid}`);
        wo.findings.forEach(f => {
            list.appendChild(createFindingCard(wo.uid, f));
        });
    });
}

function createFindingCard(uid, f) {
    const card = document.createElement('div');
    card.className = 'finding-card';
    card.setAttribute('data-status', f.status);
    
    const isClosed = f.status === 'CLOSED';
    const activeCount = f.mh.activeSessions.length;
    const isRunning = activeCount > 0;

    let badgeClass = 'open';
    if(isRunning) badgeClass = 'active';
    else if(f.status === 'ON_HOLD') badgeClass = 'hold';
    else if(isClosed) badgeClass = 'closed';

    // Build Logs
    // Combine history logs + current running sessions (for display)
    let displayRows = [];
    let totalMs = 0;

    f.mh.logs.forEach(l => {
        totalMs += l.duration;
        displayRows.push({ t: l.stop, h: `<tr><td>${formatDate(l.stop)}</td><td><b>${l.emp}</b></td><td>${l.task}</td><td><span style="color:red">STOP</span></td></tr>`});
        displayRows.push({ t: l.start, h: `<tr><td>${formatDate(l.start)}</td><td><b>${l.emp}</b></td><td>${l.task}</td><td><span style="color:green">START</span></td></tr>`});
    });
    
    // Add current starts to logs view
    f.mh.activeSessions.forEach(s => {
        displayRows.push({ t: s.start, h: `<tr><td>${formatDate(s.start)}</td><td><b>${s.emp}</b></td><td>${s.task}</td><td><span style="color:green">START</span></td></tr>`});
    });

    displayRows.sort((a,b) => new Date(b.t) - new Date(a.t));
    const logHtml = displayRows.map(x => x.h).join('');

    // Generate Active Mechanics List
    let mechHtml = '';
    if(activeCount > 0) {
        mechHtml = `<div class="active-mechanics">
            <div style="font-weight:bold; border-bottom:1px solid #cce5ff; margin-bottom:2px;">Currently Working (${activeCount}):</div>
            ${f.mh.activeSessions.map(s => `
                <div class="mech-item">
                    <span><i class="fas fa-user"></i> ${s.emp}</span>
                    <span id="timer-${uid}-${f.id}-${s.emp}" class="mech-timer">...</span>
                </div>
            `).join('')}
        </div>`;
    }

    card.innerHTML = `
        <div class="fc-top">
            <h3>Finding #${f.num}</h3>
            <span class="badge ${badgeClass}">${f.status.replace('_',' ')}</span>
        </div>
        <div class="fc-content">
            <div>
                <textarea class="desc-area" placeholder="Desc..." ${isClosed?'disabled':''} onchange="updateFindingDesc('${uid}','${f.id}',this.value)">${f.desc}</textarea>
                <table class="mat-table">
                    ${f.materials.map((m,i)=>`<tr><td>${m.name}</td><td>${m.qty}</td><td>${!isClosed?`<i class="fas fa-trash" style="color:red;cursor:pointer" onclick="delMat('${uid}','${f.id}',${i})"></i>`:''}</td></tr>`).join('')}
                </table>
                ${!isClosed?`<div style="display:flex;gap:5px;"><input id="m-name-${f.id}" placeholder="Part"><input id="m-qty-${f.id}" style="width:50px" placeholder="#"><button class="btn-secondary" onclick="addMat('${uid}','${f.id}')">+</button></div>`:''}
            </div>
            
            <div class="manhours-panel">
                <div class="panel-title">Manhours (Collaborative)</div>
                
                ${mechHtml}

                <div class="mh-inputs">
                    <input id="emp-${f.id}" placeholder="Your Emp ID" ${isClosed?'disabled':''}>
                    <input id="task-${f.id}" placeholder="Task Code" ${isClosed?'disabled':''}>
                </div>

                <div class="action-btns">
                    ${!isClosed ? 
                      `<button class="btn-success" onclick="initiateStart('${uid}','${f.id}')">START</button>` : 
                      `<button disabled class="btn-success">START</button>`
                    }
                    ${isRunning ? 
                      `<button class="btn-danger" onclick="initiateStop('${uid}','${f.id}')">STOP</button>` : 
                      `<button disabled class="btn-danger">STOP</button>`
                    }
                </div>

                <div style="margin-top:10px; border-top:1px dashed #ccc; padding-top:5px; text-align:right;">
                    <small>Total Recorded: <b>${formatMs(totalMs)}</b></small>
                    <button class="log-toggle" onclick="this.nextElementSibling.style.display=(this.nextElementSibling.style.display=='block'?'none':'block')">Show Logs</button>
                    <div class="log-container">
                        <table class="log-table"><tbody>${logHtml}</tbody></table>
                    </div>
                </div>

                ${f.photo ? `<div style="margin-top:5px;"><img src="${f.photo}" style="max-width:80px;border:1px solid #ccc;"> <small style="color:green;display:block">Evidence Saved</small></div>` : ''}
            </div>
        </div>
    `;
    return card;
}

// --- UTILS ---
function findFinding(uid, fid) {
    const wo = appData.find(w => w.uid === uid);
    return wo ? wo.findings.find(f => f.id === fid) : null;
}

function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes()<10?'0'+d.getMinutes():d.getMinutes()}`;
}
function formatTimeSimple(iso) {
    const d = new Date(iso);
    return `${d.getHours()}:${d.getMinutes()<10?'0'+d.getMinutes():d.getMinutes()}`;
}

function formatMs(ms) {
    let s = Math.floor((ms/1000)%60);
    let m = Math.floor((ms/(1000*60))%60);
    let h = Math.floor(ms/(1000*60*60));
    return `${h<10?'0'+h:h}:${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
}

function updateLiveTimers() {
    const now = new Date();
    // Scan DOM for active timers
    document.querySelectorAll('.mech-timer').forEach(el => {
        const idParts = el.id.split('-'); // timer-uid-fid-emp
        // idParts[0] = timer
        // idParts[1] = uid
        // idParts[2] = fid
        // idParts[3] = emp (might contain spaces if user typed them, but ID usually safe)
        
        const uid = idParts[1];
        const fid = idParts[2] + '-' + idParts[3]; // reconstruction logic if ID has dash? No, fid is uid-F1.
        // Actually, split is risky if ID has dashes. Better approach:
        
        // Let's rely on finding data
    });

    // Better approach: Iterate Data, update DOM
    appData.forEach(wo => {
        wo.findings.forEach(f => {
            f.mh.activeSessions.forEach(s => {
                const el = document.getElementById(`timer-${wo.uid}-${f.id}-${s.emp}`);
                if(el) {
                    const diff = now - new Date(s.start);
                    el.innerText = formatMs(diff);
                }
            });
        });
    });
}
