const d = document;
const { jsPDF } = window.jspdf;

// --- CONSTANTS ---
const MAX_DURATION_SECONDS = 600; // 10 minutes
const PIXELS_PER_SECOND = 100;
const FREQ_MIN = 100;
const FREQ_MAX = 2000;
const ERASE_RADIUS = 20;
const AUTOSAVE_KEY = 'music-drawing-autosave';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.1;
const DEFAULT_EFFECT_INTENSITY = 50; // Intensidade padrão para efeitos aplicados à seleção

// --- DOM ELEMENTS ---
const el = {
    playBtn: d.getElementById('playBtn'), playIcon: d.getElementById('playIcon'), pauseIcon: d.getElementById('pauseIcon'), playBtnText: d.querySelector('#playBtn span'),
    resetViewBtn: d.getElementById('resetViewBtn'),
    playhead: d.getElementById('playhead'), colorPicker: d.getElementById('colorPicker'), lineWidth: d.getElementById('lineWidth'),
    clearBtn: d.getElementById('clearBtn'),
    reverbSlider: d.getElementById('reverb'), // Reverb Global
    delayTimeSlider: d.getElementById('delayTime'), // Delay Global
    delayFeedbackSlider: d.getElementById('delayFeedback'), // Delay Global Feedback
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

    effectIntensitySlider: d.getElementById('effectRange'), 

    // Ferramentas de Desenho e Interação
    tools: { 
        select: d.getElementById('select'), pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), hand: d.getElementById('hand'), 
        glissando: d.getElementById('glissando'), staccato: d.getElementById('staccato'), percussion: d.getElementById('percussion'), 
        arpeggio: d.getElementById('arpeggio'), granular: d.getElementById('granular'), tremolo: d.getElementById('tremolo'),
        // Novas ferramentas de desenho
        line: d.getElementById('line'), circle: d.getElementById('circle'), rectangle: d.getElementById('rectangle')
    },
    // Controles de Efeitos no Desenho (agora sliders, sem `effectTools` como botões diretos)
    effectSliders: {
        volumeEffect: d.getElementById('volumeEffect'), panEffect: d.getElementById('panEffect'),
        vibratoEffect: d.getElementById('vibratoEffect'), reverbEffect: d.getElementById('reverbEffect'), 
        delayEffect: d.getElementById('delayEffect'), 
        lowpassFilterEffect: d.getElementById('lowpassFilterEffect'), highpassFilterEffect: d.getElementById('highpassFilterEffect'), 
        bandpassFilterEffect: d.getElementById('bandpassFilterEffect'), notchFilterEffect: d.getElementById('notchFilterEffect'), 
        phaserEffect: d.getElementById('phaserEffect'), flangerEffect: d.getElementById('flangerEffect'), chorusEffect: d.getElementById('chorusEffect'),
        distortionEffect: d.getElementById('distortionEffect'), compressorEffect: d.getElementById('compressorEffect'),
        gainEffect: d.getElementById('gainEffect'), tremoloAmplitudeEffect: d.getElementById('tremoloAmplitudeEffect'), 
        wahEffect: d.getElementById('wahEffect'),
        // Knobs de EQ
        bassEq: d.getElementById('bassEq'), midEq: d.getElementById('midEq'), trebleEq: d.getElementById('trebleEq')
    },
    timbres: { 
        sine: d.getElementById('sine'), square: d.getElementById('square'), sawtooth: d.getElementById('sawtooth'), 
        triangle: d.getElementById('triangle'), fm: d.getElementById('fm'), pulse: d.getElementById('pulse'),
        organ: d.getElementById('organ'), pluck: d.getElementById('pluck'), noise: d.getElementById('noise'),
        am: d.getElementById('am'), pwm: d.getElementById('pwm')
    }
};

const ctx = el.canvas.getContext('2d');
const yRulerCtx = el.yRulerCanvas.getContext('2d');
const xRulerCtx = el.xRulerCanvas.getContext('2d');

// --- STATE MANAGEMENT ---
let state = {
    isDrawing: false,
    isSelecting: false,
    isMoving: false,
    selectionStart: null,
    selectionEnd: null,
    activeTool: 'pencil', // A ferramenta ativa é sempre de desenho/interação
    activeTimbre: 'sine',
    lastPos: { x: 0, y: 0 },
    glissandoStart: null,
    lineStart: null, // Novo: ponto de início para linha
    circleCenter: null, // Novo: centro para círculo
    rectangleStart: null, // Novo: ponto de início para retângulo
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
    selectedElements: [], // Armazena IDs dos elementos selecionados
    zoomLevel: 1.0,

    exportStartTime: 0,
    exportEndTime: 5,
    isDraggingStart: false,
    isDraggingEnd: false,
    isDraggingPlayhead: false,

    effectIntensity: DEFAULT_EFFECT_INTENSITY, // Intensidade para efeitos aplicados via seleção (0-100)
    currentEffectValues: {} // Armazena os valores atuais dos sliders de efeito
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

    // Inicializa os valores de currentEffectValues com os valores padrão dos sliders
    Object.keys(el.effectSliders).forEach(key => {
        state.currentEffectValues[key] = parseFloat(el.effectSliders[key].value);
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
    ctx.clearRect(0, 0, el.canvas.width / state.zoomLevel, el.canvas.height / state.zoomLevel);

    ctx.save();
    ctx.scale(state.zoomLevel, state.zoomLevel);

    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        drawElementWithEffects(stroke); // Chamar a nova função de desenho com efeitos
    });
    state.composition.symbols.forEach(s => drawElementWithEffects(s)); // Chamar a nova função de desenho com efeitos

    if (state.isSelecting) {
        drawMarquee();
    }

    // Desenhar indicadores de seleção para elementos selecionados
    state.selectedElements.forEach(elementId => {
        const element = findElementById(elementId);
        if (element) {
            drawSelectionIndicator(element);
        }
    });

    ctx.restore();
    drawRulers();
    updateExportSelectionVisuals();
}

function drawRulers() {
    xRulerCtx.clearRect(0, 0, el.xRulerCanvas.width, el.xRulerCanvas.height);
    yRulerCtx.clearRect(0, 0, el.yRulerCanvas.width, el.yRulerCanvas.height);

    const textColor = getComputedStyle(d.documentElement).getPropertyValue('--text-dark').trim();
    const rulerFont = '9px Inter';

    // X-Ruler (Time)
    xRulerCtx.fillStyle = textColor;
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

    // --- Y-Ruler (Frequency) ---
    yRulerCtx.fillStyle = textColor;
    yRulerCtx.font = rulerFont;
    yRulerCtx.textAlign = 'right';
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

// --- EVENT HANDLING ---
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

    // Listeners para Ferramentas de Desenho/Interação
    Object.keys(el.tools).forEach(key => el.tools[key]?.addEventListener('click', () => setActiveTool(key)));
    // Listeners para Sliders de Efeito - Cada um vai chamar applyEffectToSelectedElements
    Object.keys(el.effectSliders).forEach(key => {
        const slider = el.effectSliders[key];
        const effectType = slider.dataset.effectType || key.replace('Effect', ''); // Pega o tipo do efeito do data-attribute ou ID
        slider?.addEventListener('input', () => {
            state.currentEffectValues[key] = parseFloat(slider.value); // Salva o valor atual do slider
            applyEffectToSelectedElements(effectType, parseFloat(slider.value));
        });
    });

    Object.keys(el.timbres).forEach(key => el.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));

    el.zoomInBtn.addEventListener('click', () => handleZoom(true));
    el.zoomOutBtn.addEventListener('click', () => handleZoom(false));

    el.saveProjectBtn.addEventListener('click', saveProject);
    el.importProjectBtn.addEventListener('click', () => el.drawmusImporter.click());
    el.drawmusImporter.addEventListener('change', importProject);

    el.exportJpgBtn.addEventListener('click', exportJpg);
    el.exportPdfBtn.addEventListener('click', exportPdf);
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

    // Listener para o slider de intensidade de efeito
    el.effectIntensitySlider.addEventListener('input', (e) => {
        state.effectIntensity = parseFloat(e.target.value);
    });

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
    const rect = el.mainCanvasArea.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left + el.mainCanvasArea.scrollLeft) / state.zoomLevel;
    const y = (clientY - rect.top + el.mainCanvasArea.scrollTop) / state.zoomLevel;

    return { x, y };
}

