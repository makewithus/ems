"use client";
import { useState, useRef, useEffect } from "react";

interface Issue {
  number:   number;
  title:    string;
  status:   string;
  priority: string;
  created:  string;
}

interface PreviewData {
  confirmation_message: string;
  action: string;
  success: boolean;
  fields: Record<string, unknown>;
  needs_clarification: boolean;
  confidence: number;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: "Open",        color: "#ef4444", bg: "#fef2f2" },
  // in_progress: { label: "In Progress", color: "#f59e0b", bg: "#fffbeb" },
  // testing:     { label: "Testing",     color: "#6366f1", bg: "#eef2ff" },
  blocked:     { label: "Blocked",     color: "#dc2626", bg: "#fee2e2" },
  resolved:    { label: "Resolved",    color: "#22c55e", bg: "#f0fdf4" },
  // closed:      { label: "Closed",      color: "#6b7280", bg: "#f3f4f6" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: "High",   color: "#ef4444", bg: "#fef2f2" },
  medium: { label: "Medium", color: "#f59e0b", bg: "#fffbeb" },
  low:    { label: "Low",    color: "#22c55e", bg: "#f0fdf4" },
};

const ALL_STATUSES = ["all", "open", "resolved"];
const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
export default function IssuesPage() {
  const [issues, setIssues]             = useState<Issue[]>([]);
  const [docId, setDocId]               = useState("");
  const [docUrl, setDocUrl]             = useState("");
  const [docConnected, setDocConnected] = useState(false);
  const [urlInput, setUrlInput]         = useState("");
  const [urlError, setUrlError]         = useState("");
  const [fetching, setFetching]         = useState(false);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [text, setText]                 = useState("");
  const [preview, setPreview]           = useState<PreviewData | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState("");
  const [isListening, setIsListening]   = useState(false);
  const [transcript, setTranscript]     = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery]   = useState("");
  const [recentDocs, setRecentDocs]     = useState<{ id: string; url: string }[]>([]);
  const [showRecent, setShowRecent]     = useState(false);
  const [activeTabName, setActiveTabName] = useState("");
  const recognitionRef                  = useRef<SpeechRecognitionInstance | null>(null);
  const [savedDocs, setSavedDocs] = useState<{id: string, url: string, name: string}[]>([]);
const [showDropdown, setShowDropdown] = useState(false);

  // Load saved doc + recent docs on page open
  useEffect(() => {
    const savedId  = localStorage.getItem("ems_doc_id");
    const savedUrl = localStorage.getItem("ems_doc_url");
    if (savedId && savedUrl) {
      setDocId(savedId);
      setDocUrl(savedUrl);
      setDocConnected(true);
      fetchIssues(savedId);
    }
    const recent = localStorage.getItem("ems_recent_docs");
    if (recent) setRecentDocs(JSON.parse(recent));
  }, []);

  // Speech recognition
  useEffect(() => {
    const windowWithSpeech = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SR = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.continuous     = false;
    r.interimResults = true;
    r.lang           = "en-US";

    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(interim);
      if (final) { setText(p => (p ? p + " " + final : final).trim()); setTranscript(""); }
    };
    r.onend  = () => { setIsListening(false); setTranscript(""); };
    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (e.error !== "no-speech") setError("Mic error: " + e.error);
    };
    recognitionRef.current = r;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) { setError("Speech recognition not supported."); return; }
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else { setError(""); recognitionRef.current.start(); setIsListening(true); }
  };

  const extractDocId = (url: string) => {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };
