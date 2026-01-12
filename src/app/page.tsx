"use client";

import { useState, useEffect } from "react";
import styles from "./Home.module.css";
import { FaCog, FaBrain, FaCheck, FaTelegramPlane, FaRobot } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"credentials" | "automation">("credentials");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to Solve");
  const [result, setResult] = useState<any>(null);

  const [credentials, setCredentials] = useState({
    session: "",
    csrf: "",
    gemini: "",
    tg_token: "",
    tg_chat_id: "",
    auto_solve: false,
    cf_handle: "",
    cf_jsessionid: "",
    cf_csrf_token: "",
    cf_auto_solve: false,
  });

  useEffect(() => {
    const session = localStorage.getItem("lc_session") || "";
    const csrf = localStorage.getItem("lc_csrf") || "";
    const gemini = localStorage.getItem("gemini_key") || "";
    const tg_token = localStorage.getItem("tg_token") || "";
    const tg_chat_id = localStorage.getItem("tg_chat_id") || "";
    const auto_solve = localStorage.getItem("auto_solve") === "true";
    const cf_handle = localStorage.getItem("cf_handle") || "";
    const cf_jsessionid = localStorage.getItem("cf_jsessionid") || "";
    const cf_csrf_token = localStorage.getItem("cf_csrf_token") || "";
    const cf_auto_solve = localStorage.getItem("cf_auto_solve") === "true";

    setCredentials({ session, csrf, gemini, tg_token, tg_chat_id, auto_solve, cf_handle, cf_jsessionid, cf_csrf_token, cf_auto_solve });
  }, []);

  const saveSettings = async () => {
    localStorage.setItem("lc_session", credentials.session);
    localStorage.setItem("lc_csrf", credentials.csrf);
    localStorage.setItem("gemini_key", credentials.gemini);
    localStorage.setItem("tg_token", credentials.tg_token);
    localStorage.setItem("tg_chat_id", credentials.tg_chat_id);
    localStorage.setItem("auto_solve", credentials.auto_solve.toString());
    localStorage.setItem("cf_handle", credentials.cf_handle);
    localStorage.setItem("cf_jsessionid", credentials.cf_jsessionid);
    localStorage.setItem("cf_csrf_token", credentials.cf_csrf_token);
    localStorage.setItem("cf_auto_solve", credentials.cf_auto_solve.toString());

    // Sync to Supabase if automation is enabled
    if (credentials.auto_solve || credentials.cf_auto_solve) {
      try {
        if (!supabase) {
          console.error("Supabase client not initialized. Check your environment variables.");
          return;
        }

        const { error } = await supabase
          .from('automation_settings')
          .upsert({
            id: 1, // Single user mode for now
            leetcode_session: credentials.session,
            csrf_token: credentials.csrf,
            gemini_api_key: credentials.gemini,
            telegram_token: credentials.tg_token,
            telegram_chat_id: credentials.tg_chat_id,
            is_active: credentials.auto_solve,
            cf_handle: credentials.cf_handle,
            cf_jsessionid: credentials.cf_jsessionid,
            cf_csrf_token: credentials.cf_csrf_token,
            cf_active: credentials.cf_auto_solve
          });

        if (error) console.error("Supabase Sync Error:", error);
      } catch (e) {
        console.error("Supabase Connection Error:", e);
      }
    }

    setShowSettings(false);
  };

  const handleSolve = async (mode: "potd" | "next" = "potd") => {
    if (!credentials.session || !credentials.csrf) {
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setStatus(mode === "potd" ? "Analyzing POTD..." : "Finding Next Unsolved...");

    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "leetcode",
          mode,
          leetcode_session: credentials.session,
          csrf_token: credentials.csrf,
          gemini_key: credentials.gemini,
          tg_token: credentials.tg_token,
          tg_chat_id: credentials.tg_chat_id,
        })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.status === "Submitted") {
          setStatus("Solved! " + data.problem);
          setResult(data);
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#ffd700", "#ffffff", "#ffaa00"]
          });
        } else if (data.status === "ALL_SOLVED") {
          setStatus("All caught up! Great job.");
        } else {
          setStatus("Status: " + data.status);
        }
      } else {
        setStatus("Error: " + data.error);
        if (data.error?.toLowerCase().includes("missing") || data.error?.toLowerCase().includes("failed")) {
          setShowSettings(true);
        }
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

      <div className={styles.logo}>
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ color: "var(--primary)", letterSpacing: "4px", marginBottom: "40px" }}
        >
          {credentials.auto_solve ? "AUTO-SOLVER" : "SOLVER"}
        </motion.h1>
      </div>

      <motion.button
        className={styles.solveButton}
        onClick={() => handleSolve("potd")}
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
            {result ? <FaCheck size={50} /> : "POTD"}
          </span>
        )}
      </motion.button>

      <button
        className={styles.secondaryButton}
        onClick={() => handleSolve("next")}
        disabled={loading}
      >
        Solve Next Unsolved
      </button>

      <div className={styles.statusText}>
        {status}
        {result && (
          <div style={{ fontSize: "0.8rem", marginTop: "10px", color: "var(--primary)" }}>
            {result.problem} <br />
            Result: {JSON.stringify(result.submission_result?.state || "Accepted")}
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
              <div className={styles.settingsTabs}>
                <div
                  className={`${styles.tab} ${activeTab === 'credentials' ? styles.active : ''}`}
                  onClick={() => setActiveTab('credentials')}
                >
                  Credentials
                </div>
                <div
                  className={`${styles.tab} ${activeTab === 'automation' ? styles.active : ''}`}
                  onClick={() => setActiveTab('automation')}
                >
                  Automation
                </div>
              </div>

              {activeTab === 'credentials' ? (
                <>
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
                    <label>Gemini API Key (Optional)</label>
                    <input
                      className={styles.input}
                      type="password"
                      value={credentials.gemini}
                      onChange={(e) => setCredentials({ ...credentials, gemini: e.target.value })}
                      placeholder="AIza... (Leave empty to use server env)"
                    />
                  </div>
                </>
              ) : (
                <div className={styles.automationSection}>
                  <div className={styles.toggleContainer}>
                    <label>Enable Auto-Solve</label>
                    <input
                      type="checkbox"
                      className={styles.toggle}
                      checked={credentials.auto_solve}
                      onChange={(e) => setCredentials({ ...credentials, auto_solve: e.target.checked })}
                    />
                  </div>
                  <p className={styles.helperText}>
                    * Automation requires Supabase to store tokens securely for server access.
                  </p>

                  <div className={styles.inputGroup}>
                    <label><FaTelegramPlane style={{ marginRight: '5px' }} /> Telegram Bot Token</label>
                    <input
                      className={styles.input}
                      type="password"
                      value={credentials.tg_token}
                      onChange={(e) => setCredentials({ ...credentials, tg_token: e.target.value })}
                      placeholder="123456789:ABCDEF..."
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label><FaRobot style={{ marginRight: '5px' }} /> Telegram Chat ID</label>
                    <input
                      className={styles.input}
                      type="text"
                      value={credentials.tg_chat_id}
                      onChange={(e) => setCredentials({ ...credentials, tg_chat_id: e.target.value })}
                      placeholder="123456789"
                    />
                  </div>
                  <p className={styles.helperText}>
                    Get your chat ID by messaging @userinfobot on Telegram.
                  </p>

                  <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

                  <h3 style={{ color: 'var(--foreground)', marginBottom: '15px' }}>Codeforces (Beta)</h3>

                  <div className={styles.toggleContainer}>
                    <label>Enable CF Auto-Solve</label>
                    <input
                      type="checkbox"
                      className={styles.toggle}
                      checked={credentials.cf_auto_solve}
                      onChange={(e) => setCredentials({ ...credentials, cf_auto_solve: e.target.checked })}
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>CF Handle</label>
                    <input
                      className={styles.input}
                      type="text"
                      value={credentials.cf_handle}
                      onChange={(e) => setCredentials({ ...credentials, cf_handle: e.target.value })}
                      placeholder="tourist"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>CF JSESSIONID</label>
                    <input
                      className={styles.input}
                      type="password"
                      value={credentials.cf_jsessionid}
                      onChange={(e) => setCredentials({ ...credentials, cf_jsessionid: e.target.value })}
                      placeholder="Look in browser cookies"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label>CF CSRF Token (39ce7...)</label>
                    <input
                      className={styles.input}
                      type="password"
                      value={credentials.cf_csrf_token}
                      onChange={(e) => setCredentials({ ...credentials, cf_csrf_token: e.target.value })}
                      placeholder="From page source or cookies"
                    />
                  </div>
                </div>
              )}

              <button className={styles.saveButton} onClick={saveSettings}>
                Save Settings
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
