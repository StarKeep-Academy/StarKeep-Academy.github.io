
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
            { name: 'XR Prototyping',       time: '10:00', enrolled: false },
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
            { name: 'Open Mic Night',  time: '19:00', enrolled: false },
            { name: 'Community Forum', time: '12:00', enrolled: false },
        ]
    },
];

const mapCanvas     = document.getElementById('map-canvas');
const schedulePanel = document.getElementById('schedule-panel');
const scheduleTitle = document.getElementById('schedule-location');
const scheduleList  = document.getElementById('schedule-list');
const closeBtn      = document.getElementById('schedule-close');
const legendBtns    = document.querySelectorAll('.legend-btn');

let activeType   = null;
let selectedNode = null;

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

const mapNodes = mapCanvas.querySelectorAll('.map-node');

legendBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const toggling = activeType === btn.dataset.type;
        legendBtns.forEach(b => b.classList.remove('active'));
        activeType = toggling ? null : btn.dataset.type;
        if (!toggling) btn.classList.add('active');
        filterNodes(activeType);
        closeSchedulePanel();
    });
});

function filterNodes(type) {
    mapNodes.forEach(node => {
        node.classList.toggle('visible', !!type && node.dataset.type === type);
    });
}

function createScheduleItem(cls) {
    const li      = document.createElement('li');
    const nameEl  = document.createElement('span');
    const timeEl  = document.createElement('span');
    const enrollBtn = document.createElement('button');

    li.className        = 'schedule-item';
    nameEl.className    = 'schedule-item-name';
    nameEl.textContent  = cls.name;
    timeEl.className    = 'schedule-item-time';
    timeEl.textContent  = cls.time;
    enrollBtn.className = 'enroll-btn';
    enrollBtn.classList.toggle('enrolled', cls.enrolled);
    enrollBtn.textContent = cls.enrolled ? 'Enrolled' : 'Enroll';

    if (!cls.enrolled) {
        enrollBtn.addEventListener('click', () => {
            cls.enrolled = true;
            enrollBtn.textContent = 'Enrolled';
            enrollBtn.classList.add('enrolled');
        }, { once: true });
    }

    li.append(nameEl, timeEl, enrollBtn);
    return li;
}

function openSchedule(loc, node) {
    if (selectedNode) selectedNode.classList.remove('selected');
    selectedNode = node;
    node.classList.add('selected');

    scheduleTitle.textContent = loc.name;
    scheduleList.innerHTML = '';
    loc.classes.forEach(cls => scheduleList.appendChild(createScheduleItem(cls)));
    schedulePanel.hidden = false;
}

function closeSchedulePanel() {
    schedulePanel.hidden = true;
    if (selectedNode) selectedNode.classList.remove('selected');
    selectedNode = null;
}

closeBtn.addEventListener('click', closeSchedulePanel);
