/* ══════════════════════════════════════════════════════════════════════
   두는 사람 — 닉네임과 연승.

   사람을 알아보는 것은 pid 하나다. 브라우저가 처음 올 때 만들어 저장하고,
   그 뒤로는 계속 그것을 들고 온다. 첫 닉네임은 pid 에서 기계적으로 뽑는다 —
   그래서 처음 온 사람도 이름 없이 서 있는 일이 없다.

   이름은 고르는 것이 아니라 뽑는 것이다. 원하는 단어를 직접 쓸 수는 없고,
   앞말과 뒷말을 각각 다시 굴릴 수만 있다. 다시 굴리면 반드시 다른 말이 나온다.

   연승은 이름이 아니라 pid 에 붙는다. 그래서 이름이 바뀌어도 따라간다.

   메모리에만 둔다. 서버가 다시 뜨면 연승도 처음부터다 — 기록으로 남길 것은
   승패 집계뿐이라고 정했고, 연승은 그 자리에서 재미로 보는 것이다.
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

/* 앞말 96 × 뒷말 96 = 9216 가지 */
const HEAD = [
  "늠름한","재빠른","조용한","성난","느긋한","영리한","둔한","용감한",
  "수줍은","고집센","날쌘","묵직한","엉뚱한","단정한","무뚝뚝한","상냥한",
  "부지런한","게으른","깐깐한","너그러운","시끄러운","진지한","엄한","해맑은",
  "씩씩한","다부진","야무진","당당한","꿋꿋한","듬직한","우직한","진득한",
  "끈질긴","의젓한","점잖은","차분한","침착한","신중한","대담한","겁없는",
  "배짱좋은","넉살좋은","싹싹한","살가운","다정한","따뜻한","포근한","푸근한",
  "훈훈한","유쾌한","명랑한","쾌활한","활기찬","힘찬","기운찬","우렁찬",
  "재치있는","슬기로운","똑똑한","총명한","기발한","어수룩한","덜렁대는","새침한",
  "도도한","통통한","날씬한","튼튼한","단단한","굳센","억센","힘센",
  "발빠른","민첩한","날렵한","느린","굼뜬","나른한","졸린","배고픈",
  "심심한","궁금한","수상한","능청스런","천진한","순박한","소박한","검소한",
  "알뜰한","부드러운","사나운","무서운","수다스런","멋진","귀여운","말쑥한",
];
const TAIL = [
  "사자","호랑이","기린","코끼리","병아리","닭","여우","너구리",
  "수달","오소리","두루미","까치","올빼미","삵","담비","고라니",
  "다람쥐","멧돼지","노루","족제비","참새","두더지","살쾡이","백로",
  "곰","늑대","표범","말","소","양","염소","토끼",
  "사슴","낙타","하마","코뿔소","얼룩말","원숭이","고릴라","판다",
  "캥거루","코알라","나무늘보","고슴도치","두꺼비","개구리","도롱뇽","거북",
  "자라","도마뱀","구렁이","매","독수리","솔개","부엉이","까마귀",
  "제비","기러기","비둘기","갈매기","딱따구리","뻐꾸기","꾀꼬리","종달새",
  "황새","왜가리","원앙","오리","거위","공작","앵무새","펭귄",
  "물개","바다표범","돌고래","고래","상어","가오리","문어","오징어",
  "게","새우","잉어","붕어","메기","가재","개미","벌",
  "나비","잠자리","사마귀","매미","귀뚜라미","반딧불이","달팽이","쥐",
];

/* 해시의 낮은 비트를 마저 흩는다.
   FNV 도 djb2 도 아래쪽 비트가 잘 안 섞인다. 96 = 32×3 이라 나머지를 구할 때
   그 낮은 비트를 그대로 쓰게 되고, 그러면 어떤 말은 열 배 자주 나온다.
   실제로 "발빠른 캥거루"와 "발빠른 물개"가 연달아 나왔다. */
function mix(x){
  x ^= x >>> 16; x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}
/* pid 를 두 갈래로 흩어 앞말과 뒷말을 고른다 — 처음 받는 이름 */
function seedOf(pid){
  let a = 2166136261, b = 5381;
  for (let i = 0; i < pid.length; i++){
    a = (Math.imul(a ^ pid.charCodeAt(i), 16777619)) >>> 0;
    b = ((Math.imul(b, 33)) ^ pid.charCodeAt(i)) >>> 0;
  }
  return {h: mix(a) % HEAD.length, t: mix(b) % TAIL.length};
}
const join  = p => HEAD[p.h] + " " + TAIL[p.t];
const nameOf = pid => join(seedOf(pid));

/* 같은 말이 다시 나오면 안 굴린 것처럼 보인다. 반드시 다른 자리를 준다 */
function other(cur, n){
  let k = (Math.random() * (n - 1)) | 0;
  if (k >= cur) k++;
  return k;
}
/* part 는 "head" 나 "tail". 그 한쪽만 다시 뽑는다 */
function reroll(p, part){
  if (!p) return false;
  if (part === "head")      p.h = other(p.h, HEAD.length);
  else if (part === "tail") p.t = other(p.t, TAIL.length);
  else return false;
  p.name = join(p);
  return true;
}

/* 연승 뱃지 — 2연승부터 보인다 */
function badge(streak){
  if (streak >= 10) return "gold";
  if (streak >= 5)  return "crimson";
  if (streak >= 2)  return "navy";
  return null;
}

const people = new Map();                // pid → {pid, h, t, name, streak, dcRun, seen}
const MAX = 5000;                        // 무료 인스턴스다. 무한정 쌓지 않는다

function get(pid){
  let p = people.get(pid);
  if (!p){
    if (people.size >= MAX){             // 가장 오래 안 온 사람부터 비운다
      let old = null;
      for (const q of people.values()) if (!old || q.seen < old.seen) old = q;
      if (old) people.delete(old.pid);
    }
    const s = seedOf(pid);
    p = {pid, h: s.h, t: s.t, name: join(s), streak: 0, dcRun: 0, seen: 0};
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

/* 밖으로 내보내는 모습. 앞말과 뒷말을 따로 실어야 다시 굴릴 칸을 그린다 */
const view = p => p ? {pid: p.pid, name: p.name, head: HEAD[p.h], tail: TAIL[p.t],
                       streak: p.streak, badge: badge(p.streak)} : null;

module.exports = {get, settle, view, badge, nameOf, reroll, HEAD, TAIL};
