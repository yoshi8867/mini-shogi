/* node ws.test.js — 소켓 왕복 검사.
   서버를 실제로 띄우고 목록 → 대국 → 종료까지 돌린다.
   DB 는 끄고 돈다 — 테스트가 진짜 기록을 더럽히면 안 된다. */
"use strict";
const assert = require("assert");
const {spawn} = require("child_process");
const path = require("path");
const WebSocket = require("ws");
const EG = require("../shared/engine.js")();

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const WSU  = `ws://127.0.0.1:${PORT}/ws`;
const wait = ms => new Promise(r => setTimeout(r, ms));

function client(){
  const ws = new WebSocket(WSU);
  const box = [], waiters = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex(w => w.t === m.t && (!w.pred || w.pred(m)));
    if (i >= 0) waiters.splice(i, 1)[0].go(m); else box.push(m);
  });
  return {
    ws,
    open: () => new Promise(r => ws.on("open", r)),
    send: (t, o) => ws.send(JSON.stringify(Object.assign({t}, o || {}))),
    next(t, ms = 5000, pred = null){
      const i = box.findIndex(m => m.t === t && (!pred || pred(m)));
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((go, fail) => {
        const w = {t, pred, go};
        waiters.push(w);
        setTimeout(() => {
          const j = waiters.indexOf(w);
          if (j >= 0){ waiters.splice(j, 1); fail(new Error(`${t} 를 못 받았다`)); }
        }, ms);
      });
    },
    drain(){ box.length = 0; },
    close: () => ws.close(),
  };
}
async function hello(pid){
  const c = client(); await c.open();
  c.send("hello", {pid});
  c.me = await c.next("me");
  await c.next("rooms");
  return c;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    env: Object.assign({}, process.env, {PORT: String(PORT), DATABASE_URL: ""}),
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {});
  srv.stderr.on("data", d => process.stderr.write(d));
  const bye = code => { try { srv.kill(); } catch (e) {} process.exit(code); };

  try {
    /* ── 1. healthz ─────────────────────────────────────────────────── */
    let up = false;
    for (let i = 0; i < 40 && !up; i++){
      try {
        const j = await (await fetch(`${BASE}/healthz`)).json();
        assert.strictEqual(j.ok, true);
        assert.strictEqual(j.db, "off", "테스트인데 DB 가 켜졌다");
        up = true;
        console.log(`health  200 · db ${j.db} · node ${j.node}`);
      } catch (e) { await wait(150); }
    }
    assert.ok(up, "서버가 안 떴다");
    assert.strictEqual((await fetch(`${BASE}/없는주소`)).status, 404);

    /* ── 2. 인사와 닉네임 ───────────────────────────────────────────── */
    const A = await hello("pid-aaaaaaaa-1");
    assert.ok(/^\S+ \S+$/.test(A.me.name), `닉네임이 이상하다: ${A.me.name}`);
    assert.strictEqual(A.me.streak, 0);
    assert.strictEqual(A.me.badge, null);
    const again = await hello("pid-aaaaaaaa-1");
    assert.strictEqual(again.me.name, A.me.name, "같은 pid 인데 이름이 달라졌다");
    again.close();
    console.log(`hello   pid → 닉네임 "${A.me.name}" · 연승 0`);

    const bad = client(); await bad.open();
    bad.send("hello", {pid: "짧음"});
    assert.strictEqual((await bad.next("error")).why, "badpid");
    bad.close();

    /* ── 2-1. 이름 다시 굴리기 ─────────────────────────────────────── */
    const R = await hello("pid-rrrrrrrr-9");
    let cur = R.me;
    for (let i = 0; i < 20; i++){
      const part = i % 2 ? "tail" : "head";
      R.send("rename", {part});
      await wait(220);                      // 연타 방지가 있다. 한 박자 쉰다
      const got = await R.next("me");
      assert.notStrictEqual(got[part], cur[part], `${part} 이 그대로다`);
      assert.strictEqual(got[part === "head" ? "tail" : "head"],
                         cur[part === "head" ? "tail" : "head"], "다른 쪽까지 바뀌었다");
      assert.strictEqual(got.name, got.head + " " + got.tail);
      cur = got;
    }
    R.send("rename", {part: "직접입력"});
    assert.strictEqual((await R.next("error")).why, "bad", "엉뚱한 자리를 받아줬다");
    const back = await hello("pid-rrrrrrrr-9");
    assert.strictEqual(back.me.name, cur.name, "다시 들어오니 이름이 돌아갔다");
    back.close(); R.close();
    console.log(`rename  앞말/뒷말 따로 20번 · 마지막 "${cur.name}"`);

    /* ── 3. 대국 열기 · 목록 ────────────────────────────────────────── */
    A.send("open", {open: true});
    const seatedA = await A.next("seated");
    assert.strictEqual(seatedA.side, 0);
    assert.strictEqual(seatedA.open, true);
    const code = seatedA.code;
    const st0 = await A.next("state");
    assert.strictEqual(st0.ready, false, "혼자인데 준비됐다고 한다");
    assert.strictEqual(st0.left, 0, "혼자 기다리는데 시계가 돈다");     // ← 회귀

    const B = await hello("pid-bbbbbbbb-2");
    const rows = await B.next("rooms", 5000, r => r.rooms.length > 0);
    const row = rows.rooms.find(r => r.code === code);
    assert.ok(row, "목록에 대국이 안 보인다");
    assert.strictEqual(row.state, "waiting");
    assert.strictEqual(row.open, true);
    assert.strictEqual(row.people.length, 1, "대기 중인데 사람이 하나가 아니다");
    assert.strictEqual(row.people[0].name, A.me.name, "목록에 닉네임이 안 실린다");
    console.log(`list    대국 ${code} · 대기(${row.people[0].name})`);

    /* ── 4. 들어가기 ────────────────────────────────────────────────── */
    B.send("join", {code});
    const seatedB = await B.next("seated");
    assert.strictEqual(seatedB.side, 1);
    await A.next("peer");
    const st1 = await B.next("state", 5000, s => s.ready);
    assert.ok(st1.left > 25000, `둘이 앉았는데 시계가 이상하다: ${st1.left}`);
    assert.strictEqual(st1.people[0].name, A.me.name);
    assert.strictEqual(st1.people[1].name, B.me.name);
    console.log(`join    ${A.me.name} vs ${B.me.name} · 시계 ${Math.round(st1.left/1000)}초`);

    B.send("rename", {part: "head"});
    assert.strictEqual((await B.next("error")).why, "joined", "대국 중에 이름이 바뀌었다");

    const C = await hello("pid-cccccccc-3");
    C.send("join", {code});
    assert.strictEqual((await C.next("error")).why, "full");
    C.send("join", {code: "ZZZZ"});
    assert.strictEqual((await C.next("error")).why, "nocode");

    /* ── 5. 심판 ────────────────────────────────────────────────────── */
    B.send("move", {m: 1, ply: 0});
    assert.strictEqual((await B.next("error")).why, "turn");
    A.send("move", {m: 0x7ffff, ply: 0});
    assert.strictEqual((await A.next("error")).why, "illegal");
    A.drain(); B.drain();
    console.log("judge   남의 차례 거절 · 불법 수 거절");

    /* ── 6. 끝까지 한 판 ────────────────────────────────────────────── */
    const pos = {b: Int8Array.from(st1.b),
                 hand: [st1.hand[0].slice(), st1.hand[1].slice()], turn: st1.turn};
    const seen = new Map([[EG.hash(pos), 1]]);
    let ply = 0, over = null, guard = 0;
    while (!over && guard++ < 300){
      const side = pos.turn, me = side === 0 ? A : B;
      const past = [...seen].filter(e => e[1] >= 2).map(e => e[0]);
      const res = EG.best({b: pos.b, hand: pos.hand, turn: side},
                          {ms: 25, margin: 140, past});
      me.send("move", {m: res.move, ply});
      const [mvA, mvB] = await Promise.all([A.next("moved"), B.next("moved")]);
      for (const mv of [mvA, mvB]){
        assert.strictEqual(mv.by, side, "둔 사람이 틀렸다");
        assert.strictEqual(mv.m, res.move, "서버가 다른 수를 확정했다");
        assert.strictEqual(mv.ply, ply + 1, "ply 가 안 맞는다");
      }
      EG.make(pos, res.move); ply++;
      const k = EG.hash(pos); seen.set(k, (seen.get(k) || 0) + 1);
      const ends = await Promise.all([A.next("over", 80).catch(() => null),
                                      B.next("over", 80).catch(() => null)]);
      await Promise.all([A.next("state"), B.next("state")]);
      assert.deepStrictEqual(ends[0], ends[1], "양쪽이 다른 결과를 받았다");
      over = ends[0];
    }
    assert.ok(over, "300수 안에 안 끝났다");
    console.log(`play    ${ply}수 만에 ${over.why} · 승자 ${over.winner === null ? "없음" : over.winner}`);

    if (over.winner !== null){
      const pid = over.winner === 0 ? "pid-aaaaaaaa-1" : "pid-bbbbbbbb-2";
      const chk = await hello(pid);
      assert.strictEqual(chk.me.streak, 1, "이겼는데 연승이 안 올랐다");
      chk.close();
      console.log("streak  이긴 쪽 연승 1");
    }

    /* ── 7. 한 판 끝나도 대국은 닫히지 않는다 ──────────────────────── */
    A.drain(); B.drain();
    A.send("rematch");
    await Promise.all([A.next("peer"), B.next("peer")]);
    B.send("rematch");
    await Promise.all([A.next("restart"), B.next("restart")]);
    const fresh = await A.next("state", 5000, s => s.ply === 0);
    assert.strictEqual(fresh.over, null);
    assert.strictEqual(fresh.first, 1, "선공이 안 넘어갔다");
    assert.ok(fresh.left > 25000, "새 판인데 시계가 안 돈다");
    console.log("again   양쪽 동의로 재대국 · 선공 교대");

    /* ── 8. 나가기 ──────────────────────────────────────────────────── */
    A.drain(); B.drain();
    const firstMove = EG.gen({b: Int8Array.from(fresh.b),
        hand: [fresh.hand[0].slice(), fresh.hand[1].slice()], turn: fresh.turn})[0];
    (fresh.turn === 0 ? A : B).send("move", {m: firstMove, ply: 0});
    await Promise.all([A.next("moved"), B.next("moved")]);
    A.drain(); B.drain();
    A.send("leave");
    const gone = await B.next("over");
    assert.strictEqual(gone.why, "leave", "나가기가 패로 처리되지 않았다");
    assert.strictEqual(gone.winner, 1, "남은 쪽이 못 이겼다");
    const backToList = await A.next("rooms");
    assert.ok(Array.isArray(backToList.rooms), "나갔는데 목록을 안 준다");
    console.log("leave   나가기 = 패 · 남은 쪽 승 · 나간 사람은 목록으로");

    /* ── 9. 비공개 대국 ─────────────────────────────────────────────── */
    const D = await hello("pid-dddddddd-4");
    D.send("open", {open: false, pin: "4821"});
    const seatedD = await D.next("seated");
    assert.strictEqual(seatedD.open, false);
    const priv = seatedD.code;
    await D.next("state");
    D.send("open", {open: false, pin: "12"});     // 이미 앉아 있으니 거절
    assert.strictEqual((await D.next("error")).why, "joined");

    const E = await hello("pid-eeeeeeee-5");
    E.send("join", {code: priv});
    assert.strictEqual((await E.next("error")).why, "badpin", "비번 없이 들어갔다");
    E.send("join", {code: priv, pin: "0000"});
    assert.strictEqual((await E.next("error")).why, "badpin", "틀린 비번으로 들어갔다");
    E.send("join", {code: priv, pin: "4821"});
    assert.strictEqual((await E.next("seated")).side, 1, "맞는 비번인데 못 들어갔다");
    console.log("pin     비공개는 4자리 숫자 · 틀리면 거절");

    const F = await hello("pid-ffffffff-6");
    const seen2 = await F.next("rooms", 5000, r => r.rooms.some(x => x.code === priv));
    const prow = seen2.rooms.find(x => x.code === priv);
    assert.strictEqual(prow.open, false, "비공개가 공개로 보인다");
    assert.strictEqual(prow.state, "playing");
    console.log("list    비공개 대국도 목록에 뜬다 (잠김 표시)");

    [A, B, C, D, E, F].forEach(c => c.close());
    await wait(150);
    console.log("\n전부 통과");
    bye(0);
  } catch (e){
    console.error("\n실패:", e.message);
    bye(1);
  }
})();
