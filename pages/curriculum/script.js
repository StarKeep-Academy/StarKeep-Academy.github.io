// Curriculum page script
// Data for the details panels (in a real app, this would come from a database or API)
const pathDetailsData = {
    '1': { image: '/assets/images/Earthwatcher.png', title: 'Earthwatcher', text: 'Driven to protect, cultivate, and organize the Earth\'s ecosystems sustainably and compassionately. Earthwatchers immerse themselves in permaculture, guerrilla gardening, and bio-architecture, whether they are maintaining food forests, building off-grid sustainable communities, or boldly protesting for the environment.' },
    '2': { image: '/assets/images/Peacebringer.png', title: 'Peacebringer', text: 'Dedicated to healing the world and ending physical, mental, and emotional suffering. Peacebringers operate on the frontlines of empathy, specializing in therapy, naturopathic remedies, pharmaceutical innovation, and conflict mediation, while caring deeply for vulnerable people and animals.' },
    '3': { image: '/assets/images/Storyteller.png', title: 'Storyteller', text: 'Tasked with envisioning future societies and expressing ideals through art and media. Storytellers inspire action by designing conscious media, impactful music, engaging games, and immersive spaces, effectively forecasting a brighter future and making it irresistible.' },
    '4': { image: '/assets/images/Innovator.png', title: 'Innovator', text: 'Focused on developing sustainable, eco-friendly technologies that disrupt the status quo for the benefit of the world. Innovators are the architects of tomorrow, diving into robotics engineering, machine learning, clean energy development, and ethical cybersecurity.' },
    '5': { image: '/assets/images/Dreamwalker.png', title: 'Dreamwalker', text: 'Seekers of empirical evidence in mysticism and deeper understanding regarding the nature of consciousness. Dreamwalkers utilize applied philosophy, esoteric truths, and altered states—such as lucid dreaming and meditation—to acquire abstract wisdom that benefits all life.' },
    '6': { image: '/assets/images/Truthseeker.png', title: 'Truthseeker', text: 'The interdisciplinary scholars who use imagination, wisdom, and leadership to organize knowledge for world change. Truthseekers master the humanities, ethical philosophy, and the philosophy of science, meticulously archiving resources to design holistic, future-proof communities.' },

    '7': { image: '/assets/images/Scholar.png', title: 'Scholar', text: 'Growing from a strong, diverse foundation of knowledge before branching into specialization. Based in traditional academia, this path involves learning a wide range of liberal arts alongside a major or minor, ensuring a robust, well-rounded intellect.' },
    '8': { image: '/assets/images/Specialist.png', title: 'Specialist', text: 'Dedicated to surpassing the limits of human potential in one "island of brilliance". Specialists discover personal routines for unlimited growth, pushing the boundaries of advanced techniques in their chosen field while deliberately excluding unrelated subjects.' },
    '9': { image: '/assets/images/Generalist.png', title: 'Generalist', text: 'Driven to master all subjects and explore infinite paths based on what sparks joy. Generalists embrace customizable daily explorations that cultivate a massive, highly adaptable range of skills, taking breaks from whatever does not inspire them.' },
    '10': { image: '/assets/images/Wayfinder.png', title: 'Wayfinder', text: 'Focused strictly on meeting the most urgent needs of the world. Wayfinders utilize custom roadmaps designed to make them rapidly competent in specific skill sets required to succeed in areas of crisis and deep humanitarian passion.' },
    '11': { image: '/assets/images/Divergent.png', title: 'Divergent', text: 'Approaching old problems from radically new angles of experimentation. Divergents thrive on iteration, prototyping, and divergent thinking, exploring interdisciplinary combinations of knowledge, art, and design to spark unexpected innovations.' },
    '12': { image: '/assets/images/Mystic.png', title: 'Mystic', text: 'Mastering the self and exploring the unknown through the cultivation of intuition. Mystics rely on a receptive flow state, utilizing meditation, mindfulness, and altered states alongside inspirational education to spark abstract ideation and sudden revelations.' }
    
    
};

const heroicButtons = document.querySelectorAll('#heroic-path-group .path-btn'); // all 6 buttons in the left (heroic) grid
const learningButtons = document.querySelectorAll('#learning-path-group .path-btn'); // all 6 buttons in the right (learning) grid
const allButtons = document.querySelectorAll('.path-btn'); // every path button on the page (both groups combined)
const generateBtn = document.getElementById('generate-btn'); // the Generate button — disabled until both sides are chosen

