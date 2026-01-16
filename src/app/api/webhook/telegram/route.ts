import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runSolveFlow } from "@/lib/solve-engine";
import { sendTelegramMessage } from "@/lib/telegram";
import { getCurrentUser } from "@/lib/leetcode";

export const maxDuration = 60; // Vercel Pro: extend timeout to 60s

export async function POST(req: NextRequest) {
    console.log("WEBHOOK: Received request");
    try {
        const payload = await req.json();
        console.log("WEBHOOK: Payload parsed, update_id:", payload.update_id);

        const message = payload.message;
        if (!message || !message.text) {
            console.log("WEBHOOK: No message or text, returning");
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id.toString();
        const text = message.text.trim();
        console.log("WEBHOOK: Chat ID:", chatId, "Text:", text);

        if (!supabase) {
            console.log("WEBHOOK: Supabase not configured");
            return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
        }

        const { data: settings, error } = await supabase
            .from('automation_settings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .single();

        console.log("WEBHOOK: Supabase query result - error:", error, "settings:", settings?.id);

        if (error || !settings) {
            console.log("WEBHOOK: No settings found for chat, sending unauthorized message");
            await sendTelegramMessage(process.env.TELEGRAM_BOT_TOKEN || "", chatId, "⚠️ You are not authorized to use this bot. Please link your Chat ID in the web app.");
            return NextResponse.json({ ok: true });
        }

        // DUPLICATION CHECK
        const updateId = payload.update_id;

        if (updateId && settings.last_telegram_update_id === updateId) {
            console.log("Ignoring duplicate update:", updateId);
            return NextResponse.json({ ok: true });
        }

        // PROCESSING LOCK CHECK
        if (settings.processing_started_at) {
            const lockTime = new Date(settings.processing_started_at).getTime();
            const now = Date.now();
            if (now - lockTime < 60000) {
                console.log("Ignored: Processing Lock Active");
                return NextResponse.json({ ok: true });
            }
        }

        // Update ID and lock immediately
        if (updateId) {
            await supabase
                .from('automation_settings')
                .update({
                    last_telegram_update_id: updateId,
                    processing_started_at: new Date().toISOString()
                })
                .eq('id', settings.id);
        }

        const botToken = settings.telegram_token;
        const geminiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY || "";

        try {
            // Handle Commands
            if (text === "/help") {
                await sendTelegramMessage(botToken, chatId,
                    `👋 <b>Welcome to LeetCode Solver!</b>\n\n` +
                    `I can help you solve problems directly from Telegram.\n\n` +
                    `🚀 <b>Commands:</b>\n` +
                    `• /start - Re-enable automation\n` +
                    `• /stop - Pause all automation\n` +
                    `• /solve - Solve today's POTD\n` +
                    `• /next - Solve the next free algorithm\n` +
                    `• /cf - Solve random Codeforces\n` +
                    `• /status - Check your session status`
                );
            }
            else if (text === "/start") {
                await supabase.from('automation_settings').update({ is_active: true }).eq('id', settings.id);
                await sendTelegramMessage(botToken, chatId, "✅ <b>Bot Activated!</b>\n\nAutomation is now enabled. I'm ready to solve problems!");
            }
            else if (text === "/stop") {
                await supabase.from('automation_settings').update({ is_active: false }).eq('id', settings.id);
                await sendTelegramMessage(botToken, chatId, "🛑 <b>Bot Stopped!</b>\n\nI have paused all automation. Use /start to re-enable.");
            }

            else if (text === "/solve") {
                if (!settings.is_active) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Bot is Paused!</b>\n\nUse the web app to re-enable automation.");
                    return NextResponse.json({ ok: true });
                }
                await sendTelegramMessage(botToken, chatId, "🤖 <b>Processing POTD...</b> Please wait.");
                try {
                    const result = await runSolveFlow({
                        leetcode_session: settings.leetcode_session,
                        csrf_token: settings.csrf_token,
                        gemini_key: geminiKey,
                        tg_token: botToken,
                        tg_chat_id: chatId,
                        mode: "potd",
                        settings_id: settings.id
                    });

                    if (result.status === "ALREADY_SOLVED") {
                        await sendTelegramMessage(botToken, chatId, "✅ Today's POTD is already solved!");
                    }
                } catch (err: any) {
                    console.error("Solve Error:", err);
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b> ${err.message}`);
                }
            }
            else if (text === "/next") {
                if (!settings.is_active) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Bot is Paused!</b>\n\nUse the web app to re-enable automation.");
                    return NextResponse.json({ ok: true });
                }
                await sendTelegramMessage(botToken, chatId, "🤖 <b>Finding next problem...</b> This may take a minute.");
                try {
                    const result = await runSolveFlow({
                        leetcode_session: settings.leetcode_session,
                        csrf_token: settings.csrf_token,
                        gemini_key: geminiKey,
                        tg_token: botToken,
                        tg_chat_id: chatId,
                        mode: "next",
                        settings_id: settings.id
                    });

                    if (result.status === "ALL_SOLVED") {
                        await sendTelegramMessage(botToken, chatId, "🏆 You've solved everything! No more free algorithms left.");
                    }
                } catch (err: any) {
                    console.error("Next Error:", err);
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b> ${err.message}`);
                }
            }
            else if (text === "/cf") {
                if (!settings.cf_handle || !settings.cf_jsessionid || !settings.cf_csrf_token) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Codeforces Setup Required!</b>\n\nPlease add your CF Handle, JSESSIONID, and CSRF Token in the app settings.");
                    return NextResponse.json({ ok: true });
                }

                await sendTelegramMessage(botToken, chatId, "🤖 <b>Solving Random Codeforces...</b>");
                try {
                    await runSolveFlow({
                        platform: "codeforces",
                        leetcode_session: settings.leetcode_session,
                        csrf_token: settings.csrf_token,
                        gemini_key: geminiKey,
                        tg_token: botToken,
                        tg_chat_id: chatId,
                        mode: "next",
                        cf_handle: settings.cf_handle,
                        cf_jsessionid: settings.cf_jsessionid,
                        cf_csrf_token: settings.cf_csrf_token,
                        settings_id: settings.id
                    });
                } catch (err: any) {
                    console.error("CF Error:", err);
                    await sendTelegramMessage(botToken, chatId, `❌ <b>CF Error:</b> ${err.message}`);
                }
            }
            else if (text === "/status") {
                await sendTelegramMessage(botToken, chatId, "🔍 <b>Checking session...</b>");
                try {
                    const user = await getCurrentUser(settings.leetcode_session, settings.csrf_token);
                    const active = settings.is_active ? "🟢 Active" : "🔴 Inactive";
                    const sessionHealth = user ? `✅ Healthy (${user.username})` : "❌ Expired";
                    await sendTelegramMessage(botToken, chatId,
                        `📈 <b>Bot Status:</b> ${active}\n` +
                        `👤 <b>LeetCode Session:</b> ${sessionHealth}\n` +
                        `📅 <b>Last Solved:</b> ${settings.last_solved_date || "Never"}`
                    );
                } catch (err: any) {
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Error checking status:</b> ${err.message}`);
                }
            }
            else {
                // Unknown command - send help
                await sendTelegramMessage(botToken, chatId, "❓ Unknown command. Send /help to see available commands.");
            }

        } finally {
            // ALWAYS RELEASE LOCK
            await supabase
                .from('automation_settings')
                .update({ processing_started_at: null })
                .eq('id', settings.id);
        }

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error("Webhook Error:", err);
        return NextResponse.json({ ok: true });
    }
}
