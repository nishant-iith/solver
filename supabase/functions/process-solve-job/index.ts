import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.24.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// LeetCode API functions
async function getPOTD(sessionString: string, csrfToken: string) {
    const query = `
    query dailyCodingQuestionRecords {
      dailyCodingChallengeV2(year: 0, month: 0) {
        challenges { date userStatus question { titleSlug } }
      }
      activeDailyCodingChallengeQuestion {
        date userStatus question { titleSlug }
      }
    }
  `;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
            "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ query }),
    });

    const data = await res.json();
    return data.data.activeDailyCodingChallengeQuestion;
}

async function getNextUnsolved(sessionString: string, csrfToken: string) {
    const query = `
    query problemsetQuestionList($categorySlug:String $limit:Int $skip:Int $filters:QuestionListFilterInput) {
      problemsetQuestionList:questionList(categorySlug:$categorySlug limit:$limit skip:$skip filters:$filters) {
        questions:data { titleSlug isPaidOnly }
      }
    }
  `;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
            "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
            query,
            variables: {
                categorySlug: "algorithms",
                limit: 50,
                skip: 0,
                filters: { status: "NOT_STARTED" },
            },
        }),
    });

    const data = await res.json();
    const questions = data.data?.problemsetQuestionList?.questions || [];
    const freeQuestions = questions.filter((q: any) => !q.isPaidOnly);
    return freeQuestions.length > 0 ? freeQuestions[0] : null;
}

async function getQuestionData(titleSlug: string) {
    const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId questionFrontendId title difficulty content
        codeSnippets { lang langSlug code }
        sampleTestCase
      }
    }
  `;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ query, variables: { titleSlug } }),
    });

    return (await res.json()).data.question;
}

async function submitSolution(
    sessionString: string,
    csrfToken: string,
    questionId: string,
    langSlug: string,
    code: string,
    titleSlug: string
) {
    const res = await fetch(`https://leetcode.com/problems/${titleSlug}/submit/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
            "X-CSRFToken": csrfToken,
            "Referer": `https://leetcode.com/problems/${titleSlug}/`,
        },
        body: JSON.stringify({
            question_id: questionId,
            lang: langSlug,
            typed_code: code,
        }),
    });
    return await res.json();
}

async function checkSubmission(submissionId: number, sessionString: string, csrfToken: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));

        const res = await fetch(`https://leetcode.com/submissions/detail/${submissionId}/check/`, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
                "X-CSRFToken": csrfToken,
            },
        });

        const result = await res.json();
        if (result.state && result.state !== "PENDING" && result.state !== "STARTED") {
            return result;
        }
    }
    return { state: "Submitted", message: "Check your LeetCode profile for results" };
}

// Gemini API function
async function generateSolution(apiKey: string, language: string, problemDescription: string, codeSnippet: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
You are an expert competitive programmer.
Write a complete, optimized solution for the following LeetCode problem in ${language}.
The solution typically involves completing a class method.
Output ONLY the code that should go inside the solution editor. Do not include markdown formatting or explanations.

Problem:
${problemDescription}

Code Snippet:
${codeSnippet}

Your Solution:
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    if (text.startsWith("```")) {
        text = text.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
    }

    return text.trim();
}

// Telegram API function
async function sendTelegramMessage(botToken: string, chatId: string, message: string) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
}

