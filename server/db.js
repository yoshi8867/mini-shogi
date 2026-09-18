/* ══════════════════════════════════════════════════════════════════════
   기보 저장 — Neon Postgres.

   원칙 하나: DB 때문에 대국이 멈추지 않는다.
   DATABASE_URL 이 없으면 그냥 꺼진 채로 돌고, 켜져 있어도 쓰기가 실패하면
   로그만 남기고 넘어간다. 무료 티어는 잠들고, 잠든 DB 는 첫 쿼리가 느리다.
   대국은 그런 사정을 몰라야 한다.

   수가 정수 하나라서 기보가 int[] 한 칸에 그대로 들어간다.
   engine.js 로 언제든 다시 재생할 수 있다.
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

const URL = process.env.DATABASE_URL || "";
let pool = null, ready = null, broken = false;

if (URL){
  let Pool;
  try { ({Pool} = require("pg")); }
  catch { console.warn("db   pg 모듈이 없다. 기보를 남기지 않는다"); }
  if (Pool){
    pool = new Pool({
      connectionString: URL,
      ssl: {rejectUnauthorized: false},
      max: 3,                        // 무료 Neon 은 연결이 귀하다. 풀링 주소와 함께 쓴다
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000, // 잠든 DB 가 깨는 시간을 감안한다
    });
    pool.on("error", e => console.warn("db   유휴 연결 오류:", e.message));
  }
}

const SCHEMA = `
create table if not exists games (
  id          bigserial primary key,
  code        text        not null,
  first_side  smallint    not null,
  winner      smallint,                      -- 0 | 1 | null(무승부)
  why         text        not null,          -- catch try repeat stuck resign time
  plies       int         not null,
  moves       int[]       not null,          -- 수 하나가 정수 하나. 그대로 재생된다
  started_at  timestamptz not null,
  ended_at    timestamptz not null default now()
);
create index if not exists games_ended_at_idx on games (ended_at desc);
`;

/* 처음 쓸 때 한 번만 스키마를 맞춘다. 실패하면 이후로는 조용히 꺼진다. */
function init(){
  if (!pool || broken) return Promise.resolve(false);
  if (!ready){
    ready = pool.query(SCHEMA)
      .then(() => { console.log("db   연결 완료 · games 테이블 준비됨"); return true; })
      .catch(e => { broken = true; console.warn("db   초기화 실패:", e.message); return false; });
  }
  return ready;
}

async function saveGame(g){
  if (!pool || broken) return false;
  if (!(await init())) return false;
  try {
    await pool.query(
      `insert into games (code, first_side, winner, why, plies, moves, started_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [g.code, g.first, g.winner, g.why, g.moves.length, g.moves, new Date(g.startedAt)]);
    return true;
  } catch (e){
    console.warn("db   기보 저장 실패:", e.message);   // 대국은 이미 끝났다. 넘어간다
    return false;
  }
}

/* /healthz 에 얹을 한 줄 */
async function count(){
  if (!pool || broken) return null;
  try {
    const r = await pool.query("select count(*)::int as n from games");
    return r.rows[0].n;
  } catch { return null; }
}

const enabled = () => !!pool && !broken;

module.exports = {init, saveGame, count, enabled};
