// --- 1. HEX MATH (Axial Coordinates: q, r) ---

// Convert Array(row, col) to Axial(q, r)
function oddQToAxial(row, col) {
    var q = col;
    var r = row - (col - (col & 1)) / 2;
    return { q: q, r: r };
}

// Convert Axial(q, r) to Array(row, col)
function axialToOddQ(q, r) {
    var col = q;
    var row = r + (q - (q & 1)) / 2;
    return { r: row, c: col };
}

// Rotate Axial vector (q, r) 60 degrees clockwise
// Formula: (q, r) -> (-r, q + r)
function rotate60(q, r) {
    return { q: -r, r: q + r };
}

// --- 2. GLOBAL STATE ---
const ROWS = 4; // 맵 크기를 조금 더 키워 안정적인 원형 출력
const COLS = 7;
const HEX_SIZE = 64; // 반지름
let grid = []; // 2D array storing values: -1(null), 0(open), 1-3(hp), 0.5(white)
let mode = 'play'; // 'play' or 'edit'
let editVal = 3;

// --- 추가 전역 상태 ---
let isPlacementMode = false; // 배치 모드 활성화 여부
let selectedTreasureId = null; // 현재 선택된 보물 ID
let currentRotationPoints = []; // 선택된 보물의 현재 회전된 포인트 목록
let hiddenGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(false)); // 실제 숨겨진 보물 위치를 저장할 2차원 배열
let previewHexes = []; // 미리보기 중인 DOM 요소들 저장
let lastHoveredHex = null; // 마지막으로 호버된 hex 좌표
let placedTreasures = []; // 배치 확정된 보물 인스턴스 저장

// Treasure Definition: Array of {q, r} offsets relative to center (0,0)
let treasures = [
    { id: 1, name: "점", points: [{ q: 0, r: 0 }], active: true },
    { id: 2, name: "직선3", points: [{ q: 0, r: 0 }, { q: 0, r: -1 }, { q: 0, r: 1 }], active: true },
    { id: 3, name: "삼각", points: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], active: true }
];

const STAGE_DATA = {
    'stage1': [
        [-1, 1, 1, 1, 1, 2, -1],
        [1, 1, 0.5, 1, 1, 1, 1],
        [1, 2, 1, 1, 1, 0.5, 1],
        [-1, -1, 1, -1, 1, -1, -1]
    ],
    'stage2': [
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3]
    ],
    'stage3': [
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3]
    ],
    'stage4': [
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3]
    ]
};

// --- 3. INITIALIZATION & PRESETS ---

function changeBoardPreset() {
    const presetType = document.getElementById('board-preset').value;
    initBoard(presetType);
}

function resetBoard() {
    const presetType = document.getElementById('board-preset').value;
    initBoard(presetType);
}

function initBoard(stage = 'stage1') {
    grid = [];
    const container = document.getElementById('grid-container');
    container.innerHTML = '';

    // hiddenGrid 초기화
    hiddenGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    // 배치된 보물 목록 초기화
    placedTreasures = [];

    const width = 2 * HEX_SIZE;
    const height = Math.sqrt(3) * HEX_SIZE;

    // 현재 선택된 스테이지의 데이터 가져오기 (없으면 빈 배열)
    const currentLayout = STAGE_DATA[stage] || [];

    for (let r = 0; r < ROWS; r++) {
        let rowArr = [];
        for (let c = 0; c < COLS; c++) {
            // 하드코딩된 배열에서 값 추출 (데이터가 없으면 -1 기본값)
            let val = (currentLayout[r] && currentLayout[r][c] !== undefined)
                ? currentLayout[r][c]
                : -1;

            rowArr.push(val);

            // DOM 생성 및 배치 로직
            let hex = document.createElement('div');
            hex.className = 'hex';
            hex.dataset.r = r;
            hex.dataset.c = c;

            // Flat-topped Pixel 좌표 계산 (Odd-Q)
            const x = c * (width * 0.75);
            const y = r * height + ((c % 2) * (height / 2));

            hex.style.left = `${x}px`;
            hex.style.top = `${y}px`;
            hex.onclick = () => onHexClick(r, c);
            hex.onmouseover = () => onHexHover(r, c);

            container.appendChild(hex);
        }
        grid.push(rowArr);
    }
    renderGrid();
    renderVisualTreasureList();
    renderPlacedList(); // 배치된 보물 목록 초기화

    // 보드가 초기화되자마자 확률 계산을 실행하여 화면에 표시
    runSolver();
}

