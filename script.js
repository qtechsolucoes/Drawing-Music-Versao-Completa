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
    reverbSlider: d.getElementById('reverb'), // Reverb Global (manter por enquanto, mas não será usado nos elementos)
    delayTimeSlider: d.getElementById('delayTime'), // Delay Global (manter por enquanto, mas não será usado nos elementos)
    delayFeedbackSlider: d.getElementById('delayFeedback'), // Delay Global Feedback (manter por enquanto, mas não será usado nos elementos)
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
        organ: d.getElementById('organ'), noise: d.getElementById('noise'),
        // pluck, am, pwm removidos
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
    sourceNodes: [], // Para rastrear os nós de áudio e poder pará-los
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

    // Inicializa e zera os sliders de efeito
    resetEffectSliders();
    // Preenche o currentEffectValues com os valores neutros/iniciais
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

    // Desenha todos os elementos (traços e símbolos)
    // A ordem de desenho pode ser importante para sobreposição
    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        drawElementWithEffects(stroke); // Usa a função que aplica efeitos visuais
    });
    state.composition.symbols.forEach(s => drawElementWithEffects(s)); // Usa a função que aplica efeitos visuais

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
        // Pega o tipo do efeito do data-attribute ou ID (ex: reverbEffect -> reverbZone)
        const effectType = slider.dataset.effectType || key.replace('Effect', '');
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

    // Listener para o slider de intensidade de efeito (este slider deve ser removido se cada efeito tem sua intensidade)
    // Ou re-proposto para ter um uso mais claro. Por enquanto, mantido sem uso direto nas refatorações.
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
                    // SELECIONOU UM ELEMENTO
                    if (isMultiSelect) {
                        if (state.selectedElements.includes(clickedElement.id)) {
                            // Desseleciona se já estiver selecionado e Ctrl/Cmd pressionado
                            state.selectedElements = state.selectedElements.filter(id => id !== clickedElement.id);
                        } else {
                            // Adiciona à seleção se Ctrl/Cmd pressionado
                            state.selectedElements.push(clickedElement.id);
                        }
                    } else {
                        // Seleção única
                        state.selectedElements = [clickedElement.id];
                    }
                    // NOVO: Atualiza os sliders de efeito para o primeiro elemento selecionado
                    if (state.selectedElements.length > 0) {
                        const firstSelectedElement = findElementById(state.selectedElements[0]);
                        updateEffectSlidersForSelection(firstSelectedElement);
                    } else {
                        resetEffectSliders(); // Se a seleção ficou vazia, zera os sliders
                    }
                } else {
                    // Clicou fora, iniciar seleção de área ou limpar seleção
                    state.isSelecting = true;
                    state.selectionStart = pos;
                    state.selectionEnd = pos;
                    if (!isMultiSelect) {
                        state.selectedElements = [];
                        // NOVO: Zera os sliders de efeito quando nada está selecionado
                        resetEffectSliders();
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
            height: state.selectionEnd.y - state.selectionEnd.y, // Corrigido para height com base em y inicial e final
        };

        const allElements = [...state.composition.strokes, ...state.composition.symbols];
        // Filtra para garantir que apenas elementos dentro da caixa de seleção são adicionados
        // e evita duplicatas se já estiverem em state.selectedElements
        allElements.forEach(element => {
            const r2 = getElementBoundingBox(element);
            if (doRectsIntersect(r1, r2)) {
                if (!state.selectedElements.includes(element.id)) {
                    state.selectedElements.push(element.id);
                }
            } else {
                // Se o elemento foi incluído por multi-seleção antes e agora está fora da nova caixa, remove
                state.selectedElements = state.selectedElements.filter(id => id !== element.id);
            }
        });
        
        state.isSelecting = false;
        // NOVO: Se múltiplos elementos estão selecionados, exibe as configurações do primeiro (ou limpa se nenhum)
        if (state.selectedElements.length > 0) {
            const firstSelectedElement = findElementById(state.selectedElements[0]);
            updateEffectSlidersForSelection(firstSelectedElement);
        } else {
            resetEffectSliders();
        }
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
        resetEffectSliders(); // Zera os sliders após limpar
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
        effects: [] // Todos os novos símbolos iniciam sem efeitos aplicados
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
    if (!element) return;

    ctx.save(); // Salva o estado original antes de aplicar qualquer efeito visual

    // Garante que o array de efeitos existe
    element.effects = element.effects || [];

    // --- Aplicação de Efeitos Visuais (Camadas Inferiores) ---
    // Efeitos que manipulam a sombra, opacidade geral ou que são desenhados como "camadas" atrás do elemento principal.

    let currentGlobalAlpha = ctx.globalAlpha; // Armazena a opacidade atual para poder modificá-la e restaurá-la

    // Efeito de Volume/Ganho (altera a opacidade geral do elemento)
    const gainEffect = element.effects.find(e => e.type === 'volumeZone' || e.type === 'gain');
    if (gainEffect) {
        const gainAmount = gainEffect.params.gain || 1.0; // 0 a 2.0
        currentGlobalAlpha = Math.max(0.2, Math.min(1.0, gainAmount)); // Opacidade de 0.2 (quase transparente) a 1.0
        ctx.globalAlpha = currentGlobalAlpha;
    } else {
        ctx.globalAlpha = 1.0; // Reseta para opacidade total se não houver efeito de ganho
    }

    // Efeito de Reverb (sombra difusa ao redor do desenho)
    const reverbEffect = element.effects.find(e => e.type === 'reverbZone');
    if (reverbEffect && reverbEffect.params.mix > 0) {
        const reverbAmount = reverbEffect.params.mix; // 0 a 1
        ctx.shadowBlur = reverbAmount * 30; // Mais reverb, mais blur na sombra (0 a 30px)
        ctx.shadowColor = element.color; // Cor da sombra é a cor do desenho
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    } else {
        // Reseta sombra se não houver reverb ou mix 0
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }

    // Efeito de Distorção (sombra com pequeno blur e deslocamento aleatório para "ruído")
    const distortionEffect = element.effects.find(e => e.type === 'distortion');
    if (distortionEffect && distortionEffect.params.amount > 0) {
        const distortionAmount = distortionEffect.params.amount; // 0 a 200
        ctx.shadowBlur = Math.min(5, distortionAmount * 0.05); // Pequeno blur (max 5px)
        ctx.shadowColor = element.color; // ou uma cor avermelhada/escura para distorção
        ctx.shadowOffsetX = (Math.random() - 0.5) * distortionAmount * 0.02; // Pequeno deslocamento aleatório
        ctx.shadowOffsetY = (Math.random() - 0.5) * distortionAmount * 0.02;
    }
    // NOTA: Se houver reverb E distorção, a última sombra aplicada irá prevalecer ou se combinar (dependendo do navegador).
    // Para um controle mais fino, poderia-se desenhar múltiplas camadas de sombras.
    // Por simplicidade, assumimos que uma sombra principal será suficiente ou que a ordem no forEach define a prioridade.

    // === Efeitos de Pulsação/Ondulação (Vibrato, Tremolo Amplitude, Wah) ===
    // Estes alteram a forma ou a escala do elemento base.
    const vibratoEffect = element.effects.find(e => e.type === 'vibratoZone');
    const tremoloAmpEffect = element.effects.find(e => e.type === 'tremoloAmplitude');
    const wahEffect = element.effects.find(e => e.type === 'wah');

    if (vibratoEffect || tremoloAmpEffect || wahEffect) {
        ctx.save(); // Salva o estado para a transformação
        const centerX = element.x || (element.points ? element.points[0].x : 0);
        const centerY = element.y || (element.points ? element.points[0].y : 0);

        ctx.translate(centerX, centerY); // Move o ponto de origem para o centro do elemento

        if (vibratoEffect) {
            const rate = vibratoEffect.params.rate || 5;
            const depth = vibratoEffect.params.depth || 50;
            const offsetY = Math.sin(Date.now() * 0.005 * rate) * (depth * 0.1); // Oscilação vertical
            ctx.translate(0, offsetY);
        }

        if (tremoloAmpEffect) {
            const rate = tremoloAmpEffect.params.rate || 8;
            const depth = tremoloAmpEffect.params.depth || 0.5; // 0 a 1
            const scaleFactor = 1 + Math.sin(Date.now() * 0.01 * rate) * (depth * 0.2); // Pulsação de escala
            ctx.scale(scaleFactor, scaleFactor);
        }
        
        if (wahEffect) {
            const rate = wahEffect.params.rate || 2;
            const range = wahEffect.params.range || 2000;
            const brightness = 1 + Math.sin(Date.now() * 0.005 * rate) * (range / FREQ_MAX * 0.5); // Simula brilho pulsante
            // Não é um filtro CSS, mas pode simularmos com opacidade ou luz
            // ctx.globalAlpha = currentGlobalAlpha * brightness; // Isso pode ser muito agressivo
            ctx.shadowBlur = brightness * 10;
            ctx.shadowColor = element.color; // Ou branco
        }

        ctx.translate(-centerX, -centerY); // Move o ponto de origem de volta
        drawBaseElement(element, ctx); // Desenha o elemento base com as transformações
        ctx.restore(); // Restaura o estado após as transformações
    } else {
        // Se não houver efeitos de pulsação/ondulação, desenha o elemento base
        drawBaseElement(element, ctx);
    }
    

    // === Efeito de Pan (Leve deslocamento horizontal / Duplicação sutil) ===
    const panEffect = element.effects.find(e => e.type === 'panZone');
    if (panEffect && Math.abs(panEffect.params.pan) > 0.05) { // Aplicar apenas se houver pan significativo
        ctx.save();
        const panAmount = panEffect.params.pan; // -1 a 1
        const offset = panAmount * 5; // Deslocamento visual (ajuste o 5 para mais ou menos)
        ctx.globalAlpha = (ctx.globalAlpha || 1.0) * 0.4; // Menor opacidade para a "cópia"
        ctx.translate(offset, 0);
        drawBaseElement(element, ctx);
        ctx.restore();
    }

    // === Efeitos de Delay (Cadeia de ecos visuais com opacidade decrescente) ===
    const delayEffect = element.effects.find(e => e.type === 'delayZone');
    if (delayEffect && delayEffect.params.mix > 0) {
        const delayAmount = delayEffect.params.mix; // 0 a 1
        const timeParam = delayEffect.params.time || 0.25;
        const numEchoes = Math.floor(delayAmount * 3) + 1; // 1 a 4 ecos
        const baseOffsetX = 10 * timeParam; // Base para o deslocamento visual do eco
        const baseOffsetY = 5 * timeParam; // Pequeno deslocamento vertical

        for (let i = numEchoes; i >= 1; i--) { // Desenha os ecos de trás para frente
            ctx.save();
            ctx.globalAlpha = (currentGlobalAlpha || 1.0) * (delayAmount * 0.3) * (i / numEchoes); // Opacidade do eco diminui
            ctx.translate(-baseOffsetX * i, -baseOffsetY * i); // Deslocamento para trás
            drawBaseElement(element, ctx);
            ctx.restore();
        }
    }
    
    // === Efeitos de Filtros e EQ (Brilhos/Sombras direcionais) ===
    const filterEffects = element.effects.filter(e => ['lowpassFilter', 'highpassFilter', 'bandpassFilter', 'notchFilter', 'bassEq', 'midEq', 'trebleEq'].includes(e.type));
    if (filterEffects.length > 0) {
        filterEffects.forEach(effect => {
            const intensity = effect.params.gain !== undefined ? Math.abs(effect.params.gain) : (effect.params.Q || 1);
            if (intensity > 0) {
                ctx.save();
                ctx.globalAlpha = (currentGlobalAlpha || 1.0) * (0.1 + (intensity / 20) * 0.4); // Opacidade sutil para o "brilho"
                ctx.lineWidth = element.lineWidth + (intensity / 10); // Linha um pouco mais grossa

                // Ajustes de sombra/brilho para indicar a frequência
                let shadowColor = 'rgba(255, 255, 255, 0.5)'; // Padrão
                let shadowOffsetY = 0;
                let shadowOffsetX = 0;

                switch (effect.type) {
                    case 'lowpassFilter': // Corta agudos, passa graves: sutil sombreamento nos agudos
                        shadowColor = 'rgba(0, 0, 0, 0.3)'; // Escuro
                        shadowOffsetY = -2; // Para cima (agudos)
                        break;
                    case 'highpassFilter': // Corta graves, passa agudos: sutil brilho nos agudos
                        shadowColor = 'rgba(255, 255, 255, 0.5)'; // Brilho
                        shadowOffsetY = 2; // Para baixo (graves)
                        break;
                    case 'bandpassFilter': // Passa banda: brilho concentrado
                        shadowColor = 'rgba(0, 255, 255, 0.6)'; // Ciano
                        break;
                    case 'notchFilter': // Corta banda: "buraco" ou desfoque no centro
                        shadowColor = 'rgba(255, 0, 0, 0.5)'; // Vermelho
                        break;
                    case 'bassEq':
                        shadowColor = 'rgba(0, 0, 0, 0.4)'; // Sombra forte para graves
                        shadowOffsetY = 3;
                        break;
                    case 'midEq':
                        shadowColor = 'rgba(255, 200, 0, 0.5)'; // Amarelo para médios
                        break;
                    case 'trebleEq':
                        shadowColor = 'rgba(255, 255, 255, 0.6)'; // Brilho forte para agudos
                        shadowOffsetY = -3;
                        break;
                }
                ctx.shadowBlur = intensity * 2;
                ctx.shadowColor = shadowColor;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                drawBaseElement(element, ctx); // Desenha a camada do filtro
                ctx.restore();
            }
        });
    }

    // === Efeitos de Modulação (Phaser, Flanger, Chorus) - Cópias "fantasmas" ===
    const complexModEffects = element.effects.filter(e => ['phaser', 'flanger', 'chorus'].includes(e.type));
    if (complexModEffects.length > 0) {
        complexModEffects.forEach(effect => {
            ctx.save();
            const mix = effect.params.mix || 0.5; // Mix do efeito
            const rate = effect.params.rate || 0.5; // Frequência do LFO
            const numCopies = 2; // Número de cópias fantasmas
            const baseSpread = 5; // Espalhamento base

            for (let i = 1; i <= numCopies; i++) {
                ctx.save();
                const ghostAlpha = (currentGlobalAlpha || 1.0) * (mix * 0.5) * (1 - (i / (numCopies + 1))); // Opacidade decrescente
                ctx.globalAlpha = ghostAlpha;

                // Deslocamento para criar o efeito de espalhamento
                const offsetX = Math.sin(Date.now() * 0.005 * rate + i) * baseSpread * (mix);
                const offsetY = Math.cos(Date.now() * 0.005 * rate + i) * baseSpread * (mix);

                // Pequenas variações de cor para simular a mudança de fase
                // Isso pode ser computacionalmente caro ou não funcionar em todos os navegadores.
                // Uma alternativa mais leve é usar a cor do elemento, mas variar a saturação ou brilho.
                // ctx.filter = `hue-rotate(${i * 15 * mix}deg)`; // Pode não ser suportado uniformemente ou ser caro

                ctx.translate(offsetX, offsetY);
                drawBaseElement(element, ctx);
                ctx.translate(-2 * offsetX, -2 * offsetY); // Desfaz a translação para o próximo fantasma (para ir em direções opostas)
                drawBaseElement(element, ctx);
                ctx.restore();
            }
            ctx.restore();
        });
    }
    
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
        context.fillStyle = s.color; // Símbolos têm fillStyle
        switch(s.type) {
            case 'staccato': context.arc(s.x, s.y, s.size / 4, 0, 2 * Math.PI); context.fill(); break;
            case 'percussion': context.moveTo(s.x - s.size/2, s.y - s.size/2); context.lineTo(s.x + s.size/2, s.x + s.size/2); context.moveTo(s.x + s.size/2, s.y - s.size/2); context.lineTo(s.x - s.size/2, s.y + s.size/2); context.stroke(); break;
            case 'glissando': context.moveTo(s.x, s.y); context.lineTo(s.endX, s.endY); context.stroke(); break;
            case 'arpeggio': context.lineWidth = Math.max(2, s.size / 15); context.moveTo(s.x - s.size, s.y + s.size/2); context.bezierCurveTo(s.x - s.size/2, s.y - s.size, s.x + s.size/2, s.y + s.size, s.x + s.size, s.y-s.size/2); context.stroke(); break;
            case 'granular': 
                // Removed globalAlpha from here as it's handled by visual effects logic
                context.fillRect(s.x - s.size, s.y - s.size/2, s.size*2, s.size); 
                break;
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
        // Já está salvo em state.currentEffectValues, que é lido por updateEffectSlidersForSelection
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
            const sliderElement = Object.values(el.effectSliders).find(s => s.dataset.effectType === effectType); // Corrigido aqui
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
                    params.pan = (sliderValue / 100); // Pan de -1.0 a 1.0 (slider de -100 a 100)
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
                case 'compressor':
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
                    params.baseFreq = (FREQ_MIN + FREQ_MAX) / 2; // Frequência central do filtro Wah
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

// Função para atualizar os sliders de efeito com os valores do elemento selecionado
function updateEffectSlidersForSelection(element) {
    // Primeiro, zera todos os sliders para um estado neutro
    resetEffectSliders();

    if (element && element.effects) {
        element.effects.forEach(effect => {
            // Encontra o slider correspondente ao tipo de efeito
            const slider = Object.values(el.effectSliders).find(s => s.dataset.effectType === effect.type);
            if (slider) {
                // Mapeia os parâmetros do efeito de volta para o valor do slider
                let sliderValue;
                switch (effect.type) {
                    case 'reverbZone':
                        // O mix do reverb vai de 0 a 1, o slider de 0 a 100
                        sliderValue = effect.params.mix * 100; 
                        break;
                    case 'delayZone':
                        // O mix do delay vai de 0 a 1, o slider de 0 a 100
                        sliderValue = effect.params.mix * 100;
                        break;
                    case 'volumeZone':
                    case 'gain':
                        sliderValue = (effect.params.gain / 2) * 100; // De 0-2 para 0-200
                        break;
                    case 'panZone':
                        sliderValue = effect.params.pan * 100; // De -1 a 1 para -100 a 100
                        break;
                    case 'vibratoZone':
                        sliderValue = (effect.params.depth / 100) * 100; // depth é 0-100, slider 0-100
                        break;
                    case 'lowpassFilter':
                        // Inverso: lowpass no 0 corta tudo (freq baixa), no 100 passa tudo (freq alta)
                        // A frequência é FREQ_MIN + (RANGE * (1 - normalizedValue))
                        // normalizedValue = 1 - ((freq - FREQ_MIN) / RANGE)
                        sliderValue = 100 - ( (effect.params.frequency - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * 100 );
                        break;
                    case 'highpassFilter':
                        // Highpass no 0 passa tudo (freq baixa), no 100 corta tudo (freq alta)
                        sliderValue = ( (effect.params.frequency - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * 100 );
                        break;
                    case 'bandpassFilter':
                    case 'notchFilter':
                        sliderValue = ( (effect.params.frequency - FREQ_MIN) / (FREQ_MAX - FREQ_MIN) * 100 );
                        break;
                    case 'phaser':
                        sliderValue = (effect.params.depth / 2000) * 100; // depth 0-2000, slider 0-100
                        break;
                    case 'flanger':
                        sliderValue = (effect.params.feedback / 0.9) * 100; // feedback 0-0.9, slider 0-100
                        break;
                    case 'chorus':
                        sliderValue = (effect.params.mix) * 100; // mix 0-1, slider 0-100
                        break;
                    case 'distortion':
                        sliderValue = (effect.params.amount / 200) * 100; // amount 0-200, slider 0-100
                        break;
                    case 'compressor':
                        sliderValue = (effect.params.ratio - 1) / 10 * 100; // ratio 1-11, slider 0-100
                        break;
                    case 'tremoloAmplitude':
                        sliderValue = (effect.params.depth) * 100; // depth 0-1, slider 0-100
                        break;
                    case 'wah':
                        sliderValue = (effect.params.range / 3000) * 100; // range 0-3000, slider 0-100
                        break;
                    case 'bassEq':
                    case 'midEq':
                    case 'trebleEq':
                        sliderValue = effect.params.gain; // ganho -20 a 20, slider -20 a 20
                        break;
                    default:
                        sliderValue = 0; // Default para 0 se não mapeado
                }
                slider.value = sliderValue;
                state.currentEffectValues[slider.id] = sliderValue; // Atualiza o estado interno
            }
        });
    }
}

// Função para zerar todos os sliders de efeito para seus valores neutros
function resetEffectSliders() {
    Object.keys(el.effectSliders).forEach(key => {
        const slider = el.effectSliders[key];
        let neutralValue;
        switch (slider.dataset.effectType) {
            case 'volumeZone':
            case 'gain':
                neutralValue = 100; // Volume/Gain neutro é 100%
                break;
            case 'panZone':
                neutralValue = 0; // Pan neutro é 0
                break;
            case 'lowpassFilter':
                neutralValue = 100; // LowPass neutro é 100 (passa tudo)
                break;
            case 'highpassFilter':
                neutralValue = 0; // HighPass neutro é 0 (passa tudo)
                break;
            case 'bassEq':
            case 'midEq':
            case 'trebleEq':
                neutralValue = 0; // EQ neutro é 0dB
                break;
            default:
                neutralValue = 0; // A maioria dos efeitos começa em 0
        }
        slider.value = neutralValue;
        state.currentEffectValues[slider.id] = neutralValue; // Atualiza o estado interno
    });
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
    resetEffectSliders(); // Zera os sliders após deletar seleção
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
    // NOVO: Atualiza os sliders para os elementos colados
    if (state.selectedElements.length > 0) {
        const firstSelectedElement = findElementById(state.selectedElements[0]);
        updateEffectSlidersForSelection(firstSelectedElement);
    }
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
                state.selectedElements = []; // Limpa a seleção ao importar
                redrawAll();
                saveState();
                resetEffectSliders(); // Zera os sliders ao importar um novo projeto
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

        state.selectedElements = []; // Limpa a seleção ao desfazer/refazer
        resetEffectSliders(); // Zera os sliders
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

        state.selectedElements = []; // Limpa a seleção ao desfazer/refazer
        resetEffectSliders(); // Zera os sliders
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

        scheduleAllSounds(state.audioCtx, state.playbackStartTime);
        animatePlayhead();
    });
}

function stopPlayback() {
    state.isPlaying = false;

    state.sourceNodes.forEach(node => {
        try { 
            // Para OscillatorNodes e BufferSourceNodes, .stop() funciona
            if (typeof node.stop === 'function') {
                node.stop(0); 
            }
            // Para outros nós (gain, filter, etc.), apenas desconecta
            if (typeof node.disconnect === 'function') {
                node.disconnect();
            }
        } catch(e) {
            console.warn("Erro ao parar/desconectar nó de áudio:", e);
        }
    });
    state.sourceNodes = []; // Limpa o array de nós para evitar referências antigas

    if (state.audioCtx && state.audioCtx.state !== 'closed') {
        // Não fechamos o AudioContext para permitir retomar a reprodução de onde parou.
        // Apenas suspendemos se desejado, mas fechar o AudioContext completamente
        // destruiria todos os nós e forçaria uma nova inicialização, o que não é ideal para pausa/play.
        // Se quisermos preservar os nós para retomar instantaneamente, devemos apenas parar as fontes.
        // Por agora, vou manter o close, mas é um ponto a considerar para otimização.
        // state.audioCtx.close().then(() => state.audioCtx = null).catch(e => console.error("Erro ao fechar AudioContext:", e));
    }

    cancelAnimationFrame(state.animationFrameId);
    updatePlaybackUI(false);
}

function animatePlayhead() {
    if (!state.isPlaying || !state.audioCtx) return;

    // Use o 'state.audioCtx.currentTime' no momento em que a reprodução *começou*
    // para calcular o tempo decorrido de forma precisa.
    const audioContextStartTimeForCurrentPlay = state.audioCtx.currentTime;
    const canvasStartPosInSeconds = state.playbackStartTime; // Onde o playhead estava quando iniciamos

    function frame() {
        if (!state.isPlaying || !state.audioCtx) return;

        // O tempo atual no áudio é o `playbackStartTime` guardado + tempo decorrido desde que o áudio foi iniciado
        const elapsedTimeSinceAudioStart = state.audioCtx.currentTime - audioContextStartTimeForCurrentPlay;
        const currentPosInSeconds = canvasStartPosInSeconds + elapsedTimeSinceAudioStart;

        if (currentPosInSeconds >= MAX_DURATION_SECONDS) {
            stopPlayback();
            // Opcional: resetar playbackStartTime para 0 no final da pauta
            state.playbackStartTime = 0; 
            updatePlayheadPosition();
            return;
        }

        state.playbackStartTime = currentPosInSeconds;
        updatePlayheadPosition();

        const currentXInPixels = state.playbackStartTime * PIXELS_PER_SECOND;
        // Rolagem automática para seguir o playhead
        if (currentXInPixels * state.zoomLevel > el.mainCanvasArea.scrollLeft + el.mainCanvasArea.clientWidth) {
            el.mainCanvasArea.scrollLeft = (currentXInPixels * state.zoomLevel) - el.mainCanvasArea.clientWidth + 100; // +100px para margem
        } else if (currentXInPixels * state.zoomLevel < el.mainCanvasArea.scrollLeft) {
            el.mainCanvasArea.scrollLeft = (currentXInPixels * state.zoomLevel) - 100; // -100px para margem
        }

        state.animationFrameId = requestAnimationFrame(frame);
    }
    state.animationFrameId = requestAnimationFrame(frame);
}

// A função scheduleAllSounds agora aceita um parâmetro `offsetTime`
function scheduleAllSounds(audioCtx, offsetTime = 0) {
    const now = audioCtx.currentTime;
    state.sourceNodes = []; // Garante que sourceNodes está vazio antes de preencher

    const mainOut = audioCtx.createGain();
    mainOut.connect(audioCtx.destination); 

    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;

        const xCoords = stroke.points.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);

        const strokeStartTimeCanvas = minX / PIXELS_PER_SECOND;
        const strokeEndTimeCanvas = maxX / PIXELS_PER_SECOND;

        // Calcula a duração total do som no canvas
        let durationCanvas = strokeEndTimeCanvas - strokeStartTimeCanvas;
        if (durationCanvas <= 0) {
            durationCanvas = 0.05; // Duração mínima para evitar sons com duração zero
        }

        // Calcula o ponto de início do traço em relação ao tempo do AudioContext.
        // `scheduledAudioStart` é o tempo absoluto no AudioContext em que o som deve começar.
        const scheduledAudioStart = now + (strokeStartTimeCanvas - offsetTime);

        // Calcula o ponto de fim do traço em relação ao tempo do AudioContext.
        const scheduledAudioEnd = now + (strokeEndTimeCanvas - offsetTime);

        // Se o som terminar antes do tempo atual do AudioContext (now) ou começar muito depois do limite, não agenda.
        if (scheduledAudioEnd < now || scheduledAudioStart > now + MAX_DURATION_SECONDS) {
            return;
        }

        // Garante que o som não comece antes do "now" (tempo atual do AudioContext)
        // Isso é crucial para cortes precisos quando se reinicia de um ponto.
        const actualScheduledStart = Math.max(now, scheduledAudioStart);
        // Ajusta a duração se o som começar depois do ponto original agendado.
        const actualDuration = scheduledAudioEnd - actualScheduledStart;

        if (actualDuration <= 0) {
            return; // Evita agendar sons com duração zero ou negativa
        }

        // Gera os valores de frequência para o traço
        // Precisamos ajustar o trecho do freqValues para começar do `offsetTime`
        const freqValues = new Float32Array(Math.ceil(actualDuration * 100)); // 100 samples por segundo
        
        let startInterpolationTime = strokeStartTimeCanvas; // O tempo no canvas onde o stroke realmente começa
        if (scheduledAudioStart < now) { // Se o som já deveria ter começado
            startInterpolationTime = offsetTime; // Começamos a interpolação a partir do offset
        }

        let currentPointIndex = 0;
        // Encontrar o ponto inicial mais próximo ou anterior ao startInterpolationTime
        while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x / PIXELS_PER_SECOND < startInterpolationTime) {
            currentPointIndex++;
        }

        for (let i = 0; i < freqValues.length; i++) {
            const timeInCurrentSegment = i / 100;
            // Posição X no canvas correspondente ao tempo atual do segmento a ser reproduzido
            const xPosInCanvas = startInterpolationTime * PIXELS_PER_SECOND + timeInCurrentSegment * PIXELS_PER_SECOND;

            // Garante que o xPosInCanvas não exceda o fim do stroke original
            if (xPosInCanvas > maxX) {
                freqValues[i] = yToFrequency(stroke.points[stroke.points.length - 1].y); // Pega a última frequência
                continue;
            }

            // Encontra o segmento de linha correto para interpolação
            while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInCanvas) {
                currentPointIndex++;
            }
            const p1 = stroke.points[currentPointIndex];
            const p2 = stroke.points[currentPointIndex + 1] || p1; // Se for o último ponto, usa p1

            // Interpolação linear da frequência entre p1 e p2
            const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosInCanvas - p1.x) / (p2.x - p1.x);
            const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
            freqValues[i] = yToFrequency(interpolatedY);
        }
        // FIM DA MUDANÇA CRÍTICA AQUI (freqValues)

        // Calcula o volume inicial e pan com base na espessura e posição X
        const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
        const pan = xToPan(minX); 

        // Cria o tom com todos os parâmetros, incluindo o elemento para os efeitos
        createTone(audioCtx, {
            element: stroke, // Passa o elemento completo para que os efeitos sejam lidos
            type: stroke.timbre,
            startTime: actualScheduledStart, // Usa o tempo de início ajustado
            endTime: actualScheduledStart + actualDuration, // Usa a duração ajustada
            freqValues: freqValues, // Usa os freqValues ajustados
            vol: vol,
            pan: pan,
            xStart: minX, // Posição X inicial no canvas (para referência visual/pan)
            xEnd: maxX,   // Posição X final no canvas
            initialY: stroke.points[0].y, // Posição Y inicial (para referência de altura/frequência)
        }, mainOut);
    });

    state.composition.symbols.forEach(s => {
        const symbolStartTimeCanvas = s.x / PIXELS_PER_SECOND;

        // Calcula o tempo de início do símbolo em relação ao AudioContext.currentTime,
        // mas subtrai o offsetTime para começar a partir da posição desejada.
        const scheduledTime = now + Math.max(0, symbolStartTimeCanvas - offsetTime);

        // Para símbolos, a duração é fixa ou calculada por eles mesmos.
        // Se um símbolo começa antes do offset, ele é ignorado.
        if (symbolStartTimeCanvas < offsetTime || scheduledTime > now + MAX_DURATION_SECONDS) {
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
                    // Ajusta o agendamento de cada nota do arpejo também
                    const noteScheduledTime = now + Math.max(0, (symbolStartTimeCanvas + i * 0.05) - offsetTime);
                    if (noteScheduledTime > now + MAX_DURATION_SECONDS) return; // Evita agendar notas muito à frente
                    createTone(audioCtx, { element: s, type: 'triangle', startTime: noteScheduledTime, endTime: noteScheduledTime + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, xStart: s.x, initialY: s.y }, mainOut);
                });
                break;
            case 'glissando':
                const glissStartTimeCanvas = s.x / PIXELS_PER_SECOND;
                const glissEndTimeCanvas = s.endX / PIXELS_PER_SECOND;

                // Garante que o glissando comece no mínimo no offsetTime
                const actualGlissStartTime = Math.max(glissStartTimeCanvas, offsetTime);
                const actualGlissEndTime = Math.max(glissEndTimeCanvas, offsetTime); // Glissando não pode terminar antes do offset

                const scheduledGlissStart = now + (actualGlissStartTime - offsetTime);
                const scheduledGlissEnd = now + (actualGlissEndTime - offsetTime);
                const glissDuration = scheduledGlissEnd - scheduledGlissStart;

                if (glissDuration > 0) {
                    // Para o glissando, a frequência inicial e final podem precisar de ajuste
                    // se ele for "cortado" pelo offsetTime.
                    let startFreq = yToFrequency(s.y);
                    let endFreq = yToFrequency(s.endY);

                    // Se o glissando começa depois do offset (ou seja, offsetTime > glissStartTimeCanvas),
                    // precisamos interpolar a frequência no ponto de início real.
                    if (offsetTime > glissStartTimeCanvas) {
                        const totalCanvasDuration = glissEndTimeCanvas - glissStartTimeCanvas;
                        const progressAtOffset = (offsetTime - glissStartTimeCanvas) / totalCanvasDuration;
                        startFreq = yToFrequency(s.y + (s.endY - s.y) * progressAtOffset);
                    }

                    createTone(audioCtx, { element: s, type: s.timbre, startTime: scheduledGlissStart, endTime: scheduledGlissEnd, startFreq: startFreq, endFreq: endFreq, vol, pan, xStart: s.x, xEnd: s.endX, initialY: s.y }, mainOut);
                }
                break;
            case 'tremolo': 
                for (let t = 0; t < 0.5; t += 0.05) {
                    const tremoloScheduledTime = now + Math.max(0, (symbolStartTimeCanvas + t) - offsetTime);
                    if (tremoloScheduledTime > now + MAX_DURATION_SECONDS) return;
                    createTone(audioCtx, { element: s, type: 'sine', startTime: tremoloScheduledTime, endTime: tremoloScheduledTime + 0.1, startFreq: freq, vol: vol * 0.8, pan, xStart: s.x, initialY: s.y }, mainOut);
                }
                break;
            case 'granular':
                for (let i = 0; i < 20; i++) {
                     const randomOffset = Math.random() * 0.5;
                     const granularScheduledTime = now + Math.max(0, (symbolStartTimeCanvas + randomOffset) - offsetTime);
                     if (granularScheduledTime > now + MAX_DURATION_SECONDS) return;
                     createTone(audioCtx, { element: s, type: 'sine', startTime: granularScheduledTime, endTime: granularScheduledTime + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, xStart: s.x, initialY: s.y }, mainOut);
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

    // Array para coletar todos os nós de áudio que precisam ser iniciados e parados
    const nodesToStartStop = [];

    // Criação do oscilador/fonte de som baseado no timbre
    switch (opts.type) {
        case 'noise':
            osc = audioCtx.createBufferSource();
            // A duração do buffer precisa ser suficiente para o som, mesmo que cortado
            const bufferDuration = Math.max(duration + 0.1, 0.5); // Garante um buffer mínimo
            const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * bufferDuration, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            osc.buffer = buffer;
            osc.loop = false;
            nodesToStartStop.push(osc); // Adiciona o BufferSourceNode
            break;
        case 'fm':
            const carrier = audioCtx.createOscillator(); carrier.type = 'sine';
            const modulator = audioCtx.createOscillator(); modulator.type = 'square';
            
            // Apply frequency modulation over time if freqValues exist
            if(opts.freqValues) {
                // Modulator frequency can be based on carrier's average or a fixed ratio
                modulator.frequency.setValueAtTime( (opts.freqValues.reduce((a, b) => a + b) / opts.freqValues.length) * 1.5 || 300, audioCtx.currentTime); 
            } else {
                modulator.frequency.setValueAtTime( (opts.startFreq || 200) * 1.5, audioCtx.currentTime);
            }

            const modGain = audioCtx.createGain(); 
            // Modulator gain (detuning depth) can also be dynamic if needed, but fixed for now
            modGain.gain.setValueAtTime( (opts.startFreq || 200) * 0.75, audioCtx.currentTime);
            modulator.connect(modGain).connect(carrier.frequency);
            osc = audioCtx.createGain(); carrier.connect(osc); 
            
            nodesToStartStop.push(modulator, carrier); // Adiciona ambos osciladores
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

            nodesToStartStop.push(fundamental, harmonic1, harmonic2); // Adiciona todos os osciladores
            break;
        case 'pulse': // O timbre 'pulse' não tinha uma implementação específica no switch, adicionei uma simples
            osc = audioCtx.createOscillator();
            osc.type = 'square'; // Simplesmente um quadrado por enquanto para "pulse"
            nodesToStartStop.push(osc);
            break;
        case 'sine':
        case 'square':
        case 'sawtooth':
        case 'triangle':
        default: 
            osc = audioCtx.createOscillator();
            osc.type = opts.type;
            nodesToStartStop.push(osc); // Adiciona o oscilador padrão
            break;
    }

    // Configuração de frequência para osciladores padrão
    // Esta parte do código só se aplica a OscillatorNodes que têm a propriedade 'frequency'
    // E DEVE VIR ANTES DE QUALQUER CONEXÃO DO 'osc' QUE MUDE SEU TIPO (ex: osc = pluckGain)
    // Para garantir que o oscilador REAL seja configurado.
    if (nodesToStartStop.includes(osc) && osc instanceof OscillatorNode) { // Verifica se 'osc' ainda é o OscillatorNode original
        if (opts.freqValues) {
            osc.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
        } else if (opts.startFreq) {
            osc.frequency.setValueAtTime(opts.startFreq, opts.startTime);
            if (opts.endFreq) osc.frequency.linearRampToValueAtTime(opts.endFreq, opts.endTime);
        }
    }

    // Cria o GainNode principal para o som
    const mainGain = audioCtx.createGain(); 
    mainGain.gain.setValueAtTime(0, opts.startTime);
    mainGain.gain.linearRampToValueAtTime(opts.vol, opts.startTime + 0.01); // Ataque
    mainGain.gain.setValueAtTime(opts.vol, opts.endTime - 0.01);
    mainGain.gain.linearRampToValueAtTime(0, opts.endTime); // Release

    // Conecta a fonte do som (osc) ao mainGain, a menos que o timbre seja AM (já conectado)
    if (opts.type !== 'am' && typeof osc.connect === 'function') { 
        osc.connect(mainGain);
    }

    let currentNode = mainGain; // O mainGain agora é o primeiro nó no pipeline de efeitos

    // Aplicar efeitos armazenados no elemento (opts.element)
    if (opts.element && opts.element.effects && opts.element.effects.length > 0) {
        // Ordena os efeitos para garantir um pipeline lógico
        // Ex: Filters -> Modulation -> Dynamics -> Spacial -> Reverb/Delay (como send/return)
        const effectOrder = [
            'lowpassFilter', 'highpassFilter', 'bandpassFilter', 'notchFilter', 'bassEq', 'midEq', 'trebleEq', // EQ e Filtros
            'phaser', 'flanger', 'chorus', 'vibratoZone', 'tremoloAmplitude', 'wah', // Modulação
            'distortion', 'compressor', // Dinâmica (gain já tratado no mainGain)
            // Reverb e Delay são tratados em paralelo com o sinal seco, então precisam de lógica especial
        ];

        // Filtra e ordena os efeitos
        const orderedEffects = effectOrder
            .map(type => opts.element.effects.find(eff => eff.type === type))
            .filter(Boolean); // Remove nulls/undefineds

        // Cria uma cópia do currentNode para o sinal "seco" que será mesclado no final
        // Isso é crucial para efeitos como Reverb e Delay que operam em paralelo.
        // Para outros efeitos em série, o `currentNode` se propaga.
        const drySignalBypassNode = audioCtx.createGain();
        drySignalBypassNode.gain.value = 1.0; // Inicia com ganho total
        currentNode.connect(drySignalBypassNode); // Conecta o sinal atual ao bypass

        orderedEffects.forEach(effect => {
            let effectNode;
            const params = effect.params; // Parâmetros específicos do efeito

            switch (effect.type) {
                case 'lowpassFilter':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'lowpass';
                    effectNode.frequency.value = params.frequency || FREQ_MAX;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'highpassFilter':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'highpass';
                    effectNode.frequency.value = params.frequency || FREQ_MIN;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'bandpassFilter':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'bandpass';
                    effectNode.frequency.value = params.frequency || (FREQ_MIN + FREQ_MAX) / 2;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'notchFilter':
                    effectNode = audioCtx.createBiquadFilter();
                    effectNode.type = 'notch';
                    effectNode.frequency.value = params.frequency || (FREQ_MIN + FREQ_MAX) / 2;
                    effectNode.Q.value = params.Q || 1;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'gain': // Se houver um "gain" adicional no pipeline
                    effectNode = audioCtx.createGain();
                    effectNode.gain.value = params.gain || 1.0;
                    currentNode.connect(effectNode);
                    currentNode = effectNode;
                    break;
                case 'vibratoZone':
                    let targetOscillatorFreqParam = null;
                    // Tenta encontrar o parâmetro de frequência do oscilador principal ou de um sub-oscilador
                    // Apenas aplica vibrato se o oscilador principal for um OscillatorNode
                    if (osc instanceof OscillatorNode) { 
                        targetOscillatorFreqParam = osc.frequency;
                    } 
                    // Removido o caso de nodesToStartStop[0] para evitar vibrato em timbres complexos de forma errada
                    // se o primeiro nó não for o oscilador de frequência principal.

                    if (targetOscillatorFreqParam) {
                        const vibratoLFO = audioCtx.createOscillator();
                        vibratoLFO.type = 'sine';
                        vibratoLFO.frequency.value = params.rate || 5; 
                        const vibratoGain = audioCtx.createGain();
                        vibratoGain.gain.value = params.depth || 50; 
                        vibratoLFO.connect(vibratoGain).connect(targetOscillatorFreqParam);
                        nodesToStartStop.push(vibratoLFO); // Adiciona o LFO para ser iniciado/parado
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
                    nodesToStartStop.push(phaserLFO);
                    break;
                case 'flanger': 
                    effectNode = audioCtx.createDelay(0.05);
                    const flangerLFO = audioCtx.createOscillator();
                    flangerLFO.type = 'sine';
                    flangerLFO.frequency.value = params.rate || 0.2;
                    const flangerLFO_Gain = audioCtx.createGain();
                    flangerLFO_Gain.gain.value = params.delay || 0.005;
                    flangerLFO.connect(flangerLFO_Gain).connect(effectNode.delayTime);

                    const flangerFeedback = audioCtx.createGain();
                    flangerFeedback.gain.value = params.feedback || 0.8;

                    // NOTA: Para flanger/chorus, o mix dry/wet é um pouco mais complexo se for para
                    // um "insert" no pipeline. A abordagem de send/return é mais comum.
                    // Para simplificar e manter a cadeia, vamos misturar aqui.
                    const flangerMerger = audioCtx.createChannelMerger(1);
                    const flangerWetMix = audioCtx.createGain(); flangerWetMix.gain.value = params.mix || 0.5;
                    const flangerDryMix = audioCtx.createGain(); flangerDryMix.gain.value = 1 - (params.mix || 0.5);

                    currentNode.connect(flangerDryMix).connect(flangerMerger);
                    currentNode.connect(effectNode).connect(flangerFeedback).connect(effectNode); // Loop de feedback
                    effectNode.connect(flangerWetMix).connect(flangerMerger);
                    
                    currentNode = flangerMerger;
                    nodesToStartStop.push(flangerLFO);
                    break;
                case 'chorus': 
                    const chorusDelay1 = audioCtx.createDelay(0.1);
                    const chorusDelay2 = audioCtx.createDelay(0.1);

                    const chorusLFO1 = audioCtx.createOscillator();
                    chorusLFO1.type = 'sine';
                    chorusLFO1.frequency.value = params.rate || 0.1;
                    const chorusLFO1_Gain = audioCtx.createGain();
                    chorusLFO1_Gain.gain.value = params.delay || 0.02;
                    chorusLFO1.connect(chorusLFO1_Gain).connect(chorusDelay1.delayTime);

                    const chorusLFO2 = audioCtx.createOscillator();
                    chorusLFO2.type = 'sine';
                    chorusLFO2.frequency.value = (params.rate || 0.1) * 1.2;
                    const chorusLFO2_Gain = audioCtx.createGain();
                    chorusLFO2_Gain.gain.value = (params.delay || 0.02) * 0.8;
                    chorusLFO2.connect(chorusLFO2_Gain).connect(chorusDelay2.delayTime);

                    const chorusMerger = audioCtx.createChannelMerger(1);
                    const chorusWetMix1 = audioCtx.createGain(); chorusWetMix1.gain.value = (params.mix || 0.5) / 2;
                    const chorusWetMix2 = audioCtx.createGain(); chorusWetMix2.gain.value = (params.mix || 0.5) / 2;
                    const chorusDryMix = audioCtx.createGain(); chorusDryMix.gain.value = 1 - (params.mix || 0.5);

                    currentNode.connect(chorusDryMix).connect(chorusMerger);
                    currentNode.connect(chorusDelay1).connect(chorusWetMix1).connect(chorusMerger);
                    currentNode.connect(chorusDelay2).connect(chorusWetMix2).connect(chorusMerger);

                    currentNode = chorusMerger;
                    nodesToStartStop.push(chorusLFO1, chorusLFO2);
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
                    nodesToStartStop.push(tremoloAmpLFO);
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
                    nodesToStartStop.push(wahLFO);
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

        // TRATAMENTO FINAL DE REVERB E DELAY (CONEXÕES EM PARALELO)
        // Estes devem ser aplicados após todos os outros efeitos "em série".
        // O sinal `drySignalBypassNode` contém o áudio original antes de ser processado pelos efeitos em série.
        // O `currentNode` contém o áudio *após* os efeitos em série.

        // Delay (send/return)
        const delayEffect = opts.element.effects.find(eff => eff.type === 'delayZone');
        if (delayEffect && delayEffect.params.mix > 0) {
            const delayNode = audioCtx.createDelay(1.0); // Max delay 1 sec
            const feedbackNode = audioCtx.createGain();
            const wetGainDelay = audioCtx.createGain();
            
            delayNode.delayTime.value = delayEffect.params.time || 0.25;
            feedbackNode.gain.value = delayEffect.params.feedback || 0.3;
            wetGainDelay.gain.value = delayEffect.params.mix || 0.5;

            // Envia o sinal processado (currentNode) para o delay
            currentNode.connect(delayNode); 
            delayNode.connect(feedbackNode).connect(delayNode); // Loop de feedback
            delayNode.connect(wetGainDelay); // Saída do delay

            // Mistura o sinal wet de volta ao currentNode (sinal dry já está nele se for um efeito em série)
            // Se o Delay for o *último* efeito antes do panner, ele se conecta ao panner.
            // Se houver outros efeitos depois, o resultado do mix deve ser o novo currentNode.
            // Para simplicidade e eficácia como send/return, ele se conecta de volta ao currentNode.
            wetGainDelay.connect(currentNode); 
        }

        // Reverb (send/return)
        const reverbEffect = opts.element.effects.find(eff => eff.type === 'reverbZone');
        if (reverbEffect && reverbEffect.params.mix > 0) {
            const reverbNode = audioCtx.createConvolver();
            reverbNode.buffer = createImpulseResponse(audioCtx, reverbEffect.params.decay || 1.5, 2.0);
            const reverbWetGain = audioCtx.createGain();
            reverbWetGain.gain.value = reverbEffect.params.mix || 0.3;

            // Envia o sinal processado (currentNode) para o reverb
            currentNode.connect(reverbNode); 
            reverbNode.connect(reverbWetGain); 

            // Mistura o sinal wet de volta ao currentNode
            reverbWetGain.connect(currentNode); 
        }
    }
    
    // Conecta o último nó do pipeline de efeitos ao panner
    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(opts.pan, opts.startTime);
    currentNode.connect(panner);

    // E o panner ao mainOut geral
    panner.connect(mainOut);

    // Inicia e para todos os nós que são fontes de áudio
    nodesToStartStop.forEach(node => {
        if (typeof node.start === 'function' && typeof node.stop === 'function') {
            node.start(opts.startTime);
            node.stop(opts.endTime);
        }
        state.sourceNodes.push(node); // Adiciona todos os nós para serem parados posteriormente
    });
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
    // Normaliza a posição Y do canvas (0 a 1, onde 0 é topo, 1 é base)
    // Inverte o Y porque no canvas 0 é o topo e para frequência 0 é mais grave (embaixo)
    const normalizedY = 1 - Math.max(0, Math.min(1, y / el.canvas.height));
    // Mapeia logaritmicamente a frequência
    return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, normalizedY);
}

function yFromFrequency(freq) {
    // Mapeia a frequência de volta para a posição Y do canvas
    const normalizedFreq = Math.log(freq / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
    return el.canvas.height * (1 - normalizedFreq);
}

function xToPan(x) { 
    // Mapeia a posição X do canvas para um valor de pan de -1 (esquerda) a 1 (direita)
    // Considerando o centro como 0
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
        // Para JPG/PDF, desenhe o canvas na escala original para melhor qualidade
        tempCanvas.width = el.canvas.width;
        tempCanvas.height = el.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCtx.height);

        // Desenha todos os elementos na escala original (sem o zoom do display)
        // Isso requer uma recriação simplificada do redrawAll sem o state.zoomLevel
        tempCtx.save();
        state.composition.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;
            drawBaseElement(stroke, tempCtx); // Desenha sem efeitos visuais complexos para exportação
        });
        state.composition.symbols.forEach(s => drawBaseElement(s, tempCtx));
        tempCtx.restore();

        const imgData = tempCanvas.toDataURL('image/jpeg', 0.8); // Qualidade JPG
        const link = d.createElement('a');
        link.href = imgData; // Não precisa de URL.createObjectURL para dataURL
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
        
        // Desenha todos os elementos na escala original
        tempCtx.save();
        state.composition.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;
            drawBaseElement(stroke, tempCtx);
        });
        state.composition.symbols.forEach(s => drawBaseElement(s, tempCtx));
        tempCtx.restore();

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
        const now = 0; // O tempo inicial no OfflineAudioContext é 0

        const mainOut = audioCtx.createGain();
        mainOut.connect(audioCtx.destination);

        state.composition.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;

            const xCoords = stroke.points.map(p => p.x);
            const minX = Math.min(...xCoords);
            const maxX = Math.max(...xCoords);

            const strokeStart = minX / PIXELS_PER_SECOND;
            const strokeEnd = maxX / PIXELS_PER_SECOND;

            // Ajusta o tempo do traço para o contexto de exportação
            if (strokeEnd < exportStartTime || strokeStart > exportEndTime) return;

            // Calcula o início relativo ao `exportStartTime`
            const scheduledStartTime = Math.max(0, strokeStart - exportStartTime);
            let strokeDuration = strokeEnd - strokeStart;
            if (strokeDuration <=0) strokeDuration = 0.05;

            // Recalcula freqValues se o traço começar antes ou terminar depois da seleção de exportação
            // Para garantir que a interpolação cubra apenas o trecho visível/audível
            const exportRelativeMinX = Math.max(minX, exportStartTime * PIXELS_PER_SECOND);
            const exportRelativeMaxX = Math.min(maxX, exportEndTime * PIXELS_PER_SECOND);
            const effectiveDuration = (exportRelativeMaxX - exportRelativeMinX) / PIXELS_PER_SECOND;

            const freqValues = new Float32Array(Math.ceil(effectiveDuration * 100));
            let currentPointIndex = 0;
            for (let i = 0; i < freqValues.length; i++) {
                const timeInEffectiveStroke = i / 100;
                const xPosInEffectiveStroke = exportRelativeMinX + timeInEffectiveStroke * PIXELS_PER_SECOND;

                while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInEffectiveStroke) {
                    currentPointIndex++;
                }
                const p1 = stroke.points[currentPointIndex];
                const p2 = stroke.points[currentPointIndex + 1] || p1;

                const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosInEffectiveStroke - p1.x) / (p2.x - p1.x);
                const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
                freqValues[i] = yToFrequency(interpolatedY);
            }


            const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
            const pan = xToPan(minX); 

            createTone(audioCtx, {
                element: stroke, // Passa o elemento completo
                type: stroke.timbre,
                startTime: now + scheduledStartTime,
                endTime: now + scheduledStartTime + effectiveDuration, // Usa a duração efetiva
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