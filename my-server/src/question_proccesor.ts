interface ApiResponse {
    response_code: number;
    results: ApiResult[];
}

interface ApiResult {
    category: string;
    type: string;
    difficulty: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
}

interface ConvertedData {
    question: string;
    answers: string[];
    correctAnswer: string;
}
export function convertApiResponse(response: ApiResponse): {
    question: string;
    answers: string[];
    correctAnswer: string;
    category: string
} {
    if (response.results.length === 0) {
        throw new Error('No results found in the API response.');
    }

    const result = response.results[0];
    const { question, correct_answer, incorrect_answers, category } = result;

    // Combine correct and incorrect answers and shuffle them
    const allAnswers = [correct_answer, ...incorrect_answers];

    return {
        question: question,
        answers: allAnswers,
        correctAnswer: correct_answer,
        category: category
    };
}