function renderGrid() {
    const hexes = document.querySelectorAll('.hex');
    hexes.forEach(el => {
        const r = parseInt(el.dataset.r);
        const c = parseInt(el.dataset.c);
        const val = grid[r][c];

        el.dataset.val = val;
        el.innerHTML = '';
        el.classList.remove('best-pick');
        el.style.backgroundColor = '';

        // --- 보물 표시 레이어 추가 ---
        if (hiddenGrid[r] && hiddenGrid[r][c]) {
            const indicator = document.createElement('div');
            indicator.className = 'treasure-indicator';
            el.appendChild(indicator);
            el.classList.add('has-treasure');
        } else {
            el.classList.remove('has-treasure');
        }

        // --- 확률 텍스트 레이어 ---
        let probSpan = document.createElement('span');
        probSpan.className = 'prob-text';
        probSpan.innerText = '0'; // 초기 확률
        el.appendChild(probSpan);
    });
}

// --- 4. INTERACTION ---
function setMode(m) {
    mode = m;

    // 버튼 UI 업데이트
    document.getElementById('btn-play').className = m === 'play' ? 'active' : '';
    document.getElementById('btn-edit').className = m === 'edit' ? 'active' : '';
    document.getElementById('edit-palette').style.display = m === 'edit' ? 'flex' : 'none';

    // 컨테이너 클래스 조작 (CSS 연동)
    const container = document.getElementById('grid-container');
    if (m === 'edit') {
        container.classList.add('editing');
    } else {
        container.classList.remove('editing');
    }
}

function onHexClick(r, c) {
    // 1. 배치 모드 처리
    if (isPlacementMode) {
        if (selectedTreasureId) {
            // 보물 배치 로직
            const targetCoords = calculatePlacementCoords(r, c);

            // 최종 유효성 검사 (-1만 아니면 배치 가능)
            let isValid = true;
            for (let coord of targetCoords) {
                if (coord.r < 0 || coord.r >= ROWS || coord.c < 0 || coord.c >= COLS ||
                    (hiddenGrid[coord.r] && hiddenGrid[coord.r][coord.c]) ||
                    grid[coord.r][coord.c] === -1) { // -1(없음) 블럭만 아니면 모두 허용
                    isValid = false; break;
                }
            }

            if (isValid) {
                const treasureTemplate = treasures.find(t => t.id === selectedTreasureId);

                // 1. 데이터 기록
                targetCoords.forEach(coord => {
                    if (!hiddenGrid[coord.r]) {
                        hiddenGrid[coord.r] = [];
                    }
                    hiddenGrid[coord.r][coord.c] = true;
                });

                // 2. 배치된 목록에 추가
                placedTreasures.push({
                    ...treasureTemplate,
                    points: [...currentRotationPoints], // 현재 회전 상태 저장
                    placedAt: { r, c }
                });

                // 3. 상태 업데이트
                selectedTreasureId = null;
                currentRotationPoints = [];
                clearPlacementPreview();
                renderVisualTreasureList(); // 왼쪽 상단 갱신
                renderPlacedList(); // 왼쪽 하단 갱신
                renderGrid();      // 보드판 갱신 (보물 표시)
                runSolver();       // 보물 위치 확정에 따른 확률 재계산
            } else {
                alert("이 위치에는 배치할 수 없습니다.");
            }
        } else if (hiddenGrid[r] && hiddenGrid[r][c]) {
            // 보물이 이미 있는 곳을 클릭하면 해당 보물을 찾아 회수
            const tIndex = placedTreasures.findIndex(t => {
                // 이 보물의 점유 칸 중 현재 클릭한 (r, c)가 포함되는지 확인
                const centerAxial = oddQToAxial(t.placedAt.r, t.placedAt.c);
                return t.points.some(p => {
                    const pos = axialToOddQ(centerAxial.q + p.q, centerAxial.r + p.r);
                    return pos.r === r && pos.c === c;
                });
            });

            if (tIndex !== -1) {
                removeTreasure(tIndex);
            }
        }
        return; // 배치 모드에서는 채굴 로직 실행 안 함
    }

    // 2. 기존 편집/채굴 모드 처리
    if (mode === 'edit') {
        grid[r][c] = editVal;
        renderGrid();
    } else {
        // Play Mode: Mine logic
        mineBlock(r, c);
        // 보물 발견 체크
        checkTreasureFound(r, c);
    }
}

