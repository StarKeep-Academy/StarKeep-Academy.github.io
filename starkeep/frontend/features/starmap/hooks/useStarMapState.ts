/**
 * features/starmap/hooks/useStarMapState.ts
 *
 * All Star Map state and logic.
 * Canvas, panel, and screen components read from this hook only.
 */

import { useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StarStatus = 'pending' | 'active' | 'submitted' | 'approved';

export interface Planet {
  id:      string;
  label:   string;
  done:    boolean;
  order:   number;
}

export interface StarNode {
  id:             string;
  title:          string;
  desc:           string;
  status:         StarStatus;
  lux?:           number;
  completedDate?: string;
  planets:        Planet[];
  evidence:       { label: string }[];
}

export interface Constellation {
  name: string;
}

export interface ConstSuggestion {
  name: string;
  hint: string;
}

// ─── Static seed data ─────────────────────────────────────────────────────────

export const GOALS = [
  'Create a gamified sustainability app',
  'Build a community farming robot',
  'Design a regenerative city blueprint',
  'Launch an open-source education platform',
  'Build a mental health support network',
];

export const CONST_SUGGESTIONS: ConstSuggestion[] = [
  { name: 'DIGITAL FOUNDATION', hint: 'Skills & tools to build your vision' },
  { name: 'COMMUNITY LAUNCH',   hint: 'Connecting with your first people' },
  { name: 'IMPACT SYSTEMS',     hint: 'Measuring and scaling your impact' },
  { name: 'FINANCIAL ORBIT',    hint: 'Funding and sustainability strategy' },
];

export const INITIAL_STARS: StarNode[] = [
  {
    id: 's1', title: 'LEARN REACT NATIVE',
    desc: 'Complete Expo fundamentals and build your first cross-platform component.',
    status: 'approved', lux: 14, completedDate: 'Mar 12, 2026',
    planets: [
      { id: 'p1', label: 'Set up Expo environment',    done: true,  order: 1 },
      { id: 'p2', label: 'Complete components module', done: true,  order: 2 },
      { id: 'p3', label: 'Build nav prototype',        done: true,  order: 3 },
    ],
    evidence: [{ label: 'Course certificate.pdf' }],
  },
  {
    id: 's2', title: 'DEFINE CORE USER FLOW',
    desc: 'Map the complete onboarding journey. Validate with 5 target users.',
    status: 'submitted',
    planets: [
      { id: 'p4', label: 'Draft user journey map', done: true,  order: 1 },
      { id: 'p5', label: 'Conduct 5 interviews',   done: true,  order: 2 },
      { id: 'p6', label: 'Synthesize into spec',   done: false, order: 3 },
    ],
    evidence: [{ label: 'User research notes.md' }],
  },
  {
    id: 's3', title: 'BUILD MVP PROTOTYPE',
    desc: 'Clickable prototype of star map and avatar screens. Ready for usability testing.',
    status: 'active',
    planets: [
      { id: 'p7',  label: 'Wireframe 5 screens',   done: true,  order: 1 },
      { id: 'p8',  label: 'Design system tokens',  done: false, order: 2 },
      { id: 'p9',  label: 'Build prototype',       done: false, order: 3 },
      { id: 'p10', label: 'Run 3 usability tests', done: false, order: 4 },
    ],
    evidence: [],
  },
  {
    id: 's4', title: 'FIRST PILOT COHORT',
    desc: 'Recruit 10 beta users. Run 2-week pilot and document learnings.',
    status: 'pending', planets: [], evidence: [],
  },
  {
    id: 's5', title: 'IMPACT METRICS',
    desc: 'Design a system for tracking measurable real-world impact.',
    status: 'pending',
    planets: [
      { id: 'p11', label: 'Research existing frameworks', done: false, order: 1 },
      { id: 'p12', label: 'Design LVM scoring rubric',    done: false, order: 2 },
    ],
    evidence: [],
  },
];

/**
 * Dynamic constellation position.
 * Ring 0 (i=0..5) : r=190, angles at 60° steps from -90°
 * Ring 1 (i=6..11): r=360, staggered 30° so they fill ring-0 gaps
 * Ring N           : r = 190 + N*170, stagger = (N%2)*30°
 */
export function getConstPosition(i: number): { angle: number; r: number } {
  const RING_SIZE = 6;
  const ring      = Math.floor(i / RING_SIZE);
  const posInRing = i % RING_SIZE;
  const stagger   = (ring % 2) * 30;
  const angle     = -90 + stagger + posInRing * 60;
  const r         = 190 + ring * 170;
  return { angle, r };
}

// Star (x,y) offsets relative to constellation center — 4 shape templates that cycle
export const STAR_OFFSETS = [
  [{ x:-72,y:-78 }, { x:  4,y:-102 }, { x:82,y:-68 }, { x:56,y:  6 }, { x:-30,y: 24 }],
  [{ x:-60,y:-66 }, { x: 24,y: -90 }, { x:78,y:-38 }, { x:38,y: 32 }, { x:-46,y: 12 }],
  [{ x:-82,y:-56 }, { x: -2,y: -94 }, { x:70,y:-60 }, { x:46,y: 20 }, { x:-28,y: 40 }],
  [{ x:-62,y:-72 }, { x: 18,y: -84 }, { x:72,y:-40 }, { x:30,y: 26 }, { x:-50,y:  6 }],
];

export const MAX_STARS_PER_CONST = STAR_OFFSETS[0].length; // 5

// Per-constellation mock stars — distinct IDs and themes, one set per AI suggestion
const MOCK_STARS_BY_CONST: StarNode[][] = [
  // 0 — DIGITAL FOUNDATION (from INITIAL_STARS)
  INITIAL_STARS.slice(0, 5),

  // 1 — COMMUNITY LAUNCH
  [
    { id:'cl1', title:'MAP THE COMMUNITY',    desc:'Research and document your target community and their needs.',       status:'approved', lux:8,  completedDate:'Apr 2, 2026',
      planets:[{id:'clp1',label:'Define audience persona',done:true,order:1},{id:'clp2',label:'Survey 20 people',done:true,order:2}], evidence:[{label:'Community report.pdf'}] },
    { id:'cl2', title:'BUILD ONLINE PRESENCE', desc:'Create a landing page and social accounts for your project.',       status:'submitted',
      planets:[{id:'clp3',label:'Design landing page',done:true,order:1},{id:'clp4',label:'Launch social media',done:false,order:2}], evidence:[{label:'Page screenshot.png'}] },
    { id:'cl3', title:'HOST FIRST EVENT',      desc:'Run your first community meetup — online or in person.',            status:'active',
      planets:[{id:'clp5',label:'Pick format and date',done:true,order:1},{id:'clp6',label:'Promote the event',done:false,order:2},{id:'clp7',label:'Run the event',done:false,order:3}], evidence:[] },
    { id:'cl4', title:'GROW TO 100 MEMBERS',   desc:'Reach your first 100 active community members.',                   status:'pending', planets:[], evidence:[] },
  ],

  // 2 — IMPACT SYSTEMS
  [
    { id:'is1', title:'DEFINE IMPACT METRICS', desc:'Establish measurable KPIs that prove real-world change.',           status:'approved', lux:10, completedDate:'Apr 15, 2026',
      planets:[{id:'isp1',label:'Research impact frameworks',done:true,order:1},{id:'isp2',label:'Pick 3 core KPIs',done:true,order:2}], evidence:[{label:'KPI doc.md'}] },
    { id:'is2', title:'PILOT MEASUREMENT',     desc:'Run your impact measurement system for one full month.',            status:'active',
      planets:[{id:'isp3',label:'Set up tracking',done:true,order:1},{id:'isp4',label:'Collect one month data',done:false,order:2}], evidence:[] },
    { id:'is3', title:'FIRST IMPACT REPORT',   desc:'Publish a public report of your first measured impact results.',   status:'pending', planets:[], evidence:[] },
    { id:'is4', title:'SCALE MEASUREMENT',     desc:'Automate and scale your measurement system for growth.',            status:'pending', planets:[], evidence:[] },
    { id:'is5', title:'IMPACT DASHBOARD',      desc:'Build a live dashboard showing real-time impact.',                 status:'pending', planets:[], evidence:[] },
  ],

  // 3 — FINANCIAL ORBIT
  [
    { id:'fo1', title:'FINANCIAL MODEL',       desc:'Build a sustainable financial model for your initiative.',         status:'approved', lux:6,  completedDate:'Apr 20, 2026',
      planets:[{id:'fop1',label:'Cost breakdown',done:true,order:1},{id:'fop2',label:'Revenue streams',done:true,order:2}], evidence:[{label:'Model.xlsx'}] },
    { id:'fo2', title:'FIRST REVENUE',         desc:'Generate your first dollar of revenue or secure your first grant.',status:'active',
      planets:[{id:'fop3',label:'Identify revenue path',done:true,order:1},{id:'fop4',label:'First transaction',done:false,order:2}], evidence:[] },
    { id:'fo3', title:'GRANT PIPELINE',        desc:'Build a pipeline of 5+ grant applications.',                       status:'pending', planets:[], evidence:[] },
  ],
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStarMapState() {
  const [zoom, setZoom]                   = useState<0 | 1 | 2>(0);
  const [hasNorthStar, setHasNorthStar]   = useState(false);
  const [northStarGoal, setNorthStarGoal] = useState('');
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [suggestionQueue, setSuggestionQueue] = useState<ConstSuggestion[]>([]);

  const [selectedConst, setSelectedConst] = useState<number | null>(null);
  const [expandedStar,  setExpandedStar]  = useState<string | null>(null);
  const [panelOpen,     setPanelOpen]     = useState(false);

  const [showGoalModal,       setShowGoalModal]       = useState(false);
  const [showConfirmModal,    setShowConfirmModal]     = useState(false);
  const [showNorthStarScreen, setShowNorthStarScreen]  = useState(false);

  const [selectedGoal, setSelectedGoal] = useState(GOALS[0]);
  const [hoveredConst, setHoveredConst] = useState<number | null>(null);
  const [hoveredStar,  setHoveredStar]  = useState<string | null>(null);

  // Per-constellation star lists (user-added stars); seed stars come from INITIAL_STARS
  const [constStarsMap, setConstStarsMap] = useState<Record<number, StarNode[]>>({});

  // Mutable seed-star data (for mutations on seed stars — planets, evidence, status)
  const starsRef = useRef<StarNode[]>(
    INITIAL_STARS.map(s => ({ ...s, planets: s.planets.map(p => ({ ...p })) }))
  );
  const [starVersion, setStarVersion] = useState(0);
  const bumpStars = useCallback(() => setStarVersion(v => v + 1), []);

  // setPanTarget injected by the screen (from useStarMapPan)
  const setPanTargetRef = useRef<(x: number, y: number) => void>(() => {});

  // ── Navigation ──────────────────────────────────────────────────────────────

  const confirmNorthStar = useCallback(() => {
    setHasNorthStar(true);
    setNorthStarGoal(selectedGoal);
    setZoom(1);
    setShowGoalModal(false);
    setPanTargetRef.current(0, 0);
    setSuggestionQueue([...CONST_SUGGESTIONS]);
    setConstellations([]);
    setConstStarsMap({});
    setShowConfirmModal(true);
  }, [selectedGoal]);

  const confirmConstellation = useCallback((suggestion: ConstSuggestion) => {
    setConstellations(prev => {
      const ci       = prev.length;
      const template = MOCK_STARS_BY_CONST[ci] ?? MOCK_STARS_BY_CONST[0];
      const stars    = template.map(s => ({ ...s, planets: s.planets.map(p => ({ ...p })) }));
      // Add to starsRef so addEvidence / submitStar mutations work on all stars
      starsRef.current = [
        ...starsRef.current,
        ...stars.filter(s => !starsRef.current.find(sr => sr.id === s.id)),
      ];
      setConstStarsMap(m => ({ ...m, [ci]: stars }));
      return [...prev, { name: suggestion.name }];
    });
    setSuggestionQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) setShowConfirmModal(false);
      return next;
    });
  }, []);

  const dismissConstellation = useCallback(() => {
    setSuggestionQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) setShowConfirmModal(false);
      return next;
    });
  }, []);

  // vertBias shifts content downward so it appears below the dome (pass height/6 from canvas)
  const enterConstellation = useCallback((i: number, vertBias = 0) => {
    setSelectedConst(i);
    setZoom(2);
    const pos = getConstPosition(i);
    const rad = (pos.angle * Math.PI) / 180;
    setPanTargetRef.current(
      -Math.cos(rad) * pos.r,
      -Math.sin(rad) * pos.r - 40 + vertBias,
    );
  }, []);

  const exitConstellation = useCallback(() => {
    setZoom(1);
    // selectedConst is intentionally NOT cleared — ConstLayer stays mounted so its
    // AnimatedG rotation nodes are never destroyed (web animation fix, mirrors SkyLayer pattern).
    setExpandedStar(null);
    setPanelOpen(false);
    setPanTargetRef.current(0, 0);
  }, []);

  // ── Star interactions ────────────────────────────────────────────────────────

  const openStarPanel = useCallback((starId: string, screenWidth: number, vertBias = 0) => {
    setExpandedStar(starId);
    setPanelOpen(true);
    if (selectedConst === null) return;
    const ci = selectedConst;
    const allStars = constStarsMap[ci] ?? [];
    const idx = allStars.findIndex(s => s.id === starId);
    if (idx < 0) return;
    const off = STAR_OFFSETS[ci % 4]?.[idx] ?? { x: 0, y: 0 };
    const SC  = 2.2;
    const pos = getConstPosition(ci);
    const rad = (pos.angle * Math.PI) / 180;
    const targetScreenX = (screenWidth - 340) / 2;
    setPanTargetRef.current(
      targetScreenX - screenWidth / 2 - Math.cos(rad) * pos.r - off.x * SC,
      -40 - Math.sin(rad) * pos.r - off.y * SC + vertBias,
    );
  }, [selectedConst, constStarsMap]);

  const closeStarPanel = useCallback(() => {
    setExpandedStar(null);
    setPanelOpen(false);
  }, []);

  // ── Star data access ─────────────────────────────────────────────────────────

  // Returns all stars for a constellation: seed stars (with mutations) + user-added stars
  const getConstStars = useCallback((ci: number): StarNode[] => {
    const all = constStarsMap[ci] ?? [];
    // Apply any in-session mutations (planet toggles etc.) from starsRef
    return all.map(s => starsRef.current.find(sr => sr.id === s.id) ?? s);
  }, [constStarsMap, starVersion]); // starVersion ensures re-compute after mutations

  const getStar = useCallback((starId: string): StarNode | undefined => {
    // Check starsRef first (seed star mutations)
    const fromRef = starsRef.current.find(s => s.id === starId);
    if (fromRef) return fromRef;
    // Then user-created stars in constStarsMap
    for (const stars of Object.values(constStarsMap)) {
      const found = stars.find(s => s.id === starId);
      if (found) return found;
    }
    return undefined;
  }, [constStarsMap]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const togglePlanet = useCallback((starId: string, planetIdx: number) => {
    // Mutate seed star in starsRef
    starsRef.current = starsRef.current.map(s => {
      if (s.id !== starId) return s;
      const planets = s.planets.map((p, i) => i === planetIdx ? { ...p, done: !p.done } : p);
      return { ...s, planets };
    });
    // Mutate user-created star in constStarsMap
    setConstStarsMap(prev => {
      const updated: Record<number, StarNode[]> = {};
      for (const [k, stars] of Object.entries(prev)) {
        updated[Number(k)] = stars.map(s => {
          if (s.id !== starId) return s;
          const planets = s.planets.map((p, i) => i === planetIdx ? { ...p, done: !p.done } : p);
          return { ...s, planets };
        });
      }
      return updated;
    });
    bumpStars();
  }, [bumpStars]);

  const addEvidence = useCallback((starId: string) => {
    const label = `evidence-${Date.now().toString().slice(-4)}.jpg`;
    starsRef.current = starsRef.current.map(s => {
      if (s.id !== starId) return s;
      return { ...s, evidence: [...s.evidence, { label }] };
    });
    setConstStarsMap(prev => {
      const out: Record<number, StarNode[]> = {};
      for (const [k, stars] of Object.entries(prev)) {
        out[Number(k)] = stars.map(s => s.id !== starId ? s : { ...s, evidence: [...s.evidence, { label }] });
      }
      return out;
    });
    bumpStars();
  }, [bumpStars]);

  const submitStar = useCallback((starId: string) => {
    starsRef.current = starsRef.current.map(s => {
      if (s.id !== starId || !s.evidence.length) return s;
      return { ...s, status: 'submitted' as StarStatus };
    });
    setConstStarsMap(prev => {
      const out: Record<number, StarNode[]> = {};
      for (const [k, stars] of Object.entries(prev)) {
        out[Number(k)] = stars.map(s => {
          if (s.id !== starId || !s.evidence.length) return s;
          return { ...s, status: 'submitted' as StarStatus };
        });
      }
      return out;
    });
    bumpStars();
  }, [bumpStars]);

  // ── Constellation management ─────────────────────────────────────────────────

  const addConstellation = useCallback((name: string) => {
    setConstellations(prev => {
      const ci = prev.length;
      setConstStarsMap(m => ({ ...m, [ci]: [] }));
      return [...prev, { name: name.toUpperCase() }];
    });
  }, []);

  const addStarToConst = useCallback((ci: number, title: string) => {
    const star: StarNode = {
      id:      `u-${ci}-${Date.now()}`,
      title:   title.toUpperCase(),
      desc:    '',
      status:  'pending',
      planets: [],
      evidence: [],
    };
    setConstStarsMap(prev => ({
      ...prev,
      [ci]: [...(prev[ci] ?? []), star],
    }));
  }, []);

  return {
    zoom, hasNorthStar, northStarGoal,
    constellations, suggestionQueue,
    selectedConst, expandedStar, panelOpen,
    showGoalModal, setShowGoalModal,
    showConfirmModal, setShowConfirmModal,
    showNorthStarScreen, setShowNorthStarScreen,
    selectedGoal, setSelectedGoal,
    hoveredConst, setHoveredConst,
    hoveredStar,  setHoveredStar,
    starsRef, starVersion,
    setPanTargetRef,
    confirmNorthStar, confirmConstellation, dismissConstellation,
    enterConstellation, exitConstellation,
    openStarPanel, closeStarPanel,
    getConstStars, getStar,
    togglePlanet, addEvidence, submitStar,
    addConstellation, addStarToConst,
  };
}
