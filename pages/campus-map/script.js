// all campus locations — x/y are percentage positions on the map canvas
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

const mapCanvas     = document.getElementById('map-canvas'); // the div the map image and nodes live inside
const schedulePanel = document.getElementById('schedule-panel'); // the side panel that shows a location's classes
const scheduleTitle = document.getElementById('schedule-location'); // h2 inside the panel showing the location name
const scheduleList  = document.getElementById('schedule-list'); // ul inside the panel where class rows are injected
const closeBtn      = document.getElementById('schedule-close'); // the × button that closes the panel
const legendBtns    = document.querySelectorAll('.legend-btn'); // the four filter buttons in the legend sidebar

let activeType   = null; // which location type is currently filtered (null = none active)
let selectedNode = null; // which node dot is currently selected (null = none)

// create a dot node for every location and inject it into the map
locations.forEach(loc => {
    const node = document.createElement('div'); // the dot element
    node.className = 'map-node';
    node.dataset.id   = loc.id; // used to identify the node later
    node.dataset.type = loc.type; // used by the legend filter to show/hide by category
    node.style.left = `${loc.x}%`; // horizontal position as % of map width
    node.style.top  = `${loc.y}%`; // vertical position as % of map height

    const tooltip = document.createElement('span'); // small label that appears above the dot on hover
    tooltip.className   = 'node-tooltip';
    tooltip.textContent = loc.name;
    node.appendChild(tooltip);

    node.addEventListener('click', () => openSchedule(loc, node)); // clicking a dot opens the schedule panel
    mapCanvas.appendChild(node);
});

const mapNodes = mapCanvas.querySelectorAll('.map-node'); // all dot nodes now in the DOM

// legend button click — toggles filtering by location type
legendBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const toggling = activeType === btn.dataset.type; // true if clicking the already-active button (deselect)
        legendBtns.forEach(b => b.classList.remove('active')); // clear all active states
        activeType = toggling ? null : btn.dataset.type; // deselect if already active, otherwise select this type
        if (!toggling) btn.classList.add('active'); // highlight the clicked button
        filterNodes(activeType); // show only matching nodes
        closeSchedulePanel(); // close the panel since the selection changed
    });
});

// shows only nodes whose type matches — hides all others
function filterNodes(type) {
    mapNodes.forEach(node => {
        node.classList.toggle('visible', !!type && node.dataset.type === type);
    });
}

// builds a single class row (name + time + enroll button) for the schedule list
function createScheduleItem(cls) {
    const li        = document.createElement('li');
    const nameEl    = document.createElement('span');
    const timeEl    = document.createElement('span');
    const enrollBtn = document.createElement('button');

    li.className        = 'schedule-item';
    nameEl.className    = 'schedule-item-name';
    nameEl.textContent  = cls.name;
    timeEl.className    = 'schedule-item-time';
    timeEl.textContent  = cls.time;
    enrollBtn.className = 'enroll-btn';
    enrollBtn.classList.toggle('enrolled', cls.enrolled); // pre-fill enrolled state if already set
    enrollBtn.textContent = cls.enrolled ? 'Enrolled' : 'Enroll';

    if (!cls.enrolled) {
        enrollBtn.addEventListener('click', () => {
            cls.enrolled = true; // saves state so it persists if the panel is reopened
            enrollBtn.textContent = 'Enrolled';
            enrollBtn.classList.add('enrolled');
        }, { once: true }); // once:true means this listener fires only once and removes itself
    }

    li.append(nameEl, timeEl, enrollBtn);
    return li;
}

// opens the schedule panel for a given location and marks its dot as selected
function openSchedule(loc, node) {
    if (selectedNode) selectedNode.classList.remove('selected'); // deselect the previous node
    selectedNode = node;
    node.classList.add('selected');

    scheduleTitle.textContent = loc.name; // set the panel heading
    scheduleList.innerHTML = ''; // clear previous classes
    loc.classes.forEach(cls => scheduleList.appendChild(createScheduleItem(cls))); // rebuild the list
    schedulePanel.hidden = false; // make the panel visible
}

// hides the schedule panel and deselects the active node
function closeSchedulePanel() {
    schedulePanel.hidden = true;
    if (selectedNode) selectedNode.classList.remove('selected');
    selectedNode = null;
}

closeBtn.addEventListener('click', closeSchedulePanel); // × button closes the panel

// ===== Zone hover — info box follows the cursor =====
const infobox  = document.getElementById('map-infobox'); // the floating info box element
const infoName = document.getElementById('infobox-name'); // name line inside the info box
const infoDesc = document.getElementById('infobox-desc'); // description line inside the info box

document.querySelectorAll('.map-zone').forEach(zone => {
    zone.addEventListener('mouseenter', () => {
        infoName.textContent = zone.dataset.name; // fill in the zone name from the data attribute
        infoDesc.textContent = zone.dataset.info; // fill in the zone description from the data attribute
        infobox.classList.add('visible'); // show the info box
    });

    zone.addEventListener('mousemove', e => {
        const offset = 18; // gap between the cursor tip and the info box edge
        const boxW   = infobox.offsetWidth;
        const boxH   = infobox.offsetHeight;
        const left   = e.clientX + offset + boxW > window.innerWidth  ? e.clientX - offset - boxW : e.clientX + offset; // flip left if too close to right edge
        const top    = e.clientY + offset + boxH > window.innerHeight ? e.clientY - offset - boxH : e.clientY + offset; // flip up if too close to bottom edge
        infobox.style.left = left + 'px';
        infobox.style.top  = top  + 'px';
    });

    zone.addEventListener('mouseleave', () => {
        infobox.classList.remove('visible'); // hide the info box when the cursor leaves the zone
    });
});
