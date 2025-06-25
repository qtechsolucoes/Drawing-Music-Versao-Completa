const d = document;
const { jsPDF } = window.jspdf;

const MAX_DURATION_SECONDS = 600;
const PIXELS_PER_SECOND = 100;
const FREQ_MIN = 100;
const FREQ_MAX = 2000;
const ERASE_RADIUS = 20;
const AUTOSAVE_KEY = 'music-drawing-autosave';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.1;

const el = {
    playBtn: d.getElementById('playBtn'), playIcon: d.getElementById('playIcon'), pauseIcon: d.getElementById('pauseIcon'), playBtnText: d.querySelector('#playBtn span'),
    resetViewBtn: d.getElementById('resetViewBtn'),
    playhead: d.getElementById('playhead'), colorPicker: d.getElementById('colorPicker'), lineWidth: d.getElementById('lineWidth'),
    clearBtn: d.getElementById('clearBtn'),
    themeToggle: d.getElementById('theme-toggle'),
    themeSun: d.getElementById('theme-icon-sun'), themeMoon: d.getElementById('theme-icon-moon'),
    loadingOverlay: d.getElementById('loading-overlay'),

    saveProjectBtn: d.getElementById('saveProjectBtn'),
    importProjectBtn: d.getElementById('importProjectBtn'),
    drawmusImporter: d.getElementById('drawmusImporter'),

    exportBtn: d.getElementById('exportBtn'),
    exportJpgBtn: d.getElementById('exportJpgBtn'), exportPdfBtn: d.getElementById('exportPdfBtn'), exportWavBtn: d.getElementById('exportWavBtn'),
    undoBtn: d.getElementById('undoBtn'), redoBtn: d.getElementById('redoBtn'),
    zoomInBtn: d.getElementById('zoomInBtn'),
    zoomOutBtn: d.getElementById('zoomOutBtn'),

    canvas: d.getElementById('drawingCanvas'),
    canvasContainer: d.getElementById('canvas-container'),
    mainCanvasArea: d.getElementById('main-canvas-area'),
    yRulerCanvas: d.getElementById('y-ruler-canvas'),
    xRulerCanvas: d.getElementById('x-ruler-canvas'),
    xRulerContainer: d.getElementById('x-ruler-container'),
    yRulerContainer: d.getElementById('y-ruler-container'),

    exportSelectionOverlay: d.getElementById('export-selection-overlay'),
    exportStartHandle: d.getElementById('export-start-handle'),
    exportEndHandle: d.getElementById('export-end-handle'),


    tools: {
        select: d.getElementById('select'), pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), hand: d.getElementById('hand'),
        staccato: d.getElementById('staccato'), percussion: d.getElementById('percussion'),
        arpeggio: d.getElementById('arpeggio'), granular: d.getElementById('granular'), tremolo: d.getElementById('tremolo'),
        line: d.getElementById('line'),
    },
    effectSliders: {
        volumeEffect: d.getElementById('volumeEffect'), panEffect: d.getElementById('panEffect'),
        vibratoEffect: d.getElementById('vibratoEffect'), reverbEffect: d.getElementById('reverbEffect'),
        delayEffect: d.getElementById('delayEffect'),
        lowpassFilterEffect: d.getElementById('lowpassFilterEffect'), highpassFilterEffect: d.getElementById('highpassFilterEffect'),
        bandpassFilterEffect: d.getElementById('bandpassFilterEffect'), notchFilterEffect: d.getElementById('notchFilterEffect'),
        phaserEffect: d.getElementById('phaserEffect'), flangerEffect: d.getElementById('flangerEffect'), chorusEffect: d.getElementById('chorusEffect'),
        distortionEffect: d.getElementById('distortionEffect'), compressorEffect: d.getElementById('compressorEffect'),
        tremoloAmplitudeEffect: d.getElementById('tremoloAmplitudeEffect'),
        wahEffect: d.getElementById('wahEffect'),
    },
    globalEqSliders: {
        bassEqGlobal: d.getElementById('bassEqGlobal'),
        midEqGlobal: d.getElementById('midEqGlobal'),
        trebleEqGlobal: d.getElementById('trebleEqGlobal')
    },
    timbres: {
        sine: d.getElementById('sine'), square: d.getElementById('square'), sawtooth: d.getElementById('sawtooth'),
        triangle: d.getElementById('triangle'), fm: d.getElementById('fm'), pulse: d.getElementById('pulse'),
        organ: d.getElementById('organ'), noise: d.getElementById('noise'),
    }
};

const ctx = el.canvas.getContext('2d');
const yRulerCtx = el.yRulerCanvas.getContext('2d');
const xRulerCtx = el.xRulerCanvas.getContext('2d');

let state = {
    isDrawing: false,
    isSelecting: false,
    isMoving: false,
    isResizing: false, // NOVO: Estado para redimensionamento
    resizeHandle: null, // NOVO: Armazena qual alça de redimensionamento está sendo usada
    selectionStart: null,
    selectionEnd: null,
    activeTool: 'pencil',
    activeTimbre: 'sine',
    lastPos: { x: 0, y: 0 },
    lineStart: null,
    isPlaying: false,
    playbackStartTime: 0,
    animationFrameId: null,
    audioCtx: null,
    sourceNodes: [],
    composition: {
        strokes: [],
        symbols: []
    },
    history: [],
    historyIndex: -1,
    selectedElements: [],
    zoomLevel: 1.0,

    exportStartTime: 0,
    exportEndTime: 5,
    isDraggingStart: false,
    isDraggingEnd: false,
    isDraggingPlayhead: false,

    currentEffectValues: {},
    globalEqValues: {
        bassEqGlobal: 0,
        midEqGlobal: 0,
        trebleEqGlobal: 0
    }
};
let clipboard = [];

// --- CORE FUNCTIONS ---

function initApp(mode = 'pc') {
    const backgroundAudio = d.getElementById('background-audio');
    if (backgroundAudio && !backgroundAudio.paused) {
        backgroundAudio.pause();
        backgroundAudio.currentTime = 0;
    }
    d.getElementById('selection-container')?.classList.add('hidden');
    d.getElementById('app-wrapper')?.classList.remove('hidden');

    if (mode === 'mobile') {
        d.body.classList.add('mobile-mode');
        setupMobileToolbar();
    }

    loadAutoSavedProject();
    setupEventListeners();
    applyTheme(localStorage.getItem('music-drawing-theme') || 'dark');
    setActiveTool('pencil');
    setActiveTimbre('sine');

    resetEffectSliders();
    Object.keys(el.effectSliders).forEach(key => {
        state.currentEffectValues[key] = parseFloat(el.effectSliders[key].value);
    });

    Object.keys(el.globalEqSliders).forEach(key => {
        state.globalEqValues[key] = parseFloat(el.globalEqSliders[key].value);
    });

    setTimeout(() => {
        resizeAndRedraw();
        if (state.history.length === 0) {
            saveState(true);
        }
    }, 100);
}

function resizeAndRedraw() {
    const canvasWidth = MAX_DURATION_SECONDS * PIXELS_PER_SECOND;
    const canvasHeight = el.mainCanvasArea.offsetHeight;

    if(canvasHeight <= 0) {
        setTimeout(resizeAndRedraw, 100);
        return;
    }

    el.canvas.width = canvasWidth;
    el.canvas.height = canvasHeight;
    el.canvasContainer.style.width = `${canvasWidth}px`;
    el.canvasContainer.style.height = `${canvasHeight}px`;

    el.yRulerCanvas.width = el.yRulerContainer.offsetWidth;
    el.yRulerCanvas.height = canvasHeight;

    el.xRulerCanvas.width = canvasWidth;
    el.xRulerCanvas.height = el.xRulerContainer.offsetHeight;

    redrawAll();
}

function redrawAll() {
    ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        drawElementWithEffects(stroke);
    });
    state.composition.symbols.forEach(s => drawElementWithEffects(s));

    if (state.isSelecting) {
        drawMarquee();
    }

    // A caixa de seleção agora é desenhada apenas uma vez se houver elementos selecionados.
    if (state.selectedElements.length > 0) {
        drawSelectionIndicator();
    }

    drawRulers();
    updateExportSelectionVisuals();
}


function drawRulers() {
    xRulerCtx.clearRect(0, 0, el.xRulerCanvas.width, el.xRulerCanvas.height);
    yRulerCtx.clearRect(0, 0, el.yRulerCanvas.width, el.yRulerCanvas.height);

    const textColor = getComputedStyle(d.documentElement).getPropertyValue('--text-dark').trim();
    const rulerFont = '9px Inter';

    xRulerCtx.fillStyle = textColor;
    xRulerCtx.strokeStyle = textColor;
    xRulerCtx.font = rulerFont;
    xRulerCtx.textAlign = 'center';
    xRulerCtx.textBaseline = 'top';

    const xScroll = el.mainCanvasArea.scrollLeft;
    const xZoom = state.zoomLevel;
    const startSec = Math.floor(xScroll / (PIXELS_PER_SECOND * xZoom));
    const endSec = Math.ceil((xScroll + el.mainCanvasArea.offsetWidth) / (PIXELS_PER_SECOND * xZoom));

    for (let sec = startSec; sec <= endSec; sec++) {
        const xPos = (sec * PIXELS_PER_SECOND * xZoom) - xScroll;

        let isMajorTick = false;
        if (xZoom > 2) isMajorTick = (sec % 1 === 0);
        else if (xZoom > 0.5) isMajorTick = (sec % 5 === 0);
        else isMajorTick = (sec % 10 === 0);

        if (isMajorTick) {
            xRulerCtx.fillRect(xPos, 0, 1, 10);
            xRulerCtx.fillText(`${sec}s`, xPos, 12);
        } else {
             xRulerCtx.fillRect(xPos, 0, 1, 5);
        }
    }

    yRulerCtx.fillStyle = textColor;
    yRulerCtx.strokeStyle = textColor;
    yRulerCtx.font = rulerFont;
    yRulerCtx.textAlign = 'right';
    yRulerCtx.textBaseline = 'middle';
    yRulerCtx.textBaseline = 'middle';

    const yScroll = el.mainCanvasArea.scrollTop;
    const yZoom = state.zoomLevel;

    let minorStep, majorStep;
    if (yZoom < 0.75) {
        minorStep = 200;
        majorStep = 400;
    } else if (yZoom < 1.5) {
        minorStep = 100;
        majorStep = 200;
    } else if (yZoom < 3.0) {
        minorStep = 50;
        majorStep = 100;
    } else {
        minorStep = 20;
        majorStep = 100;
    }

    const drawnLabels = [];
    const loopIncrement = minorStep / 2;

    for (let freq = FREQ_MIN; freq <= FREQ_MAX; freq += loopIncrement) {

        let isMajor = freq % majorStep === 0;
        let isMinor = freq % minorStep === 0;

        if (!isMajor && !isMinor) continue;

        const yPos = (yFromFrequency(freq) * yZoom) - yScroll;

        if (yPos < -10 || yPos > el.yRulerCanvas.height + 10) continue;


        if (isMajor) {
            let collision = false;
            for (const drawnY of drawnLabels) {
                if (Math.abs(drawnY - yPos) < 12) {
                    collision = true;
                    break;
                }
            }

            if (!collision) {
                yRulerCtx.fillRect(el.yRulerCanvas.width - 15, yPos, 15, 1);
                yRulerCtx.fillText(`${Math.round(freq)}`, el.yRulerCanvas.width - 20, yPos);
                drawnLabels.push(yPos);
            } else {
                yRulerCtx.fillRect(el.yRulerCanvas.width - 10, yPos, 10, 1);
            }
        } else if (isMinor) {
            yRulerCtx.fillRect(el.yRulerCanvas.width - 7, yPos, 7, 1);
        }
    }
}

function setupMobileToolbar() {
    const tabs = d.querySelectorAll('#mobile-toolbar-tabs .toolbar-tab');
    const panels = d.querySelectorAll('#panels-container .toolbar-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPanelId = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            d.querySelector(`.toolbar-panel[data-panel="${targetPanelId}"]`).classList.add('active');
        });
    });
}

