import {Room, Client, Delayed} from "@colyseus/core";
import {MyRoomState, Player} from "./schema/MyRoomState";
import {ArraySchema} from "@colyseus/schema";
import {QuestionsAPI} from "../questionsAPI";

const LETTERS = "1234567890";

export class MyRoom extends Room<MyRoomState> {
    maxClients = 16;
    LOBBY_CHANNEL = "$mylobby"
    private TIMER_SECONDS = 21;
// token used for API requests from Trivia API

    // Generate a single 4 capital letter room ID.
    generateRoomIdSingle(): string {
        let result = '';
        for (let i = 0; i < 3; i++) {
            result += LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
        }
        return result;
    }

    // 1. Get room IDs already registered with the Presence API.
    // 2. Generate room IDs until you generate one that is not already used.
    // 3. Register the new room ID with the Presence API.
    async generateRoomId(): Promise<string> {
        const currentIds = await this.presence.smembers(this.LOBBY_CHANNEL);
        let id;
        do {
            id = this.generateRoomIdSingle();
        } while (currentIds.includes(id));

        await this.presence.sadd(this.LOBBY_CHANNEL, id);
        return id;
    }

    at_least_one_alive() {
        for (const [, value] of this.state.players) {
            if (value.lives > 0) {
                return true;
            }
        }
        return false;
    }

    all__alive_players_answered() {
        for (const [, value] of this.state.players) {
            if (value.lives <= 0) // skip dead players
                continue;
            if (value.getPlayerAnswer() == null) {
                return false
            }
        }
        return true;
    }

    calculate_scores() {
        for (const [, player] of this.state.players) {
            if (player.lives==0)
                continue;
            if (this.state.correctAnswer == player.getPlayerAnswer()) { // if player has answered correctly
                player.streak_correct += 1
                player.score += player.getPlayerAnswerTime() * 5;
                if (player.streak_correct > 3) {
                    player.lives += 1;
                    player.streak_correct = 0;
                }
            } else { // player has answered incorrectly
                player.lives -= 1;
                player.streak_correct = 0;
            }
        }
        this.broadcast("updated_scores");
    }

    async onCreate(options: any) {

        const quiz = new QuestionsAPI();

        this.roomId = await this.generateRoomId();
        this.setState(new MyRoomState());
        let delayedInterval: Delayed;
        let answerPromiseResolve: (value: void | PromiseLike<void>) => void; // Initialize the resolve function for each round


        this.onMessage("change_trivia_category", (client, message) => {
            this.state.trivia_category = message.category;
        })

        this.onMessage("answer_question", async (client, message) => {
            if (delayedInterval != null && delayedInterval.active) {
                let player = this.state.players.get(client.sessionId);
                if (player.getPlayerAnswer() == null && player.lives > 0) {
                    player.setPlayerAnswer(message.answer);
                    player.setPlayerAnswerTime(this.TIMER_SECONDS - Math.floor(this.clock.elapsedTime / 1000))
                } else {
                    console.log("Double answer!! from player " + client.sessionId);
                }

                if (this.all__alive_players_answered()) {
                    answerPromiseResolve(); // Resolve the promise for this specific round
                }
            }
        });


        this.onMessage("start_game", async () => {
            this.broadcast("players_get_ready");
            if (!this.state.gameHasStarted) {
                await this.lock(); // lock the room so new players can't join

                this.state.gameHasStarted = true;

                while (!this.state.gameOver) {
                    this.state.correctAnswer = "";
                    for (const [, player] of this.state.players) {
                        player.setPlayerAnswer(null);
                        player.setPlayerAnswerTime(0);
                    }
                    this.broadcast("updated_scores");

                    const {question, incorrect_answers, correct_answer, category} = quiz.getRandomQuestion();
                    this.state.question = question;
                    const allAnswers = [correct_answer, ...incorrect_answers]
                    this.state.answers = new ArraySchema<string>(...allAnswers);
                    this.state.questionCategory = category;
                    this.state.correctAnswer = "";

                    this.clock.clear();

                    this.clock.start();
                    const clockPromise = new Promise<void>((resolve) => {
                        delayedInterval = this.clock.setInterval(() => {
                            this.state.timer = Math.abs(Math.trunc(this.TIMER_SECONDS - this.clock.elapsedTime / 1000));
                        }, 250)

                        this.clock.setTimeout(() => {
                            if (delayedInterval.active) {
                                resolve();
                            }
                        }, 1000 * this.TIMER_SECONDS);
                    });
                    const answerPromise = new Promise<void>((resolve) => {
                        answerPromiseResolve = resolve; // Assign the resolve function
                    });


                    await Promise.race([clockPromise, answerPromise]); // blocking to fix the Infinite loop
                    this.state.round += 1;

                    delayedInterval.clear()
                    const timerPromise1 = new Promise<void>((resolve) => {
                        this.clock.setTimeout(() => {
                            resolve();
                        }, 2500);
                    });

                    await timerPromise1; // small 1.5 seconds delay after showing the correct response
                    this.state.correctAnswer = correct_answer;
                    this.calculate_scores();


                    const timerPromise2 = new Promise<void>((resolve) => {
                        this.clock.setTimeout(() => {
                            resolve();
                        }, 3000);
                    });

                    await timerPromise2; // small 1.5 seconds delay after showing the correct response

                    this.state.gameOver = !this.at_least_one_alive();
                }
                this.broadcast("updated_scores");
            }
        });
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        let player = new Player();
        try {
            player.username = options.username;
            player.sessionId = client.sessionId;
        } catch (error) {
            console.error(error);
        }

        this.state.players.set(client.sessionId, player);

    }

    async onLeave(client: Client, consented: boolean) {

        try {
            // if (consented) {
            //     throw new Error("consented leave");
            // }
            console.log(client.sessionId, "onLeave");
            // allow disconnected client to reconnect into this room until 30 seconds
            await this.allowReconnection(client, 30);

        } catch (e) {
            console.log(client.sessionId, "leaved for ever");
            // 20 seconds expired. let's remove the client.
            this.state.players.delete(client.sessionId);
        }
        //this.state.players.delete(client.sessionId);
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing...");
        this.presence.srem(this.LOBBY_CHANNEL, this.roomId);

    }

}
