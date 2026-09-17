/* node engine.test.js — 엔진 자기검사.
   규칙이 어긋나면 여기서 먼저 터진다. */
"use strict";
const assert = require("assert");
const EG = require("./engine.js")();

/* ── 1. perft — 수 생성이 흔들리면 숫자가 바뀐다 ───────────────────────── */
const PERFT = [1, 4, 17, 123, 980, 8174, 72240];
PERFT.forEach((want, d) => {
  const got = EG.perft(EG.fresh(), d);
  assert.strictEqual(got, want, `perft(${d}) = ${got}, 기대 ${want}`);
});
console.log("perft   초기 국면 d0~d6 일치 :", PERFT.join(" "));

/* ── 2. 초기 국면의 합법수 4개가 맞는가 ─────────────────────────────── */
{
  const p = EG.fresh(), ms = EG.gen(p);
  assert.strictEqual(ms.length, 4);
  // 병아리 7→4(잡기), 사자 10→6·8, 기린 11→8. i=7 은 자기 병아리라 사자가 못 간다.
  const tos = ms.map(EG.to).sort((a, b) => a - b);
  assert.deepStrictEqual(tos, [4, 6, 8, 8], "초기 합법수 도착칸 " + tos);
  assert.strictEqual(ms.filter(m => EG.cap(m)).length, 1, "병아리 잡는 수 하나");
}
console.log("gen     초기 합법수 4개 · 그 중 잡는 수 1개");

/* ── 3. make / unmake 왕복
   엔진 밖으로 내지 않았지만 perft 가 곧 그 검사다. 되감기가 한 군데라도
   어긋나면 그 아래 가지 전체가 딴 판이 되어 숫자가 맞을 수 없다. */

/* ── 4. 해시 — 경로가 달라도 같은 국면이면 같아야 한다 ────────────────── */
{
  const a = EG.fresh(), b = EG.fresh();
  assert.strictEqual(EG.hash(a), EG.hash(b));
  b.turn = 1;
  assert.notStrictEqual(EG.hash(a), EG.hash(b), "차례가 다르면 해시도 달라야 한다");
  const c = EG.fresh(); c.hand[0][0] = 1;
  assert.notStrictEqual(EG.hash(a), EG.hash(c), "손패가 다르면 해시도 달라야 한다");
}
console.log("hash    차례·손패까지 지문에 들어간다");

/* ── 5. 트라이 — 끝줄에 닿아도 그 칸이 잡히면 승리가 아니다 ───── */
{
  // attacked() 가 트라이 판정의 전부다. 먼저 그것부터.
  const a = {b: new Int8Array(12), hand: [[0,0,0],[0,0,0]], turn: 0};
  a.b[1] = -EG.G;                      // 후공 기린 i=1 은 i=0, i=2, i=4 를 노린다
  assert.ok( EG.attacked(a, 0, 1), "기린은 옆 칸을 노린다");
  assert.ok( EG.attacked(a, 4, 1), "기린은 앞 칸을 노린다");
  assert.ok(!EG.attacked(a, 3, 1), "대각은 기린의 자리가 아니다");

  /* 선공 사자 i=4 가 끝줄로 갈 수 있는 칸은 i=1 뿐이다
     (i=0, i=2 는 자기 기물이 막고 있다).
     즉승으로 끝나는 수만 정확히 MATE 점수를 받는다 —
     몇 수 앞의 강제승은 MATE-ply 라 구분된다. */
  const mk = guardAt => {
    const p = {b: new Int8Array(12), hand: [[0,0,0],[0,0,0]], turn: 0};
    p.b[4] = EG.L; p.b[0] = EG.E; p.b[2] = EG.G;
    p.b[guardAt] = -EG.E; p.b[11] = -EG.L;
    return p;
  };
  const scoreOfTry = p => {
    const r = EG.best(p, {ms: 80});
    const hit = r.moves.find(([m]) => EG.from(m) === 4 && EG.to(m) === 1);
    assert.ok(hit, "사자가 i=1 로 가는 수가 있어야 한다");
    return hit[1];
  };
  assert.notStrictEqual(scoreOfTry(mk(5)), EG.MATE,
    "i=5 의 코끼리가 i=1 을 노리므로 트라이가 아니다");
  assert.strictEqual(scoreOfTry(mk(8)), EG.MATE,
    "i=8 로 비키면 i=1 은 빈 자리 — 트라이 즉승");
}
console.log("try     잡히는 끝줄은 트라이가 아니다");

