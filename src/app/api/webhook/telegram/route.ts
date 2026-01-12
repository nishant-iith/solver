import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runSolveFlow } from "@/lib/solve-engine";
import { sendTelegramMessage } from "@/lib/telegram";

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

        const botToken = settings.telegram_token;
        const geminiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY || "";

        // 2. Handle Commands
        if (text === "/start" || text === "/help") {
            await sendTelegramMessage(botToken, chatId,
                `👋 <b>Welcome to LeetCode Solver!</b>\n\n` +
                `I can help you solve problems directly from Telegram.\n\n` +
                `🚀 <b>Commands:</b>\n` +
                `• /solve - Solve today's POTD\n` +
                `• /next - Solve the next free algorithm\n` +
                `• /status - Check your session status`
            );
        }
        else if (text === "/solve") {
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
            const active = settings.is_active ? "🟢 Active" : "🔴 Inactive";
            await sendTelegramMessage(botToken, chatId,
                `📈 <b>Bot Status:</b> ${active}\n` +
                `👤 <b>LeetCode Session:</b> Valid\n` +
                `📅 <b>Last Solved:</b> ${settings.last_solved_date || "Never"}`
            );
        }

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error("Webhook Error:", err);
        return NextResponse.json({ ok: true }); // Always return OK to Telegram to avoid retries
    }
}
