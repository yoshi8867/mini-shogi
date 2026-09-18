/* ══════════════════════════════════════════════════════════════════════
   두는 사람 — 닉네임과 연승.

   사람을 알아보는 것은 pid 하나다. 브라우저가 처음 올 때 만들어 저장하고,
   그 뒤로는 계속 그것을 들고 온다. 닉네임은 pid 에서 기계적으로 뽑는다 —
   고른 것이 아니라 주어진 것이므로 고칠 수 없고, 같은 사람은 늘 같은 이름이다.

   연승은 이름이 아니라 pid 에 붙는다. 그래서 이름이 바뀌어도 따라간다.

   메모리에만 둔다. 서버가 다시 뜨면 연승도 처음부터다 — 기록으로 남길 것은
   승패 집계뿐이라고 정했고, 연승은 그 자리에서 재미로 보는 것이다.
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

/* 닉네임은 고른 단어를 조립해 만든다. 앞말 24 × 뒷말 24 = 576 가지 */
const HEAD = ["늠름한","재빠른","조용한","성난","느긋한","영리한","둔한","용감한",
              "수줍은","고집센","날쌘","묵직한","엉뚱한","단정한","무뚝뚝한","상냥한",
              "부지런한","게으른","깐깐한","너그러운","시끄러운","진지한","엄한","해맑은"];
const TAIL = ["사자","호랑이","기린","코끼리","병아리","닭","여우","너구리",
              "수달","오소리","두루미","까치","올빼미","삵","담비","고라니",
              "다람쥐","멧돼지","노루","족제비","참새","두더지","살쾡이","백로"];

/* pid 를 두 갈래로 흩어 앞말과 뒷말을 고른다 */
function nameOf(pid){
  let a = 2166136261, b = 5381;
  for (let i = 0; i < pid.length; i++){
    a = ((a ^ pid.charCodeAt(i)) * 16777619) >>> 0;
    b = ((b * 33) ^ pid.charCodeAt(i)) >>> 0;
  }
  return HEAD[a % HEAD.length] + " " + TAIL[b % TAIL.length];
}

/* 연승 뱃지 — 2연승부터 보인다 */
function badge(streak){
  if (streak >= 10) return "gold";
  if (streak >= 5)  return "crimson";
  if (streak >= 2)  return "navy";
  return null;
}

const people = new Map();                // pid → {pid, name, streak, dcRun, seen}
const MAX = 5000;                        // 무료 인스턴스다. 무한정 쌓지 않는다

function get(pid){
  let p = people.get(pid);
  if (!p){
    if (people.size >= MAX){             // 가장 오래 안 온 사람부터 비운다
      let old = null;
      for (const q of people.values()) if (!old || q.seen < old.seen) old = q;
      if (old) people.delete(old.pid);
    }
    p = {pid, name: nameOf(pid), streak: 0, dcRun: 0, seen: 0};
    people.set(pid, p);
  }
  p.seen = Date.now();
  return p;
}

/* 한 판이 끝났다. why 가 무엇이었는지에 따라 연승이 달라진다.
   · 이기면 늘어나고, 지면 깨진다. 무승부는 그대로 둔다.
   · 끊겨서 끝난 판은 진 것으로 치지 않는다 — 네트워크는 사람 잘못이 아니다.
     다만 그런 판이 연달아 셋이면 연승을 인정하지 않는다. */
function settle(p, result, byDisconnect){
  if (!p) return;
  if (byDisconnect){
    p.dcRun++;
    if (p.dcRun >= 3){ p.streak = 0; p.dcRun = 0; }
    return;
  }
  p.dcRun = 0;
  if (result === "win")  p.streak++;
  else if (result === "loss") p.streak = 0;
  // 무승부는 건드리지 않는다
}

const view = p => p ? {pid: p.pid, name: p.name, streak: p.streak,
                       badge: badge(p.streak)} : null;

module.exports = {get, settle, view, badge, nameOf, HEAD, TAIL};
