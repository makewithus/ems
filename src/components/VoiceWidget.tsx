"use client";
import { useState, useRef, useEffect } from "react";

interface VoiceWidgetProps {
  sidebarOpen?: boolean;
}

export default function VoiceWidget({ sidebarOpen = true }: VoiceWidgetProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [docId, setDocId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(interim);
      if (final) {
        setText((prev) => (prev ? prev + " " + final : final).trim());
        setTranscript("");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setTranscript("");
    };

    recognition.onerror = (e: any) => {
      setIsListening(false);
      setTranscript("");
      if (e.error !== "no-speech") setError("Mic error: " + e.error);
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError("Speech recognition not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setError("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const extractDocId = (url: string) => {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleSend = async () => {
    if (!text.trim() || !docId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:8000/api/actions/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, doc_id: docId }),
      });
      const data = await res.json();
      if (data.success) setPreview(data);
      else setError(data.error || "Could not understand.");
    } catch {
      setError("Server not reachable.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, doc_id: docId, confirmed: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(data.message);
        setPreview(null);
        setText("");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed.");
      }
    } catch {
      setError("Server not reachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "0 16px 24px 16px" }}>
      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />

      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        title={!sidebarOpen ? "Voice Assistant" : undefined}
        onMouseOver={(e) => {
          e.currentTarget.style.background = open
            ? "rgba(99,102,241,0.25)"
            : "rgba(255,255,255,0.1)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = open
            ? "rgba(99,102,241,0.15)"
            : "rgba(255,255,255,0.07)";
        }}
        style={{
          width: "100%",
          padding: sidebarOpen ? "10px 14px" : "10px 0",
          borderRadius: "8px",
          background: open ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.07)",
          border: open
            ? "1px solid rgba(99,102,241,0.4)"
            : "1px solid rgba(255,255,255,0.1)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: sidebarOpen ? "flex-start" : "center",
          gap: sidebarOpen ? "10px" : "0",
          transition: "background 0.15s, border 0.15s",
          letterSpacing: "-0.02em",
        }}
      >
        {/* Mic or close icon */}
        {open ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : isListening ? (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              height: "16px",
            }}
          >
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  width: "3px",
                  height: "4px",
                  background: "#a5b4fc",
                  borderRadius: "2px",
                  animation: "soundwave 0.6s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </span>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        )}

        {sidebarOpen && (
          <span
            style={{
              opacity: sidebarOpen ? 1 : 0,
              maxWidth: sidebarOpen ? 200 : 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
              transition: "opacity 0.13s ease, max-width 0.18s cubic-bezier(0.4,0,0.2,1)",
              color: open ? "#a5b4fc" : "var(--text-inverse)",
            }}
          >
            {open ? "Close Assistant" : "Voice Assistant"}
          </span>
        )}
      </button>

      {/* Expanded Panel */}
      {open && (
        <div
          style={{
            marginTop: "8px",
            width: "100%",
            background: "#0f0f1a",
            borderRadius: "10px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          {/* Doc input */}
          {!docId ? (
            <input
              type="text"
              placeholder="Paste Google Doc link..."
              onChange={(e) => {
                const id = extractDocId(e.target.value);
                if (id) setDocId(id);
              }}
              autoFocus
              style={inputStyle}
            />
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#22c55e", fontSize: "11px" }}>
                ✓ Doc connected
              </span>
              <button
                onClick={() => setDocId("")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  fontSize: "11px",
                  textDecoration: "underline",
                }}
              >
                change
              </button>
            </div>
          )}

          {/* Text + Voice input */}
          {docId && !preview && (
            <>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder={isListening ? "Listening..." : "Type or speak..."}
                  value={isListening && transcript ? transcript : text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  autoFocus
                  style={{
                    ...inputStyle,
                    flex: 1,
                    borderColor: isListening
                      ? "rgba(99,102,241,0.6)"
                      : "rgba(255,255,255,0.12)",
                  }}
                />

                {/* Mic button */}
                <button
                  onClick={toggleListening}
                  title={isListening ? "Stop" : "Speak"}
                  style={{
                    width: "32px",
                    height: "32px",
                    flexShrink: 0,
                    borderRadius: "7px",
                    border: isListening
                      ? "1px solid rgba(99,102,241,0.6)"
                      : "1px solid rgba(255,255,255,0.12)",
                    background: isListening
                      ? "rgba(99,102,241,0.25)"
                      : "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.15s, border 0.15s",
                  }}
                >
                  {isListening ? (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        height: "14px",
                      }}
                    >
                      {[1, 2, 3].map((i) => (
                        <span
                          key={i}
                          style={{
                            display: "inline-block",
                            width: "2px",
                            height: "4px",
                            background: "#a5b4fc",
                            borderRadius: "2px",
                            animation: "soundwave 0.6s ease-in-out infinite",
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </span>
                  ) : (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10a7 7 0 0 0 14 0" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                      <line x1="9" y1="22" x2="15" y2="22" />
                    </svg>
                  )}
                </button>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={loading || !text.trim()}
                  style={{
                    width: "32px",
                    height: "32px",
                    flexShrink: 0,
                    borderRadius: "7px",
                    border: "none",
                    background:
                      loading || !text.trim()
                        ? "rgba(255,255,255,0.08)"
                        : "#6366f1",
                    color: "#fff",
                    cursor: loading || !text.trim() ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "15px",
                    transition: "background 0.15s",
                  }}
                >
                  {loading ? (
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        border: "1.5px solid rgba(255,255,255,0.4)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                        display: "inline-block",
                      }}
                    />
                  ) : (
                    "→"
                  )}
                </button>
              </div>

              {isListening && (
                <p
                  style={{
                    color: "#a5b4fc",
                    fontSize: "11px",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#ef4444",
                      display: "inline-block",
                      animation: "pulse 1s ease-in-out infinite",
                    }}
                  />
                  Listening — speak now
                </p>
              )}
            </>
          )}

          {/* Preview confirmation */}
          {preview && (
            <div
              style={{
                padding: "10px",
                background: "rgba(99,102,241,0.1)",
                borderRadius: "8px",
                border: "1px solid rgba(99,102,241,0.2)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <p
                style={{
                  color: "#e2e2f0",
                  fontSize: "12px",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {preview.confirmation_message}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setPreview(null)}
                  style={{
                    padding: "5px 12px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  style={{
                    padding: "5px 12px",
                    background: "#6366f1",
                    border: "none",
                    borderRadius: "6px",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  {loading ? "..." : "✓ Confirm"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p style={{ color: "#ef4444", fontSize: "11px", margin: 0 }}>
              ⚠️ {error}
            </p>
          )}
          {success && (
            <p style={{ color: "#22c55e", fontSize: "11px", margin: 0 }}>
              ✓ {success}
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes soundwave {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "7px",
  color: "#fff",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};