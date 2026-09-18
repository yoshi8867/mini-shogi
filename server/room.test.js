/* node room.test.js — 심판 자기검사.
   서버가 규칙을 어기거나 자리를 잘못 내주면 여기서 먼저 터진다. */
"use strict";
const assert = require("assert");
const {Room, newCode, LIMIT_MS, EG} = require("./room.js");

const sockA = {id: "A"}, sockB = {id: "B"}, sockC = {id: "C"};

/* ── 1. 방 코드 ───────────────────────────────────────────────────────── */
{
  const seen = new Set();
  for (let i = 0; i < 2000; i++){
    const c = newCode(x => seen.has(x));
    assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/, `이상한 코드 ${c}`);
    seen.add(c);
  }
  assert.strictEqual(seen.size, 2000, "코드가 겹쳤다");
  console.log("code    4글자 2000개 무충돌 · 헷갈리는 I O 0 1 없음");
}

/* ── 2. 자리 ─────────────────────────────────────────────────────────── */
{
  const r = new Room("TEST");
  const a = r.seat(sockA, null), b = r.seat(sockB, null);
  assert.strictEqual(a.side, 0);
  assert.strictEqual(b.side, 1);
  assert.ok(a.token && b.token && a.token !== b.token, "자리표가 겹쳤다");
  assert.strictEqual(r.seat(sockC, null).err, "full", "세 번째가 앉았다");
  assert.ok(r.ready);

  // 새로고침 — 자리표를 들고 오면 같은 자리로 돌아온다
  r.unseat(sockA);
  assert.ok(!r.ready);
  const again = r.seat(sockA, a.token);
  assert.strictEqual(again.side, 0, "자리표를 들고 왔는데 다른 자리로 갔다");
  assert.strictEqual(again.token, a.token);

  // 비운 사이 남이 앉으면 옛 자리표는 무효다
  r.unseat(sockA);
  const stranger = r.seat(sockC, null);
  assert.strictEqual(stranger.side, 0);
  assert.notStrictEqual(stranger.token, a.token, "남의 자리표를 물려줬다");
  console.log("seat    두 자리 · 정원 초과 거절 · 새로고침 복귀 · 자리표 무효화");
}

/* ── 3. 수 심판 ──────────────────────────────────────────────────────── */
{
  const r = new Room("TEST");
  r.seat(sockA, null); r.seat(sockB, null);
  const legal = EG.gen(r.pos);

  assert.strictEqual(r.play(1, legal[0], 0).err, "turn",  "차례가 아닌 쪽이 뒀다");
  assert.strictEqual(r.play(0, legal[0], 7).err, "stale", "엉뚱한 ply 를 받았다");
  assert.strictEqual(r.play(0, 0x7fffff, 0).err, "illegal", "불법 수를 받았다");
  assert.strictEqual(r.play(0, 1.5, 0).err, "bad", "정수가 아닌 수를 받았다");

  const ok = r.play(0, legal[0], 0);
  assert.ok(ok.ok && ok.ply === 1, "정상 수가 막혔다");
  assert.strictEqual(r.pos.turn, 1, "차례가 안 넘어갔다");
  assert.strictEqual(r.play(0, EG.gen(r.pos)[0], 1).err, "turn", "연속으로 뒀다");
  console.log("judge   차례 · ply · 불법 · 정수 검사 통과");
}

/* ── 4. 혼자 앉아서는 못 둔다 ────────────────────────────────────────── */
{
  const r = new Room("TEST");
  r.seat(sockA, null);
  assert.strictEqual(r.play(0, EG.gen(r.pos)[0], 0).err, "waiting");
  console.log("wait    상대가 없으면 수를 받지 않는다");
}

/* ── 5. 자기대국 — 방이 반드시 끝나고, 끝나면 더 못 둔다 ─────────────── */
{
  let ended = {catch:0, try:0, repeat:0, stuck:0}, plies = [];
  for (let g = 0; g < 4; g++){
    const r = new Room("TEST");
    r.seat(sockA, null); r.seat(sockB, null);
    let guard = 0;
    while (!r.over && guard++ < 400){
      const side = r.pos.turn;
      const past = [...r.seen].filter(e => e[1] >= 2).map(e => e[0]);
      const res = EG.best({b: r.pos.b, hand: r.pos.hand, turn: side},
                          {ms: 30, margin: 140, past});
      assert.ok(res.move, "엔진이 수를 못 냈다");
      const out = r.play(side, res.move, r.ply);
      assert.ok(out.ok, `심판이 엔진 수를 거절했다: ${out.err}`);
    }
    assert.ok(r.over, "400수 안에 안 끝났다");
    ended[r.over.why]++;
    plies.push(r.ply);

    // 끝난 판에는 아무도 못 둔다
    assert.strictEqual(r.play(r.pos.turn, EG.gen(r.pos)[0] || 1, r.ply).err, "over");
  }
  const tally = Object.entries(ended).filter(e => e[1]).map(e => `${e[0]} ${e[1]}`);
  console.log(`self    4판 완주 · ${tally.join(" · ")} · 최장 ${Math.max(...plies)}수`);
}

/* ── 6. 기권과 재대국 ────────────────────────────────────────────────── */
{
  const r = new Room("TEST");
  r.seat(sockA, null); r.seat(sockB, null);
  assert.strictEqual(r.first, 0);
  assert.strictEqual(r.pos.turn, 0);

  const over = r.resign(0);
  assert.deepStrictEqual(over, {winner: 1, why: "resign"}, "기권 처리가 틀렸다");
  assert.strictEqual(r.resign(1), null, "끝난 판에서 또 기권됐다");

  assert.strictEqual(r.wantRematch(0), false, "한쪽만 눌렀는데 다시 시작했다");
  assert.strictEqual(r.wantRematch(1), true,  "양쪽이 눌렀는데 안 시작했다");
  assert.strictEqual(r.over, null, "새 판인데 끝나 있다");
  assert.strictEqual(r.first, 1, "선공이 안 넘어갔다");
  assert.strictEqual(r.pos.turn, 1, "새 판의 차례가 선공과 다르다");
  assert.strictEqual(r.ply, 0);
  console.log("again   기권 · 양쪽 동의로 재대국 · 선공 교대");
}

/* ── 7. 시계 ─────────────────────────────────────────────────────────── */
{
  const r = new Room("TEST");
  r.seat(sockA, null); r.seat(sockB, null);
  const l = r.left();
  assert.ok(l > LIMIT_MS - 1000 && l <= LIMIT_MS, `남은 시간이 이상하다: ${l}`);
  r.play(0, EG.gen(r.pos)[0], 0);
  assert.ok(r.left() > LIMIT_MS - 1000, "수를 둬도 시계가 안 돌아갔다");
  r.finish(0, "time");
  assert.strictEqual(r.left(), 0, "끝난 판에 시간이 남아 있다");
  console.log(`clock   한 수 ${LIMIT_MS / 1000}초 · 수마다 초기화 · 종료 시 0`);
}

console.log("\n전부 통과");
