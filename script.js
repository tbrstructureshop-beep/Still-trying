
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Loader2, RefreshCw, AlertCircle, Plus, Trash2, 
  RotateCcw, Save, Edit2, X, CheckSquare, Square, ChevronDown
} from 'lucide-react';

const API_URL = "https://script.google.com/macros/s/AKfycbyQG9-FrBkQidkbUzWgVUUHxK7mFVYyru5RO7EKyfOzomliEn8KBCF_bkagjNw_CK8r/exec";

const App = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());

  // ROBUST DATA INITIALIZATION
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(API_URL);
      if (!resp.ok) throw new Error("Connection failed");
      const json = await resp.json();
      setData(json);
      
      // Clear previous local states on fresh load
      setSelectedIdx(null);
      setMaterials([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectFinding = (idx) => {
    setSelectedIdx(idx);
    setIsEdit(false);
    setSelectedRows(new Set());
    if (idx !== null && data) {
      const name = data.findings[idx].finding;
      const list = data.materialsByFinding[name] || [];
      setMaterials(list.length > 0 ? [...list] : [emptyMaterial()]);
    }
  };

  const emptyMaterial = () => ({
    partNo: '', description: '', qty: '', uom: 'EA', 
    availability: '', pr: '', po: '', note: '', 
    dateChange: new Date().toISOString().split('T')[0]
  });

  const updateMaterial = (idx, field, val) => {
    const next = [...materials];
    next[idx] = { ...next[idx], [field]: val };
    setMaterials(next);
  };

  const toggleSelect = (idx) => {
    const next = new Set(selectedRows);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedRows(next);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === materials.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(materials.map((_, i) => i)));
  };

  const deleteSelected = () => {
    if (selectedRows.size === 0) return;
    if (window.confirm(`Delete ${selectedRows.size} records?`)) {
      const next = materials.filter((_, i) => !selectedRows.has(i));
      setMaterials(next.length > 0 ? next : [emptyMaterial()]);
      setSelectedRows(new Set());
    }
  };

  const handleSave = async () => {
    if (selectedIdx === null || !data) return;
    setSyncing(true);
    try {
      const findingName = data.findings[selectedIdx].finding;
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ findingName, materials })
      });
      alert("Sync Successful!");
      setIsEdit(false);
      loadData(); // Re-sync with backend
    } catch (err) {
      alert("Sync Failed: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
      <p className="text-slate-500 font-bold tracking-tighter uppercase">Initializing Data Link...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center max-w-sm">
        <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Sync Error</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button onClick={loadData} className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">PIR DASHBOARD <span className="text-teal-600 underline">PRO</span></h1>
        <div className="flex items-center gap-2 px-3 py-1 bg-white border rounded-full text-[10px] font-bold text-slate-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          LIVE SYNC ACTIVE
        </div>
      </div>

      {/* General Info */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {Object.entries(data.generalData).map(([key, val]) => (
          <div key={key}>
            <p className="text-[10px] font-bold text-teal-600 uppercase mb-1">{key}</p>
            <p className="text-sm font-semibold text-slate-700 truncate">{val || '—'}</p>
          </div>
        ))}
      </div>

      {/* Finding Selection */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="max-w-md">
            <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Target Inspection Point</label>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-teal-500 outline-none pr-10"
                value={selectedIdx ?? ''}
                onChange={(e) => selectFinding(e.target.value === '' ? null : parseInt(e.target.value))}
              >
                <option value="">-- Choose Finding --</option>
                {data.findings.map((f, i) => <option key={i} value={i}>{f.finding}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {selectedIdx !== null && (
            <div className="grid md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden border">
                <img src={data.findings[selectedIdx].image} className="w-full h-full object-cover" />
              </div>
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-teal-600 uppercase">Observation</label>
                  <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-600 border border-slate-100">{data.findings[selectedIdx].description}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-rose-600 uppercase">Required Action</label>
                  <div className="p-4 bg-rose-50/50 rounded-xl text-sm font-bold text-rose-800 border border-rose-100">{data.findings[selectedIdx].action}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Material Section */}
      {selectedIdx !== null && (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden relative">
          {syncing && <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-50 flex items-center justify-center font-bold text-teal-600 animate-pulse">SYNCHRONIZING...</div>}
          
          <div className="px-6 py-4 bg-slate-50 border-b flex justify-between items-center">
            <div>
              <h2 className="font-black text-slate-800 tracking-tight">MATERIAL LIST (A5:J)</h2>
              {isEdit && <p className="text-[10px] font-bold text-teal-600">{selectedRows.size} selected</p>}
            </div>
            <button 
              onClick={() => setIsEdit(!isEdit)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isEdit ? 'bg-rose-100 text-rose-600' : 'bg-teal-600 text-white shadow-lg shadow-teal-100'}`}
            >
              {isEdit ? <><X className="w-4 h-4" /> CANCEL</> : <><Edit2 className="w-4 h-4" /> EDIT MODE</>}
            </button>
          </div>

          {/* Desktop Table - ALL CENTER ALIGNED */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-center table-center-all border-collapse">
              <thead className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest">
                <tr>
                  {isEdit && <th className="p-4 border-r border-slate-700 w-12"><input type="checkbox" checked={selectedRows.size === materials.length} onChange={toggleSelectAll} /></th>}
                  <th className="p-4 border-r border-slate-700 w-12">#</th>
                  <th className="p-4 border-r border-slate-700">Part No</th>
                  <th className="p-4 border-r border-slate-700">Description</th>
                  <th className="p-4 border-r border-slate-700 w-20">Qty</th>
                  <th className="p-4 border-r border-slate-700 w-20">UoM</th>
                  <th className="p-4 border-r border-slate-700">Avail</th>
                  <th className="p-4 border-r border-slate-700">PR</th>
                  <th className="p-4 border-r border-slate-700">PO</th>
                  <th className="p-4 border-r border-slate-700">Note</th>
                  <th className="p-4">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm font-semibold text-slate-600 divide-y">
                {materials.map((m, i) => (
                  <tr key={i} className={selectedRows.has(i) ? 'bg-teal-50' : 'hover:bg-slate-50'}>
                    {isEdit && <td className="p-3"><input type="checkbox" checked={selectedRows.has(i)} onChange={() => toggleSelect(i)} /></td>}
                    <td className="p-3 text-slate-300">{i+1}</td>
                    {['partNo', 'description', 'qty', 'uom', 'availability', 'pr', 'po', 'note', 'dateChange'].map(f => (
                      <td key={f} className="p-2 border-l border-slate-50">
                        <input 
                          readOnly={!isEdit}
                          value={m[f] || ''}
                          onChange={(e) => updateMaterial(i, f, e.target.value)}
                          className="w-full text-center bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded p-1 outline-none"
                          placeholder="—"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Editing Grid */}
          <div className="lg:hidden p-4 space-y-4">
             {isEdit && (
               <div className="flex justify-between items-center bg-teal-50 p-3 rounded-xl border border-teal-100">
                  <span className="text-xs font-black text-teal-700 uppercase">Batch Selection</span>
                  <button onClick={toggleSelectAll} className="text-[10px] font-bold bg-white px-3 py-1 rounded-full border">
                    {selectedRows.size === materials.length ? 'DESELECT ALL' : 'SELECT ALL'}
                  </button>
               </div>
             )}
             {materials.map((m, i) => (
               <div key={i} className={`border rounded-2xl p-4 space-y-3 transition-all ${selectedRows.has(i) ? 'border-teal-400 bg-teal-50/30' : 'bg-white shadow-sm'}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2" onClick={() => isEdit && toggleSelect(i)}>
                      {isEdit && (selectedRows.has(i) ? <CheckSquare className="w-4 h-4 text-teal-600" /> : <Square className="w-4 h-4 text-slate-300" />)}
                      <span className="text-[10px] font-black text-slate-300 tracking-widest uppercase">Record {i+1}</span>
                    </div>
                    {isEdit && <button onClick={() => setMaterials(materials.filter((_, idx) => idx !== i))} className="text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Part No</label>
                      <input readOnly={!isEdit} value={m.partNo} onChange={(e) => updateMaterial(i, 'partNo', e.target.value)} className="w-full text-center text-sm font-bold bg-slate-50 rounded-lg p-2 outline-none border border-slate-100" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Qty / UoM</label>
                      <div className="flex gap-1">
                        <input type="number" readOnly={!isEdit} value={m.qty} onChange={(e) => updateMaterial(i, 'qty', e.target.value)} className="w-full text-center text-sm font-bold bg-slate-50 rounded-lg p-2 outline-none border border-slate-100" />
                        <input readOnly={!isEdit} value={m.uom} onChange={(e) => updateMaterial(i, 'uom', e.target.value)} className="w-12 text-center text-[10px] font-bold bg-slate-50 rounded-lg p-1 outline-none border border-slate-100" />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Description</label>
                      <textarea rows={1} readOnly={!isEdit} value={m.description} onChange={(e) => updateMaterial(i, 'description', e.target.value)} className="w-full text-center text-sm font-semibold bg-slate-50 rounded-lg p-2 outline-none border border-slate-100 resize-none" />
                    </div>
                    {isEdit && ['availability', 'pr', 'po', 'note'].map(f => (
                      <div key={f} className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">{f}</label>
                        <input value={m[f]} onChange={(e) => updateMaterial(i, f, e.target.value)} className="w-full text-center text-xs bg-white rounded-lg p-2 outline-none border border-slate-100" />
                      </div>
                    ))}
                  </div>
               </div>
             ))}
          </div>

          {/* Footer Actions */}
          <div className="p-6 bg-slate-50 border-t flex flex-wrap gap-3">
            {isEdit ? (
              <>
                <button onClick={() => setMaterials([...materials, emptyMaterial()])} className="bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:scale-105 transition-transform"><Plus className="w-4 h-4" /> ADD ROW</button>
                {selectedRows.size > 0 && <button onClick={deleteSelected} className="bg-rose-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"><Trash2 className="w-4 h-4" /> DELETE ({selectedRows.size})</button>}
                <button onClick={() => setMaterials([emptyMaterial()])} className="bg-white border text-slate-600 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"><RotateCcw className="w-4 h-4" /> CLEAR ALL</button>
                <div className="flex-grow" />
                <button onClick={handleSave} className="bg-teal-600 text-white px-8 py-3 rounded-xl text-sm font-black flex items-center gap-2 shadow-xl shadow-teal-100 active:scale-95 transition-all"><Save className="w-4 h-4" /> SYNC TO SHEET</button>
              </>
            ) : (
              <p className="text-xs font-bold text-slate-400 py-2 uppercase tracking-widest">Read-only mode enabled. {materials.length} records found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