function setupEventListeners() {
    window.addEventListener('resize', resizeAndRedraw);
    el.mainCanvasArea.addEventListener('scroll', redrawAll);
    el.xRulerCanvas.addEventListener('click', handleTimelineClick);

    const canvasEvents = {
        'mousedown': startAction, 'mouseup': stopAction, 'mouseleave': stopAction, 'mousemove': performAction,
        'touchstart': startAction, 'touchend': stopAction, 'touchcancel': stopAction, 'touchmove': performAction
    };
    Object.entries(canvasEvents).forEach(([event, listener]) => {
        el.canvas.addEventListener(event, listener, { passive: false });
    });

    el.playBtn.addEventListener('click', togglePlayback);
    el.resetViewBtn.addEventListener('click', resetView);
    el.clearBtn.addEventListener('click', handleClear);
    el.themeToggle.addEventListener('click', () => applyTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

    Object.keys(el.tools).forEach(key => el.tools[key]?.addEventListener('click', () => setActiveTool(key)));

    // NOVO: Event listeners para edição de cor e espessura
    el.colorPicker.addEventListener('input', (e) => {
        if (state.selectedElements.length > 0) {
            state.selectedElements.forEach(id => {
                const elem = findElementById(id);
                if (elem) elem.color = e.target.value;
            });
            saveState();
            redrawAll();
        }
    });

    el.lineWidth.addEventListener('input', (e) => {
        if (state.selectedElements.length > 0) {
            const newValue = parseFloat(e.target.value);
            state.selectedElements.forEach(id => {
                const elem = findElementById(id);
                if (elem) {
                    if (elem.points) elem.lineWidth = newValue;
                    else elem.size = newValue;
                }
            });
            saveState();
            redrawAll();
        }
    });

    Object.keys(el.effectSliders).forEach(key => {
        const slider = el.effectSliders[key];
        const effectType = slider.dataset.effectType;
        if (!effectType) {
            console.warn(`Slider com ID "${key}" não tem data-effect-type. Pulando listener.`);
            return;
        }
        slider?.addEventListener('input', () => {
            state.currentEffectValues[key] = parseFloat(slider.value);
            applyEffectToSelectedElements(effectType, parseFloat(slider.value));
        });
    });

    Object.keys(el.globalEqSliders).forEach(key => {
        const slider = el.globalEqSliders[key];
        slider?.addEventListener('input', () => {
            state.globalEqValues[key] = parseFloat(slider.value);
            if (state.isPlaying) {
                stopPlayback();
                startPlayback();
            }
        });
    });

    Object.keys(el.timbres).forEach(key => el.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));

    el.zoomInBtn.addEventListener('click', () => handleZoom(true));
    el.zoomOutBtn.addEventListener('click', () => handleZoom(false));

    el.saveProjectBtn.addEventListener('click', saveProject);
    el.importProjectBtn.addEventListener('click', () => el.drawmusImporter.click());
    el.drawmusImporter.addEventListener('change', importProject);

    el.exportJpgBtn.addEventListener('click', exportJpgVisibleArea);
    el.exportPdfBtn.addEventListener('click', exportPdfPaginated);
    el.exportWavBtn.addEventListener('click', exportWav);

    el.undoBtn.addEventListener('click', undo);
    el.redoBtn.addEventListener('click', redo);

    el.exportStartHandle.addEventListener('mousedown', () => { state.isDraggingStart = true; });
    el.exportEndHandle.addEventListener('mousedown', () => { state.isDraggingEnd = true; });
    el.exportStartHandle.addEventListener('touchstart', (e) => { e.preventDefault(); state.isDraggingStart = true; }, { passive: false });
    el.exportEndHandle.addEventListener('touchstart', (e) => { e.preventDefault(); state.isDraggingEnd = true; }, { passive: false });

    window.addEventListener('mousemove', handleExportDrag);
    window.addEventListener('touchmove', handleExportDrag, { passive: false });

    const stopExportDrag = () => {
        state.isDraggingStart = false;
        state.isDraggingEnd = false;
    };
    window.addEventListener('mouseup', stopExportDrag);
    window.addEventListener('touchend', stopExportDrag);
    window.addEventListener('touchcancel', stopExportDrag);

    el.playhead.addEventListener('mousedown', startPlayheadDrag);
    window.addEventListener('mousemove', handlePlayheadDrag);
    window.addEventListener('mouseup', stopPlayheadDrag);
    el.playhead.addEventListener('touchstart', startPlayheadDrag, { passive: false });
    window.addEventListener('touchmove', handlePlayheadDrag, { passive: false });
    window.addEventListener('touchend', stopPlayheadDrag);

    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const isCtrlCmd = e.ctrlKey || e.metaKey;

        if (isCtrlCmd && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            handleZoom(true);
        } else if (isCtrlCmd && e.key === '-') {
            e.preventDefault();
            handleZoom(false);
        } else if (isCtrlCmd && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copySelectedElements();
        } else if (isCtrlCmd && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteElements();
        } else if (isCtrlCmd && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (isCtrlCmd && e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (isCtrlCmd && e.key === 's') {
            e.preventDefault();
            saveProject();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedElements();
        } else if (e.key === ' ' && e.target === d.body) {
            e.preventDefault();
            togglePlayback();
        }
    });
}

function getEventPos(e) {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const scrollContainerRect = el.mainCanvasArea.getBoundingClientRect();
    const clickX_In_VisibleContainer = clientX - scrollContainerRect.left;
    const clickY_In_VisibleContainer = clientY - scrollContainerRect.top;

    const totalOffsetX_Scaled = clickX_In_VisibleContainer + el.mainCanvasArea.scrollLeft;
    const totalOffsetY_Scaled = clickY_In_VisibleContainer + el.mainCanvasArea.scrollTop;

    const finalX = totalOffsetX_Scaled / state.zoomLevel;
    const finalY = totalOffsetY_Scaled / state.zoomLevel;

    return { x: finalX, y: finalY };
}

function startAction(e) {
    if (e.target === el.playhead) {
        state.isDraggingPlayhead = true;
        d.body.style.cursor = 'ew-resize';
        if (state.isPlaying) {
            stopPlayback();
        }
        return;
    }

    e.preventDefault();
    initAudio();
    const pos = getEventPos(e);
    state.lastPos = pos;
    state.isDrawing = true;

    switch (state.activeTool) {
        case 'select': {
            const isMultiSelect = e.ctrlKey || e.metaKey;

            // NOVO: Verifica se o clique foi numa alça de redimensionamento
            const resizeHandle = getResizeHandleAtPos(pos);
            if (resizeHandle && state.selectedElements.length > 0) {
                state.isResizing = true;
                state.resizeHandle = resizeHandle;
                el.canvas.style.cursor = getResizeCursor(resizeHandle);
                redrawAll();
                return;
            }

            const clickedElement = getElementAtPos(pos);

            if (clickedElement) {
                const isAlreadySelected = state.selectedElements.includes(clickedElement.id);

                if (isMultiSelect) {
                    if (isAlreadySelected) {
                        state.selectedElements = state.selectedElements.filter(id => id !== clickedElement.id);
                    } else {
                        state.selectedElements.push(clickedElement.id);
                    }
                } else {
                    if (!isAlreadySelected) {
                       state.selectedElements = [clickedElement.id];
                    }
                }

                if (state.selectedElements.length > 0) {
                    state.isMoving = true;
                    el.canvas.style.cursor = 'move';
                }

            } else {
                state.isMoving = false;
                state.isSelecting = true;
                state.selectionStart = pos;
                state.selectionEnd = pos;
                if (!isMultiSelect) {
                    state.selectedElements = [];
                }
            }
            updateControlsForSelection(); // Atualiza cor, espessura e efeitos
            redrawAll();
            break;
        }
        case 'pencil':
            const newStroke = { id: Date.now(), points: [pos], color: el.colorPicker.value, lineWidth: parseFloat(el.lineWidth.value), timbre: state.activeTimbre, effects: [] };
            state.composition.strokes.push(newStroke);
            break;
        case 'eraser':
            eraseAt(pos.x, pos.y);
            break;
        case 'hand':
            el.canvas.style.cursor = 'grabbing';
            break;
        case 'line':
            if (!state.lineStart) {
                state.lineStart = pos;
            } else {
                placeSymbol({ x: state.lineStart.x, y: state.lineStart.y, endX: pos.x, endY: pos.y }, state.activeTool);
                state.lineStart = null;
            }
            break;
        case 'staccato':
        case 'percussion':
        case 'arpeggio':
        case 'granular':
        case 'tremolo':
            placeSymbol(pos, state.activeTool);
            break;
    }
}


function stopAction(e) {
    if (!state.isDrawing) return;
    e.preventDefault();

    if (state.isMoving || state.isResizing) {
        state.isMoving = false;
        state.isResizing = false;
        state.resizeHandle = null;
        setActiveTool('select'); // Reseta o cursor
        saveState();
    }


    if (state.isSelecting) {
        const r1 = {
            x: Math.min(state.selectionStart.x, state.selectionEnd.x),
            y: Math.min(state.selectionStart.y, state.selectionEnd.y),
            width: Math.abs(state.selectionEnd.x - state.selectionStart.x),
            height: Math.abs(state.selectionEnd.y - state.selectionStart.y),
        };

        const allElements = [...state.composition.strokes, ...state.composition.symbols];

        const newlySelected = [];
        allElements.forEach(element => {
            const r2 = getElementBoundingBox(element);
            if (doRectsIntersect(r1, r2)) {
                newlySelected.push(element.id);
            }
        });

        if (e.ctrlKey || e.metaKey) {
            newlySelected.forEach(id => {
                if (!state.selectedElements.includes(id)) {
                    state.selectedElements.push(id);
                }
            });
        } else {
            state.selectedElements = newlySelected;
        }


        state.isSelecting = false;
        updateControlsForSelection();
        redrawAll();
    }

    state.isDrawing = false;

    if (state.activeTool === 'hand') {
        setActiveTool('hand');
        return;
    }
    if (['line'].includes(state.activeTool) &&
        (state.lineStart)) {
        return;
    }

    ctx.beginPath();
    const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
    if (currentStroke && currentStroke.points.length > 200) {
       currentStroke.points = simplify(currentStroke.points, 0.5);
    }
    if (state.activeTool !== 'eraser') {
      saveState();
    }
}

function performAction(e) {
    if (state.isDraggingPlayhead) {
        handlePlayheadDrag(e);
        return;
    }
    if (!state.isDrawing) {
        // NOVO: Altera o cursor ao passar sobre as alças de redimensionamento
        if (state.activeTool === 'select' && state.selectedElements.length > 0) {
            const pos = getEventPos(e);
            const handle = getResizeHandleAtPos(pos);
            el.canvas.style.cursor = handle ? getResizeCursor(handle) : 'pointer';
        }
        return;
    }
    e.preventDefault();
    const pos = getEventPos(e);
    const dx = pos.x - state.lastPos.x;
    const dy = pos.y - state.lastPos.y;

    if (state.isResizing) {
        resizeSelectedElements(dx, dy, pos);
        state.lastPos = pos;
        redrawAll();
        return;
    }


    if (state.isMoving) {
        moveSelectedElements(dx, dy);
        state.lastPos = pos;
        redrawAll();
        return;
    }

    if (state.isSelecting) {
        state.selectionEnd = pos;
        redrawAll();
        return;
    }

    if (state.activeTool === 'hand') {
        const rawPos = { x: e.touches ? e.touches[0].clientX : e.clientX, y: e.touches ? e.touches[0].clientY : e.clientY };
        const rawLastPos = state.lastPos.rawX !== undefined ? { x: state.lastPos.rawX, y: state.lastPos.rawY } : null;

        if(rawLastPos){
            const dx = rawPos.x - rawLastPos.x;
            const dy = rawPos.y - rawLastPos.y;
            el.mainCanvasArea.scrollLeft -= dx;
            el.mainCanvasArea.scrollTop -= dy;
        }
        state.lastPos.rawX = rawPos.x;
        state.lastPos.rawY = rawPos.y;
        return;
    } else {
        state.lastPos.rawX = null;
        state.lastPos.rawY = null;
    }

    if (state.activeTool === 'pencil') {
        const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
        if (!currentStroke) return;
        currentStroke.points.push(pos);
        redrawAll();
        state.lastPos = pos;
    } else if (state.activeTool === 'eraser') {
        eraseAt(pos.x, pos.y);
    } else if (state.activeTool === 'line' && state.lineStart) {
        redrawAll();
        ctx.beginPath();
        ctx.strokeStyle = el.colorPicker.value;
        ctx.lineWidth = parseFloat(el.lineWidth.value);
        ctx.moveTo(state.lineStart.x, state.lineStart.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }
}

function handleZoom(zoomIn) {
    const oldZoom = state.zoomLevel;
    let newZoom = oldZoom + (zoomIn ? ZOOM_STEP : -ZOOM_STEP) * oldZoom;
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));

    if (newZoom === oldZoom) return;

    const viewCenterX = el.mainCanvasArea.scrollLeft + el.mainCanvasArea.offsetWidth / 2;
    const viewCenterY = el.mainCanvasArea.scrollTop + el.mainCanvasArea.offsetHeight / 2;

    const pointX = viewCenterX / oldZoom;
    const pointY = viewCenterY / oldZoom;

    state.zoomLevel = newZoom;
    el.canvasContainer.style.transform = `scale(${newZoom})`;
    el.canvasContainer.style.transformOrigin = '0 0';

    const newScrollX = pointX * newZoom - el.mainCanvasArea.offsetWidth / 2;
    const newScrollY = pointY * newZoom - el.mainCanvasArea.offsetHeight / 2;

    el.mainCanvasArea.scrollLeft = newScrollX;
    el.mainCanvasArea.scrollTop = newScrollY;

    redrawAll();
}