function mineBlock(r, c) {
    let val = grid[r][c];
    if (val <= 0 && val !== 0.5) return; // Already open or null

    // Hit Logic
    if (val === 0.5) {
        // White block breaks instantly -> Trigger Chain
        grid[r][c] = 0;
        chainReaction(r, c);
    } else {
        grid[r][c]--;
        if (grid[r][c] === 0) {
            chainReaction(r, c);
        }
    }
    renderGrid();
    runSolver(); // 항상 최신 확률 유지
}

// Chain Reaction: Check neighbors. If neighbor is 0.5, break it and recurse.
function chainReaction(r, c) {
    // Axial neighbors directions
    const directions = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];

    let queue = [{ r, c }];
    let processed = new Set(); // Avoid infinite loops

    while (queue.length > 0) {
        let curr = queue.shift();
        let currAxial = oddQToAxial(curr.r, curr.c);

        // Check 6 neighbors
        for (let d of directions) {
            let nAxial = { q: currAxial.q + d.q, r: currAxial.r + d.r };
            let nArr = axialToOddQ(nAxial.q, nAxial.r);

            // Boundary Check
            if (nArr.r >= 0 && nArr.r < ROWS && nArr.c >= 0 && nArr.c < COLS) {
                let nVal = grid[nArr.r][nArr.c];

                // IF neighbor is White Block (0.5), it breaks!
                if (nVal === 0.5) {
                    grid[nArr.r][nArr.c] = 0; // Break
                    let key = `${nArr.r},${nArr.c}`;
                    if (!processed.has(key)) {
                        processed.add(key);
                        queue.push({ r: nArr.r, c: nArr.c }); // Recurse
                    }
                }
            }
        }
    }
}

// --- 5. TREASURE EDITOR ---
let editorGrid = []; // Stores boolean for 5x5 mini grid
const EDITOR_SIZE = 5; // -2 to +2 range

function renderTreasureList() {
    const list = document.getElementById('treasure-list');
    list.innerHTML = '';
    treasures.forEach((t, idx) => {
        let div = document.createElement('div');
        div.className = `treasure-item ${t.active ? 'selected' : ''}`;
        div.onclick = (e) => {
            if (e.target.className.includes('del-btn')) return;
            t.active = !t.active;
            renderTreasureList();
        };

        div.innerHTML = `<span>${t.name}</span>`;

        let del = document.createElement('div');
        del.className = 'del-btn';
        del.innerText = 'X';
        del.onclick = () => {
            treasures.splice(idx, 1);
            renderTreasureList();
        };
        div.appendChild(del);
        list.appendChild(div);
    });
}

function openEditor() {
    document.getElementById('modal-overlay').style.display = 'flex';
    initEditorGrid();
}
function closeEditor() {
    document.getElementById('modal-overlay').style.display = 'none';
}

function initEditorGrid() {
    const container = document.getElementById('editor-grid');
    container.innerHTML = '';
    editorGrid = []; // Reset state

    // 컨테이너 크기 고정 및 기준점 설정
    container.style.position = 'relative';
    container.style.width = '200px';
    container.style.height = '180px';

    const MINI_HEX_W = 30;
    const MINI_HEX_H = 26;

    for (let r = -2; r <= 2; r++) {
        for (let q = -2; q <= 2; q++) {
            if (Math.abs(q) <= 2 && Math.abs(r) <= 2 && Math.abs(q + r) <= 2) {
                let btn = document.createElement('div');
                btn.className = 'mini-hex';
                if (q === 0 && r === 0) btn.classList.add('center-point');

                // 수학적 좌표 계산 (Flat-topped Hex)
                const x = q * (MINI_HEX_W * 0.75) + 85; // 85는 중앙 정렬용 offset
                const y = r * MINI_HEX_H + (q % 2) * (MINI_HEX_H / 2) + 75;

                btn.style.left = `${x}px`;
                btn.style.top = `${y}px`;
                btn.style.position = 'absolute';

                btn.dataset.q = q;
                btn.dataset.r = r;
                btn.onclick = function () {
                    this.classList.toggle('active');
                };
                container.appendChild(btn);
            }
        }
    }
}