function startAction(e) {
    if (e.target === el.playhead) { // NOVO: Permite arrastar o playhead
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

    // Não há mais ferramentas de efeito que são ativadas por clique no canvas
    // A ativação dos efeitos agora ocorre ao mover os sliders, impactando a seleção.

    switch (state.activeTool) {
        case 'select': {
            const clickedElement = getElementAtPos(pos);
            const isAlreadySelected = clickedElement && state.selectedElements.includes(clickedElement.id);

            if (isAlreadySelected) {
                state.isMoving = true;
                el.canvas.style.cursor = 'move';
            } else {
                state.isMoving = false;
                const isMultiSelect = e.ctrlKey || e.metaKey;
                if (clickedElement) {
                    state.isSelecting = false;
                    if (isMultiSelect) {
                        state.selectedElements.push(clickedElement.id);
                    } else {
                        state.selectedElements = [clickedElement.id];
                    }
                } else {
                    state.isSelecting = true;
                    state.selectionStart = pos;
                    state.selectionEnd = pos;
                    if (!isMultiSelect) {
                        state.selectedElements = [];
                    }
                }
            }
            redrawAll();
            break;
        }
        case 'pencil':
            const newStroke = { id: Date.now(), points: [pos], color: el.colorPicker.value, lineWidth: el.lineWidth.value, timbre: state.activeTimbre, effects: [] }; 
            state.composition.strokes.push(newStroke);
            break;
        case 'eraser':
            eraseAt(pos.x, pos.y);
            break;
        case 'hand':
            el.canvas.style.cursor = 'grabbing';
            break;
        case 'glissando':
            if (!state.glissandoStart) {
                state.glissandoStart = pos;
            } else {
                placeSymbol(pos, state.activeTool, state.glissandoStart); 
                state.glissandoStart = null;
            }
            break;
        case 'line': 
            if (!state.lineStart) {
                state.lineStart = pos;
            } else {
                placeSymbol({ x: state.lineStart.x, y: state.lineStart.y, endX: pos.x, endY: pos.y }, state.activeTool);
                state.lineStart = null;
            }
            break;
        case 'circle': 
            if (!state.circleCenter) {
                state.circleCenter = pos;
            } else {
                const radius = Math.sqrt(Math.pow(pos.x - state.circleCenter.x, 2) + Math.pow(pos.y - state.circleCenter.y, 2));
                placeSymbol({ x: state.circleCenter.x, y: state.circleCenter.y, radius: radius }, state.activeTool);
                state.circleCenter = null;
            }
            break;
        case 'rectangle': 
            if (!state.rectangleStart) {
                state.rectangleStart = pos;
            } else {
                placeSymbol({ x: state.rectangleStart.x, y: state.rectangleStart.y, endX: pos.x, endY: pos.y }, state.activeTool);
                state.rectangleStart = null;
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

    if (state.isMoving) {
        state.isMoving = false;
        el.canvas.style.cursor = 'pointer';
        saveState();
    }

    if (state.isSelecting) {
        const r1 = {
            x: state.selectionStart.x,
            y: state.selectionStart.y,
            width: state.selectionEnd.x - state.selectionStart.x,
            height: state.selectionEnd.y - state.selectionStart.y,
        };

        const allElements = [...state.composition.strokes, ...state.composition.symbols];
        allElements.forEach(element => {
            const r2 = getElementBoundingBox(element);
            if (doRectsIntersect(r1, r2)) {
                if (!state.selectedElements.includes(element.id)) {
                    state.selectedElements.push(element.id);
                }
            }
        });
        state.isSelecting = false;
        redrawAll();
    }

    state.isDrawing = false; 

    if (state.activeTool === 'hand') {
        setActiveTool('hand');
        return;
    }
    // Para ferramentas de desenho que exigem dois cliques (glissando, line, circle, rectangle)
    // O "stop action" só salva o estado se o segundo clique foi realizado
    if (['glissando', 'line', 'circle', 'rectangle'].includes(state.activeTool) && 
        (state.glissandoStart || state.lineStart || state.circleCenter || state.rectangleStart)) {
        return; // Espera o segundo clique
    }


    ctx.beginPath();
    const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
    if (currentStroke && currentStroke.points.length > 200) {
       currentStroke.points = simplify(currentStroke.points, 0.5, true);
    }
    if (state.activeTool !== 'eraser') {
      saveState();
    }
}

function performAction(e) {
    if (state.isDraggingPlayhead) { // NOVO: Lógica para arrastar o playhead
        handlePlayheadDrag(e);
        return;
    }
    if (!state.isDrawing) return; 
    e.preventDefault();
    const pos = getEventPos(e);

    if (state.isMoving) {
        const dx = pos.x - state.lastPos.x;
        const dy = pos.y - state.lastPos.y; 
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
        const rawLastPos = { x: state.lastPos.rawX, y: state.lastPos.rawY };
        if(rawLastPos.x){
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
        // Apenas desenha uma prévia da linha
        redrawAll(); 
        ctx.beginPath();
        ctx.strokeStyle = el.colorPicker.value;
        ctx.lineWidth = el.lineWidth.value;
        ctx.moveTo(state.lineStart.x, state.lineStart.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    } else if (state.activeTool === 'circle' && state.circleCenter) {
        // Apenas desenha uma prévia do círculo
        redrawAll();
        const radius = Math.sqrt(Math.pow(pos.x - state.circleCenter.x, 2) + Math.pow(pos.y - state.circleCenter.y, 2));
        ctx.beginPath();
        ctx.strokeStyle = el.colorPicker.value;
        ctx.lineWidth = el.lineWidth.value;
        ctx.arc(state.circleCenter.x, state.circleCenter.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (state.activeTool === 'rectangle' && state.rectangleStart) {
        // Apenas desenha uma prévia do retângulo
        redrawAll();
        ctx.beginPath();
        ctx.strokeStyle = el.colorPicker.value;
        ctx.lineWidth = el.lineWidth.value;
        ctx.rect(state.rectangleStart.x, state.rectangleStart.y, pos.x - state.rectangleStart.x, pos.y - state.rectangleStart.y);
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

// --- Funções de arrastar o Playhead ---
function startPlayheadDrag(e) {
    // Essa função já é chamada pelo mousedown do playhead no início de startAction
    // A lógica de arrastar está no performAction e o stop no stopPlayheadDrag
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
        setActiveTool(state.activeTool); // Restaura o cursor da ferramenta
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
    }
}

// placeSymbol agora é apenas para símbolos de desenho, e todos recebem um array 'effects'
function placeSymbol(options, type, glissandoStart = null) {
    const symbol = {
        id: Date.now() + Math.random(),
        type: type,
        color: el.colorPicker.value,
        size: parseFloat(el.lineWidth.value),
        timbre: state.activeTimbre,
        effects: [] 
    };

    if (type === 'glissando' && glissandoStart) {
        symbol.x = glissandoStart.x;
        symbol.y = glissandoStart.y;
        symbol.endX = options.x;
        symbol.endY = options.y;
    } else if (type === 'line') {
        symbol.x = options.x;
        symbol.y = options.y;
        symbol.endX = options.endX;
        symbol.endY = options.endY;
    } else if (type === 'circle') {
        symbol.x = options.x;
        symbol.y = options.y;
        symbol.radius = options.radius;
    } else if (type === 'rectangle') {
        symbol.x = options.x;
        symbol.y = options.y;
        symbol.width = options.width;
        symbol.height = options.height;
    } else { // Para símbolos de clique único como staccato, percussion, etc.
        symbol.x = options.x;
        symbol.y = options.y;
    }

    state.composition.symbols.push(symbol);
    drawElementWithEffects(symbol); // Usar drawElementWithEffects para desenhar novos símbolos
    saveState();
}

// NOVO: Função para desenhar um elemento aplicando seus efeitos visuais
function drawElementWithEffects(element) {
    ctx.save(); // Salva o estado original antes de aplicar qualquer efeito visual

    // Aplica efeitos visuais aqui (se existirem e se o elemento não for temporário como prévia de linha/círculo)
    if (element.effects && element.effects.length > 0) {
        // Para múltiplos efeitos, a ordem pode importar. Definindo uma ordem arbitrária
        // para garantir que efeitos de sombra/transparência sejam aplicados antes de deslocamentos.
        const visualEffectOrder = ['delayZone', 'reverbZone', 'distortion', 'volumeZone', 'gain', 'lowEq', 'midEq', 'highEq', 'phaser', 'flanger', 'chorus', 'tremoloAmplitude', 'wah', 'lowpassFilter', 'highpassFilter', 'bandpassFilter', 'notchFilter', 'panZone'];

        const sortedEffects = [...element.effects].sort((a, b) => {
            return visualEffectOrder.indexOf(a.type) - visualEffectOrder.indexOf(b.type);
        });

        sortedEffects.forEach(effect => {
            // Cada efeito visual manipula o contexto antes de desenhar o baseElement,
            // ou aplica sombras/etc que persistem para o baseElement.
            // O `ctx.save()` e `ctx.restore()` são para garantir que as manipulações
            // sejam temporárias para este elemento/efeito.
            
            ctx.save(); // Salva o estado para este efeito em particular
            let originalAlpha = ctx.globalAlpha; // Armazena a opacidade atual para poder resetar

            switch (effect.type) {
                case 'reverbZone':
                    const reverbAmount = effect.params.mix || 0;
                    if (reverbAmount > 0) {
                        ctx.shadowBlur = reverbAmount * 20; // Mais reverb, mais blur
                        ctx.shadowColor = element.color;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    }
                    break;
                case 'delayZone':
                    const delayAmount = effect.params.mix || 0;
                    if (delayAmount > 0) {
                        const numEchoes = Math.floor(delayAmount * 4) + 1; // 1 a 5 ecos
                        const echoOffsetX = 5 * (effect.params.time || 0.25) * (effect.params.mix || 0.5); // Deslocamento baseado no tempo e mix
                        const echoOffsetY = 5 * (effect.params.time || 0.25) * (effect.params.mix || 0.5); // Pequeno deslocamento vertical para "corte"
                        for (let i = 1; i <= numEchoes; i++) {
                            ctx.globalAlpha = originalAlpha * (delayAmount * 0.4) * (1 - (i / (numEchoes + 1))); // Opacidade do eco diminui
                            ctx.translate(echoOffsetX, echoOffsetY); 
                            drawBaseElement(element, ctx); 
                            ctx.translate(-echoOffsetX, -echoOffsetY); // Volta a translação para não acumular
                        }
                    }
                    break;
                case 'distortion':
                    const distortionAmount = effect.params.amount || 0;
                    if (distortionAmount > 0) {
                        // Sombra com desfoque pequeno e deslocamento aleatório para "ruído"
                        ctx.shadowBlur = 2; 
                        ctx.shadowColor = element.color; 
                        ctx.shadowOffsetX = (Math.random() - 0.5) * distortionAmount * 0.1;
                        ctx.shadowOffsetY = (Math.random() - 0.5) * distortionAmount * 0.1;
                    }
                    break;
                case 'volumeZone':
                case 'gain': 
                    ctx.globalAlpha *= (effect.params.gain || 1.0); // Multiplica a opacidad
                    break;
                case 'lowEq':
                case 'midEq':
                case 'highEq':
                    const eqGain = effect.params.gain || 0;
                    if (eqGain !== 0) {
                        ctx.globalAlpha *= (1 + (eqGain / 20) * 0.2); // Aumenta/diminui opacidade para EQ
                        ctx.globalAlpha = Math.max(0.1, Math.min(1.0, ctx.globalAlpha));
                    }
                    break;
                // Outros efeitos visuais mais complexos podem ser adicionados aqui
            }
            ctx.restore(); // Restaura o estado para este efeito (limpa sombras, translações, etc.)
        });
    }

    drawBaseElement(element, ctx); // Desenha o elemento base (traço ou símbolo)
    
    ctx.restore(); // Restaura o estado original do canvas após aplicar todos os efeitos
}

// Função auxiliar para desenhar o elemento base (sem efeitos visuais, apenas sua forma e cor originais)
function drawBaseElement(s, context) {
    context.beginPath();
    context.strokeStyle = s.color;
    context.lineWidth = s.lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (s.points) { // É um traço
        if (s.points.length < 2) return;
        context.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
            context.lineTo(s.points[i].x, s.points[i].y);
        }
        context.stroke();
    } else { // É um símbolo
        context.fillStyle = s.color;
        switch(s.type) {
            case 'staccato': context.arc(s.x, s.y, s.size / 4, 0, 2 * Math.PI); context.fill(); break;
            case 'percussion': context.moveTo(s.x - s.size/2, s.y - s.size/2); context.lineTo(s.x + s.size/2, s.y + s.size/2); context.moveTo(s.x + s.size/2, s.y - s.size/2); context.lineTo(s.x - s.size/2, s.y + s.size/2); context.stroke(); break;
            case 'glissando': context.moveTo(s.x, s.y); context.lineTo(s.endX, s.endY); context.stroke(); break;
            case 'arpeggio': context.lineWidth = Math.max(2, s.size / 15); context.moveTo(s.x - s.size, s.y + s.size/2); context.bezierCurveTo(s.x - s.size/2, s.y - s.size, s.x + s.size/2, s.y + s.size, s.x + s.size, s.y-s.size/2); context.stroke(); break;
            case 'granular': context.globalAlpha = 0.5; context.fillRect(s.x - s.size, s.y - s.size/2, s.size*2, s.size); context.globalAlpha = 1.0; break;
            case 'tremolo': context.moveTo(s.x - s.size, s.y); context.lineTo(s.x - s.size/2, s.y - s.size/2); context.lineTo(s.x, s.y); context.lineTo(s.x + s.size/2, s.y + s.size/2); context.lineTo(s.x + s.size, s.y); context.stroke(); break;
            case 'line': context.moveTo(s.x, s.y); context.lineTo(s.endX, s.endY); context.stroke(); break;
            case 'circle': context.arc(s.x, s.y, s.radius, 0, 2 * Math.PI); context.stroke(); break;
            case 'rectangle': context.rect(s.x, s.y, s.width, s.height); context.stroke(); break;
        }
    }
}


function eraseAt(x, y) {
    let somethingWasErased = false;
    const eraseRadiusSquared = ERASE_RADIUS * ERASE_RADIUS;

    const initialSymbolCount = state.composition.symbols.length;
    state.composition.symbols = state.composition.symbols.filter(s => ((s.x - x)**2 + (s.y - y)**2) > eraseRadiusSquared);
    if (state.composition.symbols.length < initialSymbolCount) somethingWasErased = true;

    state.composition.strokes.forEach(stroke => {
        const initialLength = stroke.points.length;
        stroke.points = stroke.points.filter(p => ((p.x - x)**2 + (p.y - y)**2) > eraseRadiusSquared);
        if (stroke.points.length < initialLength) somethingWasErased = true;
    });
    state.composition.strokes = state.composition.strokes.filter(stroke => stroke.points.length > 1);

    if (somethingWasErased) {
        redrawAll();
        saveState();
    }
}

// --- APLICAR EFEITOS A ELEMENTOS SELECIONADOS ---
// Esta função agora é chamada pelos sliders de efeito, e o `value` é o valor do slider.
function applyEffectToSelectedElements(effectType, sliderValue) {
    if (state.selectedElements.length === 0) {
        // Se nada está selecionado, apenas atualiza o valor do slider no estado
        // mas não aplica a nenhum elemento.
        return; 
    }

    state.selectedElements.forEach(id => {
        const element = findElementById(id);
        if (element) {
            if (!element.effects) {
                element.effects = [];
            }

            let existingEffect = element.effects.find(e => e.type === effectType);
            
            // Valor normalizado do slider (0 a 1) para muitos cálculos de efeito
            // Pega o max/min do slider correto para a normalização
            const sliderElement = el.effectSliders[Object.keys(el.effectSliders).find(key => el.effectSliders[key].dataset.effectType === effectType)];
            const sliderMax = parseFloat(sliderElement.max);
            const sliderMin = parseFloat(sliderElement.min);
            const normalizedValue = (sliderValue - sliderMin) / (sliderMax - sliderMin); // Normalizado para 0-1

            const params = {}; // Parâmetros a serem atualizados/criados

            switch(effectType) {
                case 'reverbZone': // Corresponde ao slider 'reverbEffect'
                    params.decay = (normalizedValue * 2.5) + 0.5; // Duração do reverb (0.5 a 3.0s)
                    params.mix = normalizedValue; // Mix de 0 a 1
                    break;
                case 'delayZone': // Corresponde ao slider 'delayEffect'
                    params.time = normalizedValue * 0.75; // Tempo do delay (0 a 0.75s)
                    params.feedback = normalizedValue * 0.8; // Feedback (0 a 0.8)
                    params.mix = normalizedValue; // Mix de 0 a 1
                    break;
                case 'volumeZone': // Corresponde ao slider 'volumeEffect'
                case 'gain': // O antigo 'gain' era uma ferramenta, agora é um slider 'gainEffect'
                    params.gain = (sliderValue / 100) * 2; // Ganho de 0 a 2.0 (slider de 0-200)
                    break;
                case 'panZone': // Corresponde ao slider 'panEffect'
                    params.pan = (sliderValue - 0) / 100 -1; // Pan de -1.0 a 1.0 (slider de -100 a 100)
                    break;
                case 'vibratoZone': // Corresponde ao slider 'vibratoEffect'
                    params.rate = (normalizedValue * 10) + 1; // Frequência do LFO (1 a 11 Hz)
                    params.depth = normalizedValue * 100; // Profundidade do vibrato em Hz (0 a 100 Hz)
                    break;
                case 'lowpassFilter': // Corresponde ao slider 'lowpassFilterEffect'
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * (1 - normalizedValue); // Inverso: lowpass no 0 corta tudo, no 100 passa tudo
                    params.Q = 10 * normalizedValue;
                    break;
                case 'highpassFilter': // Corresponde ao slider 'highpassFilterEffect'
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * normalizedValue; // Highpass no 0 passa tudo, no 100 corta tudo
                    params.Q = 10 * normalizedValue;
                    break;
                case 'bandpassFilter': // Corresponde ao slider 'bandpassFilterEffect'
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * normalizedValue;
                    params.Q = 10 * normalizedValue;
                    break;
                case 'notchFilter': // Corresponde ao slider 'notchFilterEffect'
                    params.frequency = FREQ_MIN + (FREQ_MAX - FREQ_MIN) * normalizedValue;
                    params.Q = 10 * normalizedValue;
                    break;
                case 'phaser': // Corresponde ao slider 'phaserEffect'
                    params.rate = (normalizedValue * 2) + 0.1;
                    params.depth = normalizedValue * 2000;
                    break;
                case 'flanger': // Corresponde ao slider 'flangerEffect'
                    params.rate = (normalizedValue * 0.5) + 0.1;
                    params.delay = normalizedValue * 0.015; // max 15ms
                    params.feedback = normalizedValue * 0.9;
                    break;
                case 'chorus': // Corresponde ao slider 'chorusEffect'
                    params.rate = (normalizedValue * 0.5) + 0.1;
                    params.delay = normalizedValue * 0.025; // max 25ms
                    params.mix = normalizedValue;
                    break;
                case 'distortion': // Corresponde ao slider 'distortionEffect'
                    params.amount = normalizedValue * 200; // 0 a 200
                    break;
                case 'compressor': // Corresponde ao slider 'compressorEffect'
                    params.threshold = -20 - (normalizedValue * 40); // -20 a -60 dB
                    params.ratio = 1 + (normalizedValue * 10); // 1 a 11
                    break;
                case 'tremoloAmplitude': // Corresponde ao slider 'tremoloAmplitudeEffect'
                    params.rate = (normalizedValue * 15) + 1; // 1 a 16 Hz
                    params.depth = normalizedValue; // 0 a 1
                    break;
                case 'wah': // Corresponde ao slider 'wahEffect'
                    params.rate = (normalizedValue * 5) + 0.5; 
                    params.range = normalizedValue * 3000; 
                    params.q = 5 + (normalizedValue * 15); 
                    break;
                // NOVOS EFEITOS EQ
                case 'bassEq':
                    params.gain = sliderValue; // Ganho em dB (-20 a 20)
                    params.frequency = 100; // Frequência de corte/centro para graves (ex: 100 Hz)
                    break;
                case 'midEq':
                    params.gain = sliderValue; // Ganho em dB (-20 a 20)
                    params.frequency = 1000; // Ex: 1 kHz
                    params.Q = 1; // Q padrão para mid
                    break;
                case 'trebleEq':
                    params.gain = sliderValue; // Ganho em dB (-20 a 20)
                    params.frequency = 3000; // Ex: 3 kHz
                    break;
            }

            // Lógica para remover o efeito se o controle estiver em seu estado "neutro" ou zero
            const isNeutralValue = (
                (effectType === 'volumeZone' || effectType === 'gain') ? sliderValue === 100 : // Volume/Gain 100 é neutro
                (effectType === 'panZone') ? sliderValue === 0 : // Pan 0 é neutro
                (effectType === 'lowpassFilter') ? sliderValue === 100 : // LowPass 100% é neutro (passa tudo)
                (effectType === 'highpassFilter') ? sliderValue === 0 : // HighPass 0% é neutro (passa tudo)
                (effectType === 'bassEq' || effectType === 'midEq' || effectType === 'trebleEq') ? sliderValue === 0 : // EQ 0dB é neutro
                sliderValue === 0 // Demais efeitos, 0 é neutro
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

// --- SELECTION, COPY, PASTE, DELETE HELPERS ---
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
                // Para retângulos, o x e y são o ponto de início, então basta mover
                // para círculos, o x e y são o centro, basta mover
            }
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
}

function copySelectedElements() {
    if (state.selectedElements.length === 0) return;
    // Certifica-se de copiar também a propriedade 'effects'
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
            if (newElement.endX) newElement.endX += pasteOffset;
            if (newElement.endY) newElement.endY += pasteOffset;
            // Para retângulos, apenas move x/y (width/height são relativos)
            // Para círculos, apenas move x/y (radius é fixo)
            state.composition.symbols.push(newElement);
        }
        newSelection.push(newElement.id);
    });

    state.selectedElements = newSelection;
    saveState();
    redrawAll();
}

function findElementById(id) {
    return state.composition.strokes.find(s => s.id === id) || state.composition.symbols.find(s => s.id === id);
}

function getElementBoundingBox(element) {
    if (!element) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (element.points) { // É um traço
        if (element.points.length === 0) return null;
        element.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    } else { // É um símbolo
        const size = element.size || 10;
        if (element.type === 'glissando' || element.type === 'line') {
            minX = Math.min(element.x, element.endX);
            minY = Math.min(element.y, element.endY);
            maxX = Math.max(element.x, element.endX);
            maxY = Math.max(element.y, element.endY);
        } else if (element.type === 'circle') {
            minX = element.x - element.radius;
            minY = element.y - element.radius;
            maxX = element.x + element.radius;
            maxY = element.y + element.radius;
        } else if (element.type === 'rectangle') {
            minX = Math.min(element.x, element.x + element.width);
            minY = Math.min(element.y, element.y + element.height);
            maxX = Math.max(element.x, element.x + element.width);
            maxY = Math.max(element.y, element.y + element.height);
        } else { // Para símbolos normais (staccato, percussion, etc.)
             minX = element.x - size / 2;
             minY = element.y - size / 2;
             maxX = element.x + size / 2;
             maxY = element.y + size / 2;
        }
    }
    // Adiciona uma pequena margem para seleção mais fácil, especialmente para linhas finas
    const margin = 5;
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

function drawSelectionIndicator(element) {
    const box = getElementBoundingBox(element);
    if (box) {
        ctx.save();
        ctx.strokeStyle = getComputedStyle(d.documentElement).getPropertyValue('--selection-glow').trim();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(box.x - 5, box.y - 5, box.width + 10, box.height + 10);
        
        // Removido o desenho de pequenos ícones de efeito, pois a aparência do desenho em si já representa.
        ctx.restore();
    }
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
    for (let i = state.composition.symbols.length - 1; i >= 0; i--) {
        const s = state.composition.symbols[i];
        const box = getElementBoundingBox(s);
        if (box && pos.x >= box.x - tolerance && pos.x <= box.x + box.width + tolerance && pos.y >= box.y - tolerance && pos.y <= box.y + box.height + tolerance) {
            return s;
        }
    }
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
    const selX1 = Math.min(r1.x, r1.x + r1.width);
    const selX2 = Math.max(r1.x, r1.x + r1.width);
    const selY1 = Math.min(r1.y, r1.y + r1.height);
    const selY2 = Math.max(r1.y, r1.y + r1.height);

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
        URL.revokeObjectURL(link.href);
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
                // Ensure loaded elements have an effects array, or default to empty
                projectData.strokes.forEach(s => s.effects = s.effects || []);
                projectData.symbols.forEach(s => s.effects = s.effects || []);

                state.composition = projectData;
                state.selectedElements = [];
                redrawAll();
                saveState();
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
                    // Ensure loaded elements have an effects array, or default to empty
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
        // Garante que o array de efeitos seja restaurado
        state.composition.strokes.forEach(s => s.effects = s.effects || []);
        state.composition.symbols.forEach(s => s.effects = s.effects || []);

        state.selectedElements = [];
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
        // Garante que o array de efeitos seja restaurado
        state.composition.strokes.forEach(s => s.effects = s.effects || []);
        state.composition.symbols.forEach(s => s.effects = s.effects || []);

        state.selectedElements = [];
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

        const startX = state.playbackStartTime * PIXELS_PER_SECOND * state.zoomLevel;
        if (Math.abs(el.mainCanvasArea.scrollLeft - startX) > el.mainCanvasArea.offsetWidth) {
             el.mainCanvasArea.scrollLeft = startX - 100;
        }

        scheduleAllSounds(state.audioCtx);
        animatePlayhead();
    });
}

function stopPlayback() {
    state.isPlaying = false;

    state.sourceNodes.forEach(node => {
        try { 
            if (typeof node.stop === 'function') {
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

    if (state.audioCtx && state.audioCtx.state !== 'closed') {
        state.audioCtx.close().then(() => state.audioCtx = null).catch(e => console.error("Erro ao fechar AudioContext:", e));
    }

    cancelAnimationFrame(state.animationFrameId);
    updatePlaybackUI(false);
}

function animatePlayhead() {
    if (!state.isPlaying || !state.audioCtx) return;

    const audioContextStartTime = state.audioCtx.currentTime;
    const canvasStartPosInSeconds = state.playbackStartTime;

    function frame() {
        if (!state.isPlaying || !state.audioCtx) return;

        const elapsedTime = state.audioCtx.currentTime - audioContextStartTime;
        const currentPosInSeconds = canvasStartPosInSeconds + elapsedTime;

        if (currentPosInSeconds >= MAX_DURATION_SECONDS) {
            stopPlayback();
            return;
        }

        state.playbackStartTime = currentPosInSeconds;
        updatePlayheadPosition();

        const currentXInPixels = state.playbackStartTime * PIXELS_PER_SECOND;
        const playheadRightEdge = currentXInPixels + 100;
        if (currentXInPixels > el.mainCanvasArea.scrollLeft + el.mainCanvasArea.clientWidth) {
            el.mainCanvasArea.scrollLeft = currentXInPixels - el.mainCanvasArea.clientWidth + 100;
        }

        state.animationFrameId = requestAnimationFrame(frame);
    }
    state.animationFrameId = requestAnimationFrame(frame);
}

function scheduleAllSounds(audioCtx) {
    const now = audioCtx.currentTime;
    state.sourceNodes = [];

    const mainOut = audioCtx.createGain();
    mainOut.connect(audioCtx.destination); 

    // Reverb Global 
    const reverbNodeGlobal = audioCtx.createConvolver();
    reverbNodeGlobal.buffer = createImpulseResponse(audioCtx, 1.5, 2);
    const reverbGainGlobal = audioCtx.createGain();
    reverbGainGlobal.gain.value = parseFloat(el.reverbSlider.value);
    if (reverbGainGlobal.gain.value > 0) {
         mainOut.connect(reverbNodeGlobal).connect(reverbGainGlobal).connect(audioCtx.destination);
    }

    // Delay Global 
    const delayNodeGlobal = audioCtx.createDelay(parseFloat(el.delayTimeSlider.max));
    const feedbackNodeGlobal = audioCtx.createGain();
    delayNodeGlobal.delayTime.value = parseFloat(el.delayTimeSlider.value);
    feedbackNodeGlobal.gain.value = parseFloat(el.delayFeedbackSlider.value);
    if (delayNodeGlobal.delayTime.value > 0 && feedbackNodeGlobal.gain.value > 0) {
        mainOut.connect(delayNodeGlobal).connect(feedbackNodeGlobal).connect(delayNodeGlobal);
        delayNodeGlobal.connect(audioCtx.destination);
    }

    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;

        const xCoords = stroke.points.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);

        const strokeStartTime = minX / PIXELS_PER_SECOND;
        const strokeEndTime = maxX / PIXELS_PER_SECOND;

        if (strokeEndTime < state.playbackStartTime) { 
            return;
        }

        let duration = strokeEndTime - strokeStartTime;
        if (duration <= 0) {
            duration = 0.05; 
        }

        const timeToPlay = Math.max(0, strokeStartTime - state.playbackStartTime);
        const scheduledStartTime = now + timeToPlay;

        if (scheduledStartTime >= now + MAX_DURATION_SECONDS || scheduledStartTime + duration < now) {
            return;
        }

        const freqValues = new Float32Array(Math.ceil(duration * 100)); 
        let currentPointIndex = 0;
        for (let i = 0; i < freqValues.length; i++) {
            const timeInStroke = i / 100;
            const xPosInStroke = minX + timeInStroke * PIXELS_PER_SECOND;

            while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInStroke) {
                currentPointIndex++;
            }
            const p1 = stroke.points[currentPointIndex];
            const p2 = stroke.points[currentPointIndex + 1] || p1; 

            const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosInStroke - p1.x) / (p2.x - p1.x);
            const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
            freqValues[i] = yToFrequency(interpolatedY);
        }

        const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
        const pan = xToPan(minX); 

        createTone(audioCtx, {
            element: stroke, // Passa o elemento completo para que os efeitos sejam lidos
            type: stroke.timbre,
            startTime: scheduledStartTime,
            endTime: scheduledStartTime + duration,
            freqValues: freqValues,
            vol: vol,
            pan: pan,
            xStart: minX, 
            xEnd: maxX,
            initialY: stroke.points[0].y, 
        }, mainOut);
    });

    state.composition.symbols.forEach(s => {
        const symbolStartTime = s.x / PIXELS_PER_SECOND;

        if (symbolStartTime < state.playbackStartTime) {
            return;
        }

        const scheduledTime = now + (symbolStartTime - state.playbackStartTime);

        if (scheduledTime >= now + MAX_DURATION_SECONDS || scheduledTime < now) {
            return;
        }

        const vol = 0.1 + (s.size / 50) * 0.4;
        const pan = xToPan(s.x);
        const freq = yToFrequency(s.y);

        switch (s.type) {
            case 'staccato': createTone(audioCtx, { element: s, type: 'triangle', startTime: scheduledTime, endTime: scheduledTime + 0.08, startFreq: freq, vol, pan, xStart: s.x, initialY: s.y }, mainOut); break;
            case 'percussion': createTone(audioCtx, { element: s, type: 'noise', startTime: scheduledTime, endTime: scheduledTime + 0.1, vol, pan, xStart: s.x, initialY: s.y }, mainOut); break;
            case 'arpeggio':
                [1, 5/4, 3/2, 2].forEach((interval, i) => {
                    createTone(audioCtx, { element: s, type: 'triangle', startTime: scheduledTime + i * 0.05, endTime: scheduledTime + i * 0.05 + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, xStart: s.x, initialY: s.y }, mainOut);
                });
                break;
            case 'glissando':
                const glissEndTime = scheduledTime + ((s.endX - s.x) / PIXELS_PER_SECOND);
                if (glissEndTime > scheduledTime) {
                    createTone(audioCtx, { element: s, type: s.timbre, startTime: scheduledTime, endTime: glissEndTime, startFreq: yToFrequency(s.y), endFreq: yToFrequency(s.endY), vol, pan, xStart: s.x, xEnd: s.endX, initialY: s.y }, mainOut);
                }
                break;
            case 'tremolo': 
                for (let t = 0; t < 0.5; t += 0.05) {
                    createTone(audioCtx, { element: s, type: 'sine', startTime: scheduledTime + t, endTime: scheduledTime + t + 0.1, startFreq: freq, vol: vol * 0.8, pan, xStart: s.x, initialY: s.y }, mainOut);
                }
                break;
            case 'granular':
                for (let i = 0; i < 20; i++) {
                     const t = scheduledTime + Math.random() * 0.5;
                     createTone(audioCtx, { element: s, type: 'sine', startTime: t, endTime: t + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, xStart: s.x, initialY: s.y }, mainOut);
                }
                break;
            case 'line': 
            case 'circle': 
            case 'rectangle': 
                 createTone(audioCtx, { element: s, type: s.timbre, startTime: scheduledTime, endTime: scheduledTime + 0.1, startFreq: freq, vol, pan, xStart: s.x, initialY: s.y }, mainOut);
                break;
        }
    });
}

// createTone agora recebe o elemento completo para acessar seus efeitos
function createTone(audioCtx, opts, mainOut) {
    let osc;
    const duration = opts.endTime - opts.startTime;
    if (duration <= 0) return;

    // Criação do oscilador/fonte de som baseado no timbre
    switch (opts.type) {
        case 'noise':
            osc = audioCtx.createBufferSource();
            const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * (duration + 0.1), audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            osc.buffer = buffer;
            osc.loop = false;
            break;
        case 'fm':
            const carrier = audioCtx.createOscillator(); carrier.type = 'sine';
            const modulator = audioCtx.createOscillator(); modulator.type = 'square';
            modulator.frequency.value = (opts.startFreq || 200) * 1.5;
            const modGain = audioCtx.createGain(); modGain.gain.value = (opts.startFreq || 200) * 0.75;
            modulator.connect(modGain).connect(carrier.frequency);
            osc = audioCtx.createGain(); carrier.connect(osc); 
            modulator.start(opts.startTime); modulator.stop(opts.endTime);
            carrier.start(opts.startTime); carrier.stop(opts.endTime);
            state.sourceNodes.push(modulator, carrier);
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

            fundamental.start(opts.startTime); fundamental.stop(opts.endTime);
            harmonic1.start(opts.startTime); harmonic1.stop(opts.endTime);
            harmonic2.start(opts.startTime); harmonic2.stop(opts.endTime);
            state.sourceNodes.push(fundamental, harmonic1, harmonic2);
            break;
        case 'pluck': 
            osc = audioCtx.createOscillator();
            osc.type = 'triangle'; 
            if(opts.freqValues) osc.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
            else osc.frequency.setValueAtTime(opts.startFreq || 440, opts.startTime);

            const pluckGain = audioCtx.createGain();
            pluckGain.gain.setValueAtTime(0, opts.startTime);
            pluckGain.gain.linearRampToValueAtTime(opts.vol * 1.2, opts.startTime + 0.005); 
            pluckGain.gain.exponentialRampToValueAtTime(opts.vol * 0.5, opts.startTime + 0.1); 
            pluckGain.gain.linearRampToValueAtTime(0, opts.endTime); 
            osc.connect(pluckGain);
            osc = pluckGain; 
            osc.start(opts.startTime); osc.stop(opts.endTime);
            state.sourceNodes.push(osc); 
            break;
        case 'am': 
            const carrierAM = audioCtx.createOscillator(); carrierAM.type = 'sine';
            if(opts.freqValues) carrierAM.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
            else carrierAM.frequency.setValueAtTime(opts.startFreq || 440, opts.startTime);

            const modulatorAM = audioCtx.createOscillator(); modulatorAM.type = 'sine';
            modulatorAM.frequency.value = (opts.startFreq || 440) * 0.5; 

            const amGain = audioCtx.createGain();
            amGain.gain.value = 0.5; 
            modulatorAM.connect(amGain);
            amGain.connect(carrierAM.gain); 

            osc = audioCtx.createGain(); carrierAM.connect(osc);

            modulatorAM.start(opts.startTime); modulatorAM.stop(opts.endTime);
            carrierAM.start(opts.startTime); carrierAM.stop(opts.endTime);
            state.sourceNodes.push(modulatorAM, carrierAM);
            break;
        case 'pwm': 
            osc = audioCtx.createOscillator();
            osc.type = 'square';
            if(opts.freqValues) osc.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
            else osc.frequency.setValueAtTime(opts.startFreq || 440, opts.startTime);

            const pwmLFO = audioCtx.createOscillator();
            pwmLFO.type = 'sine';
            pwmLFO.frequency.value = 0.5; 
            const pwmGain = audioCtx.createGain();
            pwmGain.gain.value = 0.4; 
            pwmLFO.connect(pwmGain);
            pwmGain.connect(osc.detune); 

            pwmLFO.start(opts.startTime); pwmLFO.stop(opts.endTime);
            state.sourceNodes.push(pwmLFO);
            break;
        default: 
            osc = audioCtx.createOscillator();
            osc.type = opts.type;
            break;
    }

    if (opts.freqValues && osc.frequency) {
        osc.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
    } else if (opts.startFreq && osc.frequency) {
        osc.frequency.setValueAtTime(opts.startFreq, opts.startTime);
        if (opts.endFreq) osc.frequency.linearRampToValueAtTime(opts.endFreq, opts.endTime);
    }

    const mainGain = audioCtx.createGain();
    mainGain.gain.setValueAtTime(0, opts.startTime);
    mainGain.gain.linearRampToValueAtTime(opts.vol, opts.startTime + 0.01);
    mainGain.gain.setValueAtTime(opts.vol, opts.endTime - 0.01);
    mainGain.gain.linearRampToValueAtTime(0, opts.endTime);

    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(opts.pan, opts.startTime);

    let currentNode = mainGain; // O oscilador conecta ao mainGain do próprio tom
    if (osc.connect) { 
        osc.connect(mainGain);
    } else { // Para casos como pluck que já retornam um gain node
        osc.connect(mainGain);
    }


    // Aplicar efeitos armazenados no elemento (opts.element)
    if (opts.element && opts.element.effects && opts.element.effects.length > 0) {
        opts.element.effects.forEach(effect => {
            let effectNode;
            const params = effect.params; // Parâmetros específicos do efeito

            switch (effect.type) {
                case 'lowpassFilter': // Renomeado para lowpassFilterEffect no HTML, mas o type no JS é lowpassFilter
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'lowpass';
                    effectNode.frequency.value = params.frequency || FREQ_MAX;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'highpassFilter': // Renomeado para highpassFilterEffect
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'highpass';
                    effectNode.frequency.value = params.frequency || FREQ_MIN;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'bandpassFilter': // Renomeado para bandpassFilterEffect
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'bandpass';
                    effectNode.frequency.value = params.frequency || (FREQ_MIN + FREQ_MAX) / 2;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'notchFilter': // Renomeado para notchFilterEffect
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'notch';
                    effectNode.frequency.value = params.frequency || (FREQ_MIN + FREQ_MAX) / 2;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'delayZone': // Renomeado para delayEffect no HTML
                    const delayNode = audioCtx.createDelay(1.0); // Max delay 1 sec
                    const feedbackNode = audioCtx.createGain();
                    const wetGain = audioCtx.createGain();
                    const dryGain = audioCtx.createGain();

                    delayNode.delayTime.value = params.time || 0.25;
                    feedbackNode.gain.value = params.feedback || 0.3;
                    wetGain.gain.value = params.mix || 0.5;
                    dryGain.gain.value = 1 - (params.mix || 0.5);

                    currentNode.connect(dryGain);
                    currentNode.connect(delayNode);
                    delayNode.connect(feedbackNode).connect(delayNode);
                    delayNode.connect(wetGain);

                    dryGain.connect(currentNode); // Conecta o sinal seco de volta ao pipeline
                    wetGain.connect(currentNode); // Conecta o sinal com efeito de volta
                    break; 
                case 'reverbZone': // Renomeado para reverbEffect no HTML
                    effectNode = audioCtx.createConvolver();
                    effectNode.buffer = createImpulseResponse(audioCtx, params.decay || 1.5, 2.0);
                    const reverbWetGain = audioCtx.createGain();
                    reverbWetGain.gain.value = params.mix || 0.3;
                    currentNode.connect(effectNode).connect(reverbWetGain).connect(currentNode); // Conecta em paralelo
                    break;
                case 'volumeZone':
                    effectNode = audioCtx.createGain();
                    effectNode.gain.value = params.gain || 1.0;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'panZone':
                    effectNode = audioCtx.createStereoPanner();
                    effectNode.pan.value = params.pan || 0.0;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'vibratoZone':
                    // Acessar o oscilador original diretamente para vibrato, se aplicável
                    let targetOscillatorFreqParam = null;
                    if (osc instanceof OscillatorNode) { 
                        targetOscillatorFreqParam = osc.frequency;
                    } else if (opts.element.type === 'fm' || opts.element.type === 'organ' || opts.element.type === 'pluck') {
                        console.warn("Vibrato Zone para timbres complexos pode não funcionar como esperado.");
                    }

                    if (targetOscillatorFreqParam) {
                        const vibratoLFO = audioCtx.createOscillator();
                        vibratoLFO.type = 'sine';
                        vibratoLFO.frequency.value = params.rate || 5; 
                        const vibratoGain = audioCtx.createGain();
                        vibratoGain.gain.value = params.depth || 50; 
                        vibratoLFO.connect(vibratoGain).connect(targetOscillatorFreqParam);
                        vibratoLFO.start(opts.startTime);
                        vibratoLFO.stop(opts.endTime);
                        state.sourceNodes.push(vibratoLFO);
                    }
                    break;
                case 'phaser': 
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'allpass';
                    const phaserLFO = audioCtx.createOscillator();
                    phaserLFO.type = 'sine';
                    phaserLFO.frequency.value = params.rate || 0.5;
                    const phaserGain = audioCtx.createGain();
                    phaserGain.gain.value = params.depth || 1000;
                    phaserLFO.connect(phaserGain).connect(effectNode.frequency);
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    phaserLFO.start(opts.startTime);
                    phaserLFO.stop(opts.endTime);
                    state.sourceNodes.push(phaserLFO);
                    break;
                case 'flanger': 
                    effectNode = audioCtx.createDelay(0.05); // max delay
                    const flangerLFO = audioCtx.createOscillator();
                    flangerLFO.type = 'sine';
                    flangerLFO.frequency.value = params.rate || 0.2;
                    const flangerLFO_Gain = audioCtx.createGain();
                    flangerLFO_Gain.gain.value = params.delay || 0.005; // max delay modulation depth
                    flangerLFO.connect(flangerLFO_Gain).connect(effectNode.delayTime);

                    const flangerFeedback = audioCtx.createGain();
                    flangerFeedback.gain.value = params.feedback || 0.8;

                    const flangerDry = audioCtx.createGain(); flangerDry.gain.value = 1.0;
                    const flangerWet = audioCtx.createGain(); flangerWet.gain.value = 0.5;

                    currentNode.connect(flangerDry); // Sinal dry
                    currentNode.connect(effectNode); // Sinal para o delay
                    effectNode.connect(flangerFeedback).connect(effectNode); // Feedback loop
                    effectNode.connect(flangerWet); // Sinal wet

                    flangerDry.connect(currentNode);
                    flangerWet.connect(currentNode);
                    flangerLFO.start(opts.startTime);
                    flangerLFO.stop(opts.endTime);
                    state.sourceNodes.push(flangerLFO);
                    break;
                case 'chorus': 
                    // Para simplificar, um único delay LFO-modulado e mixado
                    effectNode = audioCtx.createDelay(0.1); // Delay máximo
                    const chorusLFO = audioCtx.createOscillator();
                    chorusLFO.type = 'sine';
                    chorusLFO.frequency.value = params.rate || 0.1;
                    const chorusLFO_Gain = audioCtx.createGain();
                    chorusLFO_Gain.gain.value = params.delay || 0.02;
                    chorusLFO.connect(chorusLFO_Gain).connect(effectNode.delayTime);

                    const chorusDryGain = audioCtx.createGain(); chorusDryGain.gain.value = 1.0;
                    const chorusWetGain = audioCtx.createGain(); chorusWetGain.gain.value = params.mix || 0.5;

                    currentNode.connect(chorusDryGain); 
                    currentNode.connect(effectNode).connect(chorusWetGain); 

                    chorusDryGain.connect(currentNode); 
                    chorusWetGain.connect(currentNode); 

                    chorusLFO.start(opts.startTime);
                    chorusLFO.stop(opts.endTime);
                    state.sourceNodes.push(chorusLFO);
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
                case 'gain':
                    effectNode = audioCtx.createGain();
                    effectNode.gain.value = params.gain || 1.0;
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
                    tremoloAmpLFO.start(opts.startTime);
                    tremoloAmpLFO.stop(opts.endTime);
                    state.sourceNodes.push(tremoloAmpLFO);
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
                    wahLFO.start(opts.startTime);
                    wahLFO.stop(opts.endTime);
                    state.sourceNodes.push(wahLFO);
                    break;
                case 'bassEq':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'lowshelf';
                    effectNode.frequency.value = params.frequency || 100;
                    effectNode.gain.value = params.gain || 0; 
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'midEq':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'peaking';
                    effectNode.frequency.value = params.frequency || 1000;
                    effectNode.Q.value = params.Q || 1;
                    effectNode.gain.value = params.gain || 0; 
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'trebleEq':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'highshelf';
                    effectNode.frequency.value = params.frequency || 3000;
                    effectNode.gain.value = params.gain || 0; 
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
            }
        });
    }

    // Conecta o último nó do pipeline de efeitos ao panner, e o panner ao mainOut
    currentNode.connect(panner);
    panner.connect(mainOut);

    // Inicia e para o oscilador principal (ou nó de entrada do som)
    // Apenas inicie se for um nó que pode ser iniciado e parado explicitamente.
    if (typeof osc.start === 'function' && typeof osc.stop === 'function') {
        osc.start(opts.startTime);
        osc.stop(opts.endTime);
    }
    state.sourceNodes.push(osc); 
}

// Função auxiliar para a curva de distorção (WaveShaperNode)
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


// --- UTILITY & UI FUNCTIONS ---
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

function xToPan(x) { return (x / el.canvas.width) * 2 - 1; }

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
    state.glissandoStart = null;
    state.lineStart = null; 
    state.circleCenter = null; 
    state.rectangleStart = null; 
    
    // Remove 'active' de todas as ferramentas de desenho/interação
    Object.values(el.tools).forEach(btn => btn?.classList.remove('active'));
    // Os sliders de efeito não têm estado 'active' no mesmo sentido, então não precisam ser resetados aqui.

    // Adiciona 'active' à ferramenta clicada
    if (el.tools[toolName]) {
        el.tools[toolName].classList.add('active');
    }

    // Gerencia o cursor do canvas
    let cursor = 'auto'; 
    if (toolName === 'select') cursor = 'pointer';
    else if (toolName === 'hand') cursor = 'grab';
    else if (toolName === 'eraser') cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)" stroke="black" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="2,2"/></svg>') 12 12, auto`;
    else if (['glissando', 'line', 'circle', 'rectangle', 'pencil', 'staccato', 'percussion', 'arpeggio', 'granular', 'tremolo'].includes(toolName)) cursor = 'crosshair';

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

// --- Funções da Seleção de Exportação ---

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

// --- EXPORT FUNCTIONS ---
function exportJpg() {
    try {
        const tempCanvas = d.createElement('canvas');
        tempCanvas.width = el.canvas.width;
        tempCanvas.height = el.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCtx.height);

        tempCtx.drawImage(el.canvas, 0, 0);

        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `music-drawing-${Date.now()}.jpg`;
        link.click();
    } catch (e) {
        console.error("Erro ao exportar JPG:", e);
        alert("Não foi possível exportar a imagem como JPG.");
    }
}
function exportPdf() {
    try {
        const tempCanvas = d.createElement('canvas');
        tempCanvas.width = el.canvas.width;
        tempCanvas.height = el.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCtx.height);
        tempCtx.drawImage(el.canvas, 0, 0);

        const imgData = tempCanvas.toDataURL('image/jpeg', 0.8);

        const orientation = tempCanvas.width > tempCanvas.height ? 'l' : 'p';
        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'px',
            format: [tempCanvas.width, tempCanvas.height]
        });

        pdf.addImage(imgData, 'JPEG', 0, 0, tempCanvas.width, tempCtx.height);
        pdf.save(`music-drawing-${Date.now()}.pdf`);

    } catch (e) {
        console.error("Erro ao exportar PDF:", e);
        alert("Não foi possível exportar como PDF.");
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

    const scheduleForExport = (audioCtx) => {
        const now = 0;

        const mainOut = audioCtx.createGain();
        mainOut.connect(audioCtx.destination);

        state.composition.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;

            const strokeStart = stroke.points[0].x / PIXELS_PER_SECOND;
            const strokeEnd = stroke.points[stroke.points.length - 1].x / PIXELS_PER_SECOND;

            if (strokeEnd < exportStartTime || strokeStart > exportEndTime) return;

            const scheduledStartTime = Math.max(0, strokeStart - exportStartTime);
            let strokeDuration = strokeEnd - strokeStart;
            if (strokeDuration <=0) strokeDuration = 0.05;

            const freqValues = new Float32Array(Math.ceil(strokeDuration * 100));
             let currentPointIndex = 0;
            for (let i = 0; i < freqValues.length; i++) {
                const timeInStroke = i / 100;
                const xPosInStroke = stroke.points[0].x + timeInStroke * PIXELS_PER_SECOND;

                while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInStroke) {
                    currentPointIndex++;
                }
                const p1 = stroke.points[currentPointIndex];
                const p2 = stroke.points[currentPointIndex + 1] || p1;

                const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosInStroke - p1.x) / (p2.x - p1.x);
                const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
                freqValues[i] = yToFrequency(interpolatedY);
            }

            const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
            const pan = xToPan(minX); 

            createTone(audioCtx, {
                element: stroke, // Passa o elemento completo
                type: stroke.timbre,
                startTime: now + scheduledStartTime,
                endTime: now + scheduledStartTime + strokeDuration,
                freqValues: freqValues,
                vol: vol,
                pan: pan,
                xStart: minX, 
                xEnd: maxX,
                initialY: stroke.points[0].y
            }, mainOut);
        });

        state.composition.symbols.forEach(s => {
            const symbolTime = s.x / PIXELS_PER_SECOND;
            if (symbolTime < exportStartTime || symbolTime > exportEndTime) return;

            const scheduledTime = now + (symbolTime - exportStartTime);
            const vol = 0.1 + (s.size / 50) * 0.4;
            const pan = xToPan(s.x);
            const freq = yToFrequency(s.y);

            switch (s.type) {
                case 'staccato': createTone(offlineCtx, { element: s, type: 'triangle', startTime: scheduledTime, endTime: scheduledTime + 0.08, startFreq: freq, vol, pan, xStart: s.x, initialY: s.y }, mainOut); break;
                case 'percussion': createTone(offlineCtx, { element: s, type: 'noise', startTime: scheduledTime, endTime: scheduledTime + 0.1, vol, pan, xStart: s.x, initialY: s.y }, mainOut); break;
                case 'arpeggio':
                    [1, 5/4, 3/2, 2].forEach((interval, i) => {
                        createTone(offlineCtx, { element: s, type: 'triangle', startTime: scheduledTime + i * 0.05, endTime: scheduledTime + i * 0.05 + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, xStart: s.x, initialY: s.y }, mainOut);
                    });
                    break;
                case 'glissando':
                    const glissEndTime = scheduledTime + ((s.endX - s.x) / PIXELS_PER_SECOND);
                    if (glissEndTime > scheduledTime) {
                        createTone(offlineCtx, { element: s, type: s.timbre, startTime: scheduledTime, endTime: glissEndTime, startFreq: yToFrequency(s.y), endFreq: yToFrequency(s.endY), vol, pan, xStart: s.x, xEnd: s.endX, initialY: s.y }, mainOut);
                    }
                    break;
                case 'tremolo':
                    for (let t = 0; t < 0.5; t += 0.05) {
                        createTone(offlineCtx, { element: s, type: 'sine', startTime: scheduledTime + t, endTime: scheduledTime + t + 0.1, startFreq: freq, vol: vol * 0.8, pan, xStart: s.x, initialY: s.y }, mainOut);
                    }
                    break;
                case 'granular':
                    for (let i = 0; i < 20; i++) {
                         const t = scheduledTime + Math.random() * 0.5;
                         createTone(offlineCtx, { element: s, type: 'sine', startTime: t, endTime: t + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, xStart: s.x, initialY: s.y }, mainOut);
                    }
                    break;
                case 'line': 
                case 'circle': 
                case 'rectangle': 
                     createTone(offlineCtx, { element: s, type: s.timbre, startTime: scheduledTime, endTime: scheduledTime + 0.1, startFreq: freq, vol, pan, xStart: s.x, initialY: s.y }, mainOut);
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
        URL.revokeObjectURL(link.href);
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

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

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