function handleTimelineClick(e) {
    if (state.isPlaying) {
        stopPlayback();
    }

    const rect = el.xRulerCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    const canvasX = (clickX + el.mainCanvasArea.scrollLeft) / state.zoomLevel;

    let newStartTime = canvasX / PIXELS_PER_SECOND;
    newStartTime = Math.max(0, Math.min(newStartTime, MAX_DURATION_SECONDS));

    state.playbackStartTime = newStartTime;

    updatePlayheadPosition();

    el.mainCanvasArea.scrollLeft = (state.playbackStartTime * PIXELS_PER_SECOND * state.zoomLevel) - (el.mainCanvasArea.offsetWidth / 4);

    redrawAll();
}

function startPlayheadDrag(e) {
}

function handlePlayheadDrag(e) {
    if (!state.isDraggingPlayhead) return;
    e.preventDefault();

    const rect = el.mainCanvasArea.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPosOnCanvasArea = clientX - rect.left;

    const canvasX = (xPosOnCanvasArea + el.mainCanvasArea.scrollLeft) / state.zoomLevel;

    let newStartTime = canvasX / PIXELS_PER_SECOND;
    newStartTime = Math.max(0, Math.min(newStartTime, MAX_DURATION_SECONDS));

    state.playbackStartTime = newStartTime;
    updatePlayheadPosition();
}

function stopPlayheadDrag() {
    if (state.isDraggingPlayhead) {
        state.isDraggingPlayhead = false;
        d.body.style.cursor = 'default';
        setActiveTool(state.activeTool);
    }
}

function updatePlayheadPosition() {
    const playheadX = state.playbackStartTime * PIXELS_PER_SECOND;
    el.playhead.style.transform = `translateX(${playheadX}px)`;
    el.playhead.classList.remove('hidden');
}


// --- DRAWING & COMPOSITION ---
function handleClear() {
    if (confirm("Tem certeza de que deseja limpar toda a pauta? Esta ação não pode ser desfeita.")) {
        state.composition = { strokes: [], symbols: [] };
        state.selectedElements = [];
        state.history = [];
        state.historyIndex = -1;
        saveState(true);
        redrawAll();
        updateControlsForSelection();
    }
}

function placeSymbol(options, type) {
    const symbol = {
        id: Date.now() + Math.random(),
        type: type,
        color: el.colorPicker.value,
        size: parseFloat(el.lineWidth.value),
        timbre: state.activeTimbre,
        effects: []
    };

    if (type === 'line') {
        symbol.x = options.x;
        symbol.y = options.y;
        symbol.endX = options.endX;
        symbol.endY = options.endY;
    } else {
        symbol.x = options.x;
        symbol.y = options.y;
    }

    state.composition.symbols.push(symbol);
    drawElementWithEffects(symbol);
    saveState();
}

function drawElementWithEffects(element) {
    if (!element) return;

    ctx.save();

    element.effects = element.effects || [];

    let currentGlobalAlpha = ctx.globalAlpha;

    const volumeEffect = element.effects.find(e => e.type === 'volumeZone');
    if (volumeEffect) {
        const gainAmount = volumeEffect.params.gain || 1.0;
        currentGlobalAlpha = Math.max(0.2, Math.min(1.0, gainAmount));
        ctx.globalAlpha = currentGlobalAlpha;
    } else {
        ctx.globalAlpha = 1.0;
    }

    const reverbEffect = element.effects.find(e => e.type === 'reverbZone');
    if (reverbEffect && reverbEffect.params.mix > 0) {
        const reverbAmount = reverbEffect.params.mix;
        ctx.shadowBlur = reverbAmount * 30;
        ctx.shadowColor = element.color;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    } else {
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    const distortionEffect = element.effects.find(e => e.type === 'distortion');
    if (distortionEffect && distortionEffect.params.amount > 0) {
        const distortionAmount = distortionEffect.params.amount;
        ctx.shadowBlur = Math.min(5, distortionAmount * 0.05);
        ctx.shadowColor = element.color;
        ctx.shadowOffsetX = (Math.random() - 0.5) * distortionAmount * 0.02;
        ctx.shadowOffsetY = (Math.random() - 0.5) * distortionAmount * 0.02;
    }

    const vibratoEffect = element.effects.find(e => e.type === 'vibratoZone');
    const tremoloAmpEffect = element.effects.find(e => e.type === 'tremoloAmplitude');
    const wahEffect = element.effects.find(e => e.type === 'wah');

    if (vibratoEffect || tremoloAmpEffect || wahEffect) {
        ctx.save();
        const centerX = element.x || (element.points ? element.points[0].x : 0);
        const centerY = element.y || (element.points ? element.points[0].y : 0);

        ctx.translate(centerX, centerY);

        if (vibratoEffect) {
            const rate = vibratoEffect.params.rate || 5;
            const depth = vibratoEffect.params.depth || 50;
            const offsetY = Math.sin(Date.now() * 0.005 * rate) * (depth * 0.1);
            ctx.translate(0, offsetY);
        }

        if (tremoloAmpEffect) {
            const rate = tremoloAmpEffect.params.rate || 8;
            const depth = tremoloAmpEffect.params.depth || 0.5;
            const scaleFactor = 1 + Math.sin(Date.now() * 0.01 * rate) * (depth * 0.2);
            ctx.scale(scaleFactor, scaleFactor);
        }

        if (wahEffect) {
            const rate = wahEffect.params.rate || 2;
            const range = wahEffect.params.range || 2000;
            const wobbleFactor = Math.sin(Date.now() * 0.005 * rate) * (range / FREQ_MAX * 0.2);
            ctx.shadowBlur = Math.abs(wobbleFactor) * 10;
            ctx.shadowColor = element.color;
            ctx.globalAlpha = currentGlobalAlpha * (1 + Math.abs(wobbleFactor) * 0.5);
        }

        ctx.translate(-centerX, -centerY);
        drawBaseElement(element, ctx);
        ctx.restore();
    } else {
        drawBaseElement(element, ctx);
    }

    const panEffect = element.effects.find(e => e.type === 'panZone');
    if (panEffect && Math.abs(panEffect.params.pan) > 0.05) {
        ctx.save();
        const panAmount = panEffect.params.pan;
        const offset = panAmount * 5;
        ctx.globalAlpha = (ctx.globalAlpha || 1.0) * 0.4;
        ctx.translate(offset, 0);
        drawBaseElement(element, ctx);
        ctx.restore();
    }

    const delayEffect = element.effects.find(e => e.type === 'delayZone');
    if (delayEffect && delayEffect.params.mix > 0) {
        const delayAmount = delayEffect.params.mix;
        const timeParam = delayEffect.params.time || 0.25;
        const numEchoes = Math.floor(delayAmount * 3) + 1;
        const baseOffsetX = 10 * timeParam;
        const baseOffsetY = 5 * timeParam;

        for (let i = numEchoes; i >= 1; i--) {
            ctx.save();
            ctx.globalAlpha = (currentGlobalAlpha || 1.0) * (delayAmount * 0.3) * (i / numEchoes);
            ctx.translate(-baseOffsetX * i, -baseOffsetY * i);
            drawBaseElement(element, ctx);
            ctx.restore();
        }
    }

    const filterEffects = element.effects.filter(e => ['lowpassFilter', 'highpassFilter', 'bandpassFilter', 'notchFilter'].includes(e.type));
    if (filterEffects.length > 0) {
        filterEffects.forEach(effect => {
            const intensity = effect.params.Q || 1;
            if (intensity > 0) {
                ctx.save();
                ctx.globalAlpha = (currentGlobalAlpha || 1.0) * (0.1 + (intensity / 20) * 0.4);
                ctx.lineWidth = element.lineWidth + (intensity / 10);

                let shadowColor = 'rgba(255, 255, 255, 0.5)';
                let shadowOffsetY = 0;
                let shadowOffsetX = 0;

                switch (effect.type) {
                    case 'lowpassFilter':
                        shadowColor = 'rgba(0, 0, 0, 0.3)';
                        shadowOffsetY = -2;
                        break;
                    case 'highpassFilter':
                        shadowColor = 'rgba(255, 255, 255, 0.5)';
                        shadowOffsetY = 2;
                        break;
                    case 'bandpassFilter':
                        shadowColor = 'rgba(0, 255, 255, 0.6)';
                        break;
                    case 'notchFilter':
                        shadowColor = 'rgba(255, 0, 0, 0.5)';
                        break;
                }
                ctx.shadowBlur = intensity * 2;
                ctx.shadowColor = shadowColor;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                drawBaseElement(element, ctx);
                ctx.restore();
            }
        });
    }

    const complexModEffects = element.effects.filter(e => ['phaser', 'flanger', 'chorus'].includes(e.type));
    if (complexModEffects.length > 0) {
        complexModEffects.forEach(effect => {
            ctx.save();
            const mix = effect.params.mix || 0.5;
            const rate = effect.params.rate || 0.5;
            const numCopies = 2;
            const baseSpread = 5;

            for (let i = 1; i <= numCopies; i++) {
                ctx.save();
                const ghostAlpha = (currentGlobalAlpha || 1.0) * (mix * 0.5) * (1 - (i / (numCopies + 1)));
                ctx.globalAlpha = ghostAlpha;

                const offsetX = Math.sin(Date.now() * 0.005 * rate + i) * baseSpread * (mix);
                const offsetY = Math.cos(Date.now() * 0.005 * rate + i) * baseSpread * (mix);

                ctx.translate(offsetX, offsetY);
                drawBaseElement(element, ctx);
                ctx.translate(-2 * offsetX, -2 * offsetY);
                drawBaseElement(element, ctx);
                ctx.restore();
            }
            ctx.restore();
        });
    }

    ctx.restore();
}

function drawBaseElement(s, context) {
    context.beginPath();
    context.strokeStyle = s.color;
    context.lineWidth = s.points ? s.lineWidth : s.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (s.points) {
        if (s.points.length < 2) return;
        context.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
            context.lineTo(s.points[i].x, s.points[i].y);
        }
        context.stroke();
    } else {
        context.fillStyle = s.color;
        const size = s.size;
        switch(s.type) {
            case 'staccato': context.arc(s.x, s.y, size / 4, 0, 2 * Math.PI); context.fill(); break;
            case 'percussion':
                context.moveTo(s.x - size/2, s.y - size/2);
                context.lineTo(s.x + size/2, s.y + size/2);
                context.moveTo(s.x + size/2, s.y - size/2);
                context.lineTo(s.x - size/2, s.y + size/2);
                context.stroke();
                break;
            case 'arpeggio': context.lineWidth = Math.max(2, size / 15); context.moveTo(s.x - size, s.y + size/2); context.bezierCurveTo(s.x - size/2, s.y - size, s.x + size/2, s.y + size, s.x + size, s.y-size/2); context.stroke(); break;
            case 'granular':
                context.fillRect(s.x - size, s.y - size/2, size*2, size);
                break;
            case 'tremolo': context.moveTo(s.x - size, s.y); context.lineTo(s.x - size/2, s.y - size/2); context.lineTo(s.x, s.y); context.lineTo(s.x + size/2, s.y + size/2); context.lineTo(s.x + size, s.y); context.stroke(); break;
            case 'line': context.moveTo(s.x, s.y); context.lineTo(s.endX, s.endY); context.stroke(); break;
        }
    }
}


function eraseAt(x, y) {
    let somethingWasErased = false;
    const eraseRadius = ERASE_RADIUS;
    const eraseRadiusSquared = eraseRadius * eraseRadius;

    // Otimização para Símbolos
    const initialSymbolCount = state.composition.symbols.length;
    state.composition.symbols = state.composition.symbols.filter(s => {
        const distanceSquared = (s.x - x)**2 + (s.y - y)**2;
        return distanceSquared > eraseRadiusSquared;
    });
    if (state.composition.symbols.length < initialSymbolCount) {
        somethingWasErased = true;
    }

    // Otimização para Traços
    const strokesToRemove = [];
    state.composition.strokes.forEach((stroke, strokeIndex) => {
        // Passo 1: Verificação Rápida de Bounding Box
        // Pega a "caixa" que contém o traço para uma checagem inicial.
        const bbox = getElementBoundingBox(stroke);
        if (bbox) {
            // Verifica se o círculo da borracha sequer toca a caixa do traço.
            // O 'eraseRadius' extra na verificação garante que a borda seja considerada.
            const isNear = (x + eraseRadius > bbox.x &&
                            x - eraseRadius < bbox.x + bbox.width &&
                            y + eraseRadius > bbox.y &&
                            y - eraseRadius < bbox.y + bbox.height);

            // Passo 2: Se estiver perto, faz a verificação detalhada.
            if (isNear) {
                const initialLength = stroke.points.length;
                stroke.points = stroke.points.filter(p => {
                    const distanceSquared = (p.x - x)**2 + (p.y - y)**2;
                    return distanceSquared > eraseRadiusSquared;
                });

                if (stroke.points.length < initialLength) {
                    somethingWasErased = true;
                }

                // Se o traço ficou sem pontos, marca para remoção.
                if (stroke.points.length < 2) {
                    strokesToRemove.push(strokeIndex);
                }
            }
        }
    });

    // Remove os traços que ficaram vazios, de trás para frente para não bagunçar os índices.
    for (let i = strokesToRemove.length - 1; i >= 0; i--) {
        state.composition.strokes.splice(strokesToRemove[i], 1);
    }

    // Redesenha e salva o estado apenas se algo mudou.
    if (somethingWasErased) {
        redrawAll();
        saveState();
    }
}

