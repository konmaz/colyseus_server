import * as fs from 'fs';

async function fetchOneQuestion() {

}

export class QuestionsAPI {
    private questions;
    constructor() {

        this.questions = JSON.parse(fs.readFileSync('src/en.json', 'utf8'));
    }
    getRandomQuestion(){
        const randomIndex = Math.floor(Math.random() * this.questions.length);
        return this.questions[randomIndex];
    }

}