function saveTreasure() {
    let activeCells = document.querySelectorAll('.mini-hex.active');
    if (activeCells.length === 0) {
        alert("최소 1칸 이상 선택해야 합니다.");
        return;
    }

    let points = [];
    activeCells.forEach(cell => {
        points.push({
            q: parseInt(cell.dataset.q),
            r: parseInt(cell.dataset.r)
        });
    });

    treasures.push({
        id: Date.now(),
        name: "Custom",
        points: points,
        active: true
    });

    closeEditor();
    renderVisualTreasureList();
}

// --- 비주얼 보물 목록 및 배치 모드 ---

// 보물 포인트 배열을 받아 SVG 문자열을 생성하는 도우미 함수
function generateTreasureSVG(points) {
    const hexRadius = 10; // 미니맵용 반지름
    const hexWidth = hexRadius * 2;
    const hexHeight = Math.sqrt(3) * hexRadius;

    // SVG viewBox 계산을 위한 경계박스(Bounding Box) 찾기
    let minQ = 0, maxQ = 0, minR = 0, maxR = 0;
    points.forEach(p => {
        minQ = Math.min(minQ, p.q); maxQ = Math.max(maxQ, p.q);
        minR = Math.min(minR, p.r); maxR = Math.max(maxR, p.r);
    });

    // Flat-topped 좌표계에서 중심 좌표 계산
    const getMiniXY = (q, r) => {
        const x = q * (hexWidth * 0.75);
        const y = r * hexHeight + ((q % 2) * (hexHeight / 2));
        return { x, y };
    };

    let svgContent = '';
    // Flat-topped 육각형 경로 정의
    const hexPath = `M ${hexRadius / 2} ${-hexHeight / 2} L ${hexRadius * 1.5} ${-hexHeight / 2} L ${2 * hexRadius} 0 L ${hexRadius * 1.5} ${hexHeight / 2} L ${hexRadius / 2} ${hexHeight / 2} L 0 0 Z`;

    points.forEach(p => {
        const pos = getMiniXY(p.q, p.r);
        const isCenter = p.q === 0 && p.r === 0;
        // 중심점은 다른 클래스 적용
        svgContent += `<path d="${hexPath}" transform="translate(${pos.x}, ${pos.y})" class="${isCenter ? 'center-hex' : ''}" />`;
    });

    // viewBox 설정 (약간의 여백 포함)
    const boxSize = 150;
    const centerOffset = boxSize / 2;

    return `<svg class="treasure-svg" viewBox="0 0 ${boxSize} ${boxSize}">
                <g transform="translate(${centerOffset}, ${centerOffset})">
                    ${svgContent}
                </g>
            </svg>`;
}

// 비주얼 목록 렌더링 함수
function renderVisualTreasureList() {
    const listContainer = document.getElementById('visual-treasure-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    treasures.forEach(t => {
        if (!t.active) return; // 활성화된 것만 표시

        // 1. 현재 배치된 보물 목록(placedTreasures)에 해당 보물 ID가 있는지 확인
        const isPlaced = placedTreasures.some(pt => pt.id === t.id);

        // 2. 이미 배치된 보물은 목록에서 제외 (최대 한 번만 배치 가능)
        if (isPlaced) return;

        let div = document.createElement('div');
        div.className = `visual-treasure-item ${t.id === selectedTreasureId ? 'selected' : ''}`;
        div.innerHTML = generateTreasureSVG(t.points);
        div.title = t.name; // 툴팁으로 이름 표시

        div.onclick = () => selectTreasureForPlacement(t.id);
        listContainer.appendChild(div);
    });

    // 회전 컨트롤 표시 여부 업데이트
    const rotationControls = document.getElementById('rotation-controls');
    if (rotationControls) {
        rotationControls.style.display = selectedTreasureId ? 'flex' : 'none';
    }
}

// 배치 모드 토글
function togglePlacementMode() {
    isPlacementMode = !isPlacementMode;
    const btn = document.getElementById('btn-place-mode');
    if (btn) {
        btn.innerText = `배치 모드 (${isPlacementMode ? 'ON' : 'OFF'})`;
        btn.classList.toggle('active', isPlacementMode);
    }

    if (!isPlacementMode) {
        clearPlacementPreview(); // 모드 종료 시 미리보기 제거
        selectedTreasureId = null;
        currentRotationPoints = [];
        renderVisualTreasureList();
    }
}

