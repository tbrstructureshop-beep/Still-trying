/* script.js */
const API_URL = "https://script.google.com/macros/s/AKfycbypoq7k-aw8_x_9Q3WuqZ4AzS5UQmlSUEiMQooxfG8i2UIjGnAReYvmxlHsfP-WTxUI/exec"; // Replace after deployment
const urlParams = new URLSearchParams(window.location.search);
const SHEET_ID = urlParams.get('sheetId') || "1IyjNL723csoFdYA9Zo8_oMOhIxzPPpNOXw5YSJLGh-c";
const WO_ID = urlParams.get('woId');

let STATE = {
    info: {},
    findings: [],
    materials: [],
    logs: [],
    activeFinding: null,
    pendingStop: null
};

// Initialization
window.onload = () => {
    if (!SHEET_ID) return alert("Missing Sheet ID");
    fetchData();
    setInterval(updateTimers, 1000);
};

async function fetchData() {
    showLoading(true);
    try {
        const response = await fetch(`${API_URL}?action=getAll&sheetId=${SHEET_ID}`);
        const data = await response.json();
        STATE.info = data.info[0] || {};
        STATE.findings = data.findings;
        STATE.materials = data.materials;
        STATE.logs = data.logs;
        renderUI();
    } catch (err) {
        console.error(err);
    } finally {
        showLoading(false);
    }
}

function renderUI() {
    // Header
    document.getElementById('wo-title').innerText = `Work Order: ${STATE.info.woNo || 'N/A'}`;
    document.getElementById('head-customer').innerText = STATE.info.customer || '-';
    document.getElementById('head-reg').innerText = STATE.info.aCReg || '-';
    document.getElementById('head-desc').innerText = STATE.info.partDescription || '-';
    document.getElementById('head-pn').innerText = STATE.info.partNumber || '-';
    document.getElementById('head-sn').innerText = STATE.info.serialNumber || '-';

    const container = document.getElementById('findings-container');
    container.innerHTML = '';

    STATE.findings.forEach(finding => {
        const activeUsers = getActiveUsers(finding.findingno);
        const card = document.createElement('div');
        card.className = 'finding-card';
        card.innerHTML = `
            <div class="card-summary" onclick="toggleDetails('${finding.findingno}')">
                <div>
                    <h3>#${finding.findingno}</h3>
                    <p>${finding.findingdescription}</p>
                </div>
                <div class="status-badge">${activeUsers.length > 0 ? '🟢 ACTIVE' : '⚪ IDLE'}</div>
            </div>
            <div id="details-${finding.findingno}" class="card-details">
                <div class="section-title"><span>Finding Details</span></div>
                <p><b>Action:</b> ${finding.actiongiven || 'None'}</p>
                <img src="${formatImgUrl(finding.findingimageurl)}" class="finding-img" onclick="previewImage(this.src)">
                
                <div class="section-title"><span>Material Availability</span></div>
                <div class="table-responsive">
                    <table>
                        <thead><tr><th>Part No</th><th>Desc</th><th>Qty</th><th>Status</th></tr></thead>
                        <tbody>${renderMaterials(finding.findingno)}</tbody>
                    </table>
                </div>

                <div class="section-title"><span>Man-Hour Activity</span></div>
                <div id="active-list-${finding.findingno}">${renderActiveMechanics(activeUsers)}</div>
                
                <div class="input-group"><input type="text" id="emp-${finding.findingno}" placeholder="Employee ID"></div>
                <div class="input-group"><input type="text" id="task-${finding.findingno}" placeholder="Task Code"></div>
                
                <div class="btn-grid">
                    <button class="btn btn-primary" onclick="handleStart('${finding.findingno}')" id="btn-start-${finding.findingno}">START</button>
                    <button class="btn btn-secondary" onclick="handleStop('${finding.findingno}')" id="btn-stop-${finding.findingno}">STOP</button>
                </div>

                <details class="section-title">
                    <summary>Performing Log</summary>
                    <table class="log-table">
                        <thead><tr><th>Date</th><th>User</th><th>Action</th></tr></thead>
                        <tbody>${renderLogs(finding.findingno)}</tbody>
                    </table>
                </details>
            </div>
        `;
        container.appendChild(card);
    });
}

// Logic Functions
function getActiveUsers(findingNo) {
    const starts = STATE.logs.filter(l => l.findingno == findingNo && l.action === 'START');
    const stops = STATE.logs.filter(l => l.findingno == findingNo && l.action === 'STOP');
    
    return starts.filter(s => !stops.some(st => st.executionid === s.executionid));
}

function handleStart(findingNo) {
    const empId = document.getElementById(`emp-${findingNo}`).value;
    const task = document.getElementById(`task-${findingNo}`).value;
    if (!empId || !task) return alert("Enter Employee ID and Task Code");

    const active = getActiveUsers(findingNo);
    if (active.length > 0) {
        document.getElementById('conflict-msg').innerText = `Active mechanics: ${active.map(a => a.employeeid).join(', ')}. Continue?`;
        document.getElementById('btn-confirm-parallel').onclick = () => startJob(findingNo, empId, task);
        openModal('modal-conflict');
    } else {
        startJob(findingNo, empId, task);
    }
}

async function startJob(findingNo, empId, task) {
    closeModal('modal-conflict');
    showActionLoading(`btn-start-${findingNo}`, true);
    const payload = {
        action: 'startManhour',
        sheetId: SHEET_ID,
        executionId: Date.now().toString(),
        employeeId: empId,
        findingNo: findingNo,
        taskCode: task,
        timestamp: new Date().toISOString()
    };
    await postData(payload);
    await fetchData();
}

function handleStop(findingNo) {
    const active = getActiveUsers(findingNo);
    if (active.length === 0) return alert("No active session found");
    
    STATE.activeFinding = findingNo;

    if (active.length > 1) {
        const list = document.getElementById('user-select-list');
        list.innerHTML = '';
        active.forEach(user => {
            const b = document.createElement('button');
            b.className = 'btn btn-secondary';
            b.style.width = '100%';
            b.style.marginBottom = '5px';
            b.innerText = `${user.employeeid} (${user.taskcode})`;
            b.onclick = () => { STATE.pendingStop = user; closeModal('modal-user-select'); checkFinality(); };
            list.appendChild(b);
        });
        openModal('modal-user-select');
    } else {
        STATE.pendingStop = active[0];
        checkFinality();
    }
}

function checkFinality() {
    const active = getActiveUsers(STATE.activeFinding);
    if (active.length === 1) {
        openModal('modal-final-status');
    } else {
        finalizeJob('PROGRESS');
    }
}

async function finalizeJob(status) {
    closeModal('modal-final-status');
    if (status === 'CLOSED') {
        openModal('modal-upload');
        document.getElementById('btn-upload-submit').onclick = async () => {
            const fileInput = document.getElementById('file-input');
            if (fileInput.files.length === 0) return alert("Photo required for CLOSED status");
            
            showLoading(true);
            const base64 = await toBase64(fileInput.files[0]);
            const uploadRes = await postData({
                action: 'uploadEvidence',
                data: base64.split(',')[1],
                mimeType: fileInput.files[0].type,
                filename: `finding_${STATE.activeFinding}.jpg`
            });
            executeStop(status, uploadRes.url);
        };
    } else {
        executeStop(status, "");
    }
}

async function executeStop(status, imageUrl) {
    closeModal('modal-upload');
    showLoading(true);
    const payload = {
        action: 'stopManhour',
        sheetId: SHEET_ID,
        executionId: STATE.pendingStop.executionid,
        employeeId: STATE.pendingStop.employeeid,
        findingNo: STATE.activeFinding,
        timestamp: new Date().toISOString(),
        lastStatus: status,
        imageUrl: imageUrl
    };
    await postData(payload);
    await fetchData();
}

// Helpers
async function postData(data) {
    const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return res.json();
}

function toggleDetails(id) {
    document.getElementById(`details-${id}`).classList.toggle('active');
}

function renderMaterials(findingNo) {
    return STATE.materials
        .filter(m => m.findingno == findingNo)
        .map(m => `<tr><td>${m.partno}</td><td>${m.materialdescription}</td><td>${m.qty} ${m.uom}</td><td>${m.availability}</td></tr>`)
        .join('');
}

function renderActiveMechanics(users) {
    if (users.length === 0) return '';
    return `<div class="active-mechanics">${users.map(u => `
        <div class="mechanic-row">
            <span><b>${u.employeeid}</b> [${u.taskcode}]</span>
            <span class="timer" data-start="${u.timestamp}">00:00:00</span>
        </div>
    `).join('')}</div>`;
}

function renderLogs(findingNo) {
    return STATE.logs
        .filter(l => l.findingno == findingNo)
        .reverse()
        .map(l => `<tr><td>${new Date(l.timestamp).toLocaleString()}</td><td><b>${l.employeeid}</b></td><td>${l.action}</td></tr>`)
        .join('');
}

function updateTimers() {
    document.querySelectorAll('.timer').forEach(timer => {
        const start = new Date(timer.dataset.start);
        const diff = Math.floor((new Date() - start) / 1000);
        const h = Math.floor(diff / 3600).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        timer.innerText = `${h}:${m}:${s}`;
    });
}

function formatImgUrl(url) {
    if (!url || url.includes('Noimage')) return "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Noimage.svg/250px-Noimage.svg.png";
    if (url.includes('drive.google.com')) {
        const id = url.split('id=')[1] || url.split('/d/')[1].split('/')[0];
        return `https://lh3.googleusercontent.com/d/${id}`;
    }
    return url;
}

function previewImage(src) {
    document.getElementById('modal-img-preview').src = src;
    openModal('modal-image');
}

function showLoading(show) {
    document.getElementById('loader-overlay').style.display = show ? 'flex' : 'none';
}

function showActionLoading(btnId, show) {
    const btn = document.getElementById(btnId);
    if (show) {
        btn.disabled = true;
        btn.innerHTML = `<span class="inline-spinner"></span> Processing...`;
    }
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
