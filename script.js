/**
 * MRO MOBILE WORK ORDER SYSTEM
 * Mobile Optimized - Card View - Material Detail
 */

const DB_KEY = 'mro_mobile_v1';
let appData = [];
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderApp();
    
    // Listeners
    document.getElementById('btnNewWO').addEventListener('click', createWorkOrder);
    document.getElementById('btnConflictYes').addEventListener('click', confirmJoinTeam);
    document.getElementById('btnConflictNo').addEventListener('click', cancelJoinTeam);
    document.getElementById('btnConfirmStatus').addEventListener('click', confirmFinalStatus);
    document.getElementById('photoInput').addEventListener('change', previewPhoto);
    document.getElementById('btnSavePhoto').addEventListener('click', savePhoto);
    document.getElementById('btnSkipPhoto').addEventListener('click', skipPhoto);

    timerInterval = setInterval(updateLiveTimers, 1000);
});

// --- DATA ---
function loadData() {
    const raw = localStorage.getItem(DB_KEY);
    appData = raw ? JSON.parse(raw) : [];
}
function saveData() {
    localStorage.setItem(DB_KEY, JSON.stringify(appData));
    renderApp(); // Full re-render to update UIs
}

// --- WORK ORDER ---
function createWorkOrder() {
    const uid = Date.now().toString().slice(-5);
    const newWO = {
        uid: uid,
        header: { wo: 'WO-'+uid, cust: '', reg: 'PK-', desc: '', pn: '', sn: '' },
        findings: []
    };
    
    for(let i=1; i<=3; i++) { // Default 3 findings for mobile demo
        newWO.findings.push({
            id: `${uid}-F${i}`,
            num: `0${i}`,
            desc: '', // The Finding (Discrepancy)
            actionTaken: '', // The Rectification
            status: 'OPEN',
            materials: [], // { pn, desc, qty, uom, status }
            mh: { activeSessions: [], logs: [] },
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

function updateFindingData(uid, fid, field, val) {
    const f = findFinding(uid, fid);
    if(f) { f[field] = val; localStorage.setItem(DB_KEY, JSON.stringify(appData)); } // Quick save without re-render
}

// --- MATERIAL LOGIC ---
function addMat(uid, fid) {
    // Collect values from footer inputs
    const pn = document.getElementById(`m-pn-${fid}`).value;
    const desc = document.getElementById(`m-desc-${fid}`).value;
    const qty = document.getElementById(`m-qty-${fid}`).value;
    const uom = document.getElementById(`m-uom-${fid}`).value;
    const st = document.getElementById(`m-st-${fid}`).value;

    if(pn && qty) { 
        findFinding(uid, fid).materials.push({ pn, desc, qty, uom, status: st }); 
        saveData(); 
    } else {
        alert("P/N and Qty are required");
    }
}

function delMat(uid, fid, idx) {
    findFinding(uid, fid).materials.splice(idx, 1);
    saveData();
}

// --- COLLABORATIVE MANHOURS ---
let pendingStart = null;
let pendingStop = null;

function initiateStart(uid, fid) {
    const f = findFinding(uid, fid);
    const emp = document.getElementById(`emp-${fid}`).value.trim();
    const task = document.getElementById(`task-${fid}`).value.trim();

    if(!emp || !task) { alert("Emp ID & Task Code required"); return; }
    
    // Check local duplicate
    if(f.mh.activeSessions.find(s => s.emp.toLowerCase() === emp.toLowerCase())) {
        alert("You are already active!"); return;
    }

    // Check concurrent
    if(f.mh.activeSessions.length > 0) {
        pendingStart = { uid, fid, emp, task };
        const list = document.getElementById('activeUserList');
        list.innerHTML = f.mh.activeSessions.map(s => `<li>${s.emp}</li>`).join('');
        document.getElementById('conflictModal').style.display = 'block';
    } else {
        executeStart(uid, fid, emp, task);
    }
}

function executeStart(uid, fid, emp, task) {
    const f = findFinding(uid, fid);
    f.mh.activeSessions.push({ start: new Date().toISOString(), emp, task });
    f.status = 'IN_PROGRESS';
    saveData();
}

function confirmJoinTeam() {
    if(pendingStart) executeStart(pendingStart.uid, pendingStart.fid, pendingStart.emp, pendingStart.task);
    document.getElementById('conflictModal').style.display = 'none';
}
function cancelJoinTeam() { document.getElementById('conflictModal').style.display = 'none'; }

function initiateStop(uid, fid) {
    const f = findFinding(uid, fid);
    if(f.mh.activeSessions.length === 0) return;

    if(f.mh.activeSessions.length === 1) {
        prepareStop(uid, fid, f.mh.activeSessions[0].emp);
    } else {
        const div = document.getElementById('stopUserButtons');
        div.innerHTML = f.mh.activeSessions.map(s => 
            `<button class="user-btn" onclick="prepareStop('${uid}','${fid}','${s.emp}')">
                <i class="fas fa-user-check"></i><br>${s.emp}
             </button>`
        ).join('');
        document.getElementById('stopSelectModal').style.display = 'block';
    }
}

function prepareStop(uid, fid, emp) {
    document.getElementById('stopSelectModal').style.display = 'none';
    pendingStop = { uid, fid, emp, time: new Date().toISOString() };
    
    const f = findFinding(uid, fid);
    // If last person, ask status
    if(f.mh.activeSessions.length === 1) {
        document.getElementById('statusModal').style.display = 'block';
    } else {
        finalizeStop(false);
    }
}

function confirmFinalStatus() {
    const st = document.querySelector('input[name="taskStatus"]:checked').value;
    finalizeStop(st === 'CLOSED', st);
}

function finalizeStop(isClosed, status = 'ON_HOLD') {
    if(!pendingStop) return;
    const { uid, fid, emp, time } = pendingStop;
    const f = findFinding(uid, fid);
    
    const idx = f.mh.activeSessions.findIndex(s => s.emp === emp);
    if(idx > -1) {
        const s = f.mh.activeSessions[idx];
        f.mh.logs.push({ start: s.start, stop: time, duration: new Date(time)-new Date(s.start), emp: s.emp, task: s.task });
        f.mh.activeSessions.splice(idx, 1);
    }

    document.getElementById('statusModal').style.display = 'none';
    
    if(f.mh.activeSessions.length === 0) {
        f.status = status;
        if(isClosed) {
            document.getElementById('photoModal').style.display = 'block';
            resetPhotoModal();
        } else {
            saveData();
        }
    } else {
        saveData();
    }
}

// --- PHOTO ---
let tempImg = null;
function resetPhotoModal() {
    document.getElementById('photoInput').value = ''; 
    document.getElementById('fileNameDisplay').textContent = '';
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
function skipPhoto() { document.getElementById('photoModal').style.display = 'none'; saveData(); }

// --- RENDER ---
function renderApp() {
    const c = document.getElementById('appContainer');
    c.innerHTML = '';

    appData.forEach(wo => {
        const div = document.createElement('div');
        div.className = 'wo-sheet';
        div.innerHTML = `
            <div class="wo-header-grid">
                <div class="input-group"><label>WO NO</label><input value="${wo.header.wo}" onchange="updateHeader('${wo.uid}','wo',this.value)"></div>
                <div class="input-group"><label>REG</label><input value="${wo.header.reg}" onchange="updateHeader('${wo.uid}','reg',this.value)"></div>
                <div class="input-group"><label>DESC</label><input value="${wo.header.desc}" onchange="updateHeader('${wo.uid}','desc',this.value)"></div>
            </div>
            <div id="flist-${wo.uid}"></div>
        `;
        c.appendChild(div);
        
        const flist = div.querySelector(`#flist-${wo.uid}`);
        wo.findings.forEach(f => flist.appendChild(createFindingCard(wo.uid, f)));
    });
}

function createFindingCard(uid, f) {
    const card = document.createElement('div');
    card.className = 'finding-card';
    card.setAttribute('data-status', f.status);
    const isClosed = f.status === 'CLOSED';
    
    // Summary Badge Class
    let badgeClass = 'open';
    if(f.mh.activeSessions.length > 0) badgeClass = 'active';
    else if(f.status === 'ON_HOLD') badgeClass = 'hold';
    else if(isClosed) badgeClass = 'closed';

    // Summary Text
    const summaryText = f.desc ? f.desc : "No Description Entered";
    
    // Logs Calculation
    let totalMs = f.mh.logs.reduce((a,b)=>a+b.duration,0);
    const logRows = f.mh.logs.map(l => 
        `<tr><td>${formatDate(l.stop)}</td><td>${l.emp}</td><td>${l.task}</td><td>${formatMs(l.duration)}</td></tr>`
    ).join('');

    card.innerHTML = `
        <!-- SUMMARY VIEW -->
        <div class="fc-summary" onclick="toggleDetail('${uid}-${f.id}')">
            <div class="fc-header-row">
                <span class="fc-id">Finding #${f.num}</span>
                <span class="badge ${badgeClass}">${f.status.replace('_',' ')}</span>
            </div>
            <div class="fc-desc-preview">${summaryText}</div>
            <span class="fc-toggle-btn">See Detail <i class="fas fa-chevron-right"></i></span>
        </div>

        <!-- DETAIL VIEW -->
        <div id="detail-${uid}-${f.id}" class="fc-details">
            
            <span class="detail-label">Finding Description (Discrepancy)</span>
            ${isClosed 
                ? `<div class="read-only-box">${f.desc}</div>` 
                : `<textarea rows="2" placeholder="Enter Finding..." onchange="updateFindingData('${uid}','${f.id}','desc',this.value)">${f.desc}</textarea>`
            }

            <span class="detail-label">Action Given (Rectification)</span>
            ${isClosed
                ? `<div class="read-only-box">${f.actionTaken || 'No Action Recorded'}</div>`
                : `<textarea rows="2" placeholder="Enter Action..." onchange="updateFindingData('${uid}','${f.id}','actionTaken',this.value)">${f.actionTaken}</textarea>`
            }

            <span class="detail-label">Material Availability Summary</span>
            <div class="mat-table-wrapper">
                <table class="mat-table">
                    <thead><tr><th>P/N</th><th>Desc</th><th>Qty</th><th>UoM</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        ${f.materials.map((m,i) => `
                        <tr>
                            <td>${m.pn}</td><td>${m.desc}</td><td>${m.qty}</td><td>${m.uom}</td>
                            <td><span class="badge" style="background:${m.status=='Available'?'#28a745':'#ffc107'}">${m.status}</span></td>
                            <td>${!isClosed ? `<i class="fas fa-trash" style="color:red" onclick="delMat('${uid}','${f.id}',${i})"></i>` : ''}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            
            ${!isClosed ? `
            <div class="mat-inputs">
                <input id="m-pn-${f.id}" placeholder="P/N">
                <input id="m-desc-${f.id}" placeholder="Desc">
                <input id="m-qty-${f.id}" type="number" placeholder="Qty">
                <select id="m-uom-${f.id}"><option>EA</option><option>KG</option><option>L</option></select>
                <select id="m-st-${f.id}"><option>Available</option><option>Ordered</option><option>N/A</option></select>
                <button class="btn-secondary" onclick="addMat('${uid}','${f.id}')"><i class="fas fa-plus"></i></button>
            </div>` : ''}

            ${f.photo ? `
            <span class="detail-label">Evidence</span>
            <img src="${f.photo}" style="width:100px; border-radius:5px; border:1px solid #ddd; margin-bottom:10px;">` : ''}

            <div class="manhours-panel">
                ${f.mh.activeSessions.length>0 ? `
                <div class="active-mechanics">
                    <strong><i class="fas fa-users-cog"></i> Active Now:</strong><br>
                    ${f.mh.activeSessions.map(s=> `<div>${s.emp} - <span id="t-${uid}-${f.id}-${s.emp}">...</span></div>`).join('')}
                </div>` : ''}

                <div class="mh-grid">
                    <input id="emp-${f.id}" placeholder="Emp ID" ${isClosed?'disabled':''}>
                    <input id="task-${f.id}" placeholder="Task Code" ${isClosed?'disabled':''}>
                </div>
                
                <div class="action-btns">
                    ${!isClosed ? `<button class="btn-success" onclick="initiateStart('${uid}','${f.id}')">START</button>` : `<button disabled>START</button>`}
                    ${f.mh.activeSessions.length>0 ? `<button class="btn-danger" onclick="initiateStop('${uid}','${f.id}')">STOP</button>` : `<button disabled>STOP</button>`}
                </div>

                <div style="margin-top:10px; font-size:0.8rem; text-align:right;">
                    <strong>Total: ${formatMs(totalMs)}</strong>
                    <div class="log-container">
                        <table class="log-table"><tbody>${logRows}</tbody></table>
                    </div>
                </div>
            </div>

        </div>
    `;
    return card;
}

// --- VIEW HELPERS ---
function toggleDetail(id) {
    const el = document.getElementById(`detail-${id}`);
    // Close others? Optional. For now just toggle this one.
    if(el.style.display === 'block') {
        el.style.display = 'none';
    } else {
        el.style.display = 'block';
    }
}

function findFinding(uid, fid) { return appData.find(w=>w.uid===uid).findings.find(f=>f.id===fid); }
function formatMs(ms) { 
    if(!ms) return "00:00"; 
    let m = Math.floor((ms/(1000*60))%60); 
    let h = Math.floor(ms/(1000*60*60)); 
    return `${h}h ${m}m`; 
}
function formatDate(iso) { 
    const d = new Date(iso); 
    return `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes()<10?'0'+d.getMinutes():d.getMinutes()}`; 
}
function prepareStop(uid, fid, emp) {
    document.getElementById('stopSelectModal').style.display = 'none'; // Ensure modal closes
    // ... rest of logic in main block above
    window.pendingStop = { uid, fid, emp, time: new Date().toISOString() };
    const f = findFinding(uid, fid);
    if(f.mh.activeSessions.length === 1) document.getElementById('statusModal').style.display = 'block';
    else finalizeStop(false);
}

// Timer Loop
function updateLiveTimers() {
    const now = new Date();
    appData.forEach(wo => wo.findings.forEach(f => {
        f.mh.activeSessions.forEach(s => {
            const el = document.getElementById(`t-${wo.uid}-${f.id}-${s.emp}`);
            if(el) el.innerText = formatMs(now - new Date(s.start));
        });
    }));
}
