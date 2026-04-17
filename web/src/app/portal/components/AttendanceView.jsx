'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import {
  fetchPortalAttendance,
  fetchPortalAttendanceCounts,
  fetchPortalAttendanceMeta,
  fetchPortalSubjectAttendance,
  SessionExpiredError
} from 'lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from 'lib/utils';
import {
  getAttendanceTargetStorageKey,
  toPercent,
  resolveAttendanceCounts,
  buildAttendanceGuidance,
  dateScore
} from '../utils';
import { Clock, Filter, ArrowUpRight, ArrowDownRight, FolderOpen, AlertCircle, CheckCircle2, Activity, Settings } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "components/ui/drawer";

const SegmentedArch = ({ pct }) => {
    const segments = 22;
    const radius = 80;
    const center = 100;
    const safe = pct >= 75; // Using 75 default logic for color
    const activeColor = safe ? '#10b981' : '#f43f5e';
    const inactiveColor = 'rgba(150, 150, 150, 0.2)';

    return (
        <div className="relative flex flex-col items-center">
            <svg viewBox="0 0 200 110" className="w-full max-w-[200px]">
                {Array.from({length: segments}).map((_, i) => {
                    const theta = Math.PI - (i * (Math.PI / (segments - 1)));
                    const activePctHit = (i / segments) * 100 <= pct;
                    const x1 = center + (radius - 20) * Math.cos(theta);
                    const y1 = center - (radius - 20) * Math.sin(theta);
                    const x2 = center + radius * Math.cos(theta);
                    const y2 = center - radius * Math.sin(theta);
                    
                    return (
                        <motion.line 
                            key={i} x1={x1} y1={y1} x2={x2} y2={y2} 
                            stroke={activePctHit ? activeColor : inactiveColor} 
                            strokeWidth="8" strokeLinecap="round"
                            initial={{ opacity: 0, pathLength: 0 }}
                            animate={{ opacity: 1, pathLength: 1 }}
                            transition={{ delay: i * 0.02, duration: 0.3 }}
                        />
                    );
                })}
            </svg>
            <div className="absolute top-[50%] flex flex-col items-center">
                <span className="text-2xl font-black font-[var(--font-instrument-sans)] tracking-tighter text-foreground">{Math.round(pct)}%</span>
                <span className="text-[9px] font-bold text-muted-foreground mt-0.5">{safe ? "It's already great!" : "Needs attention!"}</span>
            </div>
            
            <div className="w-full flex items-center justify-between mt-4 px-2">
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Average</span>
                    <span className="text-sm font-bold text-foreground">{(pct).toFixed(1)}%</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status Lock</span>
                    <span className="text-sm font-bold text-foreground">{safe ? 'Secure' : 'Alert'}</span>
                </div>
            </div>
        </div>
    );
};

