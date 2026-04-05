// Campus Map — script.js
// Manages legend filters, node rendering, and the class schedule panel.

// ─── Data ────────────────────────────────────────────────────────────────────
// x/y are percentages within the grey map box.
// enrolled tracks state per-class between panel opens.

const locations = [
    {
        id: 'lh1', type: 'lecture-hall', name: 'Lecture Hall #1',
        x: 22, y: 28,
        classes: [
            { name: 'Introduction to Starkeeping', time: '09:00', enrolled: false },
            { name: 'Solar Navigation 101',        time: '11:00', enrolled: false },
            { name: 'Cosmic Ethics',               time: '14:00', enrolled: false },
        ]
    },
    {
        id: 'lh2', type: 'lecture-hall', name: 'Lecture Hall #2',
        x: 68, y: 22,
        classes: [
            { name: 'Underwater Basket Weaving', time: '13:30', enrolled: false },
            { name: 'Gravity Manipulation 101',  time: '13:30', enrolled: false },
            { name: 'Dreamwalking',              time: '20:00', enrolled: false },
        ]
    },
    {
        id: 'lh3', type: 'lecture-hall', name: 'Lecture Hall #3',
        x: 45, y: 62,
        classes: [
            { name: 'World History: Galactic Arc', time: '10:00', enrolled: false },
            { name: 'Narrative Alchemy',           time: '15:30', enrolled: false },
        ]
    },
    {
        id: 'ws1', type: 'workshop', name: 'Workshop Alpha',
        x: 28, y: 68,
        classes: [
            { name: 'XR Prototyping',      time: '10:00', enrolled: false },
            { name: 'Avatar Design Studio', time: '13:00', enrolled: false },
        ]
    },
    {
        id: 'ws2', type: 'workshop', name: 'Workshop Beta',
        x: 72, y: 58,
        classes: [
            { name: 'Solarpunk Engineering', time: '09:30', enrolled: false },
            { name: 'Biome Restoration Lab', time: '14:00', enrolled: false },
        ]
    },
    {
        id: 'gh1', type: 'guild-house', name: 'Guild House: Earthwatcher',
        x: 15, y: 50,
        classes: [
            { name: 'Earthwatcher Initiation', time: '08:00', enrolled: false },
            { name: 'Field Mission Briefing',  time: '17:00', enrolled: false },
        ]
    },
    {
        id: 'sa1', type: 'social-area', name: 'The Stargazer Lounge',
        x: 80, y: 72,
        classes: [
            { name: 'Open Mic Night',   time: '19:00', enrolled: false },
            { name: 'Community Forum',  time: '12:00', enrolled: false },
        ]
    },
];

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const mapCanvas      = document.getElementById('map-canvas');
const schedulePanel  = document.getElementById('schedule-panel');
const scheduleTitle  = document.getElementById('schedule-location');
const scheduleList   = document.getElementById('schedule-list');
const closeBtn       = document.getElementById('schedule-close');
const legendBtns     = document.querySelectorAll('.legend-btn');

let activeType       = null;  // currently selected legend filter
let selectedNodeId   = null;  // currently open node

// ─── Build nodes ──────────────────────────────────────────────────────────────
locations.forEach(loc => {
    const node = document.createElement('div');
    node.className = 'map-node';
    node.dataset.id = loc.id;
    node.dataset.type = loc.type;
    node.style.left = `${loc.x}%`;
    node.style.top  = `${loc.y}%`;

    const tooltip = document.createElement('span');
    tooltip.className = 'node-tooltip';
    tooltip.textContent = loc.name;
    node.appendChild(tooltip);

    node.addEventListener('click', () => openSchedule(loc, node));
    mapCanvas.appendChild(node);
});

// ─── Legend filter ────────────────────────────────────────────────────────────
legendBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;

        // Toggle off if already active
        if (activeType === type) {
            activeType = null;
            btn.classList.remove('active');
            hideAllNodes();
            closeSchedulePanel();
            return;
        }

        // Switch to new type
        activeType = type;
        legendBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showNodesOfType(type);
        closeSchedulePanel();
    });
});

function showNodesOfType(type) {
    document.querySelectorAll('.map-node').forEach(node => {
        node.classList.toggle('visible', node.dataset.type === type);
    });
}

function hideAllNodes() {
    document.querySelectorAll('.map-node').forEach(n => n.classList.remove('visible'));
}

// ─── Schedule panel ───────────────────────────────────────────────────────────
function openSchedule(loc, node) {
    // Deselect previous node
    document.querySelectorAll('.map-node.selected').forEach(n => n.classList.remove('selected'));
    node.classList.add('selected');
    selectedNodeId = loc.id;

    scheduleTitle.textContent = loc.name;
    scheduleList.innerHTML = '';

    loc.classes.forEach((cls, i) => {
        const li = document.createElement('li');
        li.className = 'schedule-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'schedule-item-name';
        nameEl.textContent = cls.name;

        const timeEl = document.createElement('span');
        timeEl.className = 'schedule-item-time';
        timeEl.textContent = cls.time;

        const enrollBtn = document.createElement('button');
        enrollBtn.className = 'enroll-btn' + (cls.enrolled ? ' enrolled' : '');
        enrollBtn.textContent = cls.enrolled ? 'Enrolled' : 'Enroll';

        if (!cls.enrolled) {
            enrollBtn.addEventListener('click', function handler() {
                cls.enrolled = true;
                enrollBtn.textContent = 'Enrolled';
                enrollBtn.classList.add('enrolled');
                enrollBtn.removeEventListener('click', handler);
            });
        }

        li.appendChild(nameEl);
        li.appendChild(timeEl);
        li.appendChild(enrollBtn);
        scheduleList.appendChild(li);
    });

    schedulePanel.hidden = false;
}

function closeSchedulePanel() {
    schedulePanel.hidden = true;
    selectedNodeId = null;
    document.querySelectorAll('.map-node.selected').forEach(n => n.classList.remove('selected'));
}

closeBtn.addEventListener('click', closeSchedulePanel);
