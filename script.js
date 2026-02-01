/* Code.gs */
/**
 * GOOGLE APPS SCRIPT BACKEND
 * Deployment: Deploy as Web App -> Access: Anyone
 */

const FOLDER_ID = "1zu3F68ayIj9JqalTfWcOFKff8pP9zsGf";

function doGet(e) {
  const action = e.parameter.action;
  const sheetId = e.parameter.sheetId;
  const ss = SpreadsheetApp.openById(sheetId);
  
  let data = {};
  
  if (action === 'getAll') {
    data.info = getSheetData(ss, "INFO");
    data.findings = getSheetData(ss, "FINDING");
    data.materials = getSheetData(ss, "MATERIAL LIST");
    data.logs = getSheetData(ss, "MANHOUR_LOG");
  }

  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.openById(body.sheetId);
  const logSheet = ss.getSheetByName("MANHOUR_LOG");
  
  if (body.action === 'startManhour') {
    // 1.executionId, 2.employeeId, 3.timestamp, 4.findingNo, 5.taskCode, 6.actionPerformed, 7.lastStatus, 8.imageUrl, 9.totalDuration
    logSheet.appendRow([
      body.executionId,
      body.employeeId,
      body.timestamp,
      body.findingNo,
      "'" + body.taskCode, // Force string
      "START",
      "PROGRESS",
      "",
      ""
    ]);
    return jsonResponse({status: "success"});
  }
  
  if (body.action === 'stopManhour') {
    // Calculate Duration
    const logs = logSheet.getDataRange().getValues();
    let startTime = "";
    for (let i = 0; i < logs.length; i++) {
      if (logs[i][0] === body.executionId && logs[i][5] === "START") {
        startTime = new Date(logs[i][2]);
        break;
      }
    }
    
    const stopTime = new Date(body.timestamp);
    const durationHours = startTime ? (stopTime - startTime) / (1000 * 60 * 60) : 0;
    
    logSheet.appendRow([
      body.executionId,
      body.employeeId,
      body.timestamp,
      body.findingNo,
      "", 
      "STOP",
      body.lastStatus,
      body.imageUrl,
      durationHours.toFixed(2)
    ]);
    
    // Update Finding Status if CLOSED
    if (body.lastStatus === "CLOSED") {
      const findingSheet = ss.getSheetByName("FINDING");
      const fData = findingSheet.getDataRange().getValues();
      for (let j = 1; j < fData.length; j++) {
        if (fData[j][0] == body.findingNo) {
          findingSheet.getRange(j + 1, 5).setValue("CLOSED"); // Assuming Col 5 is Status
          break;
        }
      }
    }
    
    return jsonResponse({status: "success"});
  }
  
  if (body.action === 'uploadEvidence') {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(body.data), body.mimeType, body.filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return jsonResponse({url: file.getUrl()});
  }
}

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  return rows.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