function applyEffectToSelectedElements(effectType, sliderValue) {
    if (state.selectedElements.length === 0) {
        return;
    }

    state.selectedElements.forEach(id => {
        const element = findElementById(id);
        if (element) {
            if (!element.effects) {
                element.effects = [];
            }

            let existingEffect = element.effects.find(e => e.type === effectType);

            const sliderElement = Object.values(el.effectSliders).find(s => s.dataset.effectType === effectType);
            if (!sliderElement) {
                console.warn(`Slider element for effectType "${effectType}" not found.`);
                return;
            }
            const sliderMax = parseFloat(sliderElement.max);
            const sliderMin = parseFloat(sliderElement.min);
            const normalizedValue = (sliderValue - sliderMin) / (sliderMax - sliderMin);

            const params = {};

            switch(effectType) {
                case 'reverbZone':
                    params.decay = (normalizedValue * 3.5) + 0.5;
                    params.mix = normalizedValue * 1.5;
                    break;
                case 'delayZone':
                    params.time = normalizedValue * 0.75;
                    params.feedback = normalizedValue * 0.9;
                    params.mix = normalizedValue * 1.5;
                case 'volumeZone':
                    params.gain = (sliderValue / 100) * 2;
                    break;
                case 'panZone':
                    params.pan = (sliderValue / 100);
                    break;
                case 'vibratoZone':
                    params.rate = (normalizedValue * 10) + 1;
                    params.depth = normalizedValue * 100;
                    break;
                case 'lowpassFilter':
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * (1 - normalizedValue);
                    params.Q = 10 * normalizedValue;
                    break;
                case 'highpassFilter':
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * normalizedValue;
                    params.Q = 10 * normalizedValue;
                    break;
                case 'bandpassFilter':
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * normalizedValue;
                    params.Q = 10 * normalizedValue;
                    break;
                case 'notchFilter':
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * normalizedValue;
                    params.Q = 10 * normalizedValue;
                    break;
                case 'phaser':
                    params.rate = (normalizedValue * 2) + 0.1;
                    params.depth = normalizedValue * 2000;
                    break;
                case 'flanger':
                    params.rate = (normalizedValue * 0.5) + 0.1;
                    params.delay = normalizedValue * 0.015;
                    params.feedback = normalizedValue * 0.9;
                    break;
                case 'chorus':
                    params.rate = (normalizedValue * 0.5) + 0.1;
                    params.delay = normalizedValue * 0.025;
                    params.mix = normalizedValue;
                    break;
                case 'distortion':
                    params.amount = normalizedValue * 200;
                    break;
                case 'compressor':
                    params.threshold = -20 - (normalizedValue * 40);
                    params.ratio = 1 + (normalizedValue * 10);
                    break;
                case 'tremoloAmplitude':
                    params.rate = (normalizedValue * 15) + 1;
                    params.depth = normalizedValue;
                    break;
                case 'wah':
                    params.rate = (normalizedValue * 5) + 0.5;
                    params.range = normalizedValue * 3000;
                    params.q = 5 + (normalizedValue * 15);
                    params.baseFreq = (FREQ_MIN + FREQ_MAX) / 2;
                    break;
            }

            const isNeutralValue = (
                (effectType === 'volumeZone') ? sliderValue === 100 :
                (effectType === 'panZone') ? sliderValue === 0 :
                (effectType === 'lowpassFilter') ? sliderValue === 0 :
                (effectType === 'highpassFilter') ? sliderValue === 0 :
                sliderValue === 0
            );

            if (isNeutralValue) {
                element.effects = element.effects.filter(e => e.type !== effectType);
            } else {
                if (existingEffect) {
                    Object.assign(existingEffect.params, params);
                } else {
                    element.effects.push({ type: effectType, params: params });
                }
            }
        }
    });
    saveState();
    redrawAll();
}

// NOVO: Função unificada para atualizar todos os controles (cor, espessura, efeitos)
// NOVO: Função unificada para atualizar todos os controles (cor, espessura, efeitos)
function updateControlsForSelection() {
    if (state.selectedElements.length === 0) {
        resetEffectSliders();
        return;
    }

    const selectedObjects = state.selectedElements.map(id => findElementById(id)).filter(Boolean);

    // Atualizar Cor
    const firstColor = selectedObjects[0].color;
    const allSameColor = selectedObjects.every(el => el.color === firstColor);
    el.colorPicker.value = allSameColor ? firstColor : '#000000';

    // Atualizar Espessura
    const firstSize = selectedObjects[0].points ? selectedObjects[0].lineWidth : selectedObjects[0].size;
    const allSameSize = selectedObjects.every(el => (el.points ? el.lineWidth : el.size) === firstSize);
    el.lineWidth.value = allSameSize ? firstSize : 5;

    // Atualizar Sliders de Efeitos
    Object.keys(el.effectSliders).forEach(key => {
        const slider = el.effectSliders[key];
        const effectType = slider.dataset.effectType;
        let firstValue = null;
        let allHaveSameValue = true;

        for (let i = 0; i < selectedObjects.length; i++) {
            const currentElement = selectedObjects[i];
            const effect = (currentElement.effects || []).find(e => e.type === effectType);
            const sliderValue = getSliderValueFromEffect(effect, effectType, slider);

            if (i === 0) {
                firstValue = sliderValue;
            } else if (sliderValue !== firstValue) {
                allHaveSameValue = false;
                break;
            }
        }

        slider.style.accentColor = ''; // Limpa a cor customizada

        if (allHaveSameValue) {
            slider.value = firstValue;
            slider.style.opacity = '1';
        } else {
            const midValue = (parseFloat(slider.max) + parseFloat(slider.min)) / 2;
            slider.value = midValue;
            slider.style.opacity = '0.7';
            slider.style.accentColor = '#888'; // Aplica a cor cinza para estado misto
        }
    });
}


// Função auxiliar para obter o valor do slider a partir de um efeito.
function getSliderValueFromEffect(effect, effectType, slider) {
    if (!effect) {
        switch (effectType) {
            case 'volumeZone': return 100;
            case 'panZone': return 0;
            default: return parseFloat(slider.min);
        }
    }

    let sliderValue;
    const normalizedToSlider = (norm) => (norm * (slider.max - slider.min)) + slider.min;

    switch (effectType) {
        case 'reverbZone': sliderValue = normalizedToSlider((effect.params.mix || 0) / 1.5); break;
        case 'delayZone': sliderValue = normalizedToSlider((effect.params.mix || 0) / 1.5); break;
        case 'volumeZone': sliderValue = (effect.params.gain / 2) * 100; break;
        case 'panZone': sliderValue = effect.params.pan * 100; break;
        case 'vibratoZone': sliderValue = normalizedToSlider(effect.params.depth / 100); break;
        // Adicionar outros 'cases' conforme necessário...
        default: sliderValue = parseFloat(slider.min);
    }
    return Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), sliderValue));
}
function resetEffectSliders() {
    Object.keys(el.effectSliders).forEach(key => {
        const slider = el.effectSliders[key];
        let neutralValue;
        switch (slider.dataset.effectType) {
            case 'volumeZone':
                neutralValue = 100;
                break;
            case 'panZone':
                neutralValue = 0;
                break;
            default:
                neutralValue = slider.min || 0;
        }
        slider.value = neutralValue;
        state.currentEffectValues[slider.id] = neutralValue;
        slider.style.opacity = '1';
        slider.style.accentColor = ''; // Apenas remove qualquer cor customizada
    });
}
function moveSelectedElements(dx, dy) {
    state.selectedElements.forEach(id => {
        const element = findElementById(id);
        if (element) {
            if (element.points) {
                element.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
            } else {
                element.x += dx;
                element.y += dy;
                if (typeof element.endX !== 'undefined') {
                    element.endX += dx;
                    element.endY += dy;
                }
            }
        }
    });
}

// NOVO: Função para redimensionar elementos
function resizeSelectedElements(dx, dy) {
    const collectiveBox = getSelectionBoundingBox();
    if (!collectiveBox) return;

    const handle = state.resizeHandle;
    let scaleX = 1, scaleY = 1;
    let originX, originY;

    // Calcula os fatores de escala
    if (handle.includes('right')) {
        scaleX = (collectiveBox.width + dx) / collectiveBox.width;
    } else if (handle.includes('left')) {
        scaleX = (collectiveBox.width - dx) / collectiveBox.width;
    }

    if (handle.includes('bottom')) {
        scaleY = (collectiveBox.height + dy) / collectiveBox.height;
    } else if (handle.includes('top')) {
        scaleY = (collectiveBox.height - dy) / collectiveBox.height;
    }
    
    // Mantém proporção para alças de canto
    if (handle.length > 2) {
       const scale = Math.max(scaleX, scaleY);
       scaleX = scale;
       scaleY = scale;
    }


    // Define o ponto de origem da transformação (o lado oposto à alça)
    if (handle.includes('right')) originX = collectiveBox.x;
    else originX = collectiveBox.x + collectiveBox.width;

    if (handle.includes('bottom')) originY = collectiveBox.y;
    else originY = collectiveBox.y + collectiveBox.height;


    state.selectedElements.forEach(id => {
        const elem = findElementById(id);
        if (!elem) return;

        const transformPoint = (p) => {
            p.x = originX + (p.x - originX) * scaleX;
            p.y = originY + (p.y - originY) * scaleY;
        };

        if (elem.points) {
            elem.points.forEach(transformPoint);
        } else {
            let p = { x: elem.x, y: elem.y };
            transformPoint(p);
            elem.x = p.x;
            elem.y = p.y;

            if (typeof elem.endX !== 'undefined') {
                let pEnd = { x: elem.endX, y: elem.endY };
                transformPoint(pEnd);
                elem.endX = pEnd.x;
                elem.endY = pEnd.y;
            }
            // Escala o tamanho dos símbolos também
            elem.size *= Math.max(scaleX, scaleY);
        }
    });
}


function deleteSelectedElements() {
    if (state.selectedElements.length === 0) return;
    state.composition.strokes = state.composition.strokes.filter(s => !state.selectedElements.includes(s.id));
    state.composition.symbols = state.composition.symbols.filter(s => !state.selectedElements.includes(s.id));
    state.selectedElements = [];
    saveState();
    redrawAll();
    updateControlsForSelection();
}

function copySelectedElements() {
    if (state.selectedElements.length === 0) return;
    clipboard = state.selectedElements
        .map(id => findElementById(id))
        .filter(Boolean)
        .map(el => JSON.parse(JSON.stringify(el)));
}

function pasteElements() {
    if (clipboard.length === 0) return;
    const newSelection = [];
    const pasteOffset = 20;

    clipboard.forEach(element => {
        const newElement = JSON.parse(JSON.stringify(element));
        newElement.id = Date.now() + Math.random();

        if (newElement.points) {
            newElement.points.forEach(p => {
                p.x += pasteOffset;
                p.y += pasteOffset;
            });
            state.composition.strokes.push(newElement);
        } else {
            newElement.x += pasteOffset;
            newElement.y += pasteOffset;
            if (typeof newElement.endX !== 'undefined') newElement.endX += pasteOffset;
            if (typeof newElement.endY !== 'undefined') newElement.endY += pasteOffset;
            state.composition.symbols.push(newElement);
        }
        newSelection.push(newElement.id);
    });

    state.selectedElements = newSelection;
    saveState();
    redrawAll();
    updateControlsForSelection();
}

function findElementById(id) {
    return state.composition.strokes.find(s => s.id === id) || state.composition.symbols.find(s => s.id === id);
}

function getElementBoundingBox(element) {
    if (!element) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (element.points) {
        if (element.points.length === 0) return null;
        element.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    } else {
        const size = element.size || 10;
        if (element.type === 'line') {
            minX = Math.min(element.x, element.endX);
            minY = Math.min(element.y, element.endY);
            maxX = Math.max(element.x, element.endX);
            maxY = Math.max(element.y, element.endY);
        } else {
             minX = element.x - size / 2;
             minY = element.y - size / 2;
             maxX = element.x + size / 2;
             maxY = element.y + size / 2;
        }
    }
    const margin = element.lineWidth ? element.lineWidth / 2 : 5;
    return { x: minX - margin, y: minY - margin, width: (maxX - minX) + 2 * margin, height: (maxY - minY) + 2 * margin };
}