const heroicTitle = document.getElementById('heroic-title'); // h2 that shows the selected heroic path name
const learningTitle = document.getElementById('learning-title'); // h2 that shows the selected learning path name
const heroicDetailsImg = document.getElementById('heroic-image'); // img that shows the selected heroic path illustration
const heroicDetailsText = document.getElementById('heroic-text'); // p that shows the selected heroic path description
const learningDetailsImg = document.getElementById('learning-image'); // img that shows the selected learning path illustration
const learningDetailsText = document.getElementById('learning-text'); // p that shows the selected learning path description

const cpath = document.getElementById('constellation'); // img that shows the generated constellation path diagram
const cpathTitle = document.getElementById('pathtitle'); // h2 that shows the generated constellation path name
const cpathText = document.getElementById('pathtext'); // p that shows the generated constellation path description

let chosenHeroicPath = null; // tracks which heroic button is currently selected (stores its data-path-id), null if none
let chosenLearningPath = null; // tracks which learning button is currently selected (stores its data-path-id), null if none

function updateDetailsPanel(type, pathId) {
    const data = pathDetailsData[pathId]; // looks up the title, image, and text for this path id in pathDetailsData
    if (type === 'heroic') { // called with 'heroic' when a left-side button is clicked
        if (data) { // only runs if a matching entry exists in pathDetailsData
            heroicTitle.textContent = data.title; // writes the path name into the heroic title h2
            heroicDetailsImg.src = data.image; // sets the heroic image src to the path's illustration
            heroicDetailsImg.style.display = 'block'; // makes the heroic image visible (it starts hidden)
            heroicDetailsText.textContent = data.text; // writes the path description into the heroic text p
            heroicDetailsText.style.display = 'block'; // makes the heroic description visible (it starts hidden)
        }
    } else if (type === 'learning') { // called with 'learning' when a right-side button is clicked
        if (data) { // only runs if a matching entry exists in pathDetailsData
            learningTitle.textContent = data.title; // writes the path name into the learning title h2
            learningDetailsImg.src = data.image; // sets the learning image src to the path's illustration
            learningDetailsImg.style.display = 'block'; // makes the learning image visible (it starts hidden)
            learningDetailsText.textContent = data.text; // writes the path description into the learning text p
            learningDetailsText.style.display = 'block'; // makes the learning description visible (it starts hidden)
        }
    }
}

function unHide() {
        if(cpath.classList.contains("hidden")){
            cpath.classList.remove("hidden");
        }
        if(cpathTitle.classList.contains("hidden")){
            cpathTitle.classList.remove("hidden");
        }

        if(cpathText.classList.contains("hidden")){
            cpathText.classList.remove("hidden");
        }
            
        }

function reHide() {
        if(!cpath.classList.contains("hidden")){
            cpath.classList.add("hidden");
        }
       
        

}      


            

// Function to update the state of the Generate button
function updateGenerateButton() {
    if (chosenHeroicPath !== null && chosenLearningPath !== null) {
        generateBtn.disabled = false;
    } else {
        generateBtn.disabled = true;
    }
}

// Function to handle clicking on ANY path button
function handlePathButtonClick(event, group, type) {
    const clickedButton = event.currentTarget; // The specific button that was clicked
    const pathId = clickedButton.getAttribute('data-path-id');
    cpath.classList.add("hidden");
    cpathText.classList.add("hidden");
    cpathTitle.classList.add("hidden");

    // 1. Exclusive Toggle Logic: Turn off all other buttons in this group
    group.forEach(btn => btn.classList.remove('is-active'));

    // 2. Turn on the clicked button's active state
    clickedButton.classList.add('is-active');

    // 3. Update state variables and dynamic content
    if (type === 'heroic') {
        chosenHeroicPath = pathId;
        updateDetailsPanel('heroic', pathId); // called from handlePathButtonClick — left side button clicked, pathId is the data-path-id of that button
    } else {
        chosenLearningPath = pathId;
        updateDetailsPanel('learning', pathId); // called from handlePathButtonClick — right side button clicked, pathId is the data-path-id of that button
    }


    // 4. Finally, check if the Generate button can be enabled
    updateGenerateButton();
}

