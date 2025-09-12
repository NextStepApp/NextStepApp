import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView, Text, View, Button, TouchableOpacity, FlatList,
  TextInput, StyleSheet, Modal, Alert, PanResponder, ScrollView, Platform
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Optional PWA helpers you created earlier.
// If you don’t have these files, comment these two lines out.
import InstallPrompt from "./InstallPrompt";
import AddToHomeScreenTip from "./AddToHomeScreenTip";

// Passwordless local “accounts” (per-device) helpers
import {
  signInLocal, signOutLocal, currentUserLocal, listLocalAccounts
} from "./localAuth";

// Local file backup helpers (no passphrase)
import {
  backupNow, restoreFromFile,
  isBackupConfigured, enableAutoBackup, getAutoBackupEnabled,
  getLatestBackupInfo, exportLatestBackup
} from "./backup";

/** ~3 blank lines of space before content so it doesn’t hug the top edge */
const TOP_SPACER_PX = 60;
// Settings sits ~2 rows (~40px) higher than other screens
const SETTINGS_TOP_SPACER_PX = Math.max(0, TOP_SPACER_PX - 40);

/* =================== Categories =================== */
const phase1Categories = [
  "Shakes & Cereal","Entrees","Bars","Fruits & Veggies",
  "Days Met 3+2+5","Days In 1.0 Box","Physical Activity","Today's Weight",
];
const phase2Categories = [
  "Shakes & Cereal","Entrees","Bars","Fruits & Veggies",
  "Days In 1.0 Box","Days In 1.5 Box","Physical Activity","Today's Weight",
];

/* ======= Calories/min table (open-ended 400+ range) ======= */
const calorieChart = [
  { min:100, max:120.99, low:1, medium:3,  high:7,  veryHigh:10 },
  { min:121, max:140.99, low:1, medium:5,  high:9,  veryHigh:12 },
  { min:141, max:160.99, low:2, medium:5,  high:10, veryHigh:13 },
  { min:161, max:180.99, low:2, medium:6,  high:11, veryHigh:14 },
  { min:181, max:200.99, low:2, medium:7,  high:12, veryHigh:15 },
  { min:201, max:220.99, low:2, medium:7,  high:13, veryHigh:17 },
  { min:221, max:240.99, low:3, medium:8,  high:14, veryHigh:18 },
  { min:241, max:260.99, low:3, medium:9,  high:15, veryHigh:19 },
  { min:261, max:280.99, low:3, medium:9,  high:16, veryHigh:20 },
  { min:281, max:300.99, low:3, medium:10, high:17, veryHigh:21 },
  { min:301, max:320.99, low:4, medium:11, high:18, veryHigh:23 },
  { min:321, max:340.99, low:4, medium:11, high:19, veryHigh:24 },
  { min:341, max:360.99, low:4, medium:12, high:20, veryHigh:24 },
  { min:361, max:380.99, low:4, medium:13, high:20, veryHigh:26 },
  { min:381, max:399.99, low:4, medium:13, high:21, veryHigh:27 },
  { min:400, max:Infinity, low:5, medium:14, high:22, veryHigh:28 },
];
const intensities = [
  { key:"low", label:"Low" }, { key:"medium", label:"Medium" },
  { key:"high", label:"High" }, { key:"veryHigh", label:"Very High" },
];

/* =================== Helpers =================== */
const toISO = (d)=> new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().split("T")[0];
const addDays = (iso,n)=>{ const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return toISO(d); };
const dayOfWeekIndex = (iso)=> new Date(iso+"T00:00:00").getDay();
const getWeekStart = (iso,startIdx)=>{ const dow=dayOfWeekIndex(iso); const delta=(dow-startIdx+7)%7; return addDays(iso,-delta); };
const getWeekEnd = (startIso)=> addDays(startIso,6);
const datesInRange = (startIso,endIso)=>{ const out=[]; let d=startIso; while(d<=endIso){ out.push(d); d=addDays(d,1);} return out; };
const absDaysDiff=(aIso,bIso)=>Math.abs(Math.round((new Date(aIso+"T00:00:00")-new Date(bIso+"T00:00:00"))/86400000));
const PA_ENTRIES_KEY = "Physical Activity Entries";
const storageKey = (email, name) => `@nextstep/${email || "local"}/${name}`;

/* ========= Canonicalization so "Days In 1.0 Box" is shared across phases ========= */
const CATEGORY_SYNONYMS = {
  "Days In 1.0 Box": "Days In 1.0 Box",
  "Days in 1.0 Box": "Days In 1.0 Box",
  "Days in Phase 1 Box": "Days In 1.0 Box",
  "Days In The Box": "Days In 1.0 Box",
};
const canon = (cat) => CATEGORY_SYNONYMS[cat] || cat;