/* ── 6. 캐치 — 사자를 잡을 수 있으면 잡는다 ─────────────────────────── */
{
  const p = {b: new Int8Array(12), hand: [[0,0,0],[0,0,0]], turn: 0};
  p.b[7] = EG.L; p.b[4] = -EG.L; p.b[0] = -EG.G;
  const r = EG.best(p, {ms: 60});
  assert.strictEqual(EG.to(r.move), 4, "사자를 잡는 수를 골라야 한다");
  assert.ok(r.best > EG.MATE - 200);
}
console.log("catch   사자가 잡히면 그 수를 고른다");

/* ── 7. 자기대국 — 규칙대로 두면 판이 끝나는가 ──────────────────────── */
{
  let wins = [0, 0], draws = 0, maxPly = 0;
  for (let g = 0; g < 6; g++) {
    const p = EG.fresh();
    const seen = new Map([[EG.hash(p), 1]]);
    let ply = 0, ended = "";
    while (ply < 300) {
      const r = EG.best(p, {ms: 40, margin: g % 2 ? 90 : 0, past: []});
      if (!r.move) { ended = "수없음"; wins[1 - p.turn]++; break; }
      const m = r.move, cap = EG.cap(m), mover = p.turn;
      // 엔진 밖에서 두려면 gen/best 만으로는 부족하니 판을 직접 옮긴다
      applyMove(p, m);
      ply++;
      if (cap === EG.L) { ended = "캐치"; wins[mover]++; break; }
      const to = EG.to(m), s = mover;
      if (!EG.drop(m) && p.b[to] === (s === 0 ? EG.L : -EG.L)
          && ((to / 3) | 0) === EG.BACK[s] && !EG.attacked(p, to, 1 - s)) {
        ended = "트라이"; wins[mover]++; break;
      }
      const k = EG.hash(p), n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      if (n >= 3) { ended = "반복 무승부"; draws++; break; }
    }
    if (!ended) { ended = "300수 초과"; draws++; }
    maxPly = Math.max(maxPly, ply);
    assert.ok(ply > 0, "한 수도 못 뒀다");
    assert.ok(ply < 300, "판이 끝나지 않았다 (" + ply + "수)");
  }
  console.log(`self    6판 완주 · 선공 ${wins[0]} 후공 ${wins[1]} 무승부 ${draws} · 최장 ${maxPly}수`);
}

/* 엔진의 make 는 밖으로 내지 않았으므로, 테스트에서는 같은 규칙으로 한 수를 옮긴다.
   여기가 엔진과 어긋나면 perft/자기대국이 곧바로 이상해진다. */
function applyMove(p, m) {
  const s = p.turn, sign = s === 0 ? 1 : -1;
  const to = EG.to(m), d = EG.drop(m);
  if (d) { p.b[to] = d * sign; p.hand[s][EG.HSLOT[d]]--; }
  else {
    const f = EG.from(m), cap = EG.cap(m);
    if (cap) p.hand[s][EG.HSLOT[cap === EG.H ? EG.C : cap]]++;
    p.b[to] = EG.promo(m) ? EG.H * sign : p.b[f];
    p.b[f] = 0;
  }
  p.turn = 1 - s;
}

/* ── 8. 세기 — 예산별로 어디까지 보는가 ─────────────────────────────── */
console.log("");
for (const ms of [100, 250, 500, 1000]) {
  const r = EG.best(EG.fresh(), {ms});
  console.log(`speed   ${String(ms).padStart(4)}ms → 깊이 ${String(r.depth).padStart(2)}`
            + `  ${String(r.nodes).padStart(8)} 노드`);
}
console.log("\n전부 통과");
