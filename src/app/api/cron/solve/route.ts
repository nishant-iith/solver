import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runSolveFlow } from "@/lib/solve-engine";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        if (!supabase) {
            return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
        }

        const { data: settings, error } = await supabase
            .from('automation_settings')
            .select('*')
            .eq('is_active', true)
            .single();

        if (error || !settings) {
            return NextResponse.json({ message: "No active automation settings found." });
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (settings.last_solved_date === todayStr) {
            return NextResponse.json({ message: "Already solved for today." });
        }

        let targetTime = settings.target_time ? new Date(settings.target_time) : null;

        if (!targetTime || targetTime.toISOString().split('T')[0] !== todayStr) {
            const target = new Date();
            const hourOffset = 2.5;
            const totalMinutesStart = 8 * 60;
            const totalMinutesEnd = 24 * 60;
            const randomMinutes = totalMinutesStart + Math.floor(Math.random() * (totalMinutesEnd - totalMinutesStart));

            target.setUTCHours(0, randomMinutes - (5.5 * 60), 0, 0);

            await supabase.from('automation_settings')
                .update({ target_time: target.toISOString() })
                .eq('id', settings.id);

            if (settings.telegram_token && settings.telegram_chat_id) {
                const istTime = target.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
                await sendTelegramMessage(settings.telegram_token, settings.telegram_chat_id,
                    `🎯 <b>POTD Scheduled!</b>\n\nI have scheduled today's Problem of the Day for <b>${istTime} IST</b>. See you then! 🤖`
                );
            }

            return NextResponse.json({ message: "Generated new target time: " + target.toISOString() });
        }

        if (now < targetTime) {
            return NextResponse.json({ message: "Waiting for target time: " + targetTime.toISOString() });
        }

        // PERFORM THE SOLVE
        const result = await runSolveFlow({
            leetcode_session: settings.leetcode_session,
            csrf_token: settings.csrf_token,
            gemini_key: settings.gemini_api_key || process.env.GEMINI_API_KEY || "",
            tg_token: settings.telegram_token,
            tg_chat_id: settings.telegram_chat_id,
            mode: "potd"
        });

        if (result.status === "Submitted") {
            await supabase.from('automation_settings')
                .update({ last_solved_date: todayStr })
                .eq('id', settings.id);
        }

        return NextResponse.json(result);

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
