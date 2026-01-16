import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { getCurrentUser } from "@/lib/leetcode";

export const maxDuration = 10; // Keep low, we're just queuing now

// Helper to invoke Supabase Edge Function
async function invokeProcessJob(jobId: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing Supabase env vars");
        return;
    }

    // Fire and forget - don't await, just invoke
    fetch(`${supabaseUrl}/functions/v1/process-solve-job`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ job_id: jobId }),
    }).catch(err => console.error("Edge Function invoke error:", err));
}

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

        // Update ID immediately
        if (updateId) {
            await supabase
                .from('automation_settings')
                .update({ last_telegram_update_id: updateId })
                .eq('id', settings.id);
        }

        const botToken = settings.telegram_token;

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
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Bot is Paused!</b>\n\nUse /start to re-enable automation.");
                    return NextResponse.json({ ok: true });
                }

                // Queue job instead of processing
                const { data: job, error: jobError } = await supabase
                    .from('solve_jobs')
                    .insert({
                        settings_id: settings.id,
                        platform: 'leetcode',
                        mode: 'potd',
                        status: 'pending'
                    })
                    .select()
                    .single();

                if (jobError || !job) {
                    console.error("Failed to create job:", jobError);
                    await sendTelegramMessage(botToken, chatId, "❌ Failed to queue job. Please try again.");
                    return NextResponse.json({ ok: true });
                }

                await sendTelegramMessage(botToken, chatId, "🔄 <b>Job Queued!</b>\n\nProcessing POTD... You'll receive a notification when done.");

                // Invoke Edge Function asynchronously
                invokeProcessJob(job.id);
            }
            else if (text === "/next") {
                if (!settings.is_active) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Bot is Paused!</b>\n\nUse /start to re-enable automation.");
                    return NextResponse.json({ ok: true });
                }

                // Queue job instead of processing
                const { data: job, error: jobError } = await supabase
                    .from('solve_jobs')
                    .insert({
                        settings_id: settings.id,
                        platform: 'leetcode',
                        mode: 'next',
                        status: 'pending'
                    })
                    .select()
                    .single();

                if (jobError || !job) {
                    console.error("Failed to create job:", jobError);
                    await sendTelegramMessage(botToken, chatId, "❌ Failed to queue job. Please try again.");
                    return NextResponse.json({ ok: true });
                }

                await sendTelegramMessage(botToken, chatId, "🔄 <b>Job Queued!</b>\n\nFinding and solving next problem... You'll receive a notification when done.");

                // Invoke Edge Function asynchronously
                invokeProcessJob(job.id);
            }
            else if (text === "/cf") {
                if (!settings.cf_handle || !settings.cf_jsessionid || !settings.cf_csrf_token) {
                    await sendTelegramMessage(botToken, chatId, "⚠️ <b>Codeforces Setup Required!</b>\n\nPlease add your CF Handle, JSESSIONID, and CSRF Token in the app settings.");
                    return NextResponse.json({ ok: true });
                }

                await sendTelegramMessage(botToken, chatId, "⚠️ <b>Codeforces</b> is currently limited due to IP restrictions. Use /solve or /next for LeetCode.");
            }
            else if (text === "/status") {
                await sendTelegramMessage(botToken, chatId, "🔍 <b>Checking session...</b>");
                try {
                    const user = await getCurrentUser(settings.leetcode_session, settings.csrf_token);
                    const active = settings.is_active ? "🟢 Active" : "🔴 Inactive";
                    const sessionHealth = user ? `✅ Healthy (${user.username})` : "❌ Expired";

                    // Check pending jobs
                    const { count } = await supabase
                        .from('solve_jobs')
                        .select('*', { count: 'exact', head: true })
                        .eq('settings_id', settings.id)
                        .eq('status', 'pending');

                    await sendTelegramMessage(botToken, chatId,
                        `📈 <b>Bot Status:</b> ${active}\n` +
                        `👤 <b>LeetCode Session:</b> ${sessionHealth}\n` +
                        `📅 <b>Last Solved:</b> ${settings.last_solved_date || "Never"}\n` +
                        `⏳ <b>Pending Jobs:</b> ${count || 0}`
                    );
                } catch (err: any) {
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Error checking status:</b> ${err.message}`);
                }
            }
            else {
                await sendTelegramMessage(botToken, chatId, "❓ Unknown command. Send /help to see available commands.");
            }

        } catch (err: any) {
            console.error("Command error:", err);
        }

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error("Webhook Error:", err);
        return NextResponse.json({ ok: true });
    }
}
