/* ORBITA — planetary data.
 * All physical values are real (mean/average values).
 * Display radii are computed in app.js from radiusKm.
 * phase = starting orbital angle (radians) so the layout looks good at t=0.
 */

const PLANETS = [
  {
    id: 'mercury', name: 'Mercury', color: '#c8b6a6', color2: '#7d6f63',
    radiusKm: 2440, orbitAU: 0.387, periodDays: 87.97, rotationHours: 1407.6,
    moons: 0, tempC: 167, phase: 0.8,
    blurb: 'A scorched, cratered world racing around the Sun. Its 88-day year is shorter than the 176 Earth days it takes to go from one sunrise to the next.',
    moonsList: []
  },
  {
    id: 'venus', name: 'Venus', color: '#f0d3a8', color2: '#c08a4f',
    radiusKm: 6052, orbitAU: 0.723, periodDays: 224.7, rotationHours: -5832.5,
    moons: 0, tempC: 464, phase: 2.4,
    blurb: 'A runaway greenhouse. Surface pressure is 92× Earth’s and it is the hottest planet — hotter than Mercury, despite being twice as far from the Sun.',
    moonsList: []
  },
  {
    id: 'earth', name: 'Earth', color: '#63b3ec', color2: '#2b63ad',
    radiusKm: 6371, orbitAU: 1.0, periodDays: 365.25, rotationHours: 23.93,
    moons: 1, tempC: 15, phase: 5.0,
    blurb: 'The only known world with liquid-water oceans and life. 71% of its surface is ocean, and it has one large moon that stabilizes its climate.',
    moonsList: [
      { name: 'Moon', radiusKm: 1737, dist: 1.0, periodDays: 27.32, color: '#b8b4ae' }
    ]
  },
  {
    id: 'mars', name: 'Mars', color: '#e07a52', color2: '#9c3d24',
    radiusKm: 3390, orbitAU: 1.524, periodDays: 686.98, rotationHours: 24.62,
    moons: 2, tempC: -63, phase: 3.7,
    blurb: 'The red planet. Home to Olympus Mons, a volcano roughly three times the height of Everest, and the dust devil footprints left by passing rovers.',
    moonsList: [
      { name: 'Phobos', radiusKm: 11, dist: 0.7, periodDays: 0.319, color: '#8a8378' },
      { name: 'Deimos', radiusKm: 6, dist: 1.3, periodDays: 1.263, color: '#7d766c' }
    ]
  },
  {
    id: 'jupiter', name: 'Jupiter', color: '#e0b088', color2: '#a06a3c',
    radiusKm: 69911, orbitAU: 5.203, periodDays: 4332.59, rotationHours: 9.93,
    moons: 95, tempC: -108, phase: 1.4, bands: true,
    blurb: 'More massive than all other planets combined. The Great Red Spot is a storm wider than Earth that has been raging for at least 190 years.',
    moonsList: [
      { name: 'Io', radiusKm: 1822, dist: 0.75, periodDays: 1.769, color: '#d8c26a' },
      { name: 'Europa', radiusKm: 1561, dist: 1.05, periodDays: 3.551, color: '#c9bfae' },
      { name: 'Ganymede', radiusKm: 2634, dist: 1.45, periodDays: 7.155, color: '#9a938a' },
      { name: 'Callisto', radiusKm: 2410, dist: 1.9, periodDays: 16.689, color: '#847d72' }
    ]
  },
  {
    id: 'saturn', name: 'Saturn', color: '#ecd3a2', color2: '#b3925c',
    radiusKm: 58232, orbitAU: 9.537, periodDays: 10759.22, rotationHours: 10.66,
    moons: 146, tempC: -139, phase: 4.3, bands: true,
    blurb: 'The ringed jewel. Its rings are mostly water ice kilometres to thousands of kilometres thick. Saturn is so light it would float in a big enough tub of water.',
    rings: { inner: 1.5, outer: 2.6, alpha: 0.5, color: '#d8c49a' },
    moonsList: [
      { name: 'Mimas', radiusKm: 198, dist: 1.0, periodDays: 0.942, color: '#b0aca4' },
      { name: 'Enceladus', radiusKm: 252, dist: 1.25, periodDays: 1.37, color: '#e8e6e2' },
      { name: 'Rhea', radiusKm: 764, dist: 1.55, periodDays: 4.518, color: '#a8a29a' },
      { name: 'Titan', radiusKm: 2575, dist: 2.1, periodDays: 15.945, color: '#c89a5a' }
    ]
  },
  {
    id: 'uranus', name: 'Uranus', color: '#a5e0ea', color2: '#58a8bc',
    radiusKm: 25362, orbitAU: 19.19, periodDays: 30688.5, rotationHours: -17.24,
    moons: 28, tempC: -197, phase: 0.3,
    blurb: 'The sideways ice giant, tilted 98° so it rolls around the Sun like a barrel. Coldest planetary atmosphere in the Solar System: −224 °C.',
    rings: { inner: 1.6, outer: 2.1, alpha: 0.25, color: '#9fd0da' },
    moonsList: [
      { name: 'Miranda', radiusKm: 236, dist: 1.0, periodDays: 1.413, color: '#b5b2ac' },
      { name: 'Titania', radiusKm: 789, dist: 1.6, periodDays: 8.706, color: '#9d988f' }
    ]
  },
  {
    id: 'neptune', name: 'Neptune', color: '#5f7ce8', color2: '#2c3f9e',
    radiusKm: 24622, orbitAU: 30.07, periodDays: 60182, rotationHours: 16.11,
    moons: 16, tempC: -201, phase: 2.9,
    blurb: 'The windy blue world. Supersonic winds reach 2,100 km/h — the fastest in the Solar System. It was the first planet found by mathematical prediction.',
    moonsList: [
      { name: 'Triton', radiusKm: 1353, dist: 1.5, periodDays: -5.877, color: '#cfc4b0' }
    ]
  }
];