// 보물 선택 처리
function selectTreasureForPlacement(id) {
    if (selectedTreasureId === id) {
        // 이미 선택된 것 다시 클릭 시 선택 해제
        selectedTreasureId = null;
        currentRotationPoints = [];
    } else {
        selectedTreasureId = id;
        const treasure = treasures.find(t => t.id === id);
        // 선택 시 초기 포인트 복사 (깊은 복사 필요)
        currentRotationPoints = treasure.points.map(p => ({ ...p }));

        if (!isPlacementMode) {
            togglePlacementMode(); // 선택 시 자동으로 배치 모드 활성화
        }
    }
    renderVisualTreasureList();
}

// 선택된 보물 회전 (dir: 1=시계, -1=반시계)
function rotateSelectedTreasure(dir) {
    if (!selectedTreasureId) return;

    // 60도 회전 공식 적용
    currentRotationPoints = currentRotationPoints.map(p => {
        // 시계 방향: (q, r) -> (-r, q + r)
        // 반시계 방향: 시계방향으로 5번 회전과 동일
        let q = p.q, r = p.r;
        const rotations = dir === 1 ? 1 : 5;
        for (let i = 0; i < rotations; i++) {
            let nextQ = -r;
            let nextR = q + r;
            q = nextQ; r = nextR;
        }
        return { q, r };
    });

    // 마지막 호버 위치가 있으면 미리보기 갱신
    if (lastHoveredHex) {
        onHexHover(lastHoveredHex.r, lastHoveredHex.c);
    }
}

// 좌표 계산 도우미 함수 (핵심 수학 로직)
function calculatePlacementCoords(centerR, centerC) {
    const centerAxial = oddQToAxial(centerR, centerC);
    let coords = [];

    currentRotationPoints.forEach(p => {
        // 중심 Axial 좌표에 상대 좌표 더하기
        const targetQ = centerAxial.q + p.q;
        const targetR = centerAxial.r + p.r;
        // 다시 그리드(Odd-Q) 좌표로 변환
        coords.push(axialToOddQ(targetQ, targetR));
    });
    return coords;
}

// 마우스 오버 시 배치 미리보기
function onHexHover(r, c) {
    if (!isPlacementMode || !selectedTreasureId) return;

    lastHoveredHex = { r, c };
    clearPlacementPreview();

    const targetCoords = calculatePlacementCoords(r, c);
    let isValidPlacement = true;

    // 1차 유효성 검사: 경계 및 배치 가능 블록 확인
    for (let coord of targetCoords) {
        if (coord.r < 0 || coord.r >= ROWS || coord.c < 0 || coord.c >= COLS) {
            isValidPlacement = false; break;
        }
        // -1만 아니면 배치가 가능하도록 조건 완화
        if (hiddenGrid[coord.r][coord.c] || grid[coord.r][coord.c] === -1) {
            isValidPlacement = false; break;
        }
    }

    // 미리보기 클래스 적용
    const container = document.getElementById('grid-container');
    targetCoords.forEach(coord => {
        if (coord.r >= 0 && coord.r < ROWS && coord.c >= 0 && coord.c < COLS) {
            // data 속성으로 해당 hex 찾기
            const hex = container.querySelector(`.hex[data-r="${coord.r}"][data-c="${coord.c}"]`);
            if (hex) {
                hex.classList.add(isValidPlacement ? 'placement-valid' : 'placement-invalid');
                previewHexes.push(hex);
            }
        }
    });
}

// 미리보기 초기화
function clearPlacementPreview() {
    previewHexes.forEach(hex => {
        hex.classList.remove('placement-valid', 'placement-invalid');
    });
    previewHexes = [];
}

// 보물 발견 체크 함수
function checkTreasureFound(r, c) {
    if (hiddenGrid[r] && hiddenGrid[r][c]) {
        // 보물 발견!
        document.getElementById('log-area').innerText = `🎉 보물 발견! (${r}, ${c})`;

        // hiddenGrid[r][c] = false; // 배치가 유지되길 원하므로 데이터를 삭제하지 않습니다.

        runSolver(); // 확률 재계산
        renderPlacedList(); // 목록 갱신
    }
}