// Set up event listeners for both groups
heroicButtons.forEach(button => {
    button.addEventListener('click', (event) => {
        handlePathButtonClick(event, heroicButtons, 'heroic');
    });
});

learningButtons.forEach(button => {
    button.addEventListener('click', (event) => {
        handlePathButtonClick(event, learningButtons, 'learning');
    });
});

// Event listener for the Generate button
generateBtn.addEventListener('click', () => {
    console.log(`Generate pressed! Heroic: ${chosenHeroicPath}, Learning: ${chosenLearningPath}`);
    unHide();
    if(chosenHeroicPath==1 && chosenLearningPath==10){
        cpath.src='/assets/images/TheCrisisResponder.png' ;
        cpathTitle.textContent= 'The Crisis Responder';
        cpathText.textContent= 'Configuration: Earthwatcher + Wayfinder \n North Star Goal: Rapid deployment of self-sustaining, off-grid permaculture relief camps for climate refugees. \n Structure Logic (The Wayfinder): Urgent, practical, and highly targeted. This path branches moderately to pick up specific tactical skills, then rapidly converges to apply them in the field.';

    } else if(chosenHeroicPath==4 && chosenLearningPath==8){
         cpath.src='/assets/images/TheDeepTechInventor.png' ;
        cpathTitle.textContent= 'The Deep-Tech Inventor';
        cpathText.textContent= 'Configuration: Innovator + Specialist \n North Star Goal: Inventing a scalable, low-cost ocean microplastic filtration robotics system.\n Structure Logic (The Specialist): The "island of brilliance." Highly linear with almost zero branching. The student dives deeper and deeper into a single, highly technical discipline, deliberately excluding unrelated subjects.';

    } else if(chosenHeroicPath==2 && chosenLearningPath==9){
        cpath.src='/assets/images/TheHolisticHavenBuilder.png' ;
        cpathTitle.textContent= 'The Holistic Haven Builder';
        cpathText.textContent= 'Configuration: Peacebringer + Generalist \n North Star Goal: Establishing a holistic wellness sanctuary that integrates animal therapy, mental health recovery, and community mediation.\n Structure Logic (The Generalist): Highly branched and wide-ranging. The student explores multiple disconnected topics based on what sparks joy, cultivating a massive toolkit before bringing it all together at the very end.';

    } else if(chosenHeroicPath==3 && chosenLearningPath==11){
        cpath.src='/assets/images/TheEmpathyArchitect.png' ;
        cpathTitle.textContent= 'The Empathy Architect';
        cpathText.textContent= 'Configuration: Storyteller + Divergent \n North Star Goal: Designing a blockbuster XR (Extended Reality) game that teaches climate stewardship through radical empathy and serious play.\n Structure Logic (The Divergent): Approaching old problems from weird angles. This path branches into seemingly unrelated disciplines (art, tech, science) and forces them to smash together to create unexpected innovations.';

    } else if(chosenHeroicPath==5 && chosenLearningPath==12){
        cpath.src='/assets/images/TheNoeticHealer.png' ;
        cpathTitle.textContent= 'The Noetic Healer';
        cpathText.textContent= 'Configuration: Dreamwalker + Mystic \n North Star Goal: Mapping altered states of consciousness to develop a scientifically validated, consciousness-based healing modality that integrates esoteric wisdom with empirical research for end-of-life care.\n Structure Logic (The Mystic): Intuitive and reflective. This path relies on flow states, inner mastery, and alternating between experiential practice and abstract academic conception.';

    } else if(chosenHeroicPath==6 && chosenLearningPath==7){
         cpath.src='/assets/images/TheEcoSystemsArchitect.png' ;
        cpathTitle.textContent= 'The Eco-Systems Architect';
        cpathText.textContent= 'Configuration: Truthseeker + Scholar \n North Star Goal: Designing a future-proof, self-sustaining eco-village that serves as a replicable model for regenerative living.\n Structure Logic (The Scholar): Traditional academic progression. A broad, robust foundation of liberal arts (the "minor") that slowly tapers into a highly focused specialization (the "major").';
    } else {
        reHide();
        cpathTitle.textContent= 'These paths are incompatible';
        cpathText.textContent= 'Try different combinations of Heroic and Learning paths to discover your unique constellation!';
    }
   
});