/* Comets. Elliptical orbits with the Sun at one focus.
 * a = semi-major axis (AU), e = eccentricity, periodDays, phase = mean anomaly at t=0.
 */
const COMETS = [
  {
    id: 'halley', name: 'Halley’s Comet', aAU: 17.834, e: 0.967,
    periodDays: 75.3 * 365.25, phase: 0.35, omega: 2.1, tail: true
  },
  {
    id: 'encke', name: 'Comet Encke', aAU: 2.228, e: 0.624,
    periodDays: 3.3 * 365.25, phase: 4.2, omega: 5.3, tail: true
  }
];

/* Quiz: pool of questions. 5 random ones are drawn per run. */
const QUIZ = [
  { q: 'Which planet is the hottest in the Solar System?',
    a: ['Mercury', 'Venus', 'Jupiter', 'Mars'], correct: 1,
    why: 'Venus’s thick CO₂ atmosphere traps heat — surface ~464 °C, hotter than Mercury.' },
  { q: 'Which planet has the most confirmed moons?',
    a: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], correct: 1,
    why: 'Saturn leads with well over 200 confirmed moons, ahead of Jupiter’s ~95.' },
  { q: 'What is the Great Red Spot?',
    a: ['A volcanic vent on Mars', 'A storm on Jupiter', 'A crater on the Moon', 'A dust storm on Venus'], correct: 1,
    why: 'A giant anticyclonic storm on Jupiter, wider than Earth, raging for centuries.' },
  { q: 'Which planet spins backwards (retrograde)?',
    a: ['Mars', 'Neptune', 'Venus', 'Earth'], correct: 2,
    why: 'Venus rotates east-to-west, so the Sun rises in the west. Uranus is a bonus: it rolls on its side.' },
  { q: 'On Mercury, how long is it from one sunrise to the next?',
    a: ['59 Earth days', '88 Earth days', '176 Earth days', '365 Earth days'], correct: 2,
    why: 'Mercury’s spin and orbit nearly 3:2-resonate, so a solar day lasts 176 Earth days.' },
  { q: 'Which planet has the fastest winds?',
    a: ['Jupiter', 'Venus', 'Earth', 'Neptune'], correct: 3,
    why: 'Neptune’s supersonic jet streams top out near 2,100 km/h.' },
  { q: 'Which comet returns to the inner Solar System every ~76 years?',
    a: ['Halley’s Comet', 'Comet Encke', 'Hale-Bopp', 'Comet Hyatt'], correct: 0,
    why: 'Halley was last seen in 1986 and returns around 2061.' },
  { q: 'Which planet is so low-density it would float on water?',
    a: ['Uranus', 'Saturn', 'Jupiter', 'Pluto'], correct: 1,
    why: 'Saturn’s mean density is ~0.69 g/cm³ — less than water’s 1.0.' },
  { q: 'Which moon is larger than the planet Mercury?',
    a: ['Titan', 'Europa', 'Ganymede', 'Triton'], correct: 2,
    why: 'Ganymede, a moon of Jupiter, is the largest moon in the Solar System.' },
  { q: 'Neptune was discovered by…',
    a: ['Telescope surveys', 'Mathematical prediction', 'Radar', 'Photography'], correct: 1,
    why: 'Irregularities in Uranus’s orbit led Adams and Le Verrier to predict its position in 1846.' },
  { q: 'What are Saturn’s rings made of mostly?',
    a: ['Dust and rock', 'Molten lava', 'Water ice', 'Frozen methane'], correct: 2,
    why: 'Countless chunks of water ice, from dust-sized grains to house-sized blocks.' },
  { q: 'How long does one year last on Neptune?',
    a: ['12 Earth years', '25 Earth years', '165 Earth years', '365 Earth days'], correct: 2,
    why: 'Since its discovery in 1846, Neptune has completed only one full orbit.' }
];

window.ORBITA_DATA = { PLANETS, COMETS, QUIZ };