/** Migration of old labels to canonical labels (runs on load) */
const CATEGORY_MAPPINGS = {
  "Days In The Box": "Days In 1.0 Box",
  "Days in Phase 1 Box": "Days In 1.0 Box",
  "Days in 1.0 Box": "Days In 1.0 Box",
};
const migrateCategoryKeys = async (email, currentEntries) => {
  try {
    let changed = false;
    const updated = { ...currentEntries };
    for (const d of Object.keys(updated)) {
      const row = { ...updated[d] };
      let rowChanged = false;
      for (const [oldKey, newKey] of Object.entries(CATEGORY_MAPPINGS)) {
        if (Object.prototype.hasOwnProperty.call(row, oldKey)) {
          if (row[newKey] == null) row[newKey] = row[oldKey];
          delete row[oldKey];
          rowChanged = true;
          changed = true;
        }
      }
      if (rowChanged) updated[d] = row;
    }
    if (changed) {
      await AsyncStorage.setItem(storageKey(email, "entries"), JSON.stringify(updated));
    }
    return changed ? updated : currentEntries;
  } catch (e) {
    console.warn("Migration failed:", e);
    return currentEntries;
  }
};

/* =================== Small Components =================== */
function LocalAccountList({ onPick }){
  const [emails,setEmails]=useState([]);
  useEffect(()=>{ (async()=>{ setEmails(await listLocalAccounts()); })(); },[]);
  if (emails.length === 0) {
    return <Text style={{opacity:.6}}>No local accounts yet.</Text>;
  }
  return (
    <View style={{borderWidth:1,borderRadius:8,padding:10}}>
      {emails.map(e=>(
        <TouchableOpacity key={e} onPress={()=>onPick && onPick(e)} style={{paddingVertical:6}}>
          <Text>• {e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function AuthScreen({ onSignedIn }){
  const [username,setUsername]=useState("");

  const doContinue = async()=> {
    try {
      if(!username.trim()){ Alert.alert("Enter a username (email)"); return; }
      const u = await signInLocal(username.trim());
      onSignedIn(u);
    } catch(e){ Alert.alert("Unable to continue", e.message || String(e)); }
  };

  const doRestore = async()=> {
    try{
      await restoreFromFile(null, async (snapshot)=>{
        const em = snapshot.email || username || "local";
        await AsyncStorage.setItem(storageKey(em,"entries"), JSON.stringify(snapshot.payload.entries||{}));
        await AsyncStorage.setItem(storageKey(em,"phase"), String(snapshot.payload.phase||1));
        await AsyncStorage.setItem(storageKey(em,"date"), snapshot.payload.selectedDate || "");
        await AsyncStorage.setItem(storageKey(em,"weekStartDay"), String(snapshot.payload.weekStartDay ?? 0));
        const u = await signInLocal(em);
        onSignedIn(u);
      });
    }catch(e){
      Alert.alert("Restore failed", e?.message || "Could not restore from file.");
    }
  };

  return (
    <SafeAreaView style={{flex:1}}>
      <ScrollView contentContainerStyle={{padding:16,justifyContent:"center",flexGrow:1}}>
        <View style={{height:TOP_SPACER_PX}} />
        <View style={styles.screenInner}>
          <Text style={styles.authTitle}>Choose an Account</Text>
          <Text style={{marginBottom:8}}>Use any username (e.g., your email). No password required.</Text>

          <TextInput
            style={styles.input}
            autoCapitalize="none"
            placeholder="Username (e.g., you@example.com)"
            value={username}
            onChangeText={setUsername}
          />
          <Button title="Continue" onPress={doContinue} />

          <View style={{height:16}}/>
          <Text style={{fontWeight:"600", marginBottom:8}}>Or pick an existing account on this device:</Text>
          <LocalAccountList onPick={async (email)=>{ const u=await signInLocal(email); onSignedIn(u); }} />

          <View style={{height:16}}/>
          <Text style={{fontWeight:"600", marginBottom:6}}>Restore from backup file</Text>
          <Button title="Pick file & restore" onPress={doRestore}/>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =================== Main App =================== */
export default function App(){
  /* PWA bootstrap (web only) — inject manifest & register service worker for GitHub Pages base path */
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const base = "/NextStepApp";
    try {
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "manifest";
        link.href = `${base}/manifest.webmanifest`;
        document.head.appendChild(link);
      }
    } catch {}
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${base}/sw.js`, { scope: `${base}/` })
        .catch((e) => console.warn("SW register failed:", e));
    }
  }, []);

  /* Auth */
  const [authReady,setAuthReady]=useState(false);
  const [user,setUser]=useState(null);
  useEffect(()=>{ (async()=>{ const u=await currentUserLocal(); setUser(u); setAuthReady(true); })(); },[]);

  /* Core state */
  const [phase,setPhase]=useState(1);
  const [entries,setEntries]=useState({});
  const todayISO = useMemo(()=>toISO(new Date()),[]);
  const [selectedDate,setSelectedDate]=useState(todayISO);

  /* View & settings */
  const [viewMode,setViewMode]=useState("daily"); // "daily" | "weekly"
  const [weekStartDay,setWeekStartDay]=useState(0);
  const [showSettings,setShowSettings]=useState(false);

  /* PA entries */
  const [newPAEntry,setNewPAEntry]=useState("");
  const [showPAList,setShowPAList]=useState(false);

  /* Calculator */
  const [showCalc,setShowCalc]=useState(false);
  const [calcWeight,setCalcWeight]=useState("");
  const [minutes,setMinutes]=useState("");
  const [intensity,setIntensity]=useState("medium");

  /* Backup UI (LOCAL FILE BACKUP) */
  const [backupConfigured,setBackupConfigured]=useState(false);
  const [autoBackupEnabled,setAutoBackupEnabled]=useState(false);
  const [lastBackupInfo,setLastBackupInfo]=useState(null);

  const categories = phase===1 ? phase1Categories : phase2Categories;

  /* Load & save per-user state */
  useEffect(()=>{ if(!user) return; (async()=>{
    try{
      const [e,p,d,wsd]=await Promise.all([
        AsyncStorage.getItem(storageKey(user.email,"entries")),
        AsyncStorage.getItem(storageKey(user.email,"phase")),
        AsyncStorage.getItem(storageKey(user.email,"date")),
        AsyncStorage.getItem(storageKey(user.email,"weekStartDay")),
      ]);
      let loadedEntries = e ? JSON.parse(e) : {};
      loadedEntries = await migrateCategoryKeys(user.email, loadedEntries);
      setEntries(loadedEntries);
      if(p) setPhase(Number(p)||1);
      if(d) setSelectedDate(d);
      if(wsd) setWeekStartDay(Number(wsd));
    }catch(err){ console.warn("Load error:",err); }
  })(); },[user]);

  useEffect(()=>{ if(!user) return;
    AsyncStorage.setItem(storageKey(user.email,"entries"), JSON.stringify(entries)).catch(()=>{});
  },[user,entries]);
  useEffect(()=>{ if(!user) return;
    AsyncStorage.setItem(storageKey(user.email,"phase"), String(phase)).catch(()=>{});
  },[user,phase]);
  useEffect(()=>{ if(!user) return;
    AsyncStorage.setItem(storageKey(user.email,"date"), selectedDate).catch(()=>{});
  },[user,selectedDate]);
  useEffect(()=>{ if(!user) return;
    AsyncStorage.setItem(storageKey(user.email,"weekStartDay"), String(weekStartDay)).catch(()=>{});
  },[user,weekStartDay]);

  /* Backup state init + default auto-enable */
  useEffect(()=>{ (async()=>{
    if(!user?.email) return;
    const [configured, autoFlag, info] = await Promise.all([
      isBackupConfigured(user.email),
      getAutoBackupEnabled(user.email),
      getLatestBackupInfo(user.email),
    ]);
    setBackupConfigured(!!configured);
    setAutoBackupEnabled(!!autoFlag);
    setLastBackupInfo(info || null);
    if (!autoFlag) {
      try {
        await enableAutoBackup(user.email, true);
        setAutoBackupEnabled(true);
        const m = await backupNow(user.email);
        setLastBackupInfo(m);
      } catch {}
    }
  })(); },[user]);

  /* ========== AUTO BACKUP EFFECT (debounced) ========== */
  const backupDebounceRef = useRef(null);
  useEffect(()=>{
    if(!user?.email || !autoBackupEnabled) return;
    if (backupDebounceRef.current) clearTimeout(backupDebounceRef.current);
    backupDebounceRef.current = setTimeout(async ()=>{
      try{
        const info = await backupNow(user.email);
        setLastBackupInfo(info);
      }catch(e){
        console.warn("Auto-backup failed:", e?.message || e);
      }
    }, 1200);
    return ()=>{ if (backupDebounceRef.current) clearTimeout(backupDebounceRef.current); };
  }, [entries, phase, selectedDate, weekStartDay, autoBackupEnabled, user]);

  /* Entry helpers (canonical keys) */
  const day=(iso)=> entries[iso] || {};
  const rawVal=(iso,cat)=> day(iso)[canon(cat)];
  const valNum=(iso,cat)=> { const v=rawVal(iso,cat); return Number.isFinite(v)?v:0; };
  const setVal=(iso,cat,v)=> setEntries(prev=>{ const d=prev[iso]||{}; const k=canon(cat); return {...prev,[iso]:{...d,[k]:v}}; });
  const inc=(cat)=> setVal(selectedDate, cat, valNum(selectedDate,cat)+1);
  const dec=(cat)=> setVal(selectedDate, cat, Math.max(0, valNum(selectedDate,cat)-1));

  /* Physical Activity entries */
  const getPAEntries=(iso)=>{ const arr=day(iso)[PA_ENTRIES_KEY]; return Array.isArray(arr)?arr:[]; };
  const setPAEntries=(iso,arr)=> setEntries(prev=>{ const d=prev[iso]||{}; return {...prev,[iso]:{...d,[PA_ENTRIES_KEY]:arr}}; });
  const getPATotal=(iso)=> getPAEntries(iso).reduce((a,b)=>a+(Number(b)||0),0) + valNum(iso,"Physical Activity");

  /* Weight logic */
  const mostRecentWeightUpTo=(iso)=>{
    const dates=Object.keys(entries).sort();
    for(let i=dates.length-1;i>=0;i--){ const d=dates[i]; if(d<=iso){
      const w=entries[d]?.["Today's Weight"]; if(Number.isFinite(w)) return w;
    }}
    return null;
  };

  // Weekly weight rule: only consider weights INSIDE the week, choose the date closest to today
  const weeklyWeightForRange = (startIso, endIso) => {
    const inWeek = datesInRange(startIso, endIso)
      .map(d => ({ d, w: entries[d]?.["Today's Weight"] }))
      .filter(x => Number.isFinite(x.w));
    if (inWeek.length === 0) return null;
    const todayI = toISO(new Date());
    let best = inWeek[0];
    let bestDist = absDaysDiff(inWeek[0].d, todayI);
    for (let i = 1; i < inWeek.length; i++) {
      const dist = absDaysDiff(inWeek[i].d, todayI);
      if (dist < bestDist) { best = inWeek[i]; bestDist = dist; }
    }
    return best.w;
  };

  /* Weekly totals & weight snapshot */
  const weeklyData = useMemo(()=>{
    const start=getWeekStart(selectedDate,weekStartDay), end=getWeekEnd(start);
    const dates=datesInRange(start,end);

    const totals={};
    (phase===1 ? phase1Categories : phase2Categories).forEach(c=>{
      const key = canon(c);
      if (key!=="Today's Weight") totals[key]=0;
    });

    dates.forEach(d=>{
      const row=entries[d]||{};
      for(const key in totals){
        const n = key==="Physical Activity"
          ? (getPAEntries(d).reduce((a,b)=>a+(Number(b)||0),0) + Number(row["Physical Activity"]||0))
          : Number(row[key]||0);
        if(Number.isFinite(n)) totals[key]+=n;
      }
    });

    const weight=weeklyWeightForRange(start,end);
    return { start,end,totals,weight };
  },[entries,selectedDate,weekStartDay,phase]);

  /* ===== Calculator (lookup & live preview) ===== */
  const calsPerMin = (weight, key) => {
    if (!weight || !key) return 0;
    const rows = calorieChart
      .map(r => ({
        min: Number(r.min),
        max: r.max == null ? Infinity : Number(r.max),
        low: Number(r.low),
        medium: Number(r.medium),
        high: Number(r.high),
        veryHigh: Number(r.veryHigh),
      }))
      .sort((a, b) => a.min - b.min);

    let chosen = rows.find(r => weight >= r.min && weight <= r.max);
    if (!chosen) {
      if (weight < rows[0].min) chosen = rows[0];
      else chosen = rows[rows.length - 1];
    }
    return Number(chosen[key]) || 0;
  };

  const openCalculator=()=>{ const w=mostRecentWeightUpTo(selectedDate); setCalcWeight(w!=null?String(w):""); setMinutes(""); setIntensity("medium"); setShowCalc(true); };

  const previewCalories = useMemo(() => {
    const w = parseFloat(String(calcWeight).trim());
    const m = parseFloat(String(minutes).trim());
    if (!Number.isFinite(w) || !Number.isFinite(m) || w <= 0 || m <= 0) return 0;
    const per = calsPerMin(w, intensity);
    return Math.round(per * m);
  }, [calcWeight, minutes, intensity]);

  const addCalories = () => {
    const w = parseFloat(String(calcWeight).trim());
    const m = parseFloat(String(minutes).trim());
    if (!Number.isFinite(w) || w <= 0) { Alert.alert("Weight required", "Please enter a valid weight (lbs)."); return; }
    if (!Number.isFinite(m) || m <= 0) { Alert.alert("Minutes required", "Please enter minutes exercised."); return; }
    const per = calsPerMin(w, intensity);
    const total = Math.round(per * m);
    if (!Number.isFinite(total) || total <= 0) {
      Alert.alert("Unable to calculate", "Please check weight, intensity, and minutes.");
      return;
    }
    const items = getPAEntries(selectedDate);
    setPAEntries(selectedDate, [...items, total]);
    setShowCalc(false);
    setMinutes("");
    setIntensity("medium");
    setCalcWeight("");
  };

  /* Swipe */
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_e,g)=> Math.abs(g.dx)>15 && Math.abs(g.dx)>Math.abs(g.dy),
    onPanResponderRelease:(_e,g)=>{ const t=50; if(g.dx<=-t) setSelectedDate(d=>addDays(d,+1)); else if(g.dx>=t) setSelectedDate(d=>addDays(d,-1)); },
  })).current;

  /* Auth gate */
  if(!authReady){ return (<SafeAreaView style={{flex:1,alignItems:"center",justifyContent:"center"}}><Text>Loading…</Text></SafeAreaView>); }
  if(!user){ return <AuthScreen onSignedIn={u=>setUser(u)} />; }

  /* ---------- FlatList as the main scroll area ---------- */
  const ListHeader = (
    <View style={styles.screenInner}>
      <View style={styles.topSpacer} />

      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={{fontWeight:"bold"}}>Phase: {phase===1?"Phase 1":"Phase 2"}</Text>
        <View style={{flexDirection:"row", alignItems:"center"}}>
          {/* Optional install button for web */}
          {Platform.OS === "web" ? <InstallPrompt /> : null}
          <TouchableOpacity onPress={async()=>{ await signOutLocal(); setUser(null); }} style={styles.smallBtn}>
            <Text>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date / Week header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={()=>setSelectedDate(d=>addDays(d,-1))} style={styles.navBtn}><Text>{"<"}</Text></TouchableOpacity>
        {viewMode==="daily" ? (
          <Text style={styles.title}>{new Date(selectedDate+"T00:00:00").toLocaleDateString()}{selectedDate===toISO(new Date())?" (Today)":""}</Text>
        ) : (
          <Text style={styles.title}>Week: {new Date(weeklyData.start+"T00:00:00").toLocaleDateString()} - {new Date(weeklyData.end+"T00:00:00").toLocaleDateString()}</Text>
        )}
        <TouchableOpacity onPress={()=>setSelectedDate(d=>addDays(d,+1))} style={styles.navBtn}><Text>{">"}</Text></TouchableOpacity>
      </View>

      {/* View toggle + Settings */}
      <View style={styles.toolbar}>
        <View style={styles.segment}>
          <TouchableOpacity style={[styles.segmentBtn, viewMode==="daily"&&styles.segmentBtnActive]} onPress={()=>setViewMode("daily")}><Text style={viewMode==="daily"?styles.segmentTextActive:null}>Daily</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, viewMode==="weekly"&&styles.segmentBtnActive]} onPress={()=>setViewMode("weekly")}><Text style={viewMode==="weekly"?styles.segmentTextActive:null}>Weekly</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={()=>setShowSettings(true)}><Text>Settings</Text></TouchableOpacity>
      </View>

      {Platform.OS === "web" ? <AddToHomeScreenTip /> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} {...panResponder.panHandlers}>
      <FlatList
        data={categories}
        keyExtractor={(i)=>i}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<View style={{height:40}}/>}
        renderItem={({item})=>{
          /* ===== WEEKLY SUMMARY MODE ===== */
          if (viewMode === "weekly") {
            return (
              <View style={styles.screenInner}>
                {item === "Today's Weight" ? (
                  <View style={styles.row}>
                    <Text style={styles.label}>{item} (weekly):</Text>
                    <Text style={styles.valueLarge}>{weeklyData.weight != null ? String(weeklyData.weight) : ""}</Text>
                    <Text style={styles.unit}>lbs</Text>
                  </View>
                ) : (
                  <View style={styles.row}>
                    <Text style={styles.label}>{item} (weekly):</Text>
                    <Text style={styles.valueLarge}>{String(weeklyData.totals[canon(item)] ?? 0)}</Text>
                    {canon(item) === "Physical Activity" ? <Text style={styles.unit}>cal</Text> : null}
                  </View>
                )}
              </View>
            );
          }

          /* ===== DAILY MODE (interactive controls) ===== */
          if(item==="Physical Activity"){
            const total=getPATotal(selectedDate); const items=getPAEntries(selectedDate);
            return (
              <View style={styles.screenInner}>
                <View style={styles.row}>
                  <Text style={styles.label}>{item}:</Text>
                  <TextInput
                    style={[styles.input,{maxWidth:160}]}
                    keyboardType="numeric"
                    inputMode="numeric"
                    value={newPAEntry}
                    onChangeText={setNewPAEntry}
                    placeholder="Add calories"
                  />
                  <TouchableOpacity style={styles.smallBtn} onPress={()=>{
                    const n=parseFloat(newPAEntry); if(!Number.isFinite(n) || n<=0){ Alert.alert("Invalid entry"); return; }
                    setPAEntries(selectedDate,[...items,Math.round(n)]); setNewPAEntry("");
                  }}><Text>Add</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={openCalculator}><Text>Calc</Text></TouchableOpacity>
                </View>

                <View style={[styles.row,{marginTop:6}]}>
                  <Text style={[styles.label,{fontWeight:"600"}]}>Total today:</Text>
                  <Text style={styles.valueLarge}>{String(total)}</Text><Text style={styles.unit}>cal</Text>
                  <TouchableOpacity style={[styles.smallBtn,{marginLeft:8}]} onPress={()=>setShowPAList(v=>!v)}>
                    <Text>{showPAList?"Hide entries":"View entries"}</Text>
                  </TouchableOpacity>
                </View>

                {showPAList && (
                  <View style={styles.paListBox}>
                    <Text style={{marginBottom:6,fontWeight:"600"}}>Physical Activity Entries</Text>
                    <ScrollView style={{maxHeight:220}}>
                      {items.length===0 ? <Text style={{opacity:.6}}>No entries yet.</Text> :
                        items.map((cals,idx)=>(
                          <View key={idx} style={styles.paItemRow}>
                            <Text style={{width:74}}>Entry {idx+1}:</Text>
                            <TextInput
                              style={[styles.input,{maxWidth:120}]}
                              keyboardType="numeric"
                              inputMode="numeric"
                              value={String(cals)}
                              onChangeText={(t)=>{ const arr=[...items]; const n=parseFloat(t); arr[idx]=Number.isFinite(n)?Math.round(n):0; setPAEntries(selectedDate,arr); }}
                            />
                            <Text style={{marginLeft:6}}>cal</Text>
                            <TouchableOpacity style={[styles.smallBtn,{marginLeft:10}]} onPress={()=>{ const arr=[...items]; arr.splice(idx,1); setPAEntries(selectedDate,arr); }}>
                              <Text>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      }
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          }

          if(item==="Today's Weight"){
            const raw=rawVal(selectedDate,item);
            return (
              <View style={styles.screenInner}>
                <View style={styles.row}>
                  <Text style={styles.label}>{item}:</Text>
                  <TextInput
                    style={[styles.input,{maxWidth:140}]}
                    keyboardType="numeric"
                    inputMode="numeric"
                    value={raw===undefined?"":String(raw)}
                    onChangeText={(t)=>{ const n=parseFloat(t);
                      if(t===""||!Number.isFinite(n)){ setEntries(prev=>{ const d=prev[selectedDate]||{}; const {[canon(item)]:_,...rest}=d; return {...prev,[selectedDate]:rest}; }); }
                      else { setVal(selectedDate,item,Math.round(n*10)/10); }
                    }}
                    placeholder="Enter weight"
                  />
                  <Text style={styles.unit}>lbs</Text>
                </View>
              </View>
            );
          }

          const v=valNum(selectedDate,item);
          return (
            <View style={styles.screenInner}>
              <View style={styles.row}>
                <Text style={styles.label}>{item}:</Text>
                <TouchableOpacity style={styles.button} onPress={()=>dec(item)}><Text>-</Text></TouchableOpacity>
                <Text style={styles.value}>{v}</Text>
                <TouchableOpacity style={styles.button} onPress={()=>inc(item)}><Text>+</Text></TouchableOpacity>
              </View>
            </View>
          );
        }}
        contentContainerStyle={{paddingBottom:40}}
      />

      {/* Calories Calculator — FULL SCREEN + SCROLL */}
      <Modal visible={showCalc} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalFull}>
          <ScrollView contentContainerStyle={[styles.modalScroll, styles.screenInner]}>
            <View style={styles.topSpacer} />
            <Text style={styles.modalTitle}>Calories Calculator</Text>
            <Text>Selected day: {new Date(selectedDate+"T00:00:00").toLocaleDateString()}</Text>
            <Text style={{marginTop:10}}>Weight to use (lbs):</Text>
            <TextInput
              style={[styles.input,{maxWidth:140}]}
              keyboardType="numeric"
              inputMode="numeric"
              value={calcWeight}
              onChangeText={setCalcWeight}
              placeholder="Enter weight"
            />
            <Text style={{marginTop:10}}>Select Intensity:</Text>
            {intensities.map(l=>(
              <TouchableOpacity key={l.key} style={[styles.intensityBtn, intensity===l.key&&styles.selectedBtn]} onPress={()=>setIntensity(l.key)}>
                <Text style={{color:intensity===l.key?"#fff":"#000"}}>{l.label}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.input,{marginTop:8, maxWidth:140}]}
              placeholder="Minutes exercised"
              keyboardType="numeric"
              inputMode="numeric"
              value={minutes}
              onChangeText={setMinutes}
            />
            <Text style={{marginTop:10,marginBottom:8}}>Calories to add: {previewCalories} cal</Text>
            <Button title="Add Calories" onPress={addCalories} disabled={previewCalories<=0}/>
            <View style={{height:10}}/>
            <Button title="Close" onPress={()=>{ setShowCalc(false); setMinutes(""); setIntensity("medium"); setCalcWeight(""); }}/>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Settings — FULL SCREEN + SCROLL (2 rows higher) */}
      <Modal visible={showSettings} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalFull}>
          <ScrollView contentContainerStyle={[styles.modalScroll, styles.screenInner]}>
            <View style={{ height: SETTINGS_TOP_SPACER_PX }} />
            <Text style={styles.modalTitle}>Settings</Text>

            <Text style={{marginBottom:8}}>Week starts on:</Text>
            {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((name,idx)=>(
              <TouchableOpacity key={name} style={[styles.intensityBtn, weekStartDay===idx&&styles.selectedBtn]} onPress={()=>setWeekStartDay(idx)}>
                <Text style={{color:weekStartDay===idx?"#fff":"#000"}}>{name}</Text>
              </TouchableOpacity>
            ))}

            <View style={{height:12}}/>
            <Text style={{marginBottom:8}}>Phase:</Text>
            <View style={{flexDirection:"row", flexWrap:"wrap"}}>
              <TouchableOpacity
                style={[styles.segmentBtn, phase===1&&styles.segmentBtnActive,{marginRight:8, marginBottom:8}]}
                onPress={()=>setPhase(1)}
              >
                <Text style={phase===1?styles.segmentTextActive:null}>Phase 1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, phase===2&&styles.segmentBtnActive,{marginBottom:8}]}
                onPress={()=>setPhase(2)}
              >
                <Text style={phase===2?styles.segmentTextActive:null}>Phase 2</Text>
              </TouchableOpacity>
            </View>

            <View style={{height:16}}/>
            <Text style={{marginBottom:8, fontWeight:"600"}}>Backup & Restore (Local file)</Text>
            <Text style={{marginBottom:4}}>
              Status: {backupConfigured ? "Backups available / Auto-backup set" : "No backups yet"}
            </Text>
            {lastBackupInfo ? (
              <Text style={{marginBottom:12}}>Last backup: {new Date(lastBackupInfo.createdAt).toLocaleString()}</Text>
            ) : <Text style={{marginBottom:12}}>Last backup: none</Text>}

            {/* Auto backup toggle */}
            <TouchableOpacity
              style={[styles.intensityBtn, autoBackupEnabled && styles.selectedBtn]}
              onPress={async()=>{
                try{
                  if(!user?.email) return;
                  const next=!autoBackupEnabled;
                  await enableAutoBackup(user.email,next);
                  setAutoBackupEnabled(next);
                  if (next) {
                    const info = await backupNow(user.email);
                    setLastBackupInfo(info);
                  }
                  Alert.alert("Auto backup", next?"Enabled.":"Disabled.");
                }catch(e){ Alert.alert("Error", e.message||String(e)); }
              }}
            >
              <Text style={{color:autoBackupEnabled?"#fff":"#000"}}>
                {autoBackupEnabled?"Disable Auto Backup":"Enable Auto Backup"}
              </Text>
            </TouchableOpacity>

            <View style={{height:10}}/>
            <Button title="Back Up Now" onPress={async()=>{
              try{
                if(!user?.email) return;
                const info=await backupNow(user.email);
                setLastBackupInfo(info);
                Alert.alert("Backup complete","Backup file updated.");
              }catch(e){ Alert.alert("Backup failed", e.message||String(e)); }
            }}/>
            <View style={{height:8}}/>
            <Button title="Export Latest Backup" onPress={async()=>{
              try{ if(!user?.email) return; await exportLatestBackup(user.email); }
              catch(e){ Alert.alert("Export failed", e.message||String(e)); }
            }}/>

            <View style={{height:16}}/>
            <Text style={{marginBottom:6, fontWeight:"600"}}>Restore From File</Text>
            <Button title="Pick file & restore" onPress={async()=>{
              try{
                await restoreFromFile(null, async (snapshot)=>{
                  const em = snapshot.email || user.email;
                  await AsyncStorage.setItem(storageKey(em,"entries"), JSON.stringify(snapshot.payload.entries||{}));
                  await AsyncStorage.setItem(storageKey(em,"phase"), String(snapshot.payload.phase||1));
                  await AsyncStorage.setItem(storageKey(em,"date"), snapshot.payload.selectedDate || "");
                  await AsyncStorage.setItem(storageKey(em,"weekStartDay"), String(snapshot.payload.weekStartDay ?? 0));
                  Alert.alert("Restore complete","Your data has been restored.");
                });
              }catch(e){
                Alert.alert("Restore failed", e?.message || "Could not restore from file.");
              }
            }}/>

            <View style={{height:12}}/>
            <Button title="Close" onPress={()=>setShowSettings(false)}/>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* =================== Styles =================== */
const styles = StyleSheet.create({
  container:{ flex:1, padding:16 },

  // center all content and limit width so nothing gets cut off
  screenInner: { width: "100%", maxWidth: 420, alignSelf: "center" },

  topSpacer:{ height: TOP_SPACER_PX },

  topbar:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8, width:"100%", alignSelf:"center"},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:8, width:"100%"},
  navBtn:{paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderRadius:8},
  title:{fontSize:18,fontWeight:"bold"},
  toolbar:{marginBottom:8,flexDirection:"row",alignItems:"center",justifyContent:"space-between", width:"100%"},
  segment:{flexDirection:"row",borderWidth:1,borderRadius:8,overflow:"hidden"},
  segmentBtn:{paddingVertical:6,paddingHorizontal:12,borderWidth:1,borderRadius:8},
  segmentBtnActive:{backgroundColor:"#E0E0E0"},
  segmentTextActive:{fontWeight:"bold"},
  settingsBtn:{paddingVertical:6,paddingHorizontal:12,borderWidth:1,borderRadius:8},

  // rows wrap and take full inner width
  row:{flexDirection:"row",alignItems:"center",marginVertical:8, width:"100%", flexWrap:"wrap"},
  rowCol:{marginVertical:8, width:"100%"},

  label:{flex:1,fontSize:16,minWidth:150},
  value:{width:60,textAlign:"center",fontSize:16},
  valueLarge:{width:100,textAlign:"center",fontSize:16},
  button:{padding:10,borderWidth:1,borderRadius:8,marginHorizontal:5},
  smallBtn:{paddingVertical:6,paddingHorizontal:10,borderWidth:1,borderRadius:8,marginLeft:6},

  // inputs are narrower so they won’t overflow on small screens
  input:{
    borderWidth:1,padding:5,textAlign:"center",borderRadius:5,marginHorizontal:5,
    minWidth:90, maxWidth:200, flexGrow:0
  },
  unit:{marginLeft:5},

  // Full-screen modal layout + scroll
  modalFull:{ flex:1, backgroundColor:"#fff", padding:20 },
  modalScroll:{ paddingBottom:40 },

  modalTitle:{fontSize:18,fontWeight:"bold",marginBottom:10},
  intensityBtn:{padding:10,borderWidth:1,borderRadius:8,marginVertical:5},
  selectedBtn:{backgroundColor:"#007AFF"},
  paListBox:{borderWidth:1,borderRadius:8,padding:10,marginTop:8},
  paItemRow:{flexDirection:"row",alignItems:"center",marginBottom:8},

  authTitle:{fontSize:22,fontWeight:"bold",marginBottom:12},
});