// Main handler
Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { job_id } = await req.json();
        console.log("Processing job:", job_id);

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get job
        const { data: job, error: jobError } = await supabase
            .from("solve_jobs")
            .select("*")
            .eq("id", job_id)
            .single();

        if (jobError || !job) {
            console.error("Job not found:", jobError);
            return new Response(JSON.stringify({ error: "Job not found" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 404,
            });
        }

        // Check if already processing
        if (job.status !== "pending") {
            return new Response(JSON.stringify({ message: "Job already processed" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Mark as processing
        await supabase
            .from("solve_jobs")
            .update({ status: "processing", started_at: new Date().toISOString() })
            .eq("id", job_id);

        // Get settings
        const { data: settings } = await supabase
            .from("automation_settings")
            .select("*")
            .eq("id", job.settings_id)
            .single();

        if (!settings) {
            throw new Error("Settings not found");
        }

        const botToken = settings.telegram_token;
        const chatId = settings.telegram_chat_id;
        const geminiKey = settings.gemini_api_key || Deno.env.get("GEMINI_API_KEY") || "";

        try {
            // LEETCODE FLOW
            let questionSlug = "";
            let problemSource = "";

            if (job.mode === "next") {
                const nextProb = await getNextUnsolved(settings.leetcode_session, settings.csrf_token);
                if (!nextProb) {
                    await sendTelegramMessage(botToken, chatId, "🏆 You've solved everything! No more free algorithms left.");
                    await supabase
                        .from("solve_jobs")
                        .update({ status: "completed", result_state: "ALL_SOLVED", completed_at: new Date().toISOString() })
                        .eq("id", job_id);
                    return new Response(JSON.stringify({ status: "ALL_SOLVED" }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
                questionSlug = nextProb.titleSlug;
                problemSource = "Solve Next";
            } else {
                const potd = await getPOTD(settings.leetcode_session, settings.csrf_token);
                if (potd.userStatus === "Finish") {
                    await sendTelegramMessage(botToken, chatId, "✅ Today's POTD is already solved!");
                    await supabase
                        .from("solve_jobs")
                        .update({ status: "completed", result_state: "ALREADY_SOLVED", completed_at: new Date().toISOString() })
                        .eq("id", job_id);
                    return new Response(JSON.stringify({ status: "ALREADY_SOLVED" }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
                questionSlug = potd.question.titleSlug;
                problemSource = "POTD";
            }

            // Notify generating
            await sendTelegramMessage(botToken, chatId, `🧠 <b>Generating solution for ${questionSlug}...</b>`);

            const qData = await getQuestionData(questionSlug);
            const validLangs = ["cpp", "python3", "java", "javascript"];
            const snippet = qData.codeSnippets.find((s: any) => validLangs.includes(s.langSlug));

            if (!snippet) {
                throw new Error("No supported language found");
            }

            // Update job with problem info
            await supabase
                .from("solve_jobs")
                .update({ problem_title: qData.title, problem_slug: questionSlug })
                .eq("id", job_id);

            const solutionCode = await generateSolution(geminiKey, snippet.lang, qData.content, snippet.code);

            // Notify submitting
            await sendTelegramMessage(botToken, chatId, "📤 <b>Submitting solution...</b>");

            const submission = await submitSolution(
                settings.leetcode_session,
                settings.csrf_token,
                qData.questionId,
                snippet.langSlug,
                solutionCode,
                questionSlug
            );

            if (!submission.submission_id) {
                throw new Error("Submission failed: " + JSON.stringify(submission));
            }

            const result = await checkSubmission(submission.submission_id, settings.leetcode_session, settings.csrf_token);

            // Update last_solved_date if accepted
            if (result.state === "Accepted") {
                const today = new Date().toISOString().split("T")[0];
                await supabase.from("automation_settings").update({ last_solved_date: today }).eq("id", settings.id);
            }

            // Send final notification
            const problemNumber = qData.questionFrontendId || "?";
            const statusEmoji = result.state === "Accepted" ? "✅" : result.state === "Wrong Answer" ? "❌" : "⚠️";

            await sendTelegramMessage(
                botToken,
                chatId,
                `<b>${statusEmoji} LeetCode ${result.state || "Submitted"}!</b>\n\n` +
                `<b>Problem:</b> ${problemNumber}. ${qData.title}\n` +
                `<b>Difficulty:</b> ${qData.difficulty}\n` +
                `<b>Status:</b> ${result.state || "Pending"}`
            );

            // Mark job as completed
            await supabase
                .from("solve_jobs")
                .update({ status: "completed", result_state: result.state, completed_at: new Date().toISOString() })
                .eq("id", job_id);

            return new Response(JSON.stringify({ status: "completed", result: result.state }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        } catch (err: any) {
            console.error("Solve error:", err);
            await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b> ${err.message}`);

            await supabase
                .from("solve_jobs")
                .update({ status: "failed", error_message: err.message, completed_at: new Date().toISOString() })
                .eq("id", job_id);

            return new Response(JSON.stringify({ error: err.message }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            });
        }
    } catch (err: any) {
        console.error("Handler error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
