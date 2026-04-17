/**
 * Interactive Roof Drawing Module
 * Pure Canvas API implementation for metal roofing calculator
 */

const RoofDrawer = (function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        GRID_SIZE: 20,
        GRID_SUBDIVISIONS: 4,
        MIN_CANVAS_WIDTH: 600,
        MIN_CANVAS_HEIGHT: 400,
        SNAP_THRESHOLD: 10,
        ZOOM_MIN: 0.5,
        ZOOM_MAX: 3,
        ZOOM_STEP: 0.25,
        COLORS: {
            grid: '#e2e8f0',
            gridMajor: '#cbd5e0',
            shape: '#2c5282',
            shapeFill: 'rgba(201, 162, 39, 0.2)',
            dimension: '#4a5568',
            highlight: '#c9a227',
            selected: '#e53e3e'
        },
        SCALE_LABEL: '1 square = 10 ft'
    };

    // ============================================
    // STATE
    // ============================================
    let state = {
        canvas: null,
        ctx: null,
        container: null,
        currentShape: null,
        shapeType: 'rectangle',
        points: [],
        segments: [],
        dimensions: [],
        panOffset: { x: 0, y: 0 },
        zoom: 1,
        isDragging: false,
        isPanning: false,
        lastMouse: { x: 0, y: 0 },
        selectedSegment: null,
        showGrid: true,
        snapToGrid: true,
        scale: 1, // pixels per foot
        northAngle: 0
    };

    // Shape templates
    const SHAPE_TEMPLATES = {
        rectangle: {
            name: 'Rectangle (Gable)',
            segments: [
                { name: 'Length', key: 'length', default: 40 },
                { name: 'Width', key: 'width', default: 30 }
            ]
        },
        lshape: {
            name: 'L-Shape',
            segments: [
                { name: 'Main Length', key: 'mainLength', default: 40 },
                { name: 'Main Width', key: 'mainWidth', default: 20 },
                { name: 'Wing Length', key: 'wingLength', default: 20 },
                { name: 'Wing Width', key: 'wingWidth', default: 15 }
            ]
        },
        tshape: {
            name: 'T-Shape',
            segments: [
                { name: 'Main Length', key: 'mainLength', default: 40 },
                { name: 'Main Width', key: 'mainWidth', default: 20 },
                { name: 'Stem Length', key: 'stemLength', default: 15 },
                { name: 'Stem Width', key: 'stemWidth', default: 15 }
            ]
        },
        ushape: {
            name: 'U-Shape',
            segments: [
                { name: 'Main Length', key: 'mainLength', default: 40 },
                { name: 'Main Width', key: 'mainWidth', default: 20 },
                { name: 'Left Wing', key: 'leftWing', default: 15 },
                { name: 'Right Wing', key: 'rightWing', default: 15 },
                { name: 'Wing Width', key: 'wingWidth', default: 12 }
            ]
        },
        custom: {
            name: 'Custom Polygon',
            segments: []
        }
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    function init(containerId) {
        state.container = document.getElementById(containerId);
        if (!state.container) {
            console.error('RoofDrawer: Container not found');
            return false;
        }

        // Create canvas
        state.canvas = document.createElement('canvas');
        state.canvas.width = Math.max(CONFIG.MIN_CANVAS_WIDTH, state.container.clientWidth);
        state.canvas.height = Math.max(CONFIG.MIN_CANVAS_HEIGHT, state.container.clientHeight);
        state.canvas.style.cssText = 'width: 100%; height: 100%; cursor: crosshair; touch-action: none;';
        state.container.appendChild(state.canvas);

        state.ctx = state.canvas.getContext('2d');
        
        // Initialize default rectangle
        state.dimensions = { length: 40, width: 30 };
        state.shapeType = 'rectangle';
        
        setupEventListeners();
        loadSavedDrawing();
        render();
        
        return true;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function setupEventListeners() {
        const canvas = state.canvas;

        // Mouse events
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('wheel', handleWheel);
        canvas.addEventListener('dblclick', handleDoubleClick);

        // Touch events
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);

        // Keyboard events
        document.addEventListener('keydown', handleKeyDown);

        // Window resize
        window.addEventListener('resize', handleResize);
    }

    function handleMouseDown(e) {
        const rect = state.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - state.panOffset.x) / state.zoom;
        const y = (e.clientY - rect.top - state.panOffset.y) / state.zoom;

        if (e.button === 2 || e.shiftKey) {
            // Right click or shift+click for panning
            state.isPanning = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
        } else if (state.shapeType === 'custom') {
            // Add point for custom polygon
            const snapped = snapToGrid(x, y);
            state.points.push(snapped);
            render();
        } else {
            // Check for segment selection
            state.selectedSegment = findSegmentAtPoint(x, y);
            state.isDragging = state.selectedSegment !== null;
            state.lastMouse = { x, y };
        }

        e.preventDefault();
    }

    function handleMouseMove(e) {
        const rect = state.canvas.getBoundingClientRect();
        
        if (state.isPanning) {
            const dx = e.clientX - state.lastMouse.x;
            const dy = e.clientY - state.lastMouse.y;
            state.panOffset.x += dx;
            state.panOffset.y += dy;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            render();
        } else if (state.isDragging && state.selectedSegment !== null) {
            const x = (e.clientX - rect.left - state.panOffset.x) / state.zoom;
            const y = (e.clientY - rect.top - state.panOffset.y) / state.zoom;
            const dx = x - state.lastMouse.x;
            const dy = y - state.lastMouse.y;
            
            // Update dimension based on drag
            updateDimensionFromDrag(state.selectedSegment, dx, dy);
            state.lastMouse = { x, y };
            render();
        }

        e.preventDefault();
    }

    function handleMouseUp(e) {
        state.isPanning = false;
        state.isDragging = false;
        e.preventDefault();
    }

    function handleWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -CONFIG.ZOOM_STEP : CONFIG.ZOOM_STEP;
        const newZoom = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, state.zoom + delta));
        
        // Zoom toward mouse position
        const rect = state.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scale = newZoom / state.zoom;
        state.panOffset.x = mouseX - (mouseX - state.panOffset.x) * scale;
        state.panOffset.y = mouseY - (mouseY - state.panOffset.y) * scale;
        state.zoom = newZoom;
        
        render();
    }

    function handleDoubleClick(e) {
        if (state.shapeType === 'custom' && state.points.length >= 3) {
            // Close custom polygon
            state.points.push({ ...state.points[0] });
            calculateSegmentsFromPoints();
            render();
        }
    }

    function handleTouchStart(e) {
        if (e.touches.length === 2) {
            state.isPanning = true;
            state.lastMouse = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        }
        e.preventDefault();
    }

    function handleTouchMove(e) {
        if (state.isPanning && e.touches.length === 2) {
            const x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const dx = x - state.lastMouse.x;
            const dy = y - state.lastMouse.y;
            state.panOffset.x += dx;
            state.panOffset.y += dy;
            state.lastMouse = { x, y };
            render();
        }
        e.preventDefault();
    }

    function handleTouchEnd(e) {
        state.isPanning = false;
        e.preventDefault();
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            if (state.shapeType === 'custom') {
                state.points = [];
                render();
            }
        } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
            if (state.shapeType === 'custom' && state.points.length > 0) {
                state.points.pop();
                render();
            }
        } else if (e.key === '+') {
            state.zoom = Math.min(CONFIG.ZOOM_MAX, state.zoom + CONFIG.ZOOM_STEP);
            render();
        } else if (e.key === '-') {
            state.zoom = Math.max(CONFIG.ZOOM_MIN, state.zoom - CONFIG.ZOOM_STEP);
            render();
        }
    }

    function handleResize() {
        if (state.container) {
            state.canvas.width = Math.max(CONFIG.MIN_CANVAS_WIDTH, state.container.clientWidth);
            state.canvas.height = Math.max(CONFIG.MIN_CANVAS_HEIGHT, state.container.clientHeight);
            render();
        }
    }

    // ============================================
    // DRAWING FUNCTIONS
    // ============================================
    function render() {
        if (!state.ctx) return;

        const ctx = state.ctx;
        const canvas = state.canvas;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Save context for transforms
        ctx.save();
        ctx.translate(state.panOffset.x, state.panOffset.y);
        ctx.scale(state.zoom, state.zoom);

        // Draw grid
        if (state.showGrid) {
            drawGrid();
        }

        // Draw shape
        drawShape();

        // Draw scale and north arrow
        drawScaleIndicator();
        drawNorthArrow();

        ctx.restore();

        // Draw UI overlay (not affected by zoom/pan)
        drawOverlay();
    }

    function drawGrid() {
        const ctx = state.ctx;
        const canvas = state.canvas;
        const gridSize = CONFIG.GRID_SIZE;
        const subSize = CONFIG.GRID_SIZE / CONFIG.GRID_SUBDIVISIONS;

        // Calculate visible area
        const startX = Math.max(0, -state.panOffset.x / state.zoom);
        const startY = Math.max(0, -state.panOffset.y / state.zoom);
        const endX = (canvas.width - state.panOffset.x) / state.zoom;
        const endY = (canvas.height - state.panOffset.y) / state.zoom;

        // Subdivisions
        ctx.strokeStyle = CONFIG.COLORS.grid;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = Math.floor(startX / subSize) * subSize; x < endX; x += subSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = Math.floor(startY / subSize) * subSize; y < endY; y += subSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();

        // Major grid lines
        ctx.strokeStyle = CONFIG.COLORS.gridMajor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }

    function drawShape() {
        const ctx = state.ctx;

        if (state.shapeType === 'custom' && state.points.length > 0) {
            // Draw custom polygon
            ctx.beginPath();
            ctx.moveTo(state.points[0].x, state.points[0].y);
            for (let i = 1; i < state.points.length; i++) {
                ctx.lineTo(state.points[i].x, state.points[i].y);
            }
            if (state.points.length >= 3) {
                ctx.closePath();
            }
            
            ctx.fillStyle = CONFIG.COLORS.shapeFill;
            ctx.fill();
            ctx.strokeStyle = CONFIG.COLORS.shape;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw points
            state.points.forEach((point, i) => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = i === state.points.length - 1 ? CONFIG.COLORS.highlight : CONFIG.COLORS.shape;
                ctx.fill();
            });

            // Draw dimensions
            drawPolygonDimensions();
        } else {
            // Draw template shape
            const shape = getShapePoints();
            if (shape.length > 0) {
                ctx.beginPath();
                ctx.moveTo(shape[0].x, shape[0].y);
                for (let i = 1; i < shape.length; i++) {
                    ctx.lineTo(shape[i].x, shape[i].y);
                }
                ctx.closePath();

                ctx.fillStyle = CONFIG.COLORS.shapeFill;
                ctx.fill();
                ctx.strokeStyle = CONFIG.COLORS.shape;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw dimensions
                drawTemplateDimensions(shape);
            }
        }
    }

    function getShapePoints() {
        const dim = state.dimensions;
        const scale = state.scale;
        const centerX = 0;
        const centerY = 0;

        switch (state.shapeType) {
            case 'rectangle':
                return [
                    { x: centerX - dim.length * scale / 2, y: centerY - dim.width * scale / 2 },
                    { x: centerX + dim.length * scale / 2, y: centerY - dim.width * scale / 2 },
                    { x: centerX + dim.length * scale / 2, y: centerY + dim.width * scale / 2 },
                    { x: centerX - dim.length * scale / 2, y: centerY + dim.width * scale / 2 }
                ];

            case 'lshape':
                const lScale = scale;
                return [
                    { x: centerX, y: centerY - dim.mainWidth * lScale / 2 },
                    { x: centerX + dim.mainLength * lScale, y: centerY - dim.mainWidth * lScale / 2 },
                    { x: centerX + dim.mainLength * lScale, y: centerY + dim.mainWidth * lScale / 2 },
                    { x: centerX + (dim.mainLength - dim.wingLength) * lScale, y: centerY + dim.mainWidth * lScale / 2 },
                    { x: centerX + (dim.mainLength - dim.wingLength) * lScale, y: centerY + (dim.mainWidth + dim.wingWidth) * lScale / 2 },
                    { x: centerX, y: centerY + (dim.mainWidth + dim.wingWidth) * lScale / 2 }
                ];

            case 'tshape':
                const tScale = scale;
                return [
                    { x: centerX - dim.mainLength * tScale / 2, y: centerY },
                    { x: centerX + dim.mainLength * tScale / 2, y: centerY },
                    { x: centerX + dim.mainLength * tScale / 2, y: centerY + dim.mainWidth * tScale },
                    { x: centerX + dim.stemWidth * tScale / 2, y: centerY + dim.mainWidth * tScale },
                    { x: centerX + dim.stemWidth * tScale / 2, y: centerY + (dim.mainWidth + dim.stemLength) * tScale },
                    { x: centerX - dim.stemWidth * tScale / 2, y: centerY + (dim.mainWidth + dim.stemLength) * tScale },
                    { x: centerX - dim.stemWidth * tScale / 2, y: centerY + dim.mainWidth * tScale },
                    { x: centerX - dim.mainLength * tScale / 2, y: centerY + dim.mainWidth * tScale }
                ];

            case 'ushape':
                const uScale = scale;
                return [
                    { x: centerX - dim.mainLength * uScale / 2, y: centerY },
                    { x: centerX + dim.mainLength * uScale / 2, y: centerY },
                    { x: centerX + dim.mainLength * uScale / 2, y: centerY + dim.mainWidth * uScale },
                    { x: centerX + (dim.mainLength - dim.rightWing) * uScale / 2, y: centerY + dim.mainWidth * uScale },
                    { x: centerX + (dim.mainLength - dim.rightWing) * uScale / 2, y: centerY + (dim.mainWidth + dim.wingWidth) * uScale },
                    { x: centerX + dim.mainLength * uScale / 2 - dim.rightWing * uScale, y: centerY + (dim.mainWidth + dim.wingWidth) * uScale },
                    { x: centerX + dim.mainLength * uScale / 2 - dim.rightWing * uScale, y: centerY },
                    { x: centerX - dim.mainLength * uScale / 2 + dim.leftWing * uScale, y: centerY },
                    { x: centerX - dim.mainLength * uScale / 2 + dim.leftWing * uScale, y: centerY + (dim.mainWidth + dim.wingWidth) * uScale },
                    { x: centerX - dim.mainLength * uScale / 2, y: centerY + (dim.mainWidth + dim.wingWidth) * uScale },
                    { x: centerX - dim.mainLength * uScale / 2, y: centerY + dim.mainWidth * uScale },
                    { x: centerX - (dim.mainLength - dim.leftWing) * uScale / 2, y: centerY + dim.mainWidth * uScale }
                ];

            default:
                return [];
        }
    }

    function drawTemplateDimensions(shape) {
        const ctx = state.ctx;
        ctx.strokeStyle = CONFIG.COLORS.dimension;
        ctx.fillStyle = CONFIG.COLORS.dimension;
        ctx.font = '12px Inter, sans-serif';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        // Draw dimension lines for each segment
        for (let i = 0; i < shape.length; i++) {
            const p1 = shape[i];
            const p2 = shape[(i + 1) % shape.length];
            
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const offset = 15;
            
            // Calculate perpendicular offset
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;

            // Draw dimension line
            ctx.beginPath();
            ctx.moveTo(midX - nx * 5, midY - ny * 5);
            ctx.lineTo(midX + nx * offset, midY + ny * offset);
            ctx.stroke();

            // Draw label
            ctx.setLineDash([]);
            const feet = len / state.scale;
            ctx.fillText(`${feet.toFixed(1)}'`, midX + nx * (offset + 10), midY + ny * (offset + 10));
        }
    }

    function drawPolygonDimensions() {
        const ctx = state.ctx;
        ctx.strokeStyle = CONFIG.COLORS.dimension;
        ctx.fillStyle = CONFIG.COLORS.dimension;
        ctx.font = '12px Inter, sans-serif';
        ctx.lineWidth = 1;

        for (let i = 0; i < state.points.length - 1; i++) {
            const p1 = state.points[i];
            const p2 = state.points[i + 1];
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const feet = len / state.scale;

            ctx.fillText(`${feet.toFixed(1)}'`, midX + 10, midY + 10);
        }
    }

    function drawScaleIndicator() {
        const ctx = state.ctx;
        const scalePx = 10 * state.scale * state.zoom; // 10 feet in pixels
        
        ctx.strokeStyle = CONFIG.COLORS.dimension;
        ctx.fillStyle = CONFIG.COLORS.dimension;
        ctx.font = '11px Inter, sans-serif';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        const x = 20;
        const y = state.canvas.height - 30;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + scalePx, y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.moveTo(x + scalePx, y - 5);
        ctx.lineTo(x + scalePx, y + 5);
        ctx.stroke();

        ctx.fillText('10 ft', x + scalePx / 2 - 15, y + 20);
    }

    function drawNorthArrow() {
        const ctx = state.ctx;
        const size = 40;
        const x = state.canvas.width - 50;
        const y = 50;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-state.northAngle * Math.PI / 180);

        ctx.fillStyle = CONFIG.COLORS.dimension;
        ctx.beginPath();
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(-size / 4, size / 4);
        ctx.lineTo(0, size / 6);
        ctx.lineTo(size / 4, size / 4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, -size / 2 + 5);
        ctx.lineTo(-size / 8, size / 8);
        ctx.lineTo(0, size / 8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = CONFIG.COLORS.dimension;
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('N', 0, size / 2 + 12);

        ctx.restore();
    }

    function drawOverlay() {
        // Draw zoom level indicator
        const ctx = state.ctx;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Zoom: ${(state.zoom * 100).toFixed(0)}%`, 20, 20);
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function snapToGrid(x, y) {
        if (!state.snapToGrid) return { x, y };
        
        const gridSize = CONFIG.GRID_SIZE * state.scale;
        return {
            x: Math.round(x / gridSize) * gridSize,
            y: Math.round(y / gridSize) * gridSize
        };
    }

    function findSegmentAtPoint(x, y) {
        // For template shapes, find closest dimension
        return null; // Simplified for now
    }

    function updateDimensionFromDrag(segment, dx, dy) {
        const scale = state.scale;
        const delta = Math.sqrt(dx * dx + dy * dy) / scale;

        // Update dimension based on segment type
        if (state.dimensions[segment] !== undefined) {
            state.dimensions[segment] = Math.max(1, state.dimensions[segment] + delta * 0.1);
            syncWithCalculator();
        }
    }

    function calculateSegmentsFromPoints() {
        state.segments = [];
        for (let i = 0; i < state.points.length - 1; i++) {
            const p1 = state.points[i];
            const p2 = state.points[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy) / state.scale;
            state.segments.push({
                length: length,
                angle: Math.atan2(dy, dx) * 180 / Math.PI
            });
        }
    }

    // ============================================
    // CALCULATIONS
    // ============================================
    function calculateArea() {
        if (state.shapeType === 'custom' && state.points.length >= 3) {
            // Shoelace formula
            let area = 0;
            for (let i = 0; i < state.points.length - 1; i++) {
                area += state.points[i].x * state.points[i + 1].y;
                area -= state.points[i + 1].x * state.points[i].y;
            }
            return Math.abs(area) / (state.scale * state.scale);
        }

        // Template calculations
        const dim = state.dimensions;
        switch (state.shapeType) {
            case 'rectangle':
                return dim.length * dim.width;
            case 'lshape':
                return dim.mainLength * dim.mainWidth + dim.wingLength * dim.wingWidth;
            case 'tshape':
                return dim.mainLength * dim.mainWidth + dim.stemLength * dim.stemWidth;
            case 'ushape':
                return dim.mainLength * dim.mainWidth + dim.leftWing * dim.wingWidth + dim.rightWing * dim.wingWidth;
            default:
                return 0;
        }
    }

    function calculatePerimeter() {
        if (state.shapeType === 'custom' && state.segments.length > 0) {
            return state.segments.reduce((sum, seg) => sum + seg.length, 0);
        }

        const dim = state.dimensions;
        switch (state.shapeType) {
            case 'rectangle':
                return 2 * (dim.length + dim.width);
            case 'lshape':
                return 2 * (dim.mainLength + dim.mainWidth + dim.wingLength + dim.wingWidth);
            case 'tshape':
                return 2 * (dim.mainLength + dim.mainWidth + dim.stemLength + dim.stemWidth);
            case 'ushape':
                return 2 * (dim.mainLength + dim.mainWidth + dim.leftWing + dim.rightWing + dim.wingWidth);
            default:
                return 0;
        }
    }

    function calculateRidgeLength() {
        const dim = state.dimensions;
        switch (state.shapeType) {
            case 'rectangle':
                return dim.length;
            case 'lshape':
                return dim.mainLength + dim.wingLength;
            case 'tshape':
                return dim.mainLength + dim.stemLength;
            case 'ushape':
                return dim.mainLength;
            default:
                return dim.length || 0;
        }
    }

    function calculateGableTrim() {
        // Gable trim = ridge length
        return calculateRidgeLength();
    }

    function syncWithCalculator() {
        // Dispatch event to update main calculator
        const area = calculateArea();
        const perimeter = calculatePerimeter();
        const ridgeLength = calculateRidgeLength();
        const gableTrim = calculateGableTrim();

        const event = new CustomEvent('roofDrawingUpdate', {
            detail: {
                area: area,
                perimeter: perimeter,
                ridgeLength: ridgeLength,
                gableTrim: gableTrim,
                dimensions: { ...state.dimensions }
            }
        });
        window.dispatchEvent(event);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        init,
        render,
        
        setShapeType(type) {
            state.shapeType = type;
            state.points = [];
            state.segments = [];
            
            // Initialize default dimensions
            const template = SHAPE_TEMPLATES[type];
            if (template && template.segments) {
                template.segments.forEach(seg => {
                    if (state.dimensions[seg.key] === undefined) {
                        state.dimensions[seg.key] = seg.default;
                    }
                });
            }
            
            render();
            syncWithCalculator();
        },

        setDimension(key, value) {
            state.dimensions[key] = parseFloat(value) || 0;
            render();
            syncWithCalculator();
        },

        getCalculations() {
            return {
                area: calculateArea(),
                perimeter: calculatePerimeter(),
                ridgeLength: calculateRidgeLength(),
                gableTrim: calculateGableTrim(),
                dimensions: { ...state.dimensions }
            };
        },

        clear() {
            state.points = [];
            state.segments = [];
            state.dimensions = { length: 40, width: 30 };
            state.shapeType = 'rectangle';
            render();
            syncWithCalculator();
        },

        pan(dx, dy) {
            state.panOffset.x += dx;
            state.panOffset.y += dy;
            render();
        },

        zoom(delta) {
            state.zoom = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, state.zoom + delta));
            render();
        },

        resetView() {
            state.panOffset = { x: 0, y: 0 };
            state.zoom = 1;
            render();
        },

        toggleGrid() {
            state.showGrid = !state.showGrid;
            render();
        },

        toggleSnap() {
            state.snapToGrid = !state.snapToGrid;
        },

        setScale(feetPerPixel) {
            state.scale = feetPerPixel;
            render();
        },

        rotateNorth(angle) {
            state.northAngle = angle;
            render();
        },

        exportPNG() {
            const link = document.createElement('a');
            link.download = 'roof-drawing.png';
            link.href = state.canvas.toDataURL('image/png');
            link.click();
        },

        saveDrawing() {
            const data = {
                shapeType: state.shapeType,
                dimensions: state.dimensions,
                points: state.points,
                segments: state.segments,
                panOffset: state.panOffset,
                zoom: state.zoom,
                northAngle: state.northAngle
            };
            localStorage.setItem('roofDrawing', JSON.stringify(data));
        },

        loadSavedDrawing() {
            const saved = localStorage.getItem('roofDrawing');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    state.shapeType = data.shapeType || 'rectangle';
                    state.dimensions = data.dimensions || { length: 40, width: 30 };
                    state.points = data.points || [];
                    state.segments = data.segments || [];
                    state.panOffset = data.panOffset || { x: 0, y: 0 };
                    state.zoom = data.zoom || 1;
                    state.northAngle = data.northAngle || 0;
                    render();
                    syncWithCalculator();
                } catch (e) {
                    console.error('Failed to load saved drawing:', e);
                }
            }
        },

        getShapeTemplates() {
            return SHAPE_TEMPLATES;
        }
    };
})();