function drawMarquee() {
    if (!state.isSelecting || !state.selectionStart || !state.selectionEnd) return;
    const start = state.selectionStart;
    const end = state.selectionEnd;
    const selectionColor = getComputedStyle(d.documentElement).getPropertyValue('--selection-glow').trim();

    ctx.save();
    ctx.fillStyle = selectionColor.replace(/[^,]+(?=\))/, '0.2');
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1;
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.restore();
}

// NOVO: Função que retorna a bounding box de toda a seleção
function getSelectionBoundingBox() {
    if (state.selectedElements.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    state.selectedElements.forEach(id => {
        const element = findElementById(id);
        const box = getElementBoundingBox(element);
        if (box) {
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);
        }
    });

    if (minX === Infinity) return null;

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// NOVO: Lógica de desenho da caixa de seleção e das alças foi movida para esta função
function drawSelectionIndicator() {
    const box = getSelectionBoundingBox();
    if (!box) return;

    ctx.save();
    const selectionColor = getComputedStyle(d.documentElement).getPropertyValue('--selection-glow').trim();
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);

    // Desenha as alças de redimensionamento
    const handles = getResizeHandles(box);
    ctx.fillStyle = selectionColor;
    Object.values(handles).forEach(handle => {
        ctx.fillRect(handle.x - handle.size / 2, handle.y - handle.size / 2, handle.size, handle.size);
    });

    ctx.restore();
}

// NOVO: Funções auxiliares para redimensionamento
function getResizeHandles(box) {
    if (!box) return {};
    const handleSize = 8;
    return {
        'top-left':     { x: box.x, y: box.y, size: handleSize },
        'top-right':    { x: box.x + box.width, y: box.y, size: handleSize },
        'bottom-left':  { x: box.x, y: box.y + box.height, size: handleSize },
        'bottom-right': { x: box.x + box.width, y: box.y + box.height, size: handleSize },
        'top':          { x: box.x + box.width / 2, y: box.y, size: handleSize },
        'bottom':       { x: box.x + box.width / 2, y: box.y + box.height, size: handleSize },
        'left':         { x: box.x, y: box.y + box.height / 2, size: handleSize },
        'right':        { x: box.x + box.width, y: box.y + box.height / 2, size: handleSize },
    };
}

function getResizeHandleAtPos(pos) {
    const box = getSelectionBoundingBox();
    if (!box) return null;
    const handles = getResizeHandles(box);
    for (const name in handles) {
        const handle = handles[name];
        if (
            pos.x >= handle.x - handle.size && pos.x <= handle.x + handle.size &&
            pos.y >= handle.y - handle.size && pos.y <= handle.y + handle.size
        ) {
            return name;
        }
    }
    return null;
}

function getResizeCursor(handleName) {
    if (handleName.includes('top') && handleName.includes('left')) return 'nwse-resize';
    if (handleName.includes('top') && handleName.includes('right')) return 'nesw-resize';
    if (handleName.includes('bottom') && handleName.includes('left')) return 'nesw-resize';
    if (handleName.includes('bottom') && handleName.includes('right')) return 'nwse-resize';
    if (handleName.includes('top') || handleName.includes('bottom')) return 'ns-resize';
    if (handleName.includes('left') || handleName.includes('right')) return 'ew-resize';
    return 'move';
}


function isPointNearLine(p, a, b, tolerance) {
    const L2 = (b.x - a.x)**2 + (b.y - a.y)**2;
    if (L2 === 0) return Math.sqrt((p.x - a.x)**2 + (p.y - a.y)**2) < tolerance;
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + t * (b.x - a.x));
    const dy = p.y - (a.y + t * (b.y - a.y));
    return (dx**2 + dy**2) < tolerance**2;
}

function getElementAtPos(pos) {
    const tolerance = 10;
    // Verifica primeiro os símbolos, que são desenhados por cima
    for (let i = state.composition.symbols.length - 1; i >= 0; i--) {
        const s = state.composition.symbols[i];
        const box = getElementBoundingBox(s);
        if (box && pos.x >= box.x && pos.x <= box.x + box.width && pos.y >= box.y && pos.y <= box.y + box.height) {
            return s;
        }
    }
    // Depois verifica os traços
    for (let i = state.composition.strokes.length - 1; i >= 0; i--) {
        const stroke = state.composition.strokes[i];
        const strokeTolerance = (stroke.lineWidth / 2) + tolerance;
        for (let j = 0; j < stroke.points.length - 1; j++) {
            if (isPointNearLine(pos, stroke.points[j], stroke.points[j+1], strokeTolerance)) {
                return stroke;
            }
        }
    }
    return null;
}


function doRectsIntersect(r1, r2) {
    if (!r1 || !r2) return false;
    const selX1 = r1.x;
    const selX2 = r1.x + r1.width;
    const selY1 = r1.y;
    const selY2 = r1.y + r1.height;

    const elX1 = r2.x;
    const elX2 = r2.x + r2.width;
    const elY1 = r2.y;
    const elY2 = r2.y + r2.height;

    return !(selX2 < elX1 || elX2 < selX1 || selY2 < elY1 || elY2 < selY1);
}

// --- PROJECT SAVE/LOAD/IMPORT ---
function saveProject() {
    try {
        const projectData = JSON.stringify(state.composition);
        const blob = new Blob([projectData], { type: 'application/json' });
        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `meu-projeto-${Date.now()}.drawmus`;
        link.click();
    } catch (e) {
        console.error("Erro ao salvar projeto:", e);
        alert("Não foi possível salvar o projeto.");
    }
}

function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const projectData = JSON.parse(e.target.result);
            if (projectData && Array.isArray(projectData.strokes) && Array.isArray(projectData.symbols)) {
                projectData.strokes.forEach(s => s.effects = s.effects || []);
                projectData.symbols.forEach(s => s.effects = s.effects || []);

                state.composition = projectData;
                state.selectedElements = [];
                redrawAll();
                saveState();
                updateControlsForSelection();
            } else {
                throw new Error("Formato de arquivo inválido.");
            }
        } catch (err) {
            console.error("Erro ao importar projeto:", err);
            alert("Erro ao ler o arquivo do projeto. Ele pode estar corrompido ou não ser um arquivo .drawmus válido.");
        } finally {
            event.target.value = null;
        }
    };
    reader.readAsText(file);
}

function loadAutoSavedProject() {
    const savedJson = localStorage.getItem(AUTOSAVE_KEY);
    if (savedJson) {
        try {
            const savedComposition = JSON.parse(savedJson);
            if (savedComposition && (savedComposition.strokes.length > 0 || savedComposition.symbols.length > 0)) {
                if (confirm("Encontramos um projeto salvo automaticamente. Deseja carregá-lo?")) {
                    savedComposition.strokes.forEach(s => s.effects = s.effects || []);
                    savedComposition.symbols.forEach(s => s.effects = s.effects || []);
                    state.composition = savedComposition;
                }
            }
        } catch (e) {
            console.error("Erro ao carregar projeto do localStorage:", e);
            localStorage.removeItem(AUTOSAVE_KEY);
        }
    }
}

// --- UNDO / REDO & HISTORY ---
function saveState(isInitial = false) {
    if (!isInitial) {
        state.history.length = state.historyIndex + 1;
    }
    const historyState = { ...state.composition };
    state.history.push(JSON.parse(JSON.stringify(historyState)));
    state.historyIndex++;
    updateUndoRedoButtons();
    updateExportButtonsState();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        state.composition.strokes.forEach(s => s.effects = s.effects || []);
        state.composition.symbols.forEach(s => s.effects = s.effects || []);

        state.selectedElements = [];
        updateControlsForSelection();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
        redrawAll();
        updateUndoRedoButtons();
        updateExportButtonsState();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        state.composition.strokes.forEach(s => s.effects = s.effects || []);
        state.composition.symbols.forEach(s => s.effects = s.effects || []);

        state.selectedElements = [];
        updateControlsForSelection();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
        redrawAll();
        updateUndoRedoButtons();
        updateExportButtonsState();
    }
}

function updateUndoRedoButtons() {
    el.undoBtn.disabled = state.historyIndex <= 0;
    el.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// --- AUDIO ENGINE ---
async function initAudio() {
    if (state.audioCtx && state.audioCtx.state !== 'closed') return;
    try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        alert('Seu navegador não suporta a Web Audio API.');
    }
}

function togglePlayback() {
    if (!state.composition.strokes.length && !state.composition.symbols.length) return;
    state.isPlaying ? stopPlayback() : startPlayback();
}

function startPlayback() {
    initAudio().then(() => {
        if (!state.audioCtx) return;
        if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

        state.isPlaying = true;
        updatePlaybackUI(true);

        const globalGainNode = state.audioCtx.createGain();
        const bassFilter = state.audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 100;
        bassFilter.gain.value = state.globalEqValues.bassEqGlobal;

        const midFilter = state.audioCtx.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 1;
        midFilter.gain.value = state.globalEqValues.midEqGlobal;

        const trebleFilter = state.audioCtx.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 3000;
        trebleFilter.gain.value = state.globalEqValues.trebleEqGlobal;

        globalGainNode.connect(bassFilter);
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);
        trebleFilter.connect(state.audioCtx.destination);

        const startX = state.playbackStartTime * PIXELS_PER_SECOND * state.zoomLevel;
        if (Math.abs(el.mainCanvasArea.scrollLeft - startX) > el.mainCanvasArea.offsetWidth) {
             el.mainCanvasArea.scrollLeft = startX - 100;
        }

        scheduleAllSounds(state.audioCtx, state.playbackStartTime, globalGainNode);
        animatePlayhead();
    });
}

function stopPlayback() {
    state.isPlaying = false;

    state.sourceNodes.forEach(node => {
        try {
            if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
                node.stop(0);
            }
            if (typeof node.disconnect === 'function') {
                node.disconnect();
            }
        } catch(e) {
            console.warn("Erro ao parar/desconectar nó de áudio:", e);
        }
    });
    state.sourceNodes = [];

    cancelAnimationFrame(state.animationFrameId);
    updatePlaybackUI(false);
}

function animatePlayhead() {
    if (!state.isPlaying || !state.audioCtx) return;

    const audioContextStartTimeForCurrentPlay = state.audioCtx.currentTime;
    const canvasStartPosInSeconds = state.playbackStartTime;

    function frame() {
        if (!state.isPlaying || !state.audioCtx) return;

        const elapsedTimeSinceAudioStart = state.audioCtx.currentTime - audioContextStartTimeForCurrentPlay;
        const currentPosInSeconds = canvasStartPosInSeconds + elapsedTimeSinceAudioStart;

        if (currentPosInSeconds >= MAX_DURATION_SECONDS) {
            stopPlayback();
            state.playbackStartTime = 0;
            updatePlayheadPosition();
            return;
        }

        state.playbackStartTime = currentPosInSeconds;
        updatePlayheadPosition();

        const currentXInPixels = state.playbackStartTime * PIXELS_PER_SECOND;
        if (currentXInPixels * state.zoomLevel > el.mainCanvasArea.scrollLeft + el.mainCanvasArea.clientWidth) {
            el.mainCanvasArea.scrollLeft = (currentXInPixels * state.zoomLevel) - el.mainCanvasArea.clientWidth + 100;
        } else if (currentXInPixels * state.zoomLevel < el.mainCanvasArea.scrollLeft) {
            el.mainCanvasArea.scrollLeft = (currentXInPixels * state.zoomLevel) - 100;
        }

        state.animationFrameId = requestAnimationFrame(frame);
    }
    state.animationFrameId = requestAnimationFrame(frame);
}