export default function AttendanceView({ token, onExpired, setCustomSidebar }) {
  const [meta, setMeta] = useState(null);
  const [selectedSem, setSelectedSem] = useState('');
  const [targetAttendancePct, setTargetAttendancePct] = useState('');
  const [attendance, setAttendance] = useState([]);
  
  // Master-Detail State
  const [activeSubject, setActiveSubject] = useState(null);
  const [historyDetail, setHistoryDetail] = useState(null);
  
  const [subjectCounts, setSubjectCounts] = useState({});
  const [message, setMessage] = useState('');
  const initialSemesterFallbackDone = useRef(false);

  useEffect(() => {
    try {
      const key = getAttendanceTargetStorageKey();
      const stored = window.localStorage.getItem(key);
      if (stored) setTargetAttendancePct(stored);
      else setTargetAttendancePct('75');
    } catch (_error) {
      setTargetAttendancePct('75');
    }
  }, []);

  useEffect(() => {
    try {
      if (targetAttendancePct) {
        window.localStorage.setItem(getAttendanceTargetStorageKey(), String(targetAttendancePct));
      }
    } catch (_error) {}
  }, [targetAttendancePct]);

  useEffect(() => {
    fetchPortalAttendanceMeta(token).then((response) => {
      const payload = response?.data || null;
      setMeta(payload);
      setMessage(payload?.latest_header?.message || '');
      setSelectedSem(payload?.latest_semester?.registration_id || '');
    }).catch((err) => {
      if (err instanceof SessionExpiredError) { onExpired?.(); return; }
      setMeta({ semesters: [] });
      setAttendance([]);
      setMessage(err?.message || 'Failed to sync metadata');
    });
  }, [token, onExpired]);

  useEffect(() => {
    if (!selectedSem) return;
    let cancelled = false;
    const resetUI = () => { setActiveSubject(null); setHistoryDetail(null); setSubjectCounts({}); };

    const loadAttendance = async () => {
      try {
        const response = await fetchPortalAttendance(token, selectedSem);
        if (cancelled) return;
        const rows = response?.data?.studentattendancelist || [];
        setAttendance(rows);
        resetUI();

        const initialCounts = {};
        for (const row of rows) {
          const subjectCode = String(row?.subjectcode || row?.individualsubjectcode || '').trim();
          if (!subjectCode) continue;
          const trustedRatio = resolveAttendanceCounts(row, '', { allowDerived: false });
          if (trustedRatio?.total) {
            initialCounts[subjectCode] = { attended: Number(trustedRatio.attended), total: Number(trustedRatio.total), loading: false, source: trustedRatio.source };
          } else {
            initialCounts[subjectCode] = { attended: 0, total: 0, loading: true, source: 'pending' };
          }
        }
        setSubjectCounts(initialCounts);

        if (rows.length) { initialSemesterFallbackDone.current = true; setMessage(''); return; }

        if (!initialSemesterFallbackDone.current) {
          initialSemesterFallbackDone.current = true;
          const semRows = Array.isArray(meta?.semesters) ? meta.semesters : [];
          const alternatives = semRows.filter(sem => sem?.registration_id && sem.registration_id !== selectedSem);
          if (alternatives.length) {
            const altResponses = await Promise.all(alternatives.map(async (s) => ({ sem: s, rows: (await fetchPortalAttendance(token, s.registration_id).catch(()=>({})))?.data?.studentattendancelist || []})));
            if (cancelled) return;
            const first = altResponses.find(item => item.rows.length > 0);
            if (first?.sem?.registration_id) {
              setMessage(`Fallback to ${first.sem.registration_code}.`);
              setSelectedSem(first.sem.registration_id);
              return;
            }
          }
        }
        setMessage(response?.data?.message || 'No subject telemetry found.');
      } catch (err) {
        if (err instanceof SessionExpiredError) { onExpired?.(); return; }
        if (cancelled) return;
        resetUI(); setAttendance([]); setMessage(err?.message || 'Data sync error.');
      }
    };
    loadAttendance();
    return () => { cancelled = true; };
  }, [token, selectedSem, onExpired, meta]);

  useEffect(() => {
    if (!selectedSem || !attendance.length) return;
    let cancelled = false;
    const loadAttendanceCounts = async () => {
      try {
        const response = await fetchPortalAttendanceCounts(token, selectedSem, false);
        if (cancelled) return;
        const counts = response?.data?.counts || {};
        setSubjectCounts(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(code => {
            if (counts[code]) next[code] = { attended: Number(counts[code].attended), total: Number(counts[code].total), loading: false, source: counts[code].source };
            else next[code].loading = false;
          });
          return next;
        });
      } catch (err) {
        if (err instanceof SessionExpiredError) { onExpired?.(); return; }
        if (cancelled) return;
        setSubjectCounts(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(code => { next[code].loading = false; });
          return next;
        });
      }
    };
    loadAttendanceCounts();
    return () => { cancelled = true; };
  }, [attendance, selectedSem, token, onExpired]);

  const selectSubject = async (row, openDrawer = false) => {
      const activeCode = String(row?.subjectcode || row?.individualsubjectcode || '').trim();
      setActiveSubject(row);
      setHistoryDetail({ loading: true, rows: [] });
      if (openDrawer) setIsMobileDrawerOpen(true);

      try {
        const response = await fetchPortalSubjectAttendance(token, selectedSem, activeCode, false);
        setHistoryDetail({ loading: false, rows: response?.data?.studentAttdsummarylist || [] });
      } catch (err) {
        if (err instanceof SessionExpiredError) { onExpired?.(); return; }
                setHistoryDetail({
                    loading: false,
                    rows: [],
                    error: err?.message || 'Unable to load attendance details right now. Please retry.'
                });
      }
  }

  // Auto-select first subject to bypass global dashboard
  useEffect(() => {
      if (attendance.length > 0 && !activeSubject) {
          selectSubject(attendance[0], false);
      }
  }, [attendance, activeSubject]);

  // --- Aggregate Math Logic --- 
  const aggregateMetrics = useMemo(() => {
    if (!attendance.length) return null;
    let tC = 0; let tA = 0;
    
    attendance.forEach(row => {
        const code = String(row?.subjectcode || row?.individualsubjectcode || '').trim();
        if (subjectCounts[code] && subjectCounts[code].total > 0) {
            tC += subjectCounts[code].total; tA += subjectCounts[code].attended;
        }
    });

    if (tC === 0) return null;
    return { attended: tA, total: tC, pct: (tA / tC) * 100 };
  }, [attendance, subjectCounts]);

  const targetVal = Number(targetAttendancePct || 75);

  // Derive State variables depending on if we are in Master or Global view.
  const isDetailView = activeSubject !== null;
  const activeCode = isDetailView ? String(activeSubject?.subjectcode || activeSubject?.individualsubjectcode || '').trim() : null;
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isTimelineDrawerOpen, setIsTimelineDrawerOpen] = useState(false);
  
  let layoutGuidance = "";
  let layoutPct = 0;
  let layoutAttended = 0;
  let layoutTotal = 0;
  let layoutSafe = true;

  useEffect(() => {
      if (!setCustomSidebar) return;
      const sidebarJsx = (
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar mt-6 w-full">
              <div className="px-6 py-2 mb-2 flex items-center justify-between gap-3">
                 <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">Attendance Roster</span>
                 <div className="relative flex items-center bg-card border border-border shadow-sm rounded-lg overflow-hidden transition-colors hover:bg-muted shrink-0">
                     <div className="px-2 text-muted-foreground border-r border-border flex items-center justify-center">
                         <Settings className="w-3 h-3" />
                     </div>
                     <select 
                         value={targetVal} 
                         onChange={(e) => setTargetAttendancePct(e.target.value)}
                         className="bg-transparent text-[10px] font-bold text-foreground focus:outline-none appearance-none px-1.5 py-1 cursor-pointer"
                     >
                         <option value="60">60%</option>
                         <option value="65">65%</option>
                         <option value="70">70%</option>
                         <option value="75">75%</option>
                         <option value="80">80%</option>
                         <option value="85">85%</option>
                         <option value="90">90%</option>
                     </select>
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
                  {attendance.map((row) => {
                      const subjectCode = String(row?.subjectcode || row?.individualsubjectcode || '').trim();
                      const pct = Number(row.LTpercantage || 0);
                      const isSelected = isDetailView && activeCode === subjectCode;
                      const countState = subjectCounts[subjectCode];
                      
                      return (
                          <button 
                              key={subjectCode} onClick={() => selectSubject(row)}
                              className={cn("w-full text-left py-3.5 px-4 rounded-xl transition-all mb-1 mt-1", isSelected ? "bg-primary/5 text-primary border border-primary/10" : "bg-transparent hover:bg-muted/50 text-muted-foreground border border-transparent")}
                          >
                              <div className="flex items-start justify-between gap-3 mb-1.5">
                                  <span className={cn("text-[13px] font-semibold leading-relaxed", isSelected ? "text-primary font-bold" : "text-foreground")}>{row.subjectdesc || subjectCode}</span>
                                  <span className={cn("text-[11px] font-black shrink-0 mt-0.5", pct >= targetVal ? "text-emerald-500" : "text-rose-500")}>{Math.round(pct)}%</span>
                              </div>
                              
                              <div className="flex items-center justify-between mt-2">
                                  <span className="text-[9px] font-mono tracking-wider opacity-60 bg-foreground/5 px-1.5 py-0.5 rounded uppercase">{subjectCode}</span>
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                      {countState?.total ? `${countState.attended} / ${countState.total}` : '...'}
                                  </span>
                              </div>
                          </button>
                      )
                  })}
              </div>
          </div>
      );
      setCustomSidebar(sidebarJsx);

      return () => setCustomSidebar(null);
  }, [attendance, subjectCounts, activeCode, isDetailView, targetVal, setCustomSidebar]);

  if (isDetailView) {
      const cState = subjectCounts[activeCode];
      layoutPct = Number(activeSubject.LTpercantage || 0);
      layoutTotal = Number(cState?.total || 0);
      layoutAttended = Number(cState?.attended || 0);
      const ratioParam = layoutTotal > 0 ? { attended: layoutAttended, total: layoutTotal } : undefined;
      layoutGuidance = buildAttendanceGuidance(activeSubject, targetVal, ratioParam);
      layoutSafe = layoutPct >= targetVal;
  } else if (aggregateMetrics) {
      layoutPct = aggregateMetrics.pct;
      layoutTotal = aggregateMetrics.total;
      layoutAttended = aggregateMetrics.attended;
      layoutSafe = layoutPct >= targetVal;
      layoutGuidance = layoutSafe ? "Global aggregate safe" : "Global aggregate at risk";
  }

  const dashboardHeader = (
      <>
          <div className="flex items-center justify-between mt-1 sm:mt-0 mb-1 sm:mb-2 px-1 lg:p-0 shrink-0 min-h-[32px]">
              <h2 className="text-sm sm:text-lg font-black text-foreground line-clamp-1 truncate pr-4">
                  {isDetailView ? (activeSubject?.subjectdesc || activeCode) : "Global Workspace"}
              </h2>
          </div>
      </>
  );

  const performanceCard = (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-card border border-border shadow-sm rounded-2xl p-4 sm:p-5 shrink-0 flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-stretch">
             
             {/* Performance Ratio Chart */}
             <div className="flex flex-col items-center justify-center shrink-0 min-w-[200px]">
                 <div className="w-full flex items-center justify-between mb-1">
                     <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Performance Ratio</h3>
                 </div>
                 {aggregateMetrics || isDetailView ? (
                    <SegmentedArch pct={layoutPct} />
                 ) : (
                    <div className="h-[120px] flex items-center justify-center text-sm font-medium text-muted-foreground">Loading topology...</div>
                 )}
             </div>

             {/* Status and Volume Details */}
             { (aggregateMetrics || isDetailView) && (
                 <div className="flex-1 flex flex-row items-center w-full border-t border-border/40 pt-4 md:border-t-0 md:pt-0 md:border-l md:border-border md:pl-6 gap-4 sm:gap-6 md:gap-10">
                    
                    {/* Status */}
                    <div className="flex-1 flex flex-col justify-center h-full">
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                            <FolderOpen className="w-3.5 h-3.5" />
                            <h3 className="text-[10px] font-bold uppercase tracking-wider">Status</h3>
                            {layoutSafe ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto hidden sm:block"/> : <AlertCircle className="w-3.5 h-3.5 text-rose-500 ml-auto hidden sm:block"/>}
                        </div>
                        <span className={cn("text-xl md:text-2xl font-black tracking-tighter leading-none mb-1.5", layoutSafe ? "text-emerald-500" : "text-rose-500")}>
                            {layoutSafe ? "Secure" : "Critical"}
                        </span>
                        <p className="text-[9px] sm:text-[10px] font-medium text-foreground line-clamp-2 leading-tight opacity-80 max-w-[200px]">
                            {isDetailView ? layoutGuidance : (aggregateMetrics ? `${aggregateMetrics.attended} Total Classes` : 'Analyzing...')}
                        </p>
                    </div>

                    <div className="w-[1px] h-12 bg-border/60 shrink-0" />

                    {/* Volume */}
                    <div className="flex-1 flex flex-col justify-center h-full">
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                            <Activity className="w-3.5 h-3.5" />
                            <h3 className="text-[10px] font-bold uppercase tracking-wider">Volume</h3>
                        </div>
                        <div className="flex items-baseline gap-1 mb-1.5">
                            <span className="text-xl md:text-2xl font-black tracking-tighter text-foreground leading-none">{layoutAttended}</span>
                            <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">/ {layoutTotal}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 text-[9px] font-bold text-muted-foreground uppercase leading-tight">
                            <span>Lab {isDetailView && <span className="text-foreground tracking-wider ml-0.5">{toPercent(activeSubject?.Ppercentage)}</span>}</span>
                            <span>Lec {isDetailView && <span className="text-foreground tracking-wider ml-0.5">{toPercent(activeSubject?.Lpercentage)}</span>}</span>
                        </div>
                    </div>

                 </div>
             )}
      </motion.div>
  );

  const sessionTimeline = (
      <div className="bg-card border border-border shadow-sm rounded-2xl flex flex-col w-full flex-1 min-h-0 overflow-hidden">
             
             {/* Table Header */}
             <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex items-center justify-between bg-muted/10 shrink-0">
                 <h2 className="text-[13px] sm:text-sm font-bold text-foreground flex items-center gap-2">
                    {isDetailView ? <Clock className="w-4 h-4 text-muted-foreground"/> : <Filter className="w-4 h-4 text-muted-foreground"/>}
                    {isDetailView ? 'Session Timeline' : 'Module Registry'}
                 </h2>
                 <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground shrink-0">{isDetailView && historyDetail?.rows?.length} Records</span>
             </div>

             {/* Table Body (Timeline or Empty State) */}
             <div className="flex-1 overflow-auto custom-scrollbar p-0 sm:p-6 relative">
                 {isDetailView ? (
                     historyDetail?.loading ? (
                         <div className="flex items-center justify-center h-full text-xs font-mono uppercase tracking-widest text-muted-foreground">Fetching records...</div>
                     ) : historyDetail?.rows?.length > 0 ? (
                         <table className="w-full text-sm text-left">
                             <thead className="text-[10px] text-muted-foreground uppercase bg-muted/20 border-b border-border">
                                 <tr>
                                     <th className="px-4 py-3 font-bold rounded-l-lg">Date / Time</th>
                                     <th className="px-4 py-3 font-bold">Type</th>
                                     <th className="px-4 py-3 font-bold">Topic Coverage</th>
                                     <th className="px-4 py-3 font-bold text-right rounded-r-lg">Status</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {historyDetail.rows.map((row, i) => (
                                     <motion.tr 
                                         key={i} 
                                         initial={{ opacity: 0, x: -10 }}
                                         animate={{ opacity: 1, x: 0 }}
                                         transition={{ delay: i * 0.02 }}
                                         className="border-b border-border/50 cursor-default"
                                     >
                                         <td className="px-4 py-3.5 font-bold text-foreground w-[160px]">{row.datetime || '-'}</td>
                                         <td className="px-4 py-3.5 text-muted-foreground w-[100px]">{row.classtype || 'Class'}</td>
                                         <td className="px-4 py-3.5 text-muted-foreground max-w-full break-words">{row.topic || '-'}</td>
                                         <td className="px-4 py-3.5 text-right w-[120px]">
                                             <span className={cn(
                                                 "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                                 row.present === 'Present' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                             )}>
                                                 {row.present === 'Present' ? 'Present' : 'Absent'}
                                             </span>
                                         </td>
                                     </motion.tr>
                                 ))}
                             </tbody>
                         </table>
                     ) : (
                         <div className="flex items-center justify-center h-full text-xs font-mono uppercase tracking-widest text-muted-foreground text-center">
                             {historyDetail?.error || 'Empty Timeline Array.'}
                         </div>
                     )
                 ) : (
                     <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
                         <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center bg-muted/20">
                            <FolderOpen className="w-5 h-5 opacity-50" />
                         </div>
                         <p className="text-sm font-medium">Select a module from the roster to view timeline telemetry.</p>
                     </div>
                 )}
             </div>

      </div>
  );

  const dashboardContent = (
      <>
          {dashboardHeader}
          {performanceCard}
          {sessionTimeline}
      </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-full min-h-0 overflow-hidden pb-24 lg:pb-0">
      
      {/* Mobile Master Pane */}
      <div className="flex flex-col lg:hidden w-full h-full min-h-0 bg-card border border-border shadow-sm rounded-2xl overflow-hidden shrink-0">
          <div className="p-5 border-b border-border bg-muted/20 flex justify-between items-start gap-4">
              <div>
                  <h2 className="text-base font-bold text-foreground">Attendance List</h2>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">Select a module to view timeline</p>
              </div>
              <div className="relative flex items-center border border-border bg-card shadow-sm rounded-lg overflow-hidden transition-colors hover:bg-muted mt-1 shrink-0">
                  <div className="px-2 text-muted-foreground border-r border-border flex items-center justify-center">
                      <Settings className="w-3.5 h-3.5" />
                  </div>
                  <select 
                      value={targetVal} 
                      onChange={(e) => setTargetAttendancePct(e.target.value)}
                      className="bg-transparent text-xs font-bold text-foreground focus:outline-none appearance-none px-2 py-1.5 cursor-pointer"
                  >
                      <option value="60">60%</option>
                      <option value="65">65%</option>
                      <option value="70">70%</option>
                      <option value="75">75%</option>
                      <option value="80">80%</option>
                      <option value="85">85%</option>
                      <option value="90">90%</option>
                  </select>
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {attendance.map((row) => {
                  const subjectCode = String(row?.subjectcode || row?.individualsubjectcode || '').trim();
                  const pct = Number(row.LTpercantage || 0);
                  const isSelected = isDetailView && activeCode === subjectCode;
                  const countState = subjectCounts[subjectCode];
                  
                  return (
                      <button 
                          key={subjectCode} onClick={() => selectSubject(row, true)}
                          className={cn("w-full text-left py-3.5 px-4 rounded-xl transition-all mb-1", isSelected ? "bg-primary/5 text-primary border border-primary/10" : "bg-transparent hover:bg-muted/50 text-muted-foreground border border-transparent")}
                      >
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                              <span className={cn("text-[13px] font-semibold leading-relaxed", isSelected ? "text-primary font-bold" : "text-foreground")}>{row.subjectdesc || subjectCode}</span>
                              <span className={cn("text-[11px] font-black shrink-0 mt-0.5", pct >= targetVal ? "text-emerald-500" : "text-rose-500")}>{Math.round(pct)}%</span>
                          </div>
                          
                          <div className="flex items-center justify-between mt-2">
                              <span className="text-[9px] font-mono tracking-wider opacity-60 bg-foreground/5 px-1.5 py-0.5 rounded uppercase">{subjectCode}</span>
                              <span className="text-[10px] font-bold text-muted-foreground">
                                  {countState?.total ? `${countState.attended} / ${countState.total}` : '...'}
                              </span>
                          </div>
                      </button>
                  )
              })}
          </div>
      </div>

      {/* Main Right Pane (Dashboard Area for Desktop) */}
      <div className="hidden lg:flex flex-1 flex-col gap-4 sm:gap-6 w-full h-full min-h-0 overflow-hidden">
          {dashboardContent}
      </div>

      {/* Mobile Drawer Performance Detail View */}
      <Drawer open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
          <DrawerContent className="flex flex-col pt-2 bg-background border-t border-border">
              <DrawerHeader className="pb-2 pt-0 shrink-0">
                  <DrawerTitle className="text-lg font-black text-left">{isDetailView ? (activeSubject?.subjectdesc || activeCode) : "Global Workspace"}</DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-5 custom-scrollbar">
                  {dashboardHeader}
                  {performanceCard}
                  <button 
                      onClick={() => setIsTimelineDrawerOpen(true)} 
                      className="w-full py-4 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-between px-5 mt-2 transition-colors hover:bg-primary/20"
                  >
                      <span>Session Timeline</span>
                      <ArrowUpRight className="w-5 h-5 text-primary opacity-80" />
                  </button>
              </div>
          </DrawerContent>
      </Drawer>

      {/* Nested Mobile Drawer for Timeline */}
      <Drawer open={isTimelineDrawerOpen} onOpenChange={setIsTimelineDrawerOpen}>
          <DrawerContent className="h-[90vh] flex flex-col pt-2 bg-background border-t border-border">
              <DrawerHeader className="pb-2 pt-0 shrink-0">
                  <DrawerTitle className="text-lg font-black text-left flex items-center gap-2">
                       {isDetailView ? (activeSubject?.subjectdesc || activeCode) : "Timeline"}
                  </DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-5 custom-scrollbar h-full min-h-0 flex-nowrap">
                  {sessionTimeline}
              </div>
          </DrawerContent>
      </Drawer>

    </div>
  );
}
