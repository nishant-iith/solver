import { NextRequest, NextResponse } from "next/server";
import { generateSolution } from "@/lib/gemini";
import { getPOTD, getQuestionData, submitSolution, checkSubmission, getNextUnsolved } from "@/lib/leetcode";

export async function POST(req: NextRequest) {
    try {
        const { leetcode_session, csrf_token, gemini_key: body_gemini_key } = await req.json();
        const gemini_key = body_gemini_key || process.env.GEMINI_API_KEY;

        if (!leetcode_session) return NextResponse.json({ error: "Missing LeetCode Session Cookie" }, { status: 400 });
        if (!csrf_token) return NextResponse.json({ error: "Missing CSRF Token" }, { status: 400 });
        if (!gemini_key) return NextResponse.json({ error: "Missing Gemini API Key" }, { status: 400 });

        // 1. Get POTD
        let potd = await getPOTD(leetcode_session, csrf_token);
        let questionSlug = potd.question.titleSlug;
        let questionId = potd.question.id; // POTD request might not return ID directly, need check.
        // Actually question object usually has questionId or similar.
        // Let's rely on getQuestionData for precise ID.

        let problemSource = "POTD";

        // Check if solved
        // userStatus usually returns "Finish" or similar if solved. Or question.status == "ac"?
        // Let's check userStatus from potd response.
        if (potd.userStatus === "Finish") {
            // POTD Solved, try next
            const nextProb = await getNextUnsolved(leetcode_session, csrf_token);
            if (nextProb) {
                questionSlug = nextProb.titleSlug;
                problemSource = "Next Unsolved: " + nextProb.title;
            } else {
                return NextResponse.json({ message: "All problems solved!", status: "ALL_SOLVED" });
            }
        }

        // 2. Get Question Data (Code Snippets)
        const qData = await getQuestionData(questionSlug);
        // Find snippet for C++ or Python. User didn't specify, default to Python3 or C++.
        // Let's prefer C++ as it's faster usually, or Python3 for ease.
        // I'll pick Python3.
        const validLangs = ["python3", "cpp", "java", "javascript"];
        const snippet = qData.codeSnippets.find((s: any) => validLangs.includes(s.langSlug));

        if (!snippet) {
            return NextResponse.json({ error: "No supported language found" }, { status: 400 });
        }

        // 3. Generate Solution
        const solutionCode = await generateSolution(
            gemini_key,
            snippet.lang,
            qData.content,
            snippet.code
        );

        // 4. Submit
        const submission = await submitSolution(
            leetcode_session,
            csrf_token,
            qData.questionId,
            snippet.langSlug,
            solutionCode,
            questionSlug
        );

        if (submission.submission_id) {
            // 5. Check Result
            const result = await checkSubmission(submission.submission_id, leetcode_session, csrf_token);
            return NextResponse.json({
                status: "Submitted",
                submission_result: result,
                problem: problemSource,
                code: solutionCode
            });
        } else {
            return NextResponse.json({ error: "Submission failed", details: submission }, { status: 500 });
        }

    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
