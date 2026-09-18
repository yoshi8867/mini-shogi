/* ══════════════════════════════════════════════════════════════════════
   방 — 대국 하나의 심판.

   규칙은 한 벌뿐이다. 클라이언트가 쓰는 그 engine.js 를 그대로 require 해서
   서버가 직접 판을 굴린다. 그래서 "클라이언트가 보낸 수"는 제안일 뿐이고,
   진실은 언제나 이쪽 pos 다.

   이 파일은 소켓을 모른다. 넣는 것은 수와 자리, 나오는 것은 사실뿐이다.
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const EG = require("../shared/engine.js")();

const LIMIT_MS = 30000;                  // 한 수 30초 — 로컬 대국과 같은 규칙
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 헷갈리는 I O 0 1 은 뺀다

function newCode(taken){
  for (;;){
    let s = "";
    for (let i = 0; i < 4; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    if (!taken(s)) return s;
  }
}
const newToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

class Room {
  constructor(code){
    this.code = code;
    this.seats = [null, null];           // 소켓 (없으면 null)
    this.tokens = [null, null];          // 자리표 — 새로고침하면 이걸로 돌아온다
    this.first = 0;                      // 이번 판 선공. 판마다 넘어간다
    this.touched = Date.now();
    this.onTimeout = null;               // 서버가 시계를 갖는다
    this.timer = null;
    this.reset();
  }

  /* ─── 판 ─── */
  reset(){
    const p = EG.fresh();
    p.turn = this.first;
    this.pos = p;
    this.ply = 0;
    this.moves = [];
    this.seen = new Map([[EG.hash(p), 1]]);
    this.over = null;                    // {winner: 0|1|null, why}
    this.deadline = 0;
    this.rematch = [false, false];
    this.startedAt = Date.now();
    this.saved = false;      // 기보는 한 번만 남긴다
    this.startClock();
  }

  /* ─── 시계 ─── */
  startClock(){
    this.stopClock();
    if (this.over) return;
    this.deadline = Date.now() + LIMIT_MS;
    this.timer = setTimeout(() => {
      if (this.over) return;
      this.finish(1 - this.pos.turn, "time");   // 시간을 넘긴 쪽이 진다
      if (this.onTimeout) this.onTimeout(this);
    }, LIMIT_MS);
    if (this.timer.unref) this.timer.unref();
  }
  stopClock(){ if (this.timer){ clearTimeout(this.timer); this.timer = null; } }
  left(){ return this.over ? 0 : Math.max(0, this.deadline - Date.now()); }

  finish(winner, why){
    this.over = {winner, why};
    this.stopClock();
  }

  /* ─── 자리 ─── */
  seat(ws, token){
    this.touched = Date.now();
    // 새로고침 — 쓰던 자리표가 있으면 그 자리로 돌려보낸다
    if (token){
      const s = this.tokens.indexOf(token);
      if (s >= 0){
        if (this.seats[s] && this.seats[s] !== ws) return {err: "taken"};
        this.seats[s] = ws;
        return {side: s, token};
      }
    }
    const s = this.seats.indexOf(null);
    if (s < 0) return {err: "full"};
    /* 빈 자리에 새 사람이 앉으면 자리표를 새로 발급한다. 먼저 있던 사람의
       자리표는 그 순간 무효다 — 자리를 비운 사이 남이 앉았으면 그게 맞다. */
    this.seats[s] = ws;
    this.tokens[s] = newToken();
    return {side: s, token: this.tokens[s]};
  }
  unseat(ws){
    const s = this.seats.indexOf(ws);
    if (s >= 0) this.seats[s] = null;
    this.touched = Date.now();
    return s;
  }
  get empty(){ return this.seats[0] === null && this.seats[1] === null; }
  get ready(){ return this.seats[0] !== null && this.seats[1] !== null; }

  /* ─── 수 ─── */
  /* 받아들이면 {ok:true, m, ply, over}, 아니면 {err} */
  play(side, m, ply){
    this.touched = Date.now();
    if (this.over)             return {err: "over"};
    if (!this.ready)           return {err: "waiting"};
    if (this.pos.turn !== side)return {err: "turn"};
    if (ply !== this.ply)      return {err: "stale"};      // 늦게 온 수는 버린다
    if (!Number.isInteger(m))  return {err: "bad"};
    if (!EG.gen(this.pos).includes(m)) return {err: "illegal"};

    const cap = EG.cap(m);
    EG.make(this.pos, m);
    this.ply++;
    this.moves.push(m);

    if (EG.decisive(this.pos, m, cap)){
      this.finish(side, cap === EG.L ? "catch" : "try");
    } else {
      const k = EG.hash(this.pos), n = (this.seen.get(k) || 0) + 1;
      this.seen.set(k, n);
      if (n >= 3) this.finish(null, "repeat");                 // 같은 국면 3회
      else if (EG.gen(this.pos).length === 0)
        this.finish(1 - this.pos.turn, "stuck");               // 둘 수 있는 수가 없다
      else this.startClock();
    }
    return {ok: true, m, ply: this.ply, over: this.over, left: this.left()};
  }

  resign(side){
    if (this.over) return null;
    this.finish(1 - side, "resign");
    return this.over;
  }

  /* 양쪽이 모두 누르면 다시 시작한다. 선공은 판마다 넘어간다 */
  wantRematch(side){
    if (!this.over) return false;
    this.rematch[side] = true;
    if (!this.rematch[0] || !this.rematch[1]) return false;
    this.first = 1 - this.first;
    this.reset();
    return true;
  }

  /* 클라이언트가 그대로 그릴 수 있는 사실 한 벌 */
  state(){
    return {
      b: Array.from(this.pos.b),
      hand: [this.pos.hand[0].slice(), this.pos.hand[1].slice()],
      turn: this.pos.turn,
      ply: this.ply,
      first: this.first,
      left: this.left(),
      ready: this.ready,
      over: this.over,
    };
  }
}

module.exports = {Room, newCode, LIMIT_MS, EG};
