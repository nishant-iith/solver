import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Keep low since we're just queuing

// Helper to invoke Supabase Edge Function
async function invokeProcessJob(jobId: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing Supabase env vars");
        return;
    }

    // Fire and forget
    fetch(`${supabaseUrl}/functions/v1/process-solve-job`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ job_id: jobId }),
    }).catch(err => console.error("Edge Function invoke error:", err));
}

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

        // Already solved today?
        if (settings.last_solved_date === todayStr) {
            return NextResponse.json({ message: "Already solved for today." });
        }

        let targetTime = settings.target_time ? new Date(settings.target_time) : null;

        // Generate new target time if not set for today (8 AM - 12 PM IST = 2:30 AM - 6:30 AM UTC)
        if (!targetTime || targetTime.toISOString().split('T')[0] !== todayStr) {
            const target = new Date();

            // Random time between 8:00 AM and 12:00 PM IST
            // IST is UTC+5:30, so 8 AM IST = 2:30 AM UTC, 12 PM IST = 6:30 AM UTC
            const startMinutesIST = 8 * 60;  // 8:00 AM
            const endMinutesIST = 12 * 60;   // 12:00 PM
            const randomMinutesIST = startMinutesIST + Math.floor(Math.random() * (endMinutesIST - startMinutesIST));

            // Convert IST to UTC (subtract 5 hours 30 minutes = 330 minutes)
            const randomMinutesUTC = randomMinutesIST - 330;

            target.setUTCHours(0, 0, 0, 0);
            target.setUTCMinutes(randomMinutesUTC);

            await supabase.from('automation_settings')
                .update({ target_time: target.toISOString() })
                .eq('id', settings.id);

            if (settings.telegram_token && settings.telegram_chat_id) {
                const istTime = target.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                await sendTelegramMessage(settings.telegram_token, settings.telegram_chat_id,
                    `🎯 <b>POTD Scheduled!</b>\n\nToday's Problem of the Day will be solved at <b>${istTime} IST</b>. See you then! 🤖`
                );
            }

            return NextResponse.json({ message: "Generated new target time: " + target.toISOString() });
        }

        // Not time yet?
        if (now < targetTime) {
            return NextResponse.json({ message: "Waiting for target time: " + targetTime.toISOString() });
        }

        // Check if there's already a pending or processing job for today's POTD
        const { data: existingJob } = await supabase
            .from('solve_jobs')
            .select('id')
            .eq('settings_id', settings.id)
            .eq('mode', 'potd')
            .in('status', ['pending', 'processing'])
            .gte('created_at', todayStr + 'T00:00:00Z') // Created today
            .single();

        if (existingJob) {
            return NextResponse.json({ message: "Job already pending/processing for today." });
        }

        // TIME TO SOLVE - Queue the job instead of processing directly
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
            return NextResponse.json({ error: "Failed to queue job" }, { status: 500 });
        }

        // Invoke Edge Function asynchronously
        invokeProcessJob(job.id);

        return NextResponse.json({
            message: "POTD job queued successfully",
            job_id: job.id
        });

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
