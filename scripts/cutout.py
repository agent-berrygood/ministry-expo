"""인물 사진 배경 지우기 (PRD 4.8). 외부 서비스 없이 이 컴퓨터에서 처리한다.

단색·그라데이션 배경(스튜디오 회색 배경 등)에서 가운데 서 있는 사람을 잘라
투명 배경 PNG로 저장한다. OpenCV GrabCut을 쓰고, 배경색 추정으로 초기 마스크를 잡는다.

사용: python scripts/cutout.py 입력.jpg 출력.png
필요: pip install opencv-python-headless numpy
"""

import sys

import cv2
import numpy as np

WORK_HEIGHT = 1400  # 계산용 축소 높이 (결과는 원본 해상도로 다시 키운다)


def cutout(src: str, dst: str) -> None:
    img = cv2.imdecode(np.fromfile(src, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"이미지를 읽을 수 없음: {src}")
    h0, w0 = img.shape[:2]
    scale = WORK_HEIGHT / h0
    small = cv2.resize(img, (round(w0 * scale), WORK_HEIGHT), interpolation=cv2.INTER_AREA)
    h, w = small.shape[:2]

    # 배경색 추정: 좌우 가장자리 띠의 행별 평균색 (위아래로 밝기가 변하는 그라데이션 배경 대응)
    band = max(4, w // 25)
    edge = np.concatenate([small[:, :band], small[:, -band:]], axis=1).astype(np.float32)
    row_bg = cv2.GaussianBlur(edge.mean(axis=1, keepdims=True), (1, 51), 0)  # (h,1,3)
    diff = np.linalg.norm(small.astype(np.float32) - row_bg, axis=2)

    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    mask[diff > 38] = cv2.GC_PR_FGD
    mask[diff < 10] = cv2.GC_BGD
    # 가장자리는 확실한 배경, 가운데 몸통 줄기는 확실한 사람
    mask[:, :band] = cv2.GC_BGD
    mask[:, -band:] = cv2.GC_BGD
    mask[: h // 60, :] = cv2.GC_BGD
    cx = w // 2
    mask[int(h * 0.45) : h, cx - w // 30 : cx + w // 30] = cv2.GC_FGD

    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(small, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # 가장 큰 덩어리만 남기고 구멍을 메운다
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = np.where(labels == biggest, 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    # 흰 셔츠가 회색 배경과 비슷해 목·가슴에 구멍이 나는 경우를 메운다.
    # 바깥과 이어지지 않은 구멍 중 몸 가운데 위쪽에 있는 것만 메운다(팔과 몸 사이 빈틈은 그대로 둔다).
    holes = cv2.bitwise_not(fg)
    flood = holes.copy()
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 0)
    n, labels, stats, cents = cv2.connectedComponentsWithStats(flood, 8)
    for i in range(1, n):
        x, y = cents[i]
        if abs(x - cx) < w * 0.12 and y < h * 0.6:
            fg[labels == i] = 255

    # 원본 크기로 키우고 가장자리를 살짝 부드럽게
    alpha = cv2.resize(fg, (w0, h0), interpolation=cv2.INTER_LINEAR)
    alpha = cv2.GaussianBlur(alpha, (0, 0), sigmaX=max(1.0, h0 / 1600))
    out = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    out[:, :, 3] = alpha
    ok, buf = cv2.imencode(".png", out)
    if not ok:
        raise SystemExit("PNG 저장 실패")
    buf.tofile(dst)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    cutout(sys.argv[1], sys.argv[2])
