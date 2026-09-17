# 동물쇼기 (Dōbutsu Shōgi)

3×4 판에서 두는 일본 **동물 쇼기**를 태블릿용 HTML5로 만드는 프로젝트.
두 사람이 태블릿을 눕혀놓고 마주 앉아 둔다.

`index.html`을 브라우저로 열면 곧바로 대국 화면이다. 규칙과 설계 기록은 오른쪽 아래 **규칙** 버튼을 누르면 서랍으로 열린다.

대국 화면의 원본은 `docs/design/motion.template.html`이고, 빌드하면 저장소 루트의 `index.html`이 된다:

```
cd docs/design && python build.py motion ../../index.html
```

---

## 지금까지 정한 것

| 항목 | 결정 |
|------|------|
| 방향 | **A · 나무와 먹** — 오동나무 판, 먹색 손그림, 오각 코마 |
| 프레임 | **P1 정통 오각** (실물 쇼기 코마 실루엣) |
| 이동 표시 | **먹색 점**, 기물을 둘러싼 가상 정사각형의 꼭짓점 4 + 변 중앙 4 |
| 내 코마 | 흰단풍 **가로결** |
| 상대 코마 | 오쿠메 **가로결** |
| 판 | 흰단풍 **세로결** (코마와 결 방향을 직각으로) |
| 진영 | 사자 진영 ↔ 호랑이 진영 (왕만 다르고 나머지 4종은 공통) |
| 기물 크기 | 칸의 84%. 병아리 66%, 기린 90%, 닭 95% |
| 배치 | 화면에서 4칸 가로 × 3칸 세로. 두 사람이 좌우에 마주 앉는다 |
| 기물 세트 | 동물 / 체스 먹선 / 체스 실루엣 — 대국 화면 우하단에서 전환 |
| 한 수 제한 | 30초 |

규칙 전문과 확정 사항은 [`docs/rules.md`](docs/rules.md).

---

## 구조

```
docs/
├── rules.md                  # 규칙 정리 + 구현 확정 사항
└── design/
    ├── build.py              # 템플릿 → 단일 HTML 빌드 (에셋을 data URI로 인라인)
    ├── *.template.html       # 편집하는 원본
    ├── *.html                # 빌드 산출물 (그대로 열면 동작)
    │                          #   motion만 저장소 루트 index.html 로 나간다
    ├── pieces/               # 기본 세트 8종 (알파 마스크 PNG)
    ├── pieces-x/             # 이스터에그 세트 8종
    ├── wood/                 # 목재 텍스처 (세로결 / -90 가로결)
    └── alt/                  # 대안 소스 비교용 (Fluent Emoji, CC0 실루엣)
assets/source/                # 원본 생성 이미지
tools/                        # 원본 이미지 → 알파 마스크 추출 스크립트
```

### 빌드

```bash
cd docs/design
python build.py motion      # motion.template.html → motion.html
```

`build.py`가 하는 일은 두 가지다.

1. `[[koma|<기물클래스>|<추가클래스>]]` 를 코마 마크업으로 전개 (이동 방향 점은 기물 종류에서 자동으로 뽑는다)
2. `ASSET:<경로>` 를 data URI로 치환 — 에셋마다 **한 번만** 등장하도록 CSS 클래스에서 참조하므로 중복되지 않는다

---

## 페이지

| 파일 | 내용 |
|------|------|
| `motion.html` | **플레이 가능한 프로토타입.** 착수 애니메이션, 합성 효과음, 전체 판정 |
| `directions.html` | 초기 시각 방향 3종 비교 (나무와 먹 / 원과 적목 / 밤과 빛) |
| `koma-test.html` | 라인아트를 오각 코마에 얹어본 것 + 대안 소스(Fluent Emoji, CC0) 비교 |
| `frames.html` | 프레임 9종(오각 6 · 사각 3) × 점/삼각형 표시 비교 |
| `wood.html` | 나뭇결 비교 + 두 세트 전체 기물 |

---

## 프로토타입에 들어간 것

**착수** — 기물을 탭하면 갈 수 있는 칸에 붉은 반투명 원이 뜬다. 원을 탭하면 들어 올려 호를 그리며 내려앉는다. 끌면 판에 붙은 채 미끄러진다.

**소리** — 오디오 파일 없이 Web Audio로 합성한다.
- 탁: 삼각파 185Hz + 사인 460Hz의 빠른 감쇠(나무 몸통) + 2kHz 대역통과 노이즈 30ms(부딪는 순간). 칠 때마다 음정 ±6% 변조
- 끄는 소리: 화이트 노이즈 → 700Hz 대역통과, 손가락 속도에 따라 음량·필터 실시간 변조
- 초읽기: 남은 5초부터 1초마다 딸깍

**잡기 연출 3종** — 들어내기(기본) / 밀어내기 / 뒤집기. 패널에서 전환.

**판정** — 캐치, 트라이, 스테일메이트, 3회 반복 무승부, 시간 초과.

---

## 크레딧

- 동물 그림: 프로젝트 작성자 생성 이미지 2세트 × 8종
- 목재 텍스처: [Poly Haven](https://polyhaven.com/textures/wood), CC0
- 비교용 에셋: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT), Wikimedia Commons (PD/CC0)
- 원작: どうぶつしょうぎ — 규칙 키타오 마도카(北尾まどか), 그림 후지타 마이코(藤田麻衣子), 2008

---

## 출처

- 목재 텍스처 — [Poly Haven](https://polyhaven.com/textures/wood), CC0
- 체스 기물 — [Cburnett](https://commons.wikimedia.org/wiki/User:Cburnett), Wikimedia Commons, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). `tools/fetch-chess-pieces.py` 로 받아 알파 마스크로 변환한다.
  chess.com 의 기물 이미지는 저작권이 있어 쓰지 않았다.
- 원작 — どうぶつしょうぎ, 규칙 키타오 마도카 · 그림 후지타 마이코, 2008
