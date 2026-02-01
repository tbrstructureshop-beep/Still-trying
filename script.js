<script>
let appData = null;
let timers = {}; // Stores intervals for counters

// INITIALIZATION
document.getElementById('btnStartJob').addEventListener('click', startJobFlow);

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function startJobFlow() {
  showLoading(true);
  google.script.run
    .withSuccessHandler(data => {
      appData = data;
      renderApp();
      switchPage('page2');
      showLoading(false);
    })
    .getInitialData();
}

function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function renderApp() {
  renderGeneralInfo();
  renderFindings();
  updateSummaryCounters();
}

function renderGeneralInfo() {
  const info = appData.info;
  const container = document.getElementById('generalInfo');
  container.innerHTML = `
    <div class="info-item"><label>A/C Reg.</label><span>${info.acReg}</span></div>
    <div class="info-item"><label>W/O No.</label><span>${info.woNo}</span></div>
    <div class="info-item"><label>Part Description</label><span>${info.partDesc}</span></div>
    <div class="info-item"><label>Part Number</label><span>${info.pn}</span></div>
    <div class="info-item"><label>Serial Number</label><span>${info.sn}</span></div>
    <div class="info-item"><label>Quantity</label><span>${info.qty}</span></div>
    <div class="info-item"><label>Date Received</label><span>${info.dateReceived}</span></div>
  `;
}

function renderFindings() {
  const container = document.getElementById('findingsContainer');
  container.innerHTML = '';

  appData.findings.forEach(f => {
    const status = getFindingStatus(f.no);
    const card = document.createElement('div');
    card.className = `card finding-card status-${status.toLowerCase()}`;
    card.id = `card-${f.no}`;
    
    card.innerHTML = `
      <div class="status-badge bg-${status.toLowerCase()}">${status}</div>
      <h3>${f.no} – ${f.idText}</h3>
      
      <!-- DROPDOWN 1 -->
      <div class="dropdown">
        <div class="dropdown-header" onclick="toggleDropdown(this)">Detail of Finding <i class="fas fa-chevron-down"></i></div>
        <div class="dropdown-content">
          ${f.pic ? `<img src="${f.pic}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">` : ''}
          <p style="white-space: pre-wrap;">${f.action}</p>
        </div>
      </div>

      <!-- DROPDOWN 2 -->
      <div class="dropdown">
        <div class="dropdown-header" onclick="toggleDropdown(this)">Material List <i class="fas fa-chevron-down"></i></div>
        <div class="dropdown-content">
          <table class="log-table">
            <thead><tr><th>PN</th><th>Desc</th><th>Qty</th><th>Avail</th></tr></thead>
            <tbody>${renderMaterials(f.no)}</tbody>
          </table>
        </div>
      </div>

      <!-- DROPDOWN 3 -->
      <div class="dropdown">
        <div class="dropdown-header" onclick="toggleDropdown(this)">Man-hour Record <i class="fas fa-chevron-down"></i></div>
        <div class="dropdown-content">
          <div id="mh-active-info-${f.no}" style="color:var(--blue); font-weight:600; margin-bottom:10px;"></div>
          <div class="mh-form">
            <input type="text" id="empId-${f.no}" placeholder="Employee ID">
            <input type="text" id="taskNo-${f.no}" placeholder="Task No" value="0000">
            <div id="timerDisplay-${f.no}" style="font-size:1.5rem; font-weight:bold; color:var(--primary); display:none;">00:00:00</div>
            <div class="btn-row">
              <button class="btn-primary" id="btnStart-${f.no}" onclick="handleStart('${f.no}')">START</button>
              <button class="btn-secondary" id="btnStop-${f.no}" style="display:none;" onclick="handleStop('${f.no}')">STOP</button>
            </div>
          </div>
        </div>
      </div>

      <!-- DROPDOWN 4 -->
      <div class="dropdown">
        <div class="dropdown-header" onclick="toggleDropdown(this)">History Logs <i class="fas fa-chevron-down"></i></div>
        <div class="dropdown-content">
          <table class="log-table">
            <thead><tr><th>Emp ID</th><th>Date/Time</th><th>Task</th><th>Action</th></tr></thead>
            <tbody>${renderLogs(f.no)}</tbody>
          </table>
        </div>
      </div>
    `;
    container.appendChild(card);
    initFindingState(f.no);
  });
}

function toggleDropdown(el) {
  el.parentElement.classList.toggle('active');
}

function getFindingStatus(findingNo) {
  const logs = appData.logs.filter(l => l.findingNo == findingNo);
  if (logs.length === 0) return 'OPEN';
  if (logs.some(l => l.status === 'CLOSED')) return 'CLOSED';
  if (logs.some(l => l.action === 'START')) {
    // Check if there is an unmatched START
    const unmatched = findActiveLog(findingNo);
    return unmatched ? 'PROGRESS' : 'OPEN';
  }
  return 'OPEN';
}

function findActiveLog(findingNo, empId = null) {
  const fLogs = appData.logs.filter(l => l.findingNo == findingNo);
  const activeLogs = {};
  fLogs.forEach(l => {
    if (l.action === 'START') activeLogs[l.execId] = l;
    else if (l.action === 'STOP') delete activeLogs[l.execId];
  });
  const actives = Object.values(activeLogs);
  return empId ? actives.find(a => a.empId == empId) : actives[0];
}

