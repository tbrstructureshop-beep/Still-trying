const UI = {
    loader: document.getElementById('loader'),
    pageStart: document.getElementById('page-start'),
    pageExec: document.getElementById('page-execution'),
    btnStart: document.getElementById('btn-start-job'),
    infoContainer: document.getElementById('general-info-content'),
    findingsList: document.getElementById('findings-list'),
    stopModal: document.getElementById('stop-modal')
};

let appData = {};
let currentActiveLog = null;

// Initialize
UI.btnStart.addEventListener('click', startJob);

async function startJob() {
    showLoader(true);
    try {
        const data = await callBackend('getInitialData');
        appData = data;
        renderInfo(data.info);
        renderFindings(data.findings, data.materials, data.logs);
        switchPage('page-execution');
    } catch (e) {
        alert("Error loading job data: " + e.message);
    } finally {
        showLoader(false);
    }
}

function renderInfo(info) {
    UI.infoContainer.innerHTML = info.map(item => `
        <div class="info-item">
            <label>${item.label}</label>
            <span>${item.value}</span>
        </div>
    `).join('');
}

function renderFindings(findings, materials, logs) {
    UI.findingsList.innerHTML = '';
    let counts = { OPEN: 0, PROGRESS: 0, CLOSED: 0 };

    findings.forEach(f => {
        const findingLogs = logs.filter(l => l.findingId == f.id);
        const status = determineStatus(findingLogs);
        counts[status]++;

        const card = document.createElement('div');
        card.className = `finding-card shadow status-${status}`;
        card.innerHTML = `
            <div class="card-main" onclick="toggleCard(this)">
                <div>
                    <strong>${f.id}</strong> — ${f.identification}
                </div>
                <span class="status-badge" style="background:${getStatusColor(status)}; color:white;">${status}</span>
            </div>
            <div class="card-details">
                <div class="dropdown-section">
                    <div class="dropdown-trigger" onclick="toggleSection(this)">Detail of Finding <span>▼</span></div>
                    <div class="dropdown-content" style="display:none; padding:15px;">
                        <img src="${f.picUrl}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">
                        <p>${f.actionText}</p>
                    </div>
                </div>
                
                <div class="dropdown-section">
                    <div class="dropdown-trigger" onclick="toggleSection(this)">Material List <span>▼</span></div>
                    <div class="dropdown-content" style="display:none;">
                        <table>
                            <thead><tr><th>Part No</th><th>Description</th><th>Qty</th><th>Stock</th></tr></thead>
                            <tbody>
                                ${materials.filter(m => m.findingId == f.id).map(m => `
                                    <tr>
                                        <td>${m.pn}</td>
                                        <td>${m.desc}</td>
                                        <td>${m.qty} ${m.uom}</td>
                                        <td>${m.avail}</td>
                                    </tr>
                                `).join('') || '<tr><td colspan="4">No materials listed</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="dropdown-section">
                    <div class="dropdown-trigger" onclick="toggleSection(this)">Man-hour Logging <span>▼</span></div>
                    <div class="dropdown-content" style="display:none; padding:15px;">
                        <div class="log-inputs">
                            <input type="text" id="emp-${f.id}" placeholder="Employee ID" class="input-field">
                            <input type="text" id="task-${f.id}" placeholder="Task No" class="input-field">
                            <button class="btn-primary" onclick="handleStart('${f.id}')">START</button>
                        </div>
                        <div id="active-timer-${f.id}" class="timer-display"></div>
                    </div>
                </div>

                <div class="dropdown-section">
                    <div class="dropdown-trigger" onclick="toggleSection(this)">Log History <span>▼</span></div>
                    <div class="dropdown-content" style="display:none;">
                        <table>
                            <thead><tr><th>User</th><th>Action</th><th>Time</th></tr></thead>
                            <tbody>
                                ${findingLogs.map(l => `
                                    <tr><td>${l.empId}</td><td>${l.taskNo}</td><td>${l.timestamp}</td></tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        UI.findingsList.appendChild(card);
    });

    document.getElementById('count-open').innerText = counts.OPEN;
    document.getElementById('count-progress').innerText = counts.PROGRESS;
    document.getElementById('count-closed').innerText = counts.CLOSED;
}

async function handleStart(findingId) {
    const empId = document.getElementById(`emp-${findingId}`).value;
    const taskNo = document.getElementById(`task-${findingId}`).value;
    if (!empId || !taskNo) return alert("Fill ID and Task");

    showLoader(true);
    const result = await callBackend('logAction', {
        type: 'START',
        findingId,
        empId,
        taskNo
    });
    showLoader(false);
    if(result.success) startJob(); // Refresh
}

// Logic Utilities
function determineStatus(logs) {
    if (logs.length === 0) return 'OPEN';
    const isClosed = logs.some(l => l.finalStatus === 'CLOSED');
    if (isClosed) return 'CLOSED';
    return 'PROGRESS';
}

function getStatusColor(s) {
    if (s === 'OPEN') return '#f1c40f';
    if (s === 'PROGRESS') return '#3498db';
    return '#27ae60';
}

function toggleCard(el) {
    const details = el.nextElementSibling;
    details.style.display = details.style.display === 'block' ? 'none' : 'block';
}

function toggleSection(el) {
    const content = el.nextElementSibling;
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function showLoader(show) { UI.loader.style.display = show ? 'flex' : 'none'; }

function callBackend(fn, args) {
    return new Promise((resolve, reject) => {
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)[fn](args);
    });
}
