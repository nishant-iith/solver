export async function getPOTD(sessionString?: string, csrfToken?: string) {
    const query = `
    query questionOfToday {
      activeDailyCodingChallengeQuestion {
        date
        link
        userStatus
        question {
          title
          titleSlug
          difficulty
          status
        }
      }
    }
  `;

    const headers: any = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    };

    if (sessionString && csrfToken) {
        headers["Cookie"] = `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`;
        headers["X-CSRFToken"] = csrfToken;
    }

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
    });

    const data = await res.json();
    return data.data.activeDailyCodingChallengeQuestion;
}

export async function getNextUnsolved(sessionString: string, csrfToken: string) {
    const query = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList: questionList(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
        filters: $filters
      ) {
        total: totalNum
        questions: data {
          acRate
          difficulty
          freqBar
          frontendQuestionId: questionFrontendId
          isFavor
          paidOnly: isPaidOnly
          status
          title
          titleSlug
          topicTags {
            name
            id
            slug
          }
          hasSolution
          hasVideoSolution
        }
      }
    }
  `;

    const variables = {
        categorySlug: "all-code-essentials",
        limit: 1,
        skip: 0,
        filters: {
            status: "NOT_STARTED",
            premiumOnly: false
        }
    };

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
            "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ query, variables }),
    });

    const data = await res.json();
    return data.data.problemsetQuestionList.questions[0]; // Return the first unsolved one
}

export async function getQuestionData(titleSlug: string) {
    const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        content
        codeSnippets {
          lang
          langSlug
          code
        }
        sampleTestCase
      }
    }
  `;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ query, variables: { titleSlug } }),
    });

    return (await res.json()).data.question;
}

export async function submitSolution(
    sessionString: string,
    csrfToken: string,
    questionId: string,
    lang: string,
    typedCode: string,
    titleSlug: string
) {
    const url = `https://leetcode.com/problems/${titleSlug}/submit/`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
            "X-CSRFToken": csrfToken,
            "Referer": `https://leetcode.com/problems/${titleSlug}/`,
            "Origin": "https://leetcode.com"
        },
        body: JSON.stringify({
            lang,
            question_id: questionId,
            typed_code: typedCode,
        }),
    });

    // LeetCode returns a submission ID first, then we might need to poll for status.
    // But often for immediate result (or error), we get something.
    // Actually, submit returns { submission_id: number }.
    // Then we need to check checkSubmission/${submission_id}

    return await res.json();
}

export async function checkSubmission(submissionId: number, sessionString: string, csrfToken: string) {
    // Simple pause before check
    await new Promise(r => setTimeout(r, 2000));

    const res = await fetch(`https://leetcode.com/submissions/detail/${submissionId}/check/`, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
            "X-CSRFToken": csrfToken,
        }
    });

    return await res.json();
}
