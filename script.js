/* script.js */
const API_URL = "https://script.google.com/macros/s/AKfycbypoq7k-aw8_x_9Q3WuqZ4AzS5UQmlSUEiMQooxfG8i2UIjGnAReYvmxlHsfP-WTxUI/exec";
const SHEET_ID = new URLSearchParams(window.location.search).get('sheetId');
const NO_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Noimage.svg/250px-Noimage.svg.png";

let appState = {
    info: {},
    findings: [],
    materials: [],
    logs: [],
    activeInterval: null
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (!SHEET_ID) {
        document.getElementById('app-container').innerHTML = `<div class="error">Error: No sheetId provided in URL parameters.</div>`;
        return;
    }
    await refreshData();
    startGlobalTimer();
}

async function refreshData() {
    try {
        const resp = await fetch(`${API_URL}?action=getAll&sheetId=${SHEET_ID}`);
        const data = await resp.json();
        appState.info = data.info[0];
        appState.findings = data.findings;
        appState.materials = data.materials;
        appState.logs = data.logs;

        updateUI();
        document.getElementById('connection-status').classList.add('online');
        document.getElementById('sync-text').innerText = "Real-time Ready";
    } catch (e) {
        console.error("Fetch Error", e);
        document.getElementById('sync-text').innerText = "Offline / Error";
    }
}

function updateUI() {
    document.getElementById('wo-title').innerText = `WO: ${appState.info.woNo || 'Unknown'}`;
    document.getElementById('wo-subtitle').innerText = `${appState.info.aircraft || ''} - ${appState.info.type || ''}`;
    
    const container = document.getElementById('app-container');
    container.innerHTML = '';

    appState.findings.forEach(finding => {
        const card = createFindingCard(finding);
        container.appendChild(card);
    });
}

function createFindingCard(finding) {
    const findingLogs = appState.logs.filter(l => l.findingNo == finding.findingNo);
    const activeExecutions = findActiveExecutions(findingLogs);
    const isClosed = finding.status === 'CLOSED';
    const status = isClosed ? 'CLOSED' : (activeExecutions.length > 0 ? 'PROGRESS' : 'OPEN');

    const card = document.createElement('div');
    card.className = `finding-card ${isClosed ? 'locked-card' : ''}`;
    card.innerHTML = `
        <div class="card-header" onclick="toggleCard(this)">
            <div class="card-info">
                <div class="finding-no">#${finding.findingNo}</div>
                <div class="finding-desc-short">${finding.description}</div>
            </div>
            <div class="badge badge-${status.toLowerCase()}">${status}</div>
        </div>
        <div class="card-body" id="body-${finding.findingNo}">
            <div class="full-desc">${finding.description}</div>
            <div class="action-given"><strong>Action:</strong> ${finding.actionGiven || 'Pending'}</div>
            
            <div class="image-grid">
                ${renderImages(finding.images)}
            </div>

            <h5>Material Requirements</h5>
            <table class="materials-table">
                <thead><tr><th>PN</th><th>Description</th><th>Qty</th></tr></thead>
                <tbody>
                    ${renderMaterials(finding.findingNo)}
                </tbody>
            </table>

            <div class="control-panel">
                <div class="active-tasks" id="active-tasks-${finding.findingNo}">
                    ${renderActiveTimers(activeExecutions)}
                </div>
                ${!isClosed ? `<button class="btn btn-primary" onclick="openStartModal('${finding.findingNo}')">START WORK</button>` : ''}
                
                <div class="history-log">
                    <strong>Audit Trail:</strong>
                    ${renderHistory(findingLogs)}
                </div>
            </div>
        </div>
    `;
    return card;
}

function renderImages(imageString) {
    if (!imageString) return `<img src="${NO_IMAGE}" class="thumb">`;
    return imageString.split(',').map(url => {
        const idMatch = url.match(/[-\w]{25,}/);
        const thumbUrl = idMatch ? `https://drive.google.com/thumbnail?id=${idMatch[0]}&sz=w800` : url;
        return `<img src="${thumbUrl}" class="thumb" onclick="previewImage('${url}')">`;
    }).join('');
}

function renderMaterials(findingNo) {
    const mats = appState.materials.filter(m => m.findingNo == findingNo);
    if (mats.length === 0) return '<tr><td colspan="3">No materials listed</td></tr>';
    return mats.map(m => `<tr><td>${m.partNumber}</td><td>${m.description}</td><td>${m.qty}</td></tr>`).join('');
}

function findActiveExecutions(logs) {
    const groups = {};
    logs.forEach(l => {
        if (!groups[l.executionId]) groups[l.executionId] = [];
        groups[l.executionId].push(l);
    });
    const actives = [];
    for (const id in groups) {
        const sorted = groups[id].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (sorted[0].actionPerformed === 'START') {
            actives.push(sorted[0]);
        }
    }
    return actives;
}