// 보물 회수 핵심 함수
function removeTreasure(index) {
    const treasure = placedTreasures[index];
    if (!treasure) return;

    // 1. 해당 보물이 차지했던 모든 절대 좌표 계산
    const centerAxial = oddQToAxial(treasure.placedAt.r, treasure.placedAt.c);

    treasure.points.forEach(p => {
        const targetAxialQ = centerAxial.q + p.q;
        const targetAxialR = centerAxial.r + p.r;
        const targetPos = axialToOddQ(targetAxialQ, targetAxialR);

        // 2. hiddenGrid에서 제거
        if (targetPos.r >= 0 && targetPos.r < ROWS && targetPos.c >= 0 && targetPos.c < COLS) {
            if (hiddenGrid[targetPos.r]) {
                hiddenGrid[targetPos.r][targetPos.c] = false;
            }
        }
    });

    // 3. 리스트에서 삭제
    placedTreasures.splice(index, 1);

    // 4. UI 갱신
    // 삭제 후 목록을 다시 렌더링하여 보물이 목록에 나타나게 함
    renderVisualTreasureList();
    renderPlacedList();
    renderGrid();
    runSolver(); // 보물이 제거되었으므로 확률 다시 계산
}

// 배치된 보물 목록 렌더링 함수
function renderPlacedList() {
    let panel = document.getElementById('placed-treasures-panel');
    if (!panel) {
        // 패널이 없으면 생성 (game-area 내부에 배치)
        const gameArea = document.getElementById('game-area');
        panel = document.createElement('div');
        panel.id = 'placed-treasures-panel';
        panel.innerHTML = '<h3>배치된 보물</h3><div id="placed-content"></div>';
        if (gameArea) {
            gameArea.appendChild(panel);
        } else {
            document.body.appendChild(panel);
        }
    }

    const content = document.getElementById('placed-content');
    if (!content) return;

    content.innerHTML = '';

    placedTreasures.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'placed-item';
        // 보물의 SVG 모양과 이름, 삭제 버튼을 표시
        div.innerHTML = `
            ${generateTreasureSVG(item.points)}
            <div style="flex:1; display:flex; flex-direction:column;">
                <span style="font-size:11px; color:#fff;">${item.name}</span>
                <span style="font-size:9px; color:#aaa;">(${item.placedAt.r}, ${item.placedAt.c})</span>
            </div>
            <button class="remove-btn" onclick="removeTreasure(${idx})">✕</button>
        `;
        content.appendChild(div);
    });
}

// --- 6. SOLVER (PROBABILITY) ---
// 인접 칸을 찾는 보조 함수
function getNeighbors(r, c) {
    const axial = oddQToAxial(r, c);
    const directions = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    let results = [];
    directions.forEach(d => {
        let n = axialToOddQ(axial.q + d.q, axial.r + d.r);
        if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
            results.push(n);
        }
    });
    return results;
}

// 확률 텍스트를 초기화하는 보조 함수
function clearProbabilities() {
    const hexes = document.querySelectorAll('.hex');
    hexes.forEach(el => {
        let probSpan = el.querySelector('.prob-text');
        if (probSpan) probSpan.innerText = "";
        const oldBadge = el.querySelector('.rank-badge');
        if (oldBadge) oldBadge.remove();
        el.classList.remove('best-pick');
    });
}

