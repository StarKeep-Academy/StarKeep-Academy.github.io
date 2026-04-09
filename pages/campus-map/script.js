// all campus locations — x/y are percentage positions on the map canvas
const locations = [
    {
        id: 'lh1', type: 'lecture-hall', name: 'Lecture Hall #1',
        x: 68, y: 22,
        classes: [
            { name: 'Introduction to Starkeeping', time: '09:00', enrolled: false },
            { name: 'Solar Navigation 101',        time: '11:00', enrolled: false },
            { name: 'Cosmic Ethics',               time: '14:00', enrolled: false },
        ]
    },
    {
        id: 'lh2', type: 'lecture-hall', name: 'Lecture Hall #2',
        x: 22, y: 28,
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
        x: 50, y: 20,
        classes: [
            { name: 'Earthwatcher Initiation', time: '08:00', enrolled: false },
            { name: 'Field Mission Briefing',  time: '17:00', enrolled: false },
        ]
    },
    {
        id: 'sa1', type: 'social-area', name: 'The Stargazer Lounge',
        x: 20, y: 72,
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

// ===== Zone config — position and size of each SVG overlay (all values are % of map canvas) =====
const zoneConfig = {
    cloud:    { x: 59.6, y: 42.3, width: 36.2, height: 50.4 }, // bottom-right area
    mountain: { x: 26.9, y: 0,    width: 47.5, height: 37.4 }, // top-center area
    ocean:    { x: 59.8, y: 10.7, width: 36.3, height: 40.6 }, // top-right area
    soul:     { x: 0.7,  y: 43.4, width: 41.9, height: 42.4 }, // left area
    sun:      { x: 27.8, y: 60.4, width: 44.3, height: 37.8 }, // bottom-center area
    unity:    { x: 31,   y: 21.2, width: 38,   height: 45.8 }, // center area
    world:    { x: 3.6,  y: 12.1, width: 37,   height: 37.2 }, // top-left area
};

// reads each zone's config and applies it as inline CSS — this is what actually moves and sizes the SVGs on screen
document.querySelectorAll('.map-zone').forEach(zone => {
    const key = zone.src.match(/campusmap_(\w+)\.svg/)?.[1]; // extract the zone name from the svg filename e.g. "cloud" from "campusmap_cloud.svg"
    const cfg = zoneConfig[key]; // look up that zone's config object
    if (!cfg) return; // skip if no config found for this zone
    zone.style.left   = cfg.x      + '%'; // horizontal position from the left edge of the map
    zone.style.top    = cfg.y      + '%'; // vertical position from the top edge of the map
    zone.style.width  = cfg.width  + '%'; // width as a percentage of the map width
    zone.style.height = cfg.height + '%'; // height as a percentage of the map height
});

// ===== Zone hover — lights up the zone and shows the info box next to the cursor =====
const infobox  = document.getElementById('map-infobox'); // the floating info box element
const infoName = document.getElementById('infobox-name'); // name line inside the info box
const infoDesc = document.getElementById('infobox-desc'); // description line inside the info box

document.querySelectorAll('.map-zone').forEach(zone => {

    zone.addEventListener('mouseenter', () => {
        zone.classList.add('hovered'); // adds the hovered class which CSS transitions opacity from 0 to 1
        infoName.textContent = zone.dataset.name; // fills in the zone name from its data-name attribute in the HTML
        infoDesc.textContent = zone.dataset.info; // fills in the zone description from its data-info attribute in the HTML
        infobox.classList.add('visible'); // makes the info box appear
    });

    zone.addEventListener('mousemove', e => {
        const offset = 18; // px gap between the cursor tip and the nearest edge of the info box
        const boxW   = infobox.offsetWidth; // current rendered width of the info box
        const boxH   = infobox.offsetHeight; // current rendered height of the info box
        const left   = e.clientX + offset + boxW > window.innerWidth  ? e.clientX - offset - boxW : e.clientX + offset; // place right of cursor, flip left if it would go off-screen
        const top    = e.clientY + offset + boxH > window.innerHeight ? e.clientY - offset - boxH : e.clientY + offset; // place below cursor, flip up if it would go off-screen
        infobox.style.left = left + 'px'; // move the info box to follow the cursor horizontally
        infobox.style.top  = top  + 'px'; // move the info box to follow the cursor vertically
    });

    zone.addEventListener('mouseleave', () => {
        zone.classList.remove('hovered'); // removes hovered class — CSS transitions opacity back to 0
        infobox.classList.remove('visible'); // hides the info box
    });

});
