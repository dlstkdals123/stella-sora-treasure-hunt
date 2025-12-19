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
const ROWS = 4;
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
    { id: 1, points: [{ q: 0, r: 0 }], active: true },
    { id: 2, points: [{ q: 0, r: 0 }, { q: 0, r: -1 }, { q: 0, r: 1 }], active: true },
    { id: 3, points: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], active: true }
];

const STAGE_DATA = {
    'stage1': {
        layout: [
            [-1, 1, 1, 1, 1, 1, -1],
            [1, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 1],
            [-1, -1, 1, -1, 1, -1, -1]
        ],
        // 스테이지 1에서 제공되는 보물 블록들
        availableTreasures: [
            { id: 101, points: [{ q: 0, r: 0 }], active: true },
            { id: 102, points: [{ q: 0, r: 0 }, { q: 0, r: 1 },], active: true },
            { id: 103, points: [{ q: 0, r: 0 }, { q: 0, r: -1 }, { q: 0, r: 1 }], active: true },
            { id: 104, points: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], active: true }
        ]
    }
};

// --- 3. INITIALIZATION & PRESETS ---

function resetBoard() {
    const presetType = document.getElementById('board-preset').value;
    initBoard(presetType);
}

function initBoard(stage = 'stage1') {
    grid = [];
    const container = document.getElementById('grid-container');
    container.innerHTML = '';

    const stageInfo = STAGE_DATA[stage] || { layout: [], availableTreasures: [] };

    // 1. 블록 레이아웃 설정
    const currentLayout = Array.isArray(stageInfo) ? stageInfo : (stageInfo.layout || []);

    // 2. 보물 블록 목록(Templates)을 스테이지 데이터로 교체
    treasures = JSON.parse(JSON.stringify(stageInfo.availableTreasures || []));

    // 3. 상태 초기화
    hiddenGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    placedTreasures = [];
    selectedTreasureId = null;
    currentRotationPoints = [];

    const width = 2 * HEX_SIZE;
    const height = Math.sqrt(3) * HEX_SIZE;

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
            // x = c * (width * 0.75)
            // y = r * height + (c % 2) * (height / 2)
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
    renderVisualTreasureList(); // 스테이지별로 변경된 보물 목록이 여기서 그려집니다.
    renderPlacedList();
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

// 1. 편집 도구 선택 및 UI 업데이트
function setEditVal(v) {
    editVal = v;

    // 모든 편집 버튼의 active 클래스 초기화
    document.querySelectorAll('.edit-btn').forEach(btn => {
        // 호출 인자 v와 버튼의 onclick 속성에 명시된 값이 일치하는지 확인
        if (btn.getAttribute('onclick').includes(`setEditVal(${v})`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function setMode(m) {
    mode = m;

    document.getElementById('btn-play').className = m === 'play' ? 'active' : '';
    document.getElementById('btn-edit').className = m === 'edit' ? 'active' : '';
    document.getElementById('edit-palette').style.display = m === 'edit' ? 'flex' : 'none';

    const container = document.getElementById('grid-container');
    if (m === 'edit') {
        container.classList.add('editing');
    } else {
        container.classList.remove('editing');
        // 편집을 마치고 채굴 모드로 돌아올 때 자동으로 확률 재계산
        runSolver();
    }
}

function onHexClick(r, c) {
    // 1. 배치 모드 처리
    if (isPlacementMode) {
        if (selectedTreasureId) {
            // 보물 배치 로직
            const targetCoords = calculatePlacementCoords(r, c);

            // 최종 유효성 검사
            let isValid = true;
            for (let coord of targetCoords) {
                if (coord.r < 0 || coord.r >= ROWS || coord.c < 0 || coord.c >= COLS ||
                    (hiddenGrid[coord.r] && hiddenGrid[coord.r][coord.c]) ||
                    grid[coord.r][coord.c] === -1) {
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
                isPlacementMode = false;
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
        }
        return; // 배치 모드에서는 채굴 로직 실행 안 함
    }

    // 2. 기존 편집/채굴 모드 처리
    if (mode === 'edit') {
        grid[r][c] = editVal; // 내구도 데이터 수정
        renderGrid();         // 그리드 시각적 갱신
        runSolver();          // 실시간 확률 및 전략 점수 재계산 (추가)
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
    editorGrid = [];

    container.style.position = 'relative';
    container.style.width = '200px';
    container.style.height = '180px';

    const MINI_HEX_W = 30;
    const MINI_HEX_H = 26;

    // 중앙 정렬을 위한 Offset (컨테이너 크기에 맞춰 조정)
    const offsetX = 100;
    const offsetY = 90;

    for (let r = -2; r <= 2; r++) {
        for (let q = -2; q <= 2; q++) {
            // Cube coordinate constraint: q + r + s = 0, |q|, |r|, |s| <= radius
            if (Math.abs(q) <= 2 && Math.abs(r) <= 2 && Math.abs(q + r) <= 2) {
                let btn = document.createElement('div');
                btn.className = 'mini-hex';
                const isCenter = q === 0 && r === 0;
                if (isCenter) {
                    btn.classList.add('active');
                }

                // 수학적으로 정확한 Flat-topped Hex 좌표 계산
                // x = q * (width * 3/4)
                // y = (r + q/2) * height
                const x = q * (MINI_HEX_W * 0.75) + offsetX;
                const y = (r + q / 2) * MINI_HEX_H + offsetY;

                btn.style.left = `${x - MINI_HEX_W / 2}px`; // 중심점 기준 배치를 위해 width/2 차감
                btn.style.top = `${y - MINI_HEX_H / 2}px`;  // 중심점 기준 배치를 위해 height/2 차감
                btn.style.position = 'absolute';

                btn.dataset.q = q;
                btn.dataset.r = r;
                btn.onclick = function () {
                    // 중앙 hex는 선택 해제할 수 없음
                    if (!isCenter) {
                        this.classList.toggle('active');
                    }
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
        id: Date.now(), // id만 사용하여 식별
        points: points,
        active: true
    });

    closeEditor();
    renderVisualTreasureList();
}

// --- 비주얼 보물 목록 및 배치 모드 ---

// 보물 포인트 배열을 받아 SVG 문자열을 생성하는 도우미 함수
function generateTreasureSVG(points) {
    const hexRadius = 10;
    const hexHeight = Math.sqrt(3) * hexRadius; // sqrt(3) * R

    // 1. Flat-topped 좌표계에서 중심 좌표 계산 (Axial 공식 적용)
    const getMiniXY = (q, r) => {
        // x = R * 1.5 * q
        // y = R * sqrt(3) * (r + q/2)
        const x = hexRadius * 1.5 * q;
        const y = hexHeight * (r + q / 2);
        return { x, y };
    };

    // 2. 중심점(0,0)을 기준으로 하는 육각형 경로 (Flat-topped)
    // 육각형의 여섯 정점: (R, 0), (R/2, H/2), (-R/2, H/2), (-R, 0), (-R/2, -H/2), (R/2, -H/2)
    const hexPath = `M ${hexRadius} 0 
                     L ${hexRadius / 2} ${hexHeight / 2} 
                     L ${-hexRadius / 2} ${hexHeight / 2} 
                     L ${-hexRadius} 0 
                     L ${-hexRadius / 2} ${-hexHeight / 2} 
                     L ${hexRadius / 2} ${-hexHeight / 2} Z`;

    let svgContent = '';
    points.forEach(p => {
        const pos = getMiniXY(p.q, p.r);
        const isCenter = p.q === 0 && p.r === 0;
        svgContent += `<path d="${hexPath}" transform="translate(${pos.x}, ${pos.y})" class="${isCenter ? 'center-hex' : ''}" />`;
    });

    const boxSize = 150;
    const centerOffset = boxSize / 2;

    return `<svg class="treasure-svg" viewBox="0 0 ${boxSize} ${boxSize}" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(${centerOffset}, ${centerOffset})">
                    ${svgContent}
                </g>
            </svg>`;
}

// 보물 설계도 삭제 함수
function deleteTreasureTemplate(id) {
    const index = treasures.findIndex(t => t.id === id);
    if (index !== -1) {
        treasures.splice(index, 1); // 배열에서 삭제

        // 만약 삭제하려는 보물이 현재 선택된 상태였다면 선택 해제
        if (selectedTreasureId === id) {
            selectedTreasureId = null;
            currentRotationPoints = [];
        }

        renderVisualTreasureList(); // 목록 새로고침
        runSolver(); // 확률 다시 계산
    }
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
        // div.title 제거됨 - 이름 없이 시각적 모양만 표시

        // 삭제 버튼 추가
        let delBtn = document.createElement('button');
        delBtn.className = 'visual-del-btn';
        delBtn.innerText = '✕';
        delBtn.onclick = (e) => {
            e.stopPropagation(); // 부모의 선택(click) 이벤트가 발생하지 않도록 차단
            deleteTreasureTemplate(t.id);
        };
        div.appendChild(delBtn);

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
        // 보물의 SVG 모양과 좌표만 표시
        div.innerHTML = `
            ${generateTreasureSVG(item.points)}
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                <span style="font-size:10px; color:#aaa; margin-left:5px;">좌표: (${item.placedAt.r}, ${item.placedAt.c})</span>
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

    // 1. 각 칸별로 가능한 '고유 배치 키'의 집합을 관리
    // configMap[r][c] = Set { "config_key_1", "config_key_2", ... }
    let configMap = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => new Set())
    );

    let remainingTreasures = treasures.filter(t =>
        t.active && !placedTreasures.some(pt => pt.id === t.id)
    );

    if (remainingTreasures.length === 0) {
        document.getElementById('log-area').innerText = "모든 보물의 위치를 고정했습니다.";
        clearProbabilities();
        return;
    }

    // 2. 공간 탐색 및 고유 배치 키 기록
    remainingTreasures.forEach(treasure => {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] === -1 || (hiddenGrid[r] && hiddenGrid[r][c])) continue;

                let centerAxial = oddQToAxial(r, c);
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

                        if (absArr.r < 0 || absArr.r >= ROWS || absArr.c < 0 || absArr.c >= COLS ||
                            grid[absArr.r][absArr.c] === 0 || grid[absArr.r][absArr.c] === -1 ||
                            (hiddenGrid[absArr.r] && hiddenGrid[absArr.r][absArr.c])) {
                            isValidRot = false; break;
                        }
                        currentPoints.push(`${absArr.r},${absArr.c}`);
                    }

                    if (isValidRot) {
                        // 고유한 배치 식별자 생성 (보물ID + 정렬된 좌표들)
                        let configKey = `${treasure.id}_${currentPoints.sort().join('|')}`;
                        currentPoints.forEach(pt => {
                            let [pr, pc] = pt.split(',').map(Number);
                            configMap[pr][pc].add(configKey);
                        });
                    }
                }
            }
        }
    });

    // 3. 전략 점수 산출 (OR 논리 적용)
    let strategyScores = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let hp = grid[r][c];
            if (hp <= 0 && hp !== 0.5) continue;

            // 해당 칸을 클릭했을 때 확인할 수 있는 고유 배치 집합(Union)
            let combinedConfigs = new Set(configMap[r][c]);

            // 연쇄 반응: 내구도 1 또는 0.5를 클릭 시 인접 0.5 칸들의 배치도 포함 (OR 조건)
            if (hp === 1 || hp === 0.5) {
                let neighbors = getNeighbors(r, c);
                neighbors.forEach(n => {
                    if (grid[n.r][n.c] === 0.5) {
                        // 인접한 0.5 칸의 모든 고유 배치를 현재 집합에 추가 (중복은 자동으로 제거됨)
                        configMap[n.r][n.c].forEach(key => combinedConfigs.add(key));
                    }
                });
            }

            // 요청하신 대로 0.5 내구도 클릭 비용을 1로 산정
            let cost = (hp === 0.5) ? 1.0 : hp;
            let sScore = combinedConfigs.size / cost;

            if (sScore > 0) {
                strategyScores.push({ r, c, score: sScore });
            }
        }
    }

    // 4. 정렬 및 결과 출력
    strategyScores.sort((a, b) => b.score - a.score);

    // 5. 화면 업데이트 (경우의 수 대신 sScore 표시)
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