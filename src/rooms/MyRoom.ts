import {Room, Client, Delayed} from "@colyseus/core";
import {MyRoomState, Player} from "./schema/MyRoomState";
import {ArraySchema, MapSchema, Schema, type} from "@colyseus/schema";
import {convertApiResponse} from "../question_proccesor";
import {fetchOneQuestionFromCategory, fetchToken} from "../questionsAPI";

const LETTERS = "1234567890";

export class MyRoom extends Room<MyRoomState> {
    maxClients = 16;
    LOBBY_CHANNEL = "$mylobby"
    private  TIMER_SECONDS = 21;

    private token:string; // token used for API requests from Trivia API

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
        for (const [key, value] of this.state.players) {
            if (value.lives > 0) {
                return true;
            }
        }
        return false;
    }

    all__alive_players_answered() {
        for (const [key, value] of this.state.players) {
            if (value.lives <= 0) // skip dead players
                continue;
            if (value.player_answer == null) {
                return false
            }
        }
        return true;
    }

    calculate_scores() {
        for (const [playerID, player] of this.state.players) {
            if (this.state.correctAnswer == player.player_answer) {
                player.streak_correct += 1
                player.score += player.player_answer_time * 5;
                if (player.streak_correct > 3)
                    player.lives += 1;
            } else { // player has answered incorrectly
                player.lives -= 1;
                player.streak_correct = 0;
            }
        }
    }

    async onCreate(options: any) {

        this.roomId = await this.generateRoomId();
        this.setState(new MyRoomState());
        let delayedInterval: Delayed;
        let answerPromiseResolve: (value: void | PromiseLike<void>) => void; // Initialize the resolve function for each round



        this.onMessage("change_trivia_category", (client, message) =>{
            this.state.trivia_category = message.category;
        })

        this.onMessage("answer_question", async (client, message) => {
            if (delayedInterval != null && delayedInterval.active) {
                let player = this.state.players.get(client.sessionId);
                if (player.player_answer == null && player.lives > 0) {
                    player.player_answer = message.answer;
                    player.player_answer_time = (this.TIMER_SECONDS - Math.floor(this.clock.elapsedTime / 1000));
                } else {
                    console.log("Double answer!! from player " + client.sessionId);
                }

                if (this.all__alive_players_answered()) {
                    answerPromiseResolve(); // Resolve the promise for this specific round
                }
            }
        });



        this.onMessage("start_game", async (client, message) => {
            this.broadcast("players_get_ready");
            if (!this.state.gameHasStarted) {
                this.token = await fetchToken();
                await this.lock();
                this.state.gameHasStarted = true;

                while (!this.state.gameOver){
                    this.state.correctAnswer = "";
                    for (const [playerID, player] of this.state.players) {
                        player.player_answer = null;
                        player.player_answer_time = 0;
                    }


                    const API_response =  await fetchOneQuestionFromCategory(this.token, this.state.trivia_category);
                    const { question, answers, correctAnswer, category } = convertApiResponse(API_response);
                    this.state.question = question;
                    this.state.answers = new ArraySchema<string>(...answers);
                    this.state.questionCategory = category;

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
                    this.state.round+=1;

                    delayedInterval.clear()
                    const timerPromise1 = new Promise<void>((resolve)=>{
                        this.clock.setTimeout(() => {
                            resolve();
                        },2500);
                    });

                    await timerPromise1; // small 1.5 seconds delay after showing the correct response
                    this.state.correctAnswer = correctAnswer;
                    this.calculate_scores();




                    const timerPromise2 = new Promise<void>((resolve)=>{
                        this.clock.setTimeout(() => {
                            resolve();
                        },3000);
                    });

                    await timerPromise2; // small 1.5 seconds delay after showing the correct response

                    this.state.gameOver = !this.at_least_one_alive();

                }
            }
        });
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        let player = new Player();
        try {
            player.username = options.username;
        } catch (error) {
            console.error(error);
        }

        this.state.players.set(client.sessionId, player);

    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing...");
        this.presence.srem(this.LOBBY_CHANNEL, this.roomId);

    }

}
