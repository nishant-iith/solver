"use client";

import { useState, useEffect } from "react";
import styles from "./Home.module.css";
import { FaCog, FaBrain, FaCheck, FaExclamationTriangle } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to Solve");
  const [result, setResult] = useState<any>(null);
  const [credentials, setCredentials] = useState({
    session: "",
    csrf: "",
    gemini: ""
  });

  useEffect(() => {
    const session = localStorage.getItem("lc_session") || "";
    const csrf = localStorage.getItem("lc_csrf") || "";
    const gemini = localStorage.getItem("gemini_key") || "";
    setCredentials({ session, csrf, gemini });

    // Only require LeetCode credentials for auto-open
    if (!session || !csrf) {
      setShowSettings(true);
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem("lc_session", credentials.session);
    localStorage.setItem("lc_csrf", credentials.csrf);
    localStorage.setItem("gemini_key", credentials.gemini);
    setShowSettings(false);
  };

  const handleSolve = async () => {
    // Check if session/csrf are present. Gemini key is optional (might be in env).
    if (!credentials.session || !credentials.csrf) {
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setStatus("Analyzing POTD...");

    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leetcode_session: credentials.session,
          csrf_token: credentials.csrf,
          gemini_key: credentials.gemini
        })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.status === "Submitted") {
          setStatus("Solved! " + data.problem);
          setResult(data);
        } else if (data.status === "ALL_SOLVED") {
          setStatus("All caught up! Great job.");
        } else {
          setStatus("Status: " + data.status);
        }
      } else {
        setStatus("Error: " + data.error);
      }
    } catch (err) {
      setStatus("Network Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <button
        className={styles.settingsButton}
        onClick={() => setShowSettings(true)}
      >
        <FaCog size={24} />
      </button>

      <motion.button
        className={styles.solveButton}
        onClick={handleSolve}
        disabled={loading}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {loading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            <FaBrain size={50} />
          </motion.div>
        ) : (
          <span>
            {result ? <FaCheck size={50} /> : "SOLVE"}
          </span>
        )}
      </motion.button>

      <div className={styles.statusText}>
        {status}
        {result && (
          <div style={{ fontSize: "0.8rem", marginTop: "10px", color: "var(--primary)" }}>
            {result.problem} <br />
            Result: {JSON.stringify(result.submission_result?.state || "Unknown")}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={styles.modal}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 style={{ marginBottom: "20px", color: "var(--primary)" }}>Configuration</h2>

              <div className={styles.inputGroup}>
                <label>LeetCode Session Cookie</label>
                <input
                  className={styles.input}
                  type="password"
                  value={credentials.session}
                  onChange={(e) => setCredentials({ ...credentials, session: e.target.value })}
                  placeholder="LEETCODE_SESSION=..."
                />
              </div>

              <div className={styles.inputGroup}>
                <label>CSRF Token</label>
                <input
                  className={styles.input}
                  type="password"
                  value={credentials.csrf}
                  onChange={(e) => setCredentials({ ...credentials, csrf: e.target.value })}
                  placeholder="csrftoken=..."
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Gemini API Key (Optional if set in Env)</label>
                <input
                  className={styles.input}
                  type="password"
                  value={credentials.gemini}
                  onChange={(e) => setCredentials({ ...credentials, gemini: e.target.value })}
                  placeholder="AIza... (Leave empty to use server env)"
                />
              </div>

              <button className={styles.saveButton} onClick={saveSettings}>
                Save & Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
