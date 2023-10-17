import axios from 'axios';
import e from "express";

const BASE = "https://opentdb.com/"
async function fetchOneQuestion(token: string) {
    try {
        const response = await axios.get(BASE+`api.php?amount=1&type=multiple&token=${token}`);
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching data: ${(error as Error).message}`);
    }
}

export async function fetchOneQuestionFromCategory(token: string, category: number) {
    if (category == null)
        return fetchOneQuestion(token);
    else {
        try {
            const response = await axios.get(BASE + `api.php?amount=1&type=multiple&category=${category}&token=${token}`);
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching data: ${(error as Error).message}`);
        }
    }
}


export async function fetchToken() {
    try {
        const response = await axios.get(BASE+`api_token.php?command=request`);
        return response.data.token;
    } catch (error) {
        throw new Error(`Error fetching data: ${(error as Error).message}`);
    }
}