let appData = {};
let activeTimers = {};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-start-job').addEventListener('click', startJobFlow);
});

function showLoader() { document.getElementById('loading-overlay').classList.remove('loader-hidden'); }
function hideLoader() { document.getElementById('loading-overlay').classList.add('loader-hidden'); }

async function startJobFlow() {
    showLoader();
    google.script.run.withSuccessHandler(data => {
        appData = data;
        renderPage2();
        document.getElementById('page-start').classList.remove('active');
        document.getElementById('page-execution').classList.add('active');
        hideLoader();
    }).getInitialData();
}

function renderPage2() {
    // Render Info
    const info = appData.info;
    document.getElementById('general-info-content').innerHTML = `
        <div class="info-item"><label>A/C Reg</label><span>${info.acReg}</span></div>
        <div class="info-item"><label>W/O No</label><span>${info.woNo}</span></div>
        <div class="info-item"><label>Part Description</label><span>${info.partDesc}</span></div>
        <div class="info-item"><label>PN / SN</label><span>${info.pn} / ${info.sn}</span></div>
        <div class="info-item"><label>Qty</label><span>${info.qty}</span></div>
        <div class="info-item"><label>Date Received</label><span>${info.dateReceived}</span></div>
    `;

    renderFindings();
}

function renderFindings() {
    const container = document.getElementById('findings-container');
    container.innerHTML = '';
    
    let stats = { open: 0, progress: 0, closed: 0 };

    appData.findings.forEach(finding => {
        const findingNo = finding[0];
        const status = calculateStatus(findingNo);
        stats[status.toLowerCase()]++;

        const card = document.createElement('div');
        card.className = `card finding-card`;
        card.innerHTML = `
            <div class="finding-header" onclick="toggleAccordion('content-${findingNo}')">
                <div><strong>${findingNo}</strong> – ${finding[2]}</div>
                <span class="status-badge ${status.toLowerCase()}">${status}</span>
            </div>
            
            <div id="content-${findingNo}" class="accordion-content">
                <!-- 1. Detail -->
                <div class="accordion-section">
                    <button class="accordion-trigger" onclick="toggleSubAccordion(this)">Detail of Finding <span>▼</span></button>
                    <div class="accordion-content">
                        <img src="https://drive.google.com/thumbnail?id=${extractId(finding[1])}&sz=w1000" style="max-width:100%; border-radius:8px;">
                        <p style="white-space: pre-wrap; margin-top:10px;">${finding[3]}</p>
                    </div>
                </div>

                <!-- 2. Materials -->
                <div class="accordion-section">
                    <button class="accordion-trigger" onclick="toggleSubAccordion(this)">Material List <span>▼</span></button>
                    <div class="accordion-content">
                        ${renderMaterials(findingNo)}
                    </div>
                </div>

                <!-- 3. Man-hour Record -->
                <div class="accordion-section">
                    <button class="accordion-trigger" onclick="toggleSubAccordion(this)">Man-hour Record <span>▼</span></button>
                    <div class="accordion-content">
                        ${renderManHourInput(findingNo, status)}
                    </div>
                </div>

                <!-- 4. Log -->
                <div class="accordion-section">
                    <button class="accordion-trigger" onclick="toggleSubAccordion(this)">Logged Actions <span>▼</span></button>
                    <div class="accordion-content">
                        ${renderLogs(findingNo)}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    document.getElementById('count-open').innerText = stats.open;
    document.getElementById('count-progress').innerText = stats.progress;
    document.getElementById('count-closed').innerText = stats.closed;
}

function calculateStatus(findingNo) {
    const logs = appData.logs.filter(l => l[2] == findingNo);
    if (logs.length === 0) return 'OPEN';
    const hasProgress = logs.some(l => l[6] === 'PROGRESS');
    const allClosed = logs.every(l => l[6] === 'CLOSED');
    return hasProgress ? 'PROGRESS' : (allClosed ? 'CLOSED' : 'OPEN');
}

function renderMaterials(findingNo) {
    const materials = appData.materials.filter(m => m[0] == findingNo);
    if (!materials.length) return '<p>No materials required.</p>';
    return `
        <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
            <tr style="text-align:left; border-bottom:1px solid #eee;">
                <th>P/N</th><th>Description</th><th>Qty</th><th>Status</th>
            </tr>
            ${materials.map(m => `
                <tr style="border-bottom:1px solid #eee;">
                    <td>${m[1]}</td><td>${m[2]}</td><td>${m[3]} ${m[4]}</td><td>${m[5]}</td>
                </tr>
            `).join('')}
        </table>
    `;
}

function renderManHourInput(findingNo, status) {
    if (status === 'CLOSED') return '<p class="text-red">Finding is closed. No further logging allowed.</p>';
    
    return `
        <div class="manhour-form" id="form-${findingNo}">
            <div class="manhour-controls">
                <div class="input-group">
                    <label>Employee ID</label>
                    <input type="text" id="emp-${findingNo}" placeholder="ID">
                </div>
                <div class="input-group">
                    <label>Task No</label>
                    <input type="text" id="task-${findingNo}" value="0000">
                </div>
                <button class="btn-primary" onclick="handleStart('${findingNo}')">START</button>
            </div>
            <div id="timer-${findingNo}" class="timer-display" style="display:none;">00:00:00</div>
            <button id="stop-${findingNo}" class="btn-large" style="display:none; background:var(--red); width:100%; margin-top:10px;" onclick="handleStop('${findingNo}')">STOP</button>
        </div>
    `;
}

function handleStart(findingNo) {
    const empId = document.getElementById(`emp-${findingNo}`).value;
    const taskNo = document.getElementById(`task-${findingNo}`).value;

    if (!empId) return alert("Employee ID Required");

    // Collision Check
    const activeEntry = appData.logs.find(l => l[2] == findingNo && l[5] === 'START' && !appData.logs.some(stop => stop[0] === l[0] && stop[5] === 'STOP'));
    
    if (activeEntry) {
        if (!confirm(`Employee ${activeEntry[1]} is currently working on this. Join?`)) return;
    }

    const execId = 'EX-' + Date.now();
    const payload = {
        executionId: execId,
        employeeId: empId,
        findingNo: findingNo,
        taskNo: taskNo,
        action: 'START',
        status: 'PROGRESS'
    };

    showLoader();
    google.script.run.withSuccessHandler(() => {
        refreshData(() => {
            initTimer(findingNo, Date.now(), execId);
            document.getElementById(`stop-${findingNo}`).style.display = 'block';
            document.getElementById(`timer-${findingNo}`).style.display = 'block';
            hideLoader();
        });
    }).logManhourAction(payload);
}

async function handleStop(findingNo) {
    const activeTask = activeTimers[findingNo];
    if (!activeTask) return;

    if (!confirm("Is the job still in progress?")) {
        if (!confirm("Is there any other task still required for this finding?")) {
            // Flow to CLOSED
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                showLoader();
                const reader = new FileReader();
                reader.onload = async (f) => {
                    const imgUrl = await new Promise(resolve => google.script.run.withSuccessHandler(resolve).uploadImage(f.target.result, file.name));
                    submitStop(findingNo, activeTask, 'CLOSED', imgUrl);
                };
                reader.readAsDataURL(file);
            };
            fileInput.click();
            return;
        }
    }
    submitStop(findingNo, activeTask, 'PROGRESS');
}

function submitStop(findingNo, taskData, finalStatus, imgUrl = '') {
    const payload = {
        executionId: taskData.execId,
        employeeId: document.getElementById(`emp-${findingNo}`).value,
        findingNo: findingNo,
        taskNo: document.getElementById(`task-${findingNo}`).value,
        action: 'STOP',
        status: finalStatus,
        imageUrl: imgUrl
    };

    google.script.run.withSuccessHandler(() => {
        clearInterval(taskData.interval);
        delete activeTimers[findingNo];
        refreshData();
    }).logManhourAction(payload);
}

function initTimer(findingNo, startTime, execId) {
    const display = document.getElementById(`timer-${findingNo}`);
    const interval = setInterval(() => {
        const diff = Date.now() - startTime;
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        display.innerText = `${h}:${m}:${s}`;
    }, 1000);
    activeTimers[findingNo] = { interval, startTime, execId };
}

function refreshData(callback) {
    google.script.run.withSuccessHandler(data => {
        appData = data;
        renderFindings();
        if (callback) callback();
        hideLoader();
    }).getInitialData();
}

function toggleAccordion(id) {
    const el = document.getElementById(id);
    el.classList.toggle('show');
}

function toggleSubAccordion(btn) {
    const content = btn.nextElementSibling;
    content.classList.toggle('show');
    btn.querySelector('span').innerText = content.classList.contains('show') ? '▲' : '▼';
}

function renderLogs(findingNo) {
    const logs = appData.logs.filter(l => l[2] == findingNo).reverse();
    if (!logs.length) return '<p>No history available.</p>';
    return logs.map(l => `
        <div style="font-size:0.8rem; border-bottom:1px solid #eee; padding:5px 0;">
            <strong>${l[5]}:</strong> Emp ${l[1]} | Task ${l[3]}<br>
            <small>${new Date(l[4]).toLocaleString()}</small>
        </div>
    `).join('');
}

function extractId(url) {
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : '';
}
