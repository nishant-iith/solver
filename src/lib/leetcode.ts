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
    categorySlug: "", // General search to find all unsolved problems
    limit: 100,
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
  const questions = data.data?.problemsetQuestionList?.questions || [];

  // Find first non-premium algorithmic question
  const target = questions.find((q: any) => {
    if (q.paidOnly) return false;

    // Skip Database / Shell / Concurrency
    const nonCppTags = ["Database", "Shell", "Concurrency"];
    const isNonCpp = q.topicTags.some((tag: any) => nonCppTags.includes(tag.name));
    if (isNonCpp) return false;

    // Ensure it's an algorithmic problem (to guarantee C++ snippet)
    const isAlgo = q.topicTags.length === 0 || q.topicTags.some((t: any) =>
      ["algorithms", "dynamic-programming", "array", "string", "hash-table"].includes(t.slug)
    );

    return isAlgo;
  });

  return target;
}

export async function getQuestionData(titleSlug: string) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        difficulty
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
  // Poll for result with max 10 attempts (30 seconds total)
  const maxAttempts = 10;
  const pollInterval = 3000; // 3 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const res = await fetch(`https://leetcode.com/submissions/detail/${submissionId}/check/`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cookie": `LEETCODE_SESSION=${sessionString}; csrftoken=${csrfToken};`,
        "X-CSRFToken": csrfToken,
      }
    });

    const result = await res.json();

    // Check if submission is still pending
    if (result.state && result.state !== "PENDING" && result.state !== "STARTED") {
      return result;
    }

    console.log(`Submission check attempt ${attempt + 1}/${maxAttempts}: ${result.state || 'no state'}`);
  }

  // If we exhausted all attempts, return last result
  return { state: "TIMEOUT", message: "Submission timed out waiting for result" };
}


export async function getCurrentUser(sessionString: string, csrfToken: string) {
  const query = `
    query currentUser {
      user {
        username
        isPremium
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
  return data.data?.user;
}
