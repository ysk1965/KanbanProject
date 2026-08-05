#!/usr/bin/env python3
"""로컬라이즈 시트 CSV 내려받기 → 러너용 미러 TSV 한 장.

러너는 시트에 인증할 수 없다(시트가 링크 공개가 아니라 익명 요청은 401). 그래서 CSV를
받아오는 것은 로그인된 크롬이 있는 대화형 세션의 몫이고, 이 스크립트는 그렇게 받아 둔
CSV들을 에이전트가 grep하기 좋은 한 장으로 합치기만 한다.

받는 법(대화형 세션에서, 탭마다 한 번씩):
  https://docs.google.com/spreadsheets/d/<시트ID>/gviz/tq?tqx=out:csv&headers=0&sheet=<탭이름>
  → 크롬이 data.csv 로 저장한다. locale-<탭이름>.csv 로 옮긴 뒤 이 스크립트를 돌린다.
  (같은 페이지 안에서 fetch+blob 으로 연속 저장하면 크롬이 2번째부터 자동 차단한다.
   주소로 직접 이동하는 편이 확실하다.)

  사용: build-locale-mirror.py <CSV디렉터리> <출력.tsv>

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
# ⚠️ 행 식별자(1, 100001…) 열은 **머리글이 비어 있다.** 이름으로 찾을 수 없어 A열로 고정한다.
#    그리고 '#id'는 행 식별자가 아니라 **인도네시아어** 열이다. 이름으로 '#id'를 찾으면
#    엉뚱한 언어 열이 잡힌다.
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