function scheduleAllSounds(audioCtx, offsetTime = 0, destinationNode) {
    const now = audioCtx.currentTime;
    state.sourceNodes = [];

    if (destinationNode) {
        if (typeof destinationNode.connect !== 'function') {
            console.warn("Destination node is not a valid AudioNode. Using audio context destination instead.");
            destinationNode = audioCtx.destination;
        }
    } else {
        destinationNode = audioCtx.destination;
    }


    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;

        const xCoords = stroke.points.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);

        const strokeStartTimeCanvas = minX / PIXELS_PER_SECOND;
        const strokeEndTimeCanvas = maxX / PIXELS_PER_SECOND;

        const scheduledAudioStart = now + (strokeStartTimeCanvas - offsetTime);
        const scheduledAudioEnd = now + (strokeEndTimeCanvas - offsetTime);

        if (scheduledAudioEnd < now || scheduledAudioStart > now + MAX_DURATION_SECONDS) {
            return;
        }

        const actualScheduledStart = Math.max(now, scheduledAudioStart);
        const actualDuration = scheduledAudioEnd - actualScheduledStart;

        if (actualDuration <= 0) {
            return;
        }

        const freqValues = new Float32Array(Math.ceil(actualDuration * 100));

        const startXForGeneration = (actualScheduledStart - now + offsetTime) * PIXELS_PER_SECOND;

        let currentPointIndex = 0;
        while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < startXForGeneration) {
            currentPointIndex++;
        }

        for (let i = 0; i < freqValues.length; i++) {
            const timeInSegment = i / 100;
            const xPosForFreq = startXForGeneration + timeInSegment * PIXELS_PER_SECOND;

            if (xPosForFreq > maxX) {
                freqValues[i] = yToFrequency(stroke.points[stroke.points.length - 1].y);
                continue;
            }

            while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosForFreq) {
                currentPointIndex++;
            }
            const p1 = stroke.points[currentPointIndex];
            const p2 = stroke.points[currentPointIndex + 1] || p1;

            const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosForFreq - p1.x) / (p2.x - p1.x);
            const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
            freqValues[i] = yToFrequency(interpolatedY);
        }

        const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
        const pan = xToPan(minX);

        createTone(audioCtx, {
            element: stroke,
            type: stroke.timbre,
            startTime: actualScheduledStart,
            endTime: actualScheduledStart + actualDuration,
            freqValues: freqValues,
            vol: vol,
            pan: pan,
            xStart: minX,
            xEnd: maxX,
            initialY: stroke.points[0].y,
        }, destinationNode);
    });

    state.composition.symbols.forEach(s => {
        const symbolTime = s.x / PIXELS_PER_SECOND;
        const symbolDuration = 0.1;

        const scheduledTime = now + Math.max(0, symbolTime - offsetTime);

        if (symbolTime < offsetTime || scheduledTime > now + MAX_DURATION_SECONDS) {
            return;
        }

        const vol = 0.1 + (s.size / 50) * 0.4;
        const pan = xToPan(s.x);
        const freq = yToFrequency(s.y);

        switch (s.type) {
            case 'staccato': createTone(audioCtx, { element: s, type: 'triangle', startTime: scheduledTime, endTime: scheduledTime + 0.08, startFreq: freq, vol, pan, xStart: s.x, initialY: s.y }, destinationNode); break;
            case 'percussion': createTone(audioCtx, { element: s, type: 'noise', startTime: scheduledTime, endTime: scheduledTime + 0.1, vol, pan, xStart: s.x, initialY: s.y }, destinationNode); break;
            case 'arpeggio':
                [1, 5/4, 3/2, 2].forEach((interval, i) => {
                    const noteScheduledTime = now + Math.max(0, (symbolTime + i * 0.05) - offsetTime);
                    if (noteScheduledTime > now + MAX_DURATION_SECONDS) return;
                    createTone(audioCtx, { element: s, type: 'triangle', startTime: noteScheduledTime, endTime: noteScheduledTime + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, xStart: s.x, initialY: s.y }, destinationNode);
                });
                break;
            case 'line':
                const lineStartTimeCanvas = s.x / PIXELS_PER_SECOND;
                const lineEndTimeCanvas = s.endX / PIXELS_PER_SECOND;

                const actualLineStartTime = Math.max(lineStartTimeCanvas, offsetTime);
                const actualLineEndTime = lineEndTimeCanvas;

                const scheduledLineStart = now + (actualLineStartTime - offsetTime);
                const scheduledLineEnd = now + (actualLineEndTime - offsetTime);
                const lineDuration = scheduledLineEnd - scheduledLineStart;

                if (lineDuration > 0) {
                    let startFreq = yToFrequency(s.y);
                    let endFreq = yToFrequency(s.endY);

                    const originalLineTotalDuration = lineEndTimeCanvas - lineStartTimeCanvas;
                    if (originalLineTotalDuration > 0) {
                        if (offsetTime > lineStartTimeCanvas) {
                            const progressAtOffset = (offsetTime - lineStartTimeCanvas) / originalLineTotalDuration;
                            startFreq = yToFrequency(s.y + (s.endY - s.y) * progressAtOffset);
                        }
                        if (scheduledLineEnd > now + MAX_DURATION_SECONDS) {
                             const progressAtEndLimit = ( (now + MAX_DURATION_SECONDS) - (lineStartTimeCanvas - offsetTime + now) ) / originalLineTotalDuration;
                             endFreq = yToFrequency(s.y + (s.endY - s.y) * progressAtEndLimit);
                        }
                    }

                    createTone(audioCtx, { element: s, type: s.timbre, startTime: scheduledLineStart, endTime: scheduledLineEnd, startFreq: startFreq, endFreq: endFreq, vol, pan, xStart: s.x, xEnd: s.endX, initialY: s.y }, destinationNode);
                }
                break;
            case 'tremolo':
                for (let t = 0; t < 0.5; t += 0.05) {
                    const tremoloScheduledTime = now + Math.max(0, (symbolTime + t) - offsetTime);
                    if (tremoloScheduledTime > now + MAX_DURATION_SECONDS) return;
                    createTone(audioCtx, { element: s, type: 'sine', startTime: tremoloScheduledTime, endTime: tremoloScheduledTime + 0.1, startFreq: freq, vol: vol * 0.8, pan, xStart: s.x, initialY: s.y }, destinationNode);
                }
                break;
            case 'granular':
                for (let i = 0; i < 20; i++) {
                     const randomOffset = Math.random() * 0.5;
                     const granularScheduledTime = now + Math.max(0, (symbolTime + randomOffset) - offsetTime);
                     if (granularScheduledTime > now + MAX_DURATION_SECONDS) return;
                     createTone(audioCtx, { element: s, type: 'sine', startTime: granularScheduledTime, endTime: granularScheduledTime + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, xStart: s.x, initialY: s.y }, destinationNode);
                }
                break;
        }
    });
}

function createTone(audioCtx, opts, mainOut) {
    let osc;
    const duration = opts.endTime - opts.startTime;
    if (duration <= 0) return;

    const sourcesToStop = [];
    const effectTailTime = 2.0;
    let finalStopTime = opts.endTime;

    const hasReverbOrDelay = opts.element.effects.some(e => e.type === 'reverbZone' || e.type === 'delayZone');
    if (hasReverbOrDelay) {
        finalStopTime = opts.endTime + effectTailTime;
    }


    switch (opts.type) {
        case 'noise':
            osc = audioCtx.createBufferSource();
            const bufferDuration = Math.max(duration + 0.1, 0.5);
            const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * bufferDuration, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            osc.buffer = buffer;
            osc.loop = false;
            sourcesToStop.push(osc);
            break;
        case 'fm':
            const carrier = audioCtx.createOscillator(); carrier.type = 'sine';
            const modulator = audioCtx.createOscillator(); modulator.type = 'square';

            if(opts.freqValues) {
                modulator.frequency.setValueAtTime( (opts.freqValues.reduce((a, b) => a + b) / opts.freqValues.length) * 1.5 || 300, audioCtx.currentTime);
            } else {
                modulator.frequency.setValueAtTime( (opts.startFreq || 200) * 1.5, audioCtx.currentTime);
            }

            const modGain = audioCtx.createGain();
            modGain.gain.setValueAtTime( (opts.startFreq || 200) * 0.75, audioCtx.currentTime);
            modulator.connect(modGain).connect(carrier.frequency);
            osc = audioCtx.createGain(); carrier.connect(osc);

            sourcesToStop.push(modulator, carrier);
            break;
        case 'organ':
            osc = audioCtx.createGain();
            const fundamental = audioCtx.createOscillator();
            fundamental.type = 'sine';
            if(opts.freqValues) fundamental.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
            else fundamental.frequency.setValueAtTime(opts.startFreq || 440, opts.startTime);
            fundamental.connect(osc);

            const harmonic1 = audioCtx.createOscillator();
            harmonic1.type = 'sine';
            if(opts.freqValues) harmonic1.frequency.setValueCurveAtTime(opts.freqValues.map(f => f * 2), opts.startTime, duration);
            else harmonic1.frequency.setValueAtTime((opts.startFreq || 440) * 2, opts.startTime);
            const gain1 = audioCtx.createGain(); gain1.gain.value = 0.5;
            harmonic1.connect(gain1).connect(osc);

            const harmonic2 = audioCtx.createOscillator();
            harmonic2.type = 'sine';
            if(opts.freqValues) harmonic2.frequency.setValueCurveAtTime(opts.freqValues.map(f => f * 1.5), opts.startTime, duration);
            else harmonic2.frequency.setValueAtTime((opts.startFreq || 440) * 1.5, opts.startTime);
            const gain2 = audioCtx.createGain(); gain2.gain.value = 0.3;
            harmonic2.connect(gain2).connect(osc);

            sourcesToStop.push(fundamental, harmonic1, harmonic2);
            break;
        case 'pulse':
            osc = audioCtx.createOscillator();
            osc.type = 'square';
            sourcesToStop.push(osc);
            break;
        case 'sine':
        case 'square':
        case 'sawtooth':
        case 'triangle':
        default:
            osc = audioCtx.createOscillator();
            osc.type = opts.type;
            sourcesToStop.push(osc);
            break;
    }

    if (osc instanceof OscillatorNode) {
        if (opts.freqValues) {
            osc.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
        } else if (opts.startFreq) {
            osc.frequency.setValueAtTime(opts.startFreq, opts.startTime);
            if (opts.endFreq) osc.frequency.linearRampToValueAtTime(opts.endFreq, opts.endTime);
        }
    }

    const mainGain = audioCtx.createGain();
    const attackTime = 0.01;
    const releaseTime = 0.1;

    mainGain.gain.setValueAtTime(0.0001, opts.startTime);
    mainGain.gain.exponentialRampToValueAtTime(opts.vol, opts.startTime + attackTime);
    mainGain.gain.setValueAtTime(opts.vol, opts.endTime);
    mainGain.gain.exponentialRampToValueAtTime(0.0001, opts.endTime + releaseTime);


    if (opts.type !== 'fm' && opts.type !== 'organ' && typeof osc.connect === 'function') {
        osc.connect(mainGain);
    } else if (opts.type === 'fm' && osc instanceof GainNode) {
         osc.connect(mainGain);
    } else if (opts.type === 'organ' && osc instanceof GainNode) {
         osc.connect(mainGain);
    }

    let currentNode = mainGain;

    if (opts.element && opts.element.effects && opts.element.effects.length > 0) {
        const effectOrder = [
            'lowpassFilter', 'highpassFilter', 'bandpassFilter', 'notchFilter',
            'phaser', 'flanger', 'chorus', 'vibratoZone', 'tremoloAmplitude', 'wah',
            'distortion', 'compressor'
        ];

        const orderedEffects = effectOrder
            .map(type => opts.element.effects.find(eff => eff.type === type))
            .filter(Boolean);

        orderedEffects.forEach(effect => {
            let effectNode;
            const params = effect.params;

            switch (effect.type) {
                case 'lowpassFilter':
                case 'highpassFilter':
                case 'bandpassFilter':
                case 'notchFilter':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = effect.type.replace('Filter', '');
                    effectNode.frequency.value = params.frequency || ((FREQ_MIN + FREQ_MAX) / 2);
                    if (typeof params.Q !== 'undefined') effectNode.Q.value = params.Q;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'vibratoZone':
                    if (osc instanceof OscillatorNode) {
                        const vibratoLFO = audioCtx.createOscillator();
                        vibratoLFO.type = 'sine';
                        vibratoLFO.frequency.value = params.rate || 5;
                        const vibratoGain = audioCtx.createGain();
                        vibratoGain.gain.value = params.depth || 50;
                        vibratoLFO.connect(vibratoGain).connect(osc.frequency);
                        sourcesToStop.push(vibratoLFO);
                    }
                    break;
                case 'phaser':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'allpass';
                    effectNode.frequency.value = params.depth || 1000;
                    const phaserLFO = audioCtx.createOscillator();
                    phaserLFO.type = 'sine';
                    phaserLFO.frequency.value = params.rate || 0.5;
                    const phaserLFOGain = audioCtx.createGain();
                    phaserLFOGain.gain.value = (params.depth || 1000) * 0.5;
                    phaserLFO.connect(phaserLFOGain);
                    phaserLFOGain.connect(effectNode.detune);
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    sourcesToStop.push(phaserLFO);
                    break;
                case 'flanger':
                    const delayNodeFlanger = audioCtx.createDelay(0.02);
                    const lfoFlanger = audioCtx.createOscillator();
                    lfoFlanger.type = 'sine';
                    lfoFlanger.frequency.value = params.rate || 0.2;
                    const lfoFlangerGain = audioCtx.createGain();
                    lfoFlangerGain.gain.value = params.delay || 0.005;
                    lfoFlanger.connect(lfoFlangerGain).connect(delayNodeFlanger.delayTime);

                    const feedbackFlanger = audioCtx.createGain();
                    feedbackFlanger.gain.value = params.feedback || 0.5;

                    const wetGainFlanger = audioCtx.createGain();
                    wetGainFlanger.gain.value = params.mix || 0.5;
                    const dryGainFlanger = audioCtx.createGain();
                    dryGainFlanger.gain.value = 1 - (params.mix || 0.5);

                    currentNode.connect(dryGainFlanger);
                    currentNode.connect(delayNodeFlanger);
                    delayNodeFlanger.connect(feedbackFlanger).connect(delayNodeFlanger);
                    delayNodeFlanger.connect(wetGainFlanger);

                    const mergeNodeFlanger = audioCtx.createGain();
                    dryGainFlanger.connect(mergeNodeFlanger);
                    wetGainFlanger.connect(mergeNodeFlanger);

                    currentNode = mergeNodeFlanger;
                    sourcesToStop.push(lfoFlanger);
                    break;
                case 'chorus':
                    const delayNodeChorus1 = audioCtx.createDelay(params.delay || 0.025);
                    const lfoChorus1 = audioCtx.createOscillator();
                    lfoChorus1.type = 'sine';
                    lfoChorus1.frequency.value = params.rate || 0.3;
                    const lfoChorusGain1 = audioCtx.createGain();
                    lfoChorusGain1.gain.value = (params.delay || 0.025) * 0.5;
                    lfoChorus1.connect(lfoChorusGain1).connect(delayNodeChorus1.delayTime);

                    const wetGainChorus1 = audioCtx.createGain();
                    wetGainChorus1.gain.value = (params.mix || 0.5) / 2;

                    currentNode.connect(delayNodeChorus1).connect(wetGainChorus1);

                    const delayNodeChorus2 = audioCtx.createDelay(params.delay * 1.5 || 0.0375);
                    const lfoChorus2 = audioCtx.createOscillator();
                    lfoChorus2.type = 'sine';
                    lfoChorus2.frequency.value = (params.rate || 0.3) * 0.8;
                    const lfoChorusGain2 = audioCtx.createGain();
                    lfoChorusGain2.gain.value = (params.delay || 0.025) * 0.4;
                    lfoChorus2.connect(lfoChorusGain2).connect(delayNodeChorus2.delayTime);

                    const wetGainChorus2 = audioCtx.createGain();
                    wetGainChorus2.gain.value = (params.mix || 0.5) / 2;

                    currentNode.connect(delayNodeChorus2).connect(wetGainChorus2);

                    const dryGainChorus = audioCtx.createGain();
                    dryGainChorus.gain.value = 1 - (params.mix || 0.5);
                    currentNode.connect(dryGainChorus);

                    const mergeNodeChorus = audioCtx.createGain();
                    dryGainChorus.connect(mergeNodeChorus);
                    wetGainChorus1.connect(mergeNodeChorus);
                    wetGainChorus2.connect(mergeNodeChorus);

                    currentNode = mergeNodeChorus;
                    sourcesToStop.push(lfoChorus1, lfoChorus2);
                    break;
                case 'distortion':
                    effectNode = audioCtx.createWaveShaper();
                    effectNode.curve = makeDistortionCurve(params.amount || 100);
                    effectNode.oversample = '4x';
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'compressor':
                    effectNode = audioCtx.createDynamicsCompressor();
                    effectNode.threshold.value = params.threshold || -50;
                    effectNode.knee.value = params.knee || 40;
                    effectNode.ratio.value = params.ratio || 12;
                    effectNode.attack.value = params.attack || 0.005;
                    effectNode.release.value = params.release || 0.25;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'tremoloAmplitude':
                    effectNode = audioCtx.createGain();
                    const tremoloAmpLFO = audioCtx.createOscillator();
                    tremoloAmpLFO.type = 'sine';
                    tremoloAmpLFO.frequency.value = params.rate || 8;
                    const tremoloAmpGainNode = audioCtx.createGain();
                    tremoloAmpGainNode.gain.value = params.depth || 0.5;
                    tremoloAmpLFO.connect(tremoloAmpGainNode);
                    tremoloAmpGainNode.connect(effectNode.gain);
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    sourcesToStop.push(tremoloAmpLFO);
                    break;
                case 'wah':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'bandpass';
                    effectNode.Q.value = params.q || 10;
                    const wahLFO = audioCtx.createOscillator();
                    wahLFO.type = 'sine';
                    wahLFO.frequency.value = params.rate || 2;
                    const wahGain = audioCtx.createGain();
                    wahGain.gain.value = params.range || 2000;
                    wahLFO.connect(wahGain).connect(effectNode.frequency);
                    effectNode.frequency.value = params.baseFreq || 500;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    sourcesToStop.push(wahLFO);
                    break;
            }
        });
        const delayEffect = opts.element.effects.find(eff => eff.type === 'delayZone');
        if (delayEffect && delayEffect.params.mix > 0) {
            const delayNode = audioCtx.createDelay(1.0);
            const feedbackNode = audioCtx.createGain();
            const wetGainDelay = audioCtx.createGain();

            delayNode.delayTime.value = delayEffect.params.time || 0.25;
            feedbackNode.gain.value = delayEffect.params.feedback || 0.3;
            wetGainDelay.gain.value = delayEffect.params.mix || 0.5;

            currentNode.connect(delayNode);
            delayNode.connect(feedbackNode).connect(delayNode);
            delayNode.connect(wetGainDelay);
            wetGainDelay.connect(mainOut);
        }

        const reverbEffect = opts.element.effects.find(eff => eff.type === 'reverbZone');
        if (reverbEffect && reverbEffect.params.mix > 0) {
            const reverbNode = audioCtx.createConvolver();
            reverbNode.buffer = createImpulseResponse(audioCtx, reverbEffect.params.decay || 1.5, 2.0);
            const reverbWetGain = audioCtx.createGain();
            reverbWetGain.gain.value = reverbEffect.params.mix || 0.3;

            currentNode.connect(reverbNode);
            reverbNode.connect(reverbWetGain);
            reverbWetGain.connect(mainOut);
        }
    }

    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(opts.pan, opts.startTime);
    currentNode.connect(panner);

    panner.connect(mainOut);

    sourcesToStop.forEach(node => {
        if (typeof node.start === 'function' && typeof node.stop === 'function') {
            node.start(opts.startTime);
            node.stop(finalStopTime); }
        state.sourceNodes.push(node);
    });
}

