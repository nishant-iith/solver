import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runSolveFlow } from "@/lib/solve-engine";
import { sendTelegramMessage } from "@/lib/telegram";
import { getCurrentUser } from "@/lib/leetcode";

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        // Telegram Webhook payload structure
        const message = payload.message;
        if (!message || !message.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id.toString();
        const text = message.text.trim();

        // 1. Fetch settings from Supabase
        if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

        const { data: settings, error } = await supabase
            .from('automation_settings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .single();

        if (error || !settings) {
            // Unrecognized user
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
            // If processing started less than 60 seconds ago, assume busy
            if (now - lockTime < 60000) {
                console.log("Ignored: Processing Lock Active");
                return NextResponse.json({ ok: true });
            }
        }

        // Update last_telegram_update_id and processing_started_at immediately
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
            // 2. Handle Commands
            if (text === "/start" || text === "/help") {
                await sendTelegramMessage(botToken, chatId,
                    `👋 <b>Welcome to LeetCode Solver!</b>\n\n` +
                    `I can help you solve problems directly from Telegram.\n\n` +
                    `🚀 <b>Commands:</b>\n` +
                    `• /stop - EMERGENCY STOP\n` +
                    `• /solve - Solve today's POTD\n` +
                    `• /next - Solve the next free algorithm\n` +
                    `• /status - Check your session status`
                );
            }
            else if (text === "/stop") {
                await supabase.from('automation_settings').update({ is_active: false }).eq('id', settings.id);
                await sendTelegramMessage(botToken, chatId, "🛑 <b>Bot Stopped!</b>\n\nI have paused all automation and commands. Use the web app or `/start` to re-enable.");
            }
            else if (text === "/solve") {
                if (!settings.is_active) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Bot is Paused!</b>\n\nUse `/start` or the web app to re-enable automation.");
                    // Release Lock
                    await supabase.from('automation_settings').update({ processing_started_at: null }).eq('id', settings.id);
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
                        mode: "potd"
                    });

                    if (result.status === "ALREADY_SOLVED") {
                        await sendTelegramMessage(botToken, chatId, "✅ Today's POTD is already solved!");
                    }
                } catch (err: any) {
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b> ${err.message}`);
                }
            }
            else if (text === "/next") {
                if (!settings.is_active) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Bot is Paused!</b>\n\nUse `/start` or the web app to re-enable automation.");
                    // Release Lock
                    await supabase.from('automation_settings').update({ processing_started_at: null }).eq('id', settings.id);
                    return NextResponse.json({ ok: true });
                }
                await sendTelegramMessage(botToken, chatId, "🤖 <b>Finding and solving next problem...</b> This may take a minute.");
                try {
                    const result = await runSolveFlow({
                        leetcode_session: settings.leetcode_session,
                        csrf_token: settings.csrf_token,
                        gemini_key: geminiKey,
                        tg_token: botToken,
                        tg_chat_id: chatId,
                        mode: "next"
                    });

                    if (result.status === "ALL_SOLVED") {
                        await sendTelegramMessage(botToken, chatId, "🏆 You've solved everything! No more free algorithms left.");
                    }
                } catch (err: any) {
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b> ${err.message}`);
                }
            }
            else if (text === "/status") {
                await sendTelegramMessage(botToken, chatId, "🔍 <b>Checking session health...</b>");
                const user = await getCurrentUser(settings.leetcode_session, settings.csrf_token);
                // ... same status logic
                const active = settings.is_active ? "🟢 Active" : "🔴 Inactive";
                const sessionHealth = user ? `✅ Healthy (${user.username})` : "❌ Expired";
                await sendTelegramMessage(botToken, chatId,
                    `📈 <b>Bot Status:</b> ${active}\n` +
                    `👤 <b>LeetCode Session:</b> ${sessionHealth}\n` +
                    `📅 <b>Last Solved:</b> ${settings.last_solved_date || "Never"}`
                );
            }

        } finally {
            // ALWAYS RELEASE LOCK
            if (text === "/solve" || text === "/next") {
                await supabase
                    .from('automation_settings')
                    .update({ processing_started_at: null })
                    .eq('id', settings.id);
            }
        }

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error("Webhook Error:", err);
        return NextResponse.json({ ok: true }); // Always return OK to Telegram to avoid retries
    }
}