const connectDoc = async () => {
  const id = extractDocId(urlInput);
  if (!id) { setUrlError("Invalid Google Doc URL"); return; }
  setUrlError("");

  // Doc title fetch karo
  try {
    const res = await fetch(`${API_URL}/api/actions/doc-title?doc_id=${id}`);
    const data = await res.json();
    const name = data.title || `Doc ${savedDocs.length + 1}`;
    
    if (!savedDocs.find(d => d.id === id)) {
      setSavedDocs(prev => [...prev, { id, url: urlInput, name }]);
    }
  } catch {
    if (!savedDocs.find(d => d.id === id)) {
      setSavedDocs(prev => [...prev, { id, url: urlInput, name: `Doc ${savedDocs.length + 1}` }]);
    }
  }

  setDocId(id);
  setDocUrl(urlInput);
  setDocConnected(true);
  fetchIssues(id);
};
  // const connectDoc = () => {
  //   const id = extractDocId(urlInput);
  //   if (!id) { setUrlError("Invalid Google Doc URL"); return; }
  //   setUrlError("");
  //   setDocId(id); setDocUrl(urlInput); setDocConnected(true);
  //   localStorage.setItem("ems_doc_id", id);
  //   localStorage.setItem("ems_doc_url", urlInput);
  //   const recent  = JSON.parse(localStorage.getItem("ems_recent_docs") || "[]");
  //   const updated = [{ id, url: urlInput }, ...recent.filter((d: { id: string; url: string }) => d.id !== id)].slice(0, 5);
  //   localStorage.setItem("ems_recent_docs", JSON.stringify(updated));
  //   setRecentDocs(updated);
  //   setShowRecent(false);
  //   fetchIssues(id);
  // };

  // const fetchIssues = async (id: string) => {
  //   setFetching(true);
  //   setIssues([]);
  //   try {
  //     const res = await fetch(`${API_URL}/api/actions/issues?doc_id=${id}`);
  //     const data = await res.json();
  //     if (data.success) setIssues(data.issues);
  //   } catch { setError("Could not fetch issues."); }
  //   finally { setFetching(false); }
  // };
  const fetchIssues = async (id: string) => {
  setFetching(true);
  try {
    const res = await fetch(`${API_URL}/api/actions/issues?doc_id=${id}`);
    const data = await res.json();
    
    if (data.success) {
      setIssues(prev => {
        const existingNumbers = new Set(prev.map(i => i.number));
        const newIssues = data.issues.filter((i: Issue) => !existingNumbers.has(i.number));
        return [...prev, ...newIssues];
      });
      if (data.tab_name) setActiveTabName(data.tab_name);
    }
  } catch { setError("Could not fetch issues."); }
  finally { setFetching(false); }
};

  const handleSend = async () => {
    if (!text.trim() || !docId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/actions/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, doc_id: docId }),
      });
      const data = await res.json();
      if (data.success) setPreview(data as PreviewData);
      else setError(data.error || "Could not understand.");
    } catch { setError("Server not reachable."); }
    finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/actions/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, doc_id: docId, confirmed: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(data.message);
        setPreview(null); setText(""); setPanelOpen(false);
        setTimeout(() => fetchIssues(docId), 1500);
        setTimeout(() => setSuccess(""), 4000);
      } else setError(data.error || "Failed.");
    } catch { setError("Server not reachable."); }
    finally { setLoading(false); }
  };

  const filtered = issues.filter(issue => {
    const matchStatus = filterStatus === "all" || issue.status === filterStatus;
    const matchSearch = !searchQuery ||
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.status.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts: Record<string, number> = { all: issues.length };
  ALL_STATUSES.slice(1).forEach(s => { counts[s] = issues.filter(i => i.status === s).length; });

  return (
    <div style={{ padding: "32px 36px", background: "var(--bg-primary)", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", textTransform: "uppercase", margin: 0, color: "var(--text-primary)" }}>ISSUES</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "4px 0 0" }}>Track and manage project issues using voice or text.</p>
      </div>

      {/* Google Doc Connector */}
      {/* <div style={{ background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", margin: "0 0 12px" }}>
          Google Doc Connection
        </p> */}

        {/* {docConnected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e8f0fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4"/>
                  <path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Doc Connected</p>
                <a href={docUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#4285f4" }}>Open in Google Docs ↗</a>
              </div>
              <span style={{ background: "#f0fdf4", color: "#16a34a", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: "1px solid #bbf7d0" }}>✓ Active</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => fetchIssues(docId)} style={outlineBtn}>↺ Refresh</button>
              <button onClick={() => {
                setDocConnected(false); setDocId(""); setDocUrl(""); setUrlInput(""); setIssues([]);
                localStorage.removeItem("ems_doc_id"); localStorage.removeItem("ems_doc_url");
              }} style={outlineBtn}>Change</button>
            </div>
          </div> */}
        {/* ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Paste your Google Doc link to connect:</p>

            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="https://docs.google.com/document/d/..."
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
                  onFocus={() => setShowRecent(true)}
                  onBlur={() => setTimeout(() => setShowRecent(false), 150)}
                  onKeyDown={e => e.key === "Enter" && connectDoc()}
                  autoFocus
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={connectDoc}
                  disabled={!urlInput.trim()}
                  style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: !urlInput.trim() ? "var(--border,#e5e7eb)" : "#4285f4", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !urlInput.trim() ? "not-allowed" : "pointer" }}
                > */}
                  {/* Connect
                </button>
              </div> */}

              {/* Recent docs dropdown */}
              {/* {showRecent && recentDocs.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 90, background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "8px 14px 4px", margin: 0 }}>Recent Docs</p>
                  {recentDocs.map((doc, idx) => (
                    <div
                      key={idx}
                      onMouseDown={() => { setUrlInput(doc.url); setShowRecent(false); }}
                      onMouseOver={e => (e.currentTarget.style.background = "var(--bg-primary,#f9fafb)")}
                      onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                      style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "background 0.1s" }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: "#e8f0fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4"/>
                          <path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.url.length > 60 ? doc.url.slice(0, 60) + "..." : doc.url}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div> */}

            {/* {urlError && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>⚠ {urlError}</p>}
          </div>
        )}
      </div> */}
      {/* Google Doc Connector */}
<div style={{ background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
  <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", margin: "0 0 12px" }}>
    Google Doc Connection
  </p>

  {docConnected ? (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      
      {/* Active doc highlight */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e8f0fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4"/><path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div>
          {/* Project name highlighted */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
              {savedDocs.find(d => d.id === docId)?.name || "Connected Doc"}
            </p>
            <span style={{ background: "#f0fdf4", color: "#16a34a", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #bbf7d0" }}>✓ Active</span>
          </div>
          <a href={docUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#4285f4" }}>
            Open in Google Docs ↗
          </a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, position: "relative" }}>
        <button onClick={() => fetchIssues(docId)} style={outlineBtn}>↺ Refresh</button>
        
        {/* Switch Project dropdown */}
        {savedDocs.length > 1 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              style={{ ...outlineBtn, background: showDropdown ? "#f5f3ff" : undefined, color: showDropdown ? "#6366f1" : undefined }}
            >
              Switch Project ▾
            </button>
            {showDropdown && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 4,
                background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)",
                borderRadius: 10, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                minWidth: 220, overflow: "hidden"
              }}>
                <p style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", margin: 0 }}>
                  Your Docs
                </p>
                {savedDocs.map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setDocId(doc.id);
                      setDocUrl(doc.url);
                      setShowDropdown(false);
                      fetchIssues(doc.id);
                    }}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                      background: doc.id === docId ? "#f5f3ff" : "transparent",
                      borderLeft: doc.id === docId ? "3px solid #6366f1" : "3px solid transparent"
                    }}
                    onMouseOver={e => { if (doc.id !== docId) e.currentTarget.style.background = "var(--bg-primary,#f9fafb)"; }}
                    onMouseOut={e => { if (doc.id !== docId) e.currentTarget.style.background = "transparent"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4"/><path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: doc.id === docId ? 600 : 400, color: doc.id === docId ? "#6366f1" : "var(--text-primary)" }}>
                        {doc.name}
                      </p>
                    </div>
                    {doc.id === docId && <span style={{ fontSize: 10, color: "#6366f1" }}>Active</span>}
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--border,#e5e7eb)", padding: "8px 14px" }}>
                  <button
                    onClick={() => { setShowDropdown(false); setDocConnected(false); setDocId(""); setDocUrl(""); setUrlInput(""); }}
                    style={{ fontSize: 12, color: "#4285f4", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    + Add another doc
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        <button
          onClick={() => { setDocConnected(false); setDocId(""); setDocUrl(""); setUrlInput(""); }}
          style={outlineBtn}
        >
          Change
        </button>
      </div>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        Paste your Google Doc link to connect:
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="https://docs.google.com/document/d/..."
          value={urlInput}
          onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
          onKeyDown={e => e.key === "Enter" && connectDoc()}
          autoFocus
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={connectDoc}
          disabled={!urlInput.trim()}
          style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: !urlInput.trim() ? "var(--border,#e5e7eb)" : "#4285f4", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !urlInput.trim() ? "not-allowed" : "pointer" }}
        >
          Connect
        </button>
      </div>
      {urlError && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>⚠ {urlError}</p>}
      
      {/* Previously connected docs */}
      {savedDocs.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 6px" }}>Recent docs:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {savedDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => { setDocId(doc.id); setDocUrl(doc.url); setDocConnected(true); fetchIssues(doc.id); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #4285f4", background: "#e8f0fe", color: "#4285f4", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4"/><path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {doc.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )}
</div>

      {/* Success banner */}
      {success && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px", marginBottom: 20, color: "#16a34a", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {success}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 24 }}>
        {ALL_STATUSES.slice(1).map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <div
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              style={{ background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: "16px 18px", cursor: "pointer", outline: filterStatus === s ? `2px solid ${cfg.color}` : "none" }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{counts[s] || 0}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>{cfg.label}</div>
              <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: cfg.color, width: "40%" }}/>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search by title or status..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32, width: "100%", boxSizing: "border-box" as const }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", border: "1px solid",
                borderColor: filterStatus === s ? (s === "all" ? "var(--brand-red,#e53e3e)" : STATUS_CONFIG[s]?.color || "var(--brand-red,#e53e3e)") : "var(--border,#e5e7eb)",
                background:  filterStatus === s ? (s === "all" ? "var(--brand-red,#e53e3e)" : STATUS_CONFIG[s]?.bg  || "#fff") : "var(--bg-card,#fff)",
                color:       filterStatus === s ? (s === "all" ? "#fff" : STATUS_CONFIG[s]?.color || "#000") : "var(--text-muted)",
              }}
            >
              {s === "all" ? `All ${counts.all}` : `${STATUS_CONFIG[s]?.label} ${counts[s] || 0}`}
            </button>
          ))}
        </div>

        <button
          onClick={() => { if (!docConnected) { setError("Connect a Google Doc first."); return; } setPanelOpen(!panelOpen); setPreview(null); setError(""); }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: panelOpen ? "#4f46e5" : "var(--brand-red,#e53e3e)", color: "#fff", whiteSpace: "nowrap" as const }}
        >
          {panelOpen ? "✕ Close" : " Voice / Text"}
        </button>
      </div>

      {/* Voice Panel */}
      {panelOpen && (
        <div style={{ background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-muted)", margin: "0 0 12px" }}>
            Voice / Text Command
          </p>
          {!preview && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder={isListening ? "Listening..." : '"The navbar is broken" or "Resolve issue 3"'}
                  value={isListening && transcript ? transcript : text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSend()}
                  autoFocus
                  style={{ ...inputStyle, flex: 1, borderColor: isListening ? "#6366f1" : "var(--border,#e5e7eb)" }}
                />
                <button
                  onClick={toggleListening}
                  style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, cursor: "pointer", border: `1px solid ${isListening ? "#6366f1" : "var(--border,#e5e7eb)"}`, background: isListening ? "#ede9fe" : "var(--bg-card,#fff)", color: isListening ? "#6366f1" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {isListening ? (
                    <span style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                      {[1,2,3].map(i => <span key={i} style={{ display: "inline-block", width: 3, height: 4, background: "#6366f1", borderRadius: 2, animation: "soundwave 0.6s ease-in-out infinite", animationDelay: `${i*0.15}s` }}/>)}
                    </span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0 0 14 0"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                      <line x1="9" y1="22" x2="15" y2="22"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || !text.trim()}
                  style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: "none", background: loading || !text.trim() ? "var(--border,#e5e7eb)" : "var(--brand-red,#e53e3e)", color: "#fff", cursor: loading || !text.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}
                >
                  {loading ? <span style={{ width: 10, height: 10, border: "1.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }}/> : "→"}
                </button>
              </div>
              {isListening && (
                <p style={{ color: "#6366f1", fontSize: 11, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1s ease-in-out infinite" }}/>
                  Listening — speak now
                </p>
              )}
            </>
          )}
          {preview && (
            <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: 14 }}>
              <p style={{ fontSize: 13, color: "#3730a3", margin: "0 0 12px", lineHeight: 1.5 }}>{preview.confirmation_message}</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setPreview(null)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border,#e5e7eb)", background: "var(--bg-card,#fff)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                <button onClick={handleConfirm} disabled={loading} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{loading ? "..." : "✓ Confirm"}</button>
              </div>
            </div>
          )}
          {error && <p style={{ color: "#ef4444", fontSize: 12, margin: "8px 0 0" }}>⚠ {error}</p>}
        </div>
      )}

      {/* Issue Cards */}
      {fetching ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ width: 18, height: 18, border: "2px solid var(--border,#e5e7eb)", borderTopColor: "var(--brand-red,#e53e3e)", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }}/>
          Loading issues...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: "60px 20px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
            {!docConnected ? "Connect a Google Doc to see issues." : searchQuery ? `No issues matching "${searchQuery}".` : "No issues found."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(issue => {
            const sc = STATUS_CONFIG[issue.status]     || STATUS_CONFIG.open;
            const pc = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medium;
            return (
              <div
                key={issue.number}
                style={{ background: "var(--bg-card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 16, transition: "box-shadow 0.15s" }}
                onMouseOver={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)")}
                onMouseOut={e  => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--bg-primary,#f9fafb)", border: "1px solid var(--border,#e5e7eb)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", fontFamily: "monospace" }}>#{issue.number}</span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{issue.title}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.color}22` }}>
                      {sc.label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: pc.bg, color: pc.color, border: `1px solid ${pc.color}22` }}>
                      {pc.label} Priority
                    </span>
                    {issue.created && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        {issue.created}
                      </span>
                    )}
                  </div>
                </div>

                <a href={docUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "#4285f4", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, paddingTop: 2 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4"/>
                    <path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Open Doc
                </a>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes soundwave { 0%,100% { height:4px; } 50% { height:12px; } }
        @keyframes pulse     { 0%,100% { opacity:1;  } 50% { opacity:0.3; } }
        @keyframes spin      { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  background: "var(--bg-card,#fff)",
  border: "1px solid var(--border,#e5e7eb)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};

const outlineBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 7,
  border: "1px solid var(--border,#e5e7eb)",
  background: "var(--bg-primary,#f9fafb)",
  color: "var(--text-muted)",
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
};