function makeDistortionCurve(amount) {
    let k = typeof amount === 'number' ? amount : 50;
    let n_samples = 44100;
    let curve = new Float32Array(n_samples);
    let deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function updatePlaybackUI(isPlaying) {
    el.playIcon.classList.toggle('hidden', isPlaying);
    el.pauseIcon.classList.toggle('hidden', !isPlaying);
    el.playBtnText.textContent = isPlaying ? "Parar" : "Tocar";

    if (isPlaying) {
        el.playhead.classList.remove('hidden');
    } else {
        updatePlayheadPosition();
    }
}

function updateExportButtonsState() {
    const isEmpty = !state.composition.strokes.length && !state.composition.symbols.length;
    d.getElementById('exportBtn').disabled = isEmpty;
    el.exportJpgBtn.disabled = isEmpty;
    el.exportPdfBtn.disabled = isEmpty;
    el.exportWavBtn.disabled = isEmpty;
    el.saveProjectBtn.disabled = isEmpty;
}

function resetView() {
    if (state.isPlaying) {
        stopPlayback();
    }
    state.playbackStartTime = 0;
    el.mainCanvasArea.scrollLeft = 0;
    updatePlayheadPosition();
    redrawAll();
}

function yToFrequency(y) {
    const normalizedY = 1 - Math.max(0, Math.min(1, y / el.canvas.height));
    return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, normalizedY);
}

function yFromFrequency(freq) {
    const normalizedFreq = Math.log(freq / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
    return el.canvas.height * (1 - normalizedFreq);
}

function xToPan(x) {
    return (x / el.canvas.width) * 2 - 1;
}

function createImpulseResponse(ac, duration = 1.5, decay = 2.0) {
    const rate = ac.sampleRate;
    const impulse = ac.createBuffer(2, rate * duration, rate);
    for (let i = 0; i < 2; i++) {
        const channel = impulse.getChannelData(i);
        for (let j = 0; j < channel.length; j++) {
            channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / channel.length, decay);
        }
    }
    return impulse;
}

function setActiveTool(toolName) {
    state.activeTool = toolName;
    state.lineStart = null;

    Object.values(el.tools).forEach(btn => btn?.classList.remove('active'));

    if (el.tools[toolName]) {
        el.tools[toolName].classList.add('active');
    }

    let cursor = 'auto';
    if (toolName === 'select') cursor = 'pointer';
    else if (toolName === 'hand') cursor = 'grab';
    else if (toolName === 'eraser') cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)" stroke="black" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="2,2"/></svg>') 12 12, auto`;
    else if (['line', 'pencil', 'staccato', 'percussion', 'arpeggio', 'granular', 'tremolo'].includes(toolName)) cursor = 'crosshair';

    el.canvas.style.cursor = cursor;
}

function setActiveTimbre(timbreName) {
    state.activeTimbre = timbreName;
    Object.values(el.timbres).forEach(btn => btn?.classList.remove('active'));
    el.timbres[timbreName]?.classList.add('active');
}

function applyTheme(theme) {
    d.documentElement.setAttribute('data-theme', theme);
    el.themeSun.classList.toggle('hidden', theme === 'dark');
    el.themeMoon.classList.toggle('hidden', theme !== 'dark');
    localStorage.setItem('music-drawing-theme', theme);
    setTimeout(redrawAll, 50);
}
function handleExportDrag(e) {
    if (!state.isDraggingStart && !state.isDraggingEnd) return;

    if (e.touches) e.preventDefault();

    const rect = el.xRulerContainer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPosOnRuler = clientX - rect.left;

    const time = ((el.mainCanvasArea.scrollLeft / state.zoomLevel) + (xPosOnRuler / state.zoomLevel)) / PIXELS_PER_SECOND;

    if (state.isDraggingStart) {
        state.exportStartTime = Math.max(0, Math.min(time, state.exportEndTime - 0.1));
    } else if (state.isDraggingEnd) {
        state.exportEndTime = Math.min(MAX_DURATION_SECONDS, Math.max(time, state.exportStartTime + 0.1));
    }

    updateExportSelectionVisuals();
}

function updateExportSelectionVisuals() {
    const scroll = el.mainCanvasArea.scrollLeft;
    const zoom = state.zoomLevel;

    const startHandlePos = (state.exportStartTime * PIXELS_PER_SECOND * zoom) - scroll;
    const endHandlePos = (state.exportEndTime * PIXELS_PER_SECOND * zoom) - scroll;

    el.exportStartHandle.style.left = `${startHandlePos}px`;
    el.exportEndHandle.style.left = `${endHandlePos}px`;

    const overlayStart = state.exportStartTime * PIXELS_PER_SECOND;
    const overlayEnd = state.exportEndTime * PIXELS_PER_SECOND;

    el.exportSelectionOverlay.style.left = `${overlayStart}px`;
    el.exportSelectionOverlay.style.width = `${overlayEnd - overlayStart}px`;
}

/**
 * Calcula a área retangular (bounding box) que contém todos os desenhos.
 * Isso nos ajuda a exportar apenas a área utilizada da composição.
 * @returns {object} - Um objeto { minX, minY, maxX, maxY }.
 */
function getCompositionBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const allElements = [...state.composition.strokes, ...state.composition.symbols];

    if (allElements.length === 0) {
        return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }

    allElements.forEach(element => {
        const bbox = getElementBoundingBox(element);
        if (bbox) {
            minX = Math.min(minX, bbox.x);
            minY = Math.min(minY, bbox.y);
            maxX = Math.max(maxX, bbox.x + bbox.width);
            maxY = Math.max(maxY, bbox.y + bbox.height);
        }
    });

    return { minX, minY, maxX, maxY };
}

/**
 * Exporta APENAS a área visível do canvas como uma imagem JPG.
 */
function exportJpgVisibleArea() {
    try {
        // Define as dimensões do canvas temporário com base na área visível.
        const viewWidth = el.mainCanvasArea.clientWidth;
        const viewHeight = el.mainCanvasArea.clientHeight;

        const tempCanvas = d.createElement('canvas');
        tempCanvas.width = viewWidth;
        tempCanvas.height = viewHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Preenche o fundo com a cor do tema atual.
        tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
        tempCtx.fillRect(0, 0, viewWidth, viewHeight);

        // O truque: translada o contexto para a posição de scroll atual.
        // Ao desenhar a composição inteira, apenas a parte visível será renderizada.
        tempCtx.translate(-el.mainCanvasArea.scrollLeft, -el.mainCanvasArea.scrollTop);

        // Desenha todos os elementos.
        state.composition.strokes.forEach(stroke => drawBaseElement(stroke, tempCtx));
        state.composition.symbols.forEach(s => drawBaseElement(s, tempCtx));

        // Converte o canvas temporário (que agora é um "screenshot") para imagem.
        const imgData = tempCanvas.toDataURL('image/jpeg', 0.9);
        const link = d.createElement('a');
        link.href = imgData;
        link.download = `music-drawing-view-${Date.now()}.jpg`;
        link.click();

    } catch (e) {
        console.error("Erro ao exportar JPG:", e);
        alert("Não foi possível exportar a imagem como JPG.");
    }
}

