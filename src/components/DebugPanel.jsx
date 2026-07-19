import React, { useEffect, useState } from "react";
import { API_ENDPOINTS, buildApiUrl } from "../config/api";

const endpoints = [
  { label: "Health (app.py)", url: API_ENDPOINTS.health },
  { label: "AI Predictions (app.py)", url: API_ENDPOINTS.aiPredictions },
  { label: "Predictions (api.py)", url: buildApiUrl("predictions") },
];

export default function DebugPanel() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const check = async () => {
      const checks = await Promise.all(
        endpoints.map(async (e) => {
          try {
            const res = await fetch(e.url, { method: "GET" });
            const ok = res.ok;
            let body = null;
            try { body = await res.json(); } catch {}
            return { label: e.label, url: e.url, ok, status: res.status, body };
          } catch (err) {
            return { label: e.label, url: e.url, ok: false, error: String(err) };
          }
        })
      );
      if (isMounted) setResults(checks);
    };
    check();
    const id = setInterval(check, 4000);
    return () => { isMounted = false; clearInterval(id); };
  }, []);

  return (
    <div style={{position:"fixed",bottom:10,right:10,background:"#111",color:"#fff",padding:"12px",borderRadius:8,fontSize:12,maxWidth:360,zIndex:9999,border:"1px solid #333"}}>
      <div style={{fontWeight:700,marginBottom:8}}>Debug Panel</div>
      {results.map((r, i) => (
        <div key={i} style={{marginBottom:6}}>
          <div>
            <span style={{color: r.ok ? "#4caf50" : "#f44336"}}>●</span> {r.label}
          </div>
          <div style={{opacity:0.7}}>{r.url}</div>
          <div style={{opacity:0.8}}>Status: {r.status ?? "n/a"} {r.error ? `- ${r.error}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