function initFindingState(findingNo) {
  const active = findActiveLog(findingNo);
  const startBtn = document.getElementById(`btnStart-${findingNo}`);
  const stopBtn = document.getElementById(`btnStop-${findingNo}`);
  
  if (getFindingStatus(findingNo) === 'CLOSED') {
    startBtn.disabled = true;
    startBtn.innerText = 'CLOSED';
    return;
  }

  // Check if current user (simulated) is the one active
  // In real app, we'd know current user's ID. 
}

function renderMaterials(fNo) {
  const mats = appData.materials.filter(m => m.findingNo == fNo);
  return mats.length ? mats.map(m => `<tr><td>${m.pn}</td><td>${m.desc}</td><td>${m.qtyUom}</td><td>${m.avail}</td></tr>`).join('') : '<tr><td colspan="4">No materials</td></tr>';
}

function renderLogs(fNo) {
  const logs = appData.logs.filter(l => l.findingNo == fNo);
  return logs.map(l => {
    const d = new Date(l.timestamp);
    const dateStr = `${d.getDate()} ${d.toLocaleString('en-US', {month:'short'})} ${d.getFullYear()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
    return `<tr><td>${l.empId}</td><td>${dateStr}</td><td>${l.taskNo}</td><td>${l.action}</td></tr>`;
  }).join('');
}

// MAN-HOUR LOGIC
async function handleStart(fNo) {
  const empId = document.getElementById(`empId-${fNo}`).value;
  const taskNo = document.getElementById(`taskNo-${fNo}`).value;

  if (!empId) { alert("Enter Employee ID"); return; }

  const otherActive = findActiveLog(fNo);
  if (otherActive && otherActive.empId != empId) {
    const join = await showConfirm(`Employee ${otherActive.empId} is currently working on this. Join?`);
    if (!join) return;
  }

  const execId = 'EX' + Date.now();
  const logData = { execId, empId, findingNo: fNo, taskNo, action: 'START' };
  
  showLoading(true);
  google.script.run.withSuccessHandler(res => {
    appData.logs.push({...logData, timestamp: res.timestamp});
    startTimerUI(fNo, res.timestamp, execId, empId);
    showLoading(false);
  }).logAction(logData);
}

function startTimerUI(fNo, startTime, execId, empId) {
  const timerDiv = document.getElementById(`timerDisplay-${fNo}`);
  const startBtn = document.getElementById(`btnStart-${fNo}`);
  const stopBtn = document.getElementById(`btnStop-${fNo}`);
  
  timerDiv.style.display = 'block';
  startBtn.style.display = 'none';
  stopBtn.style.display = 'block';
  stopBtn.dataset.execId = execId;
  stopBtn.dataset.empId = empId;

  timers[fNo] = setInterval(() => {
    const diff = new Date().getTime() - startTime;
    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    timerDiv.innerText = `${h}:${m}:${s}`;
  }, 1000);
}

async function handleStop(fNo) {
  const stopBtn = document.getElementById(`btnStop-${fNo}`);
  const execId = stopBtn.dataset.execId;
  const empId = stopBtn.dataset.empId;
  const taskNo = document.getElementById(`taskNo-${fNo}`).value;

  clearInterval(timers[fNo]);

  const stillInProg = await showConfirm("Is the job still in progress?");
  let finalStatus = 'PROGRESS';
  let imgUrl = '';

  if (!stillInProg) {
    const otherTasks = await showConfirm("Is there any other task required for this finding?");
    if (!otherTasks) {
      finalStatus = 'CLOSED';
      imgUrl = await handleImageUpload();
    }
  }

  const logData = { execId, empId, findingNo: fNo, taskNo, action: 'STOP', status: finalStatus, imageUrl: imgUrl };
  
  showLoading(true);
  google.script.run.withSuccessHandler(() => {
    location.reload(); // Refresh to reflect all multi-user changes
  }).logAction(logData);
}

function handleImageUpload() {
  return new Promise((resolve) => {
    const input = document.getElementById('imageUpload');
    input.onchange = e => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        google.script.run.withSuccessHandler(url => resolve(url))
          .uploadImage(evt.target.result, file.name);
      };
      reader.readAsDataURL(file);
    };
    alert("Finding Closing: Please select completion image.");
    input.click();
  });
}

function showConfirm(msg) {
  return new Promise(resolve => {
    const modal = document.getElementById('modalOverlay');
    document.getElementById('modalBody').innerText = msg;
    modal.style.display = 'flex';
    document.getElementById('modalYes').onclick = () => { modal.style.display='none'; resolve(true); };
    document.getElementById('modalNo').onclick = () => { modal.style.display='none'; resolve(false); };
  });
}

function updateSummaryCounters() {
  const counts = { OPEN: 0, PROGRESS: 0, CLOSED: 0 };
  appData.findings.forEach(f => {
    counts[getFindingStatus(f.no)]++;
  });
  
  document.getElementById('summaryCounters').innerHTML = `
    <span class="pill bg-open">OPEN: ${counts.OPEN}</span>
    <span class="pill bg-progress">PROGRESS: ${counts.PROGRESS}</span>
    <span class="pill bg-closed">CLOSED: ${counts.CLOSED}</span>
  `;
}
</script>
