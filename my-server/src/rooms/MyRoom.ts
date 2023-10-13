import {Room, Client, Delayed} from "@colyseus/core";
import {MyRoomState, Player} from "./schema/MyRoomState";
import {ArraySchema, MapSchema, Schema, type} from "@colyseus/schema";

const LETTERS = "1234567890";

export class MyRoom extends Room<MyRoomState> {
    maxClients = 16;
    LOBBY_CHANNEL = "$mylobby"

    // Generate a single 4 capital letter room ID.
    generateRoomIdSingle(): string {
        let result = '';
        for (var i = 0; i < 3; i++) {
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

    all_players_answered() {
        for (const [key, value] of this.state.players) {
            if (value.player_answer == null) {
                return false
            }
        }
        return true;
    }

    calculate_scores() {
        for (const [key, value] of this.state.players) {
            if (this.state.correctAnswer == value.player_answer) {
                value.score = value.player_answer_time * 5;
                if (value.streak_correct > 3)
                    value.lives += 1;
            } else {
                value.lives -= 1;
            }
        }
    }


    async onCreate(options: any) {

        this.roomId = await this.generateRoomId();
        this.setState(new MyRoomState());
        let delayedInterval: Delayed;
        let answerPromiseResolve: (value: void | PromiseLike<void>) => void; // Initialize the resolve function for each round

        this.onMessage("answer_question", async (client, message) => {
            if (delayedInterval != null && delayedInterval.active) {
                let player = this.state.players.get(client.sessionId);
                if (player.player_answer == null) {
                    player.player_answer = "answer";
                    player.player_answer_time = (20.0 - Math.floor(this.clock.elapsedTime / 1000));
                } else {
                    console.log("Double answer!! from player " + client.sessionId);
                }

                if (this.all_players_answered()) {
                    answerPromiseResolve(); // Resolve the promise for this specific round
                }
            }
        });
        // let answerPromise = new Promise<void>((resolve) => {
        //     this.onMessage("answer_question", async (client, message) => {
        //         if (delayedInterval != null && delayedInterval.active) {
        //             let player = this.state.players.get(client.sessionId);
        //             if (player.player_answer == null) {
        //                 player.player_answer = "answer"
        //                 player.player_answer_time = (20.0 - Math.floor(this.clock.elapsedTime / 1000));
        //             } else
        //                 console.log("Double answer!! from player " + client.sessionId)
        //
        //             if (this.all_players_answered()) {
        //                 resolve();
        //             }
        //         }
        //
        //     })
        // });



        this.onMessage("start_game", async (client, message) => {
            if (!this.state.gameHasStarted) {
                this.state.gameHasStarted = true;

                for (let i = 0; i < 20; i++) {
                    this.clock.clear();
                    this.state.timer = this.clock.elapsedTime / 1000;

                    this.state.correctAnswer = "";
                    this.state.question = "How much is 1+1?"
                    this.state.answers = new ArraySchema<string>("1", "2", "3", "4");

                    this.clock.start();
                    const clockPromise = new Promise<void>((resolve) => {
                        delayedInterval = this.clock.setInterval(() => {
                            this.state.timer = this.clock.elapsedTime / 1000;
                        }, 100)

                        this.clock.setTimeout(() => {
                            if (delayedInterval.active) {
                                resolve();
                            }
                        }, 1000 * 10);
                    });
                    const answerPromise = new Promise<void>((resolve) => {
                        answerPromiseResolve = resolve; // Assign the resolve function
                    });



                    await Promise.race([clockPromise, answerPromise]); // blocking to fix the Infinite loop
                    this.state.round+=1;

                    delayedInterval.clear()
                    this.state.correctAnswer = "Revealed!"
                    this.calculate_scores();



                    this.broadcast("hello");
                    const timerPromise = new Promise<void>((resolve)=>{
                        this.clock.setTimeout(() => {
                            resolve();
                        },3200);
                    });

                    await timerPromise; // small 1.5 seconds delay after showing the correct response
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
