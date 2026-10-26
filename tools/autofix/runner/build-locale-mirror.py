#!/usr/bin/env python3
"""로컬라이즈 시트 CSV 내려받기 → 러너용 미러 TSV 한 장.

러너는 시트에 인증할 수 없다(시트가 링크 공개가 아니라 익명 요청은 401). 그래서 CSV를
받아오는 것은 로그인된 크롬이 있는 대화형 세션의 몫이고, 이 스크립트는 그렇게 받아 둔
CSV들을 에이전트가 grep하기 좋은 한 장으로 합치기만 한다.

받는 법(대화형 세션에서, 탭마다 한 번씩). **주소로 직접 이동**한다:
  https://docs.google.com/spreadsheets/d/17Yyg7-CfFxZEBFvIrGctFnTvZFpp0DaWVAMA_xlZlpw/export?format=csv&gid=<gid>
    Default  gid=1469350934      Dialogue  gid=0
  → 크롬이 「<시트명> - <탭명>.csv」로 저장한다. locale-<탭이름>.csv 로 옮긴 뒤 이 스크립트를 돌린다.

  사용: build-locale-mirror.py <CSV디렉터리> <출력.tsv>

⚠️ gviz(`/gviz/tq?tqx=out:csv`)로도 받아지고 탭 이름으로 부를 수 있어 편하지만, **충실한 export가
   아니다.** gviz는 열마다 타입을 추론해서 숫자 열에 든 텍스트 셀을 조용히 버린다 — 실제로
   A열(숫자)의 머리글 3칸(`#SheetIndex`·`#id`·`int`)이 빈 값으로 나왔다. 데이터 행은 전부
   온전했지만(2,399행 대조 확인), 조용히 버리는 성질 자체가 이 파이프라인에 두면 안 되는 종류다.
   `export?format=csv` 를 쓴다. (gviz는 페이지 안에서 fetch로 값을 확인할 때만 쓴다 —
   export 는 크로스오리진 리다이렉트라 fetch로는 못 받는다.)

출력 한 줄 = 항목 하나. kr 값 안의 줄바꿈은 \\n 으로 이스케이프해 grep이 한 줄로 잡게 한다.
"""

import csv
import datetime
import sys
from pathlib import Path

# 정본 탭만 넣는다. #Test·#Test2 는 Default 의 부분집합인 스크래치 탭이라 뺀다 —
# 키는 전부 Default 에도 있는데 값이 어긋난 것이 29개 있어(예: '고독' vs '고덕'),
# 넣으면 에이전트가 스크래치 행을 정본으로 지목하는 경로가 열린다.
SOURCE_TABS = ["Default", "Dialogue"]

# 열은 이름으로 찾는다. 위치는 탭마다 다르다 — Default 는 en 다음이 '#변경 여부'이고
# Dialogue 는 '#pt','#de'라 6번째부터 어긋난다.
#
# ⚠️ 행 식별자(1, 100001…) 열의 머리글은 '#id'인데, **같은 이름의 열이 하나 더 있다** —
#    O열의 '#id'는 인도네시아어다. 즉 이름으로 '#id'를 찾는 코드는 구현에 따라 A열을 잡기도,
#    인도네시아어 열을 잡기도 한다(first match냐 last match냐). 한국어를 인도네시아어 칸에 쓰는
#    사고가 여기서 난다. 그래서 행 식별자는 이름으로 찾지 않고 A열로 고정한다.
ID_COL = 0
WANTED = ["#분류값", "#서브 분류", "key", "kr", "en"]

HEADER_ROW = 1   # 0-based. 1행 설명 / 2행 이름 / 3행 타입 / 4행부터 데이터
DATA_START = 3


def esc(v: str) -> str:
    return v.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "").replace("\t", " ")


def load(path: Path, tab: str):
    rows = list(csv.reader(path.open(encoding="utf-8")))
    if len(rows) <= DATA_START:
        raise SystemExit(f"{path.name}: 데이터 행이 없다")

    header = rows[HEADER_ROW]

    # 이 시트에는 이름이 겹치는 열이 실제로 있다('#id' — A열과 인도네시아어). 이름으로 찾는
    # 열이 하나라도 중복이면 어느 쪽을 잡았는지가 우연에 달리므로 멈춘다.
    dupes = {n for n in WANTED if header.count(n) > 1}
    if dupes:
        raise SystemExit(
            f"{path.name}: 머리글이 중복이라 열을 특정할 수 없다: {sorted(dupes)}\n"
            f"  2행={header!r}"
        )

    idx = {}
    for name in WANTED:
        if name not in header:
            # 조용히 틀리느니 멈춘다. 열이 삽입·개명되면 여기서 잡힌다.
            raise SystemExit(
                f"{path.name}: 머리글 '{name}' 을 찾지 못했다 (2행={header!r}).\n"
                f"  시트 열 구성이 바뀌었다. 미러를 만들지 않고 멈춘다."
            )
        idx[name] = header.index(name)

    out = []
    for r in rows[DATA_START:]:
        if len(r) <= max(idx.values()):
            continue
        key = r[idx["key"]].strip()
        if not key:
            continue
        out.append([tab, r[ID_COL].strip(), *(esc(r[idx[n]]) for n in WANTED)])
    return out


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dest = Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser()

    entries, counts = [], {}
    for tab in SOURCE_TABS:
        p = src / f"locale-{tab}.csv"
        if not p.exists():
            raise SystemExit(f"CSV가 없다: {p} (탭 '{tab}' 을 먼저 내려받을 것)")
        rows = load(p, tab)
        counts[tab] = len(rows)
        entries += rows

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as f:
        f.write(f"# 로컬라이즈 시트 스냅샷 — {stamp} 기준\n")
        f.write("# 이 시각 이후 시트가 바뀌었을 수 있다. 값이 이슈 내용과 어긋나면 스냅샷이 낡은 것을 의심할 것.\n")
        f.write(f"# 탭: {', '.join(f'{t}({counts[t]}건)' for t in SOURCE_TABS)}"
                " · #Test·#Test2 는 Default 의 스크래치 사본이라 제외했다\n")
        f.write("# 열: tab \\t id \\t 분류 \\t 서브분류 \\t key \\t kr \\t en   (값 안의 줄바꿈은 \\n 으로 이스케이프)\n")
        f.write("tab\tid\t분류\t서브분류\tkey\tkr\ten\n")
        for e in entries:
            f.write("\t".join(e) + "\n")

    # 에이전트는 Edit 를 쥐고 acceptEdits 로 돈다. 프롬프트로만 "고치지 마라"라고 하면
    # 사본은 작업 트리 밖이라 git 이 못 잡고, 조용히 고쳐진 사본이 다음 건의 근거가 된다.
    dest.chmod(0o444)

    print(f"{dest} — {len(entries)}건 ({', '.join(f'{t} {counts[t]}' for t in SOURCE_TABS)}) · 스냅샷 {stamp}")


if __name__ == "__main__":
    main()