function runSolver() {
    document.getElementById('log-area').innerText = "남은 보물 위치 계산 중...";

    // Probability Map
    let probMap = Array(ROWS).fill().map(() => Array(COLS).fill(0));

    // 1. 아직 배치되지 않은 보물들만 추출 (계산 대상)
    let remainingTreasures = treasures.filter(t => {
        return t.active && !placedTreasures.some(pt => pt.id === t.id);
    });

    if (remainingTreasures.length === 0) {
        document.getElementById('log-area').innerText = "모든 보물의 위치를 고정했습니다.";
        clearProbabilities();
        return;
    }

    // 2. 남은 보물들에 대해서만 공간 탐색
    remainingTreasures.forEach(treasure => {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                // 이미 보물이 배치된 칸(hiddenGrid)이거나 벽(-1)이면 중심점이 될 수 없음
                if (grid[r][c] === -1 || (hiddenGrid[r] && hiddenGrid[r][c])) continue;

                let centerAxial = oddQToAxial(r, c);
                let validConfigs = new Set();

                for (let rot = 0; rot < 6; rot++) {
                    let currentPoints = [];
                    let isValidRot = true;

                    for (let p of treasure.points) {
                        let rq = p.q, rr = p.r;
                        for (let k = 0; k < rot; k++) {
                            let rotated = rotate60(rq, rr);
                            rq = rotated.q; rr = rotated.r;
                        }

                        let absArr = axialToOddQ(centerAxial.q + rq, centerAxial.r + rr);

                        // 1. 경계 검사
                        if (absArr.r < 0 || absArr.r >= ROWS || absArr.c < 0 || absArr.c >= COLS) {
                            isValidRot = false; break;
                        }

                        // 2. 상태 검사 (0 또는 -1은 배치 불가)
                        let cellVal = grid[absArr.r][absArr.c];
                        if (cellVal === 0 || cellVal === -1) {
                            isValidRot = false; break;
                        }

                        // 3. [추가] 확정된 보물과의 충돌 검사
                        // 이미 배치된 보물(hiddenGrid)이 있는 칸이라면, 다른 보물이 겹쳐서 놓일 수 없음
                        if (hiddenGrid[absArr.r] && hiddenGrid[absArr.r][absArr.c]) {
                            isValidRot = false;
                            break;
                        }

                        currentPoints.push(`${absArr.r},${absArr.c}`);
                    }

                    if (isValidRot) {
                        let key = currentPoints.sort().join('|');
                        if (!validConfigs.has(key)) {
                            validConfigs.add(key);
                            currentPoints.forEach(pt => {
                                let [pr, pc] = pt.split(',').map(Number);
                                probMap[pr][pc]++;
                            });
                        }
                    }
                }
            }
        }
    });

    // 2단계: 내구도와 연쇄 반응을 고려한 "새로운 전략 점수" 산출
    let strategyScores = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let hp = grid[r][c];
            if (hp <= 0 && hp !== 0.5) continue; // 파괴된 칸 제외

            let baseP = probMap[r][c];
            let chainBonus = 0;

            // 내구도가 1이거나 0.5일 때만 연쇄 반응 보너스 발생
            if (hp === 1 || hp === 0.5) {
                let neighbors = getNeighbors(r, c);
                neighbors.forEach(n => {
                    if (grid[n.r][n.c] === 0.5) {
                        chainBonus += probMap[n.r][n.c]; // 주변 번개 칸의 가치를 더함
                    }
                });
            }

            // 새로운 확률 공식 적용
            let sScore = (baseP + chainBonus) / (hp === 0.5 ? 0.5 : hp);

            if (sScore > 0) {
                strategyScores.push({ r, c, score: sScore });
            }
        }
    }

    // 3단계: 점수 기준 내림차순 정렬 (Top 3 추출용)
    strategyScores.sort((a, b) => b.score - a.score);

    // 4단계: 화면 업데이트 (경우의 수 대신 sScore 표시)
    const hexes = document.querySelectorAll('.hex');
    hexes.forEach(el => {
        let r = parseInt(el.dataset.r);
        let c = parseInt(el.dataset.c);

        const item = strategyScores.find(s => s.r === r && s.c === c);
        let probSpan = el.querySelector('.prob-text');

        if (probSpan) {
            if (item && item.score > 0) {
                // 소수점 첫째 자리까지 표시하여 "확률 점수" 느낌 전달
                probSpan.innerText = item.score.toFixed(1);
            } else {
                probSpan.innerText = "";
            }
        }

        // Top 3 배지 중앙 배치
        const rankIndex = strategyScores.findIndex(s => s.r === r && s.c === c);
        const oldBadge = el.querySelector('.rank-badge');
        if (oldBadge) oldBadge.remove();
        el.classList.remove('best-pick');

        if (rankIndex >= 0 && rankIndex < 3 && item && item.score > 0) {
            let rank = rankIndex + 1;
            let badge = document.createElement('div');
            badge.className = `rank-badge rank-${rank}`;
            badge.innerText = `TOP ${rank}`;
            el.appendChild(badge);

            if (rank === 1) el.classList.add('best-pick');
        }
    });

    if (strategyScores.length > 0) {
        document.getElementById('log-area').innerText = `Top 3 위치 발견! (최고 전략 점수: ${strategyScores[0].score.toFixed(1)})`;
    } else {
        document.getElementById('log-area').innerText = "가능한 위치가 없습니다.";
    }
}

// Start
initBoard();