async function exportPdfPaginated() {
    // Mostra o overlay de carregamento para dar feedback ao usuário.
    el.loadingOverlay.classList.remove('hidden');

    // Pequeno delay para garantir que o overlay seja renderizado antes do processamento pesado.
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        // Constantes para o layout da página A4 em modo paisagem.
        // (Valores aproximados em pixels para 96 DPI)
        const A4_LANDSCAPE_WIDTH_PX = 1123;
        const A4_LANDSCAPE_HEIGHT_PX = 794;
        const PAGE_MARGIN = 40; // Margem de 40px em todos os lados.

        const contentWidth = A4_LANDSCAPE_WIDTH_PX - (PAGE_MARGIN * 2);
        const contentHeight = A4_LANDSCAPE_HEIGHT_PX - (PAGE_MARGIN * 2);

        // Calcula a área total ocupada pelo desenho.
        const bounds = getCompositionBounds();
        const totalDrawingWidth = bounds.maxX;
        const totalDrawingHeight = el.canvas.height; // Usamos a altura total do canvas.

        // Calcula a escala para encaixar a altura do desenho na altura da página.
        const scale = contentHeight / totalDrawingHeight;
        const scaledContentWidth = contentWidth / scale;

        // Calcula o número de páginas necessárias.
        const numPages = Math.ceil(totalDrawingWidth / scaledContentWidth);

        // Cria o documento PDF.
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: 'a4'
        });

        const tempCanvas = d.createElement('canvas');
        tempCanvas.width = contentWidth;
        tempCanvas.height = contentHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Loop para gerar cada página.
        for (let i = 0; i < numPages; i++) {
            if (i > 0) {
                pdf.addPage();
            }

            // Limpa e prepara o canvas temporário para a página atual.
            tempCtx.clearRect(0, 0, contentWidth, contentHeight);
            tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
            tempCtx.fillRect(0, 0, contentWidth, contentHeight);

            // Salva o estado do contexto.
            tempCtx.save();

            // Aplica a escala para caber na altura da página.
            tempCtx.scale(scale, scale);

            // Translada para a "fatia" correta da composição.
            tempCtx.translate(-i * scaledContentWidth, 0);

            // Desenha a composição inteira (apenas a parte relevante será visível).
            state.composition.strokes.forEach(stroke => drawBaseElement(stroke, tempCtx));
            state.composition.symbols.forEach(s => drawBaseElement(s, tempCtx));

            // Restaura o estado do contexto para remover a translação/escala.
            tempCtx.restore();

            // Adiciona a imagem da página renderizada ao PDF.
            const imgData = tempCanvas.toDataURL('image/jpeg', 0.8);
            pdf.addImage(imgData, 'JPEG', PAGE_MARGIN, PAGE_MARGIN, contentWidth, contentHeight);
        }

        pdf.save(`music-drawing-${Date.now()}.pdf`);

    } catch (e) {
        console.error("Erro ao exportar PDF:", e);
        alert("Não foi possível exportar como PDF. O projeto pode ser muito complexo.");
    } finally {
        // Esconde o overlay de carregamento.
        el.loadingOverlay.classList.add('hidden');
    }
}

async function exportWav() {
    const { exportStartTime, exportEndTime } = state;
    if (exportEndTime <= exportStartTime) {
        alert("A seleção de exportação é inválida. O tempo final deve ser maior que o inicial.");
        return;
    }

    el.loadingOverlay.classList.remove('hidden');

    const duration = exportEndTime - exportStartTime;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 44100 * duration, 44100);

    const globalGainNode = offlineCtx.createGain();
    const bassFilter = offlineCtx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 100;
    bassFilter.gain.value = state.globalEqValues.bassEqGlobal;

    const midFilter = offlineCtx.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.value = 1000;
    midFilter.Q.value = 1;
    midFilter.gain.value = state.globalEqValues.midEqGlobal;

    const trebleFilter = offlineCtx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 3000;
    trebleFilter.gain.value = state.globalEqValues.trebleEqGlobal;

    globalGainNode.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(offlineCtx.destination);


    const scheduleForExport = (audioCtx) => {
        const now = 0;

        state.composition.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;

            const xCoords = stroke.points.map(p => p.x);
            const minX = Math.min(...xCoords);
            const maxX = Math.max(...xCoords);

            const strokeStartCanvas = minX / PIXELS_PER_SECOND;
            const strokeEndCanvas = maxX / PIXELS_PER_SECOND;

            const effectiveStartCanvas = Math.max(strokeStartCanvas, exportStartTime);
            const effectiveEndCanvas = Math.min(strokeEndCanvas, exportEndTime);

            if (effectiveEndCanvas <= effectiveStartCanvas) return;

            const scheduledStartTime = effectiveStartCanvas - exportStartTime;
            const effectiveDuration = effectiveEndCanvas - effectiveStartCanvas;

            const freqValues = new Float32Array(Math.ceil(effectiveDuration * 100));

            const startXForGeneration = effectiveStartCanvas * PIXELS_PER_SECOND;

            let currentPointIndex = 0;
            while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < startXForGeneration) {
                currentPointIndex++;
            }

            for (let i = 0; i < freqValues.length; i++) {
                const timeInSegment = i / 100;
                const xPosForFreq = startXForGeneration + timeInSegment * PIXELS_PER_SECOND;

                if (xPosForFreq > maxX) {
                    freqValues[i] = yToFrequency(stroke.points[stroke.points.length - 1].y);
                    continue;
                }

                while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosForFreq) {
                    currentPointIndex++;
                }
                const p1 = stroke.points[currentPointIndex];
                const p2 = stroke.points[currentPointIndex + 1] || p1;

                const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosForFreq - p1.x) / (p2.x - p1.x);
                const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
                freqValues[i] = yToFrequency(interpolatedY);
            }

            const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
            const pan = xToPan(minX);

            createTone(audioCtx, {
                element: stroke,
                type: stroke.timbre,
                startTime: now + scheduledStartTime,
                endTime: now + scheduledStartTime + effectiveDuration,
                freqValues: freqValues,
                vol: vol,
                pan: pan,
                xStart: minX,
                xEnd: maxX,
                initialY: stroke.points[0].y
            }, globalGainNode);
        });

        state.composition.symbols.forEach(s => {
            const symbolTimeCanvas = s.x / PIXELS_PER_SECOND;
            const symbolDuration = 0.1;

            const effectiveSymbolStartCanvas = Math.max(symbolTimeCanvas, exportStartTime);
            const effectiveSymbolEndCanvas = Math.min(symbolTimeCanvas + symbolDuration, exportEndTime);

            if (effectiveSymbolEndCanvas <= effectiveSymbolStartCanvas) return;

            const scheduledTime = now + (effectiveSymbolStartCanvas - exportStartTime);
            const vol = 0.1 + (s.size / 50) * 0.4;
            const pan = xToPan(s.x);
            let freq = yToFrequency(s.y);

            switch (s.type) {
                case 'staccato': createTone(offlineCtx, { element: s, type: 'triangle', startTime: scheduledTime, endTime: scheduledTime + 0.08, startFreq: freq, vol, pan, xStart: s.x, initialY: s.y }, globalGainNode); break;
                case 'percussion': createTone(offlineCtx, { element: s, type: 'noise', startTime: scheduledTime, endTime: scheduledTime + 0.1, vol, pan, xStart: s.x, initialY: s.y }, globalGainNode); break;
                case 'arpeggio':
                    [1, 5/4, 3/2, 2].forEach((interval, i) => {
                        const noteScheduledTime = now + (symbolTimeCanvas + i * 0.05 - exportStartTime);
                        if (noteScheduledTime < now || noteScheduledTime > now + duration) return;
                        createTone(offlineCtx, { element: s, type: 'triangle', startTime: noteScheduledTime, endTime: noteScheduledTime + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, xStart: s.x, initialY: s.y }, globalGainNode);
                    });
                    break;
                case 'line':
                    const glissStartTimeCanvas = s.x / PIXELS_PER_SECOND;
                    const glissEndTimeCanvas = s.endX / PIXELS_PER_SECOND;

                    const effectiveGlissStartCanvas = Math.max(glissStartTimeCanvas, exportStartTime);
                    const effectiveGlissEndCanvas = Math.min(glissEndTimeCanvas, exportEndTime);

                    if (effectiveGlissEndCanvas <= effectiveGlissStartCanvas) return;

                    const scheduledGlissStart = now + (effectiveGlissStartCanvas - exportStartTime);
                    const glissDuration = effectiveGlissEndCanvas - effectiveGlissStartCanvas;

                    let startFreq = yToFrequency(s.y);
                    let endFreq = yToFrequency(s.endY);

                    const originalGlissTotalDuration = glissEndTimeCanvas - glissStartTimeCanvas;
                    if (originalGlissTotalDuration > 0) {
                        if (effectiveGlissStartCanvas > glissStartTimeCanvas) {
                            const progressAtStart = (effectiveGlissStartCanvas - glissStartTimeCanvas) / originalGlissTotalDuration;
                            startFreq = yToFrequency(s.y + (s.endY - s.y) * progressAtStart);
                        }
                        if (effectiveGlissEndCanvas < glissEndTimeCanvas) {
                            const progressAtEnd = (effectiveGlissEndCanvas - glissStartTimeCanvas) / originalGlissTotalDuration;
                            endFreq = yToFrequency(s.y + (s.endY - s.y) * progressAtEnd);
                        }
                    }

                    createTone(offlineCtx, { element: s, type: s.timbre, startTime: scheduledGlissStart, endTime: scheduledGlissStart + glissDuration, startFreq: startFreq, endFreq: endFreq, vol, pan, xStart: s.x, xEnd: s.endX, initialY: s.y }, globalGainNode);
                    break;
                case 'tremolo':
                    for (let t = 0; t < 0.5; t += 0.05) {
                        const tremoloScheduledTime = now + (symbolTimeCanvas + t - exportStartTime);
                        if (tremoloScheduledTime < now || tremoloScheduledTime > now + duration) return;
                        createTone(offlineCtx, { element: s, type: 'sine', startTime: tremoloScheduledTime, endTime: tremoloScheduledTime + 0.1, startFreq: freq, vol: vol * 0.8, pan, xStart: s.x, initialY: s.y }, globalGainNode);
                    }
                    break;
                case 'granular':
                    for (let i = 0; i < 20; i++) {
                         const randomOffset = Math.random() * 0.5;
                         const granularScheduledTime = now + (symbolTimeCanvas + randomOffset - exportStartTime);
                         if (granularScheduledTime < now || granularScheduledTime > now + duration) return;
                         createTone(offlineCtx, { element: s, type: 'sine', startTime: granularScheduledTime, endTime: granularScheduledTime + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, xStart: s.x, initialY: s.y }, globalGainNode);
                    }
                    break;
            }
        });
    };

    scheduleForExport(offlineCtx);

    try {
        const renderedBuffer = await offlineCtx.startRendering();
        const wav = bufferToWav(renderedBuffer);
        const blob = new Blob([new Uint8Array(wav)], { type: 'audio/wav' });

        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `minha-musica-${Date.now()}.wav`;
        link.click();
    } catch (e) {
        console.error('Erro ao renderizar o WAV:', e);
        alert('Ocorreu um erro ao exportar o áudio.');
    } finally {
        el.loadingOverlay.classList.add('hidden');
    }
}

function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);

    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return bufferArr;

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

function simplify(points, tolerance) {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > tolerance) {
        const recResults1 = simplify(points.slice(0, index + 1), tolerance);
        const recResults2 = simplify(points.slice(index), tolerance);

        return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
        return [points[0], points[end]];
    }
}

function perpendicularDistance(point, lineStart, lineEnd) {
    let dx = lineEnd.x - lineStart.x;
    let dy = lineEnd.y - lineStart.y;

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
        dx /= mag;
        dy /= mag;
    }

    const pvx = point.x - lineStart.x;
    const pvy = point.y - lineStart.y;

    const pvdot = dx * pvx + dy * pvy;

    const ax = pvx - pvdot * dx;
    const ay = pvy - pvdot * dy;

    return Math.sqrt(ax * ax + ay * ay);
}


// --- STARTUP ---
d.addEventListener('DOMContentLoaded', () => {
    const pcModeBtn = d.getElementById('pc-mode-btn');
    const mobileModeBtn = d.getElementById('mobile-mode-btn');

    if (pcModeBtn && mobileModeBtn) {
        pcModeBtn.addEventListener('click', () => initApp('pc'));
        mobileModeBtn.addEventListener('click', () => initApp('mobile'));
    }

    const selectionContainer = d.getElementById('selection-container');
    const backgroundAudio = d.getElementById('background-audio');

    if (selectionContainer && backgroundAudio) {
        const startAudioOnClick = () => {
            if (backgroundAudio.paused) {
                backgroundAudio.play().catch(error => {
                    console.error("A reprodução do áudio falhou mesmo após o clique:", error);
                });
            }
        };
        selectionContainer.addEventListener('click', startAudioOnClick, { once: true });
    }

    const appWrapper = d.getElementById('app-wrapper');
    if(selectionContainer) selectionContainer.classList.remove('hidden');
    if(appWrapper) appWrapper.classList.add('hidden');
});