function renderActiveTimers(actives) {
    return actives.map(task => `
        <div class="timer-row">
            <div class="timer-info">
                <strong>${task.employeeId}</strong> [Task ${task.taskCode}]<br>
                <small>${new Date(task.timestamp).toLocaleTimeString()}</small>
            </div>
            <div class="timer-clock" data-start="${task.timestamp}">00:00:00</div>
            <button class="btn btn-danger btn-sm" onclick="openStopModal('${task.executionId}', '${task.findingNo}', '${task.employeeId}')">STOP</button>
        </div>
    `).join('');
}

function renderHistory(logs) {
    return logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).map(l => `
        <div class="history-item">
            ${new Date(l.timestamp).toLocaleString('en-GB', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})} | 
            ${l.employeeId} | ${l.actionPerformed} | ${l.lastStatus} 
            ${l.imageUrl ? `<a href="${l.imageUrl}" target="_blank">View Evidence</a>` : ''}
        </div>
    `).join('');
}

/* Logic Functions */

function toggleCard(header) {
    const body = header.nextElementSibling;
    body.classList.toggle('active');
}

function openStartModal(findingNo) {
    const modal = document.getElementById('modal-start');
    const active = findActiveExecutions(appState.logs.filter(l => l.findingNo == findingNo));
    
    if (active.length > 0) {
        const ids = active.map(a => a.employeeId).join(', ');
        if (!confirm(`Parallel Work Alert: ${ids} already working. Join session?`)) return;
    }

    modal.style.display = 'block';
    document.getElementById('btn-confirm-start').onclick = () => performStart(findingNo);
}

async function performStart(findingNo) {
    const empId = document.getElementById('input-emp-id').value;
    const taskCode = document.getElementById('input-task-code').value;

    if (!empId || !taskCode) return alert("All fields required");

    const payload = {
        action: 'startManhour',
        sheetId: SHEET_ID,
        employeeId: empId,
        taskCode: taskCode,
        findingNo: findingNo,
        timestamp: new Date().toISOString(),
        executionId: `EXEC-${Date.now()}`
    };

    setLoading(true);
    await postToGAS(payload);
    closeModals();
    await refreshData();
    setLoading(false);
}

function openStopModal(executionId, findingNo, employeeId) {
    const modal = document.getElementById('modal-stop');
    document.getElementById('stop-details').innerText = `Stopping work for ${employeeId} on Finding #${findingNo}`;
    modal.style.display = 'block';
    
    const select = document.getElementById('select-final-status');
    const evidenceDiv = document.getElementById('evidence-upload-section');
    
    select.onchange = () => {
        evidenceDiv.classList.toggle('hidden', select.value !== 'CLOSED');
    };

    document.getElementById('btn-confirm-stop').onclick = () => performStop(executionId, findingNo, employeeId);
}

async function performStop(executionId, findingNo, employeeId) {
    const status = document.getElementById('select-final-status').value;
    const fileInput = document.getElementById('input-evidence');
    let imageUrl = "";

    setLoading(true);

    if (status === 'CLOSED' && fileInput.files.length > 0) {
        imageUrl = await uploadFile(fileInput.files[0]);
    }

    const payload = {
        action: 'stopManhour',
        sheetId: SHEET_ID,
        executionId: executionId,
        findingNo: findingNo,
        employeeId: employeeId,
        timestamp: new Date().toISOString(),
        lastStatus: status,
        imageUrl: imageUrl
    };

    await postToGAS(payload);
    closeModals();
    await refreshData();
    setLoading(false);
}

async function uploadFile(file) {
    const reader = new FileReader();
    return new Promise((resolve) => {
        reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            const resp = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'uploadEvidence',
                    sheetId: SHEET_ID,
                    filename: file.name,
                    mimeType: file.type,
                    data: base64
                })
            });
            const result = await resp.json();
            resolve(result.url);
        };
        reader.readAsDataURL(file);
    });
}

function startGlobalTimer() {
    setInterval(() => {
        document.querySelectorAll('.timer-clock').forEach(el => {
            const start = new Date(el.dataset.start);
            const now = new Date();
            const diff = Math.floor((now - start) / 1000);
            
            const h = Math.floor(diff / 3600).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            
            el.innerText = `${h}:${m}:${s}`;
        });
    }, 1000);
}

function previewImage(url) {
    const modal = document.getElementById('modal-image');
    const img = document.getElementById('img-preview-target');
    img.src = url;
    modal.style.display = "flex";
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function setLoading(isLoading) {
    document.getElementById('loading-spinner').style.display = isLoading ? 'block' : 'none';
}

async function postToGAS(payload) {
    return fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    }).then(r => r.json());
}
