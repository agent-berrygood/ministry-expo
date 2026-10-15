# 사역박람회 웹앱

개발 기준 문서는 [docs/PRD.md](docs/PRD.md)다. 작업 전에 읽고, 구현이 PRD와 달라지면 PRD를 먼저 고친다.

핵심 규칙 요약:
- 봉사자 명단·직분·연락처 등 개인정보는 데이터와 코드에 넣지 않는다. 예외는 본인 동의를 받은 부스 담당자·목회자 사진과, 그 사진 파일명의 이름뿐이다 (PRD 1.4, 4.8).
- 부서 이름과 문구는 `public/data/*.json`에만 둔다. 코드에 하드코딩하지 않는다.
- 사진은 `photos/{boothId}_{부서명}/`에 넣는 것이 유일한 방법이다. `public/photos/`와 `photos.json`은 생성물이라 손대지 않는다 (PRD 4.6).
- 인물 사진은 `photos/{boothId}_{부서명}/staff.png`, `photos/_entrance/`, `photos/_hidden/`에 넣는다. `public/figures/`와 `figures.json`은 생성물이다 (PRD 4.8).
- 사진 원본은 구글 드라이브 보관소(`.env.local`의 `PHOTO_ORIGINALS_DIR`)에 백업한 뒤에만 줄인다. 경로를 코드에 하드코딩하지 않고, 보관소의 파일은 지우거나 덮어쓰지 않는다.
- 부스·존·노드 ID는 PRD 3.1과 5.3의 규칙을 따르고, 한 번 정한 ID는 바꾸지 않는다.
- 스택은 Vite + TypeScript(strict) + Three.js + 순수 DOM/CSS다. 의존성을 추가하려면 PRD 6.1을 먼저 갱신한다.
- `scene/`과 `ui/`는 서로 직접 참조하지 않고 `src/events.ts`로만 통신한다.
- 커밋 메시지는 `type: 요약` 형식이다 (feat, fix, content, style, refactor, docs, chore).
