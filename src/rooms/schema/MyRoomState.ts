import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") sessionId : string;

  @type("string") username: string;
  @type("number") lives: number = 3;
  @type("number") score: number = 0;

  @type("string") player_answer: string;
  @type("number") player_answer_time: number;

  @type("number") streak_correct: number = 0;
}


export class MyRoomState extends Schema {
  @type("boolean") gameHasStarted: boolean = false;
  @type("boolean") gameOver: boolean = false;

  @type("string") questionCategory: string = "";

  @type("string") question: string = "";
  @type([ "string" ]) answers = new ArraySchema<string>();

  @type("string") correctAnswer: string = "";

  @type({ map: Player }) players = new MapSchema<Player>();


  @type("number") round: number = 0;
  @type("number") timer: number;

  @type("number") trivia_category: number = 9;




}



// Our custom game state, an ArraySchema of type Player only at the moment
