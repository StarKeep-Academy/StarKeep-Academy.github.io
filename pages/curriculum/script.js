// Curriculum page script
// Data for the details panels (in a real app, this would come from a database or API)
const pathDetailsData = {
    '1': { image: 'assets/images/Earthwatcher.png', text: 'You have chosen the Heroic Path of Strength.' },
    '2': { image: 'path_to_heroic2_img.jpg', text: 'You have chosen the Heroic Path of Valor.' },
    // ... add data for IDs 1-12
    '7': { image: 'path_to_learning1_img.jpg', text: 'You will focus on the Lore of Ancient Civilizations.' },
};

const heroicButtons = document.querySelectorAll('#heroic-path-group .path-btn');
const learningButtons = document.querySelectorAll('#learning-path-group .path-btn');
const allButtons = document.querySelectorAll('.path-btn');
const generateBtn = document.getElementById('generate-btn');

const heroicDetailsImg = document.getElementById('heroic-image');
const heroicDetailsText = document.getElementById('heroic-text');
const learningDetailsImg = document.getElementById('learning-image');
const learningDetailsText = document.getElementById('learning-text');

let chosenHeroicPath = null;
let chosenLearningPath = null;

// Function to update the details panel
function updateDetailsPanel(type, pathId) {
    const data = pathDetailsData[pathId];
    if (type === 'heroic') {
        if (data) {
            heroicDetailsImg.src = data.image;
            heroicDetailsImg.style.display = 'block';
            heroicDetailsText.textContent = data.text;
            heroicDetailsText.style.display = 'block';
        }
    } else if (type === 'learning') {
        if (data) {
            learningDetailsImg.src = data.image;
            learningDetailsImg.style.display = 'block';
            learningDetailsText.textContent = data.text;
            learningDetailsText.style.display = 'block';
        }
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

    // 1. Exclusive Toggle Logic: Turn off all other buttons in this group
    group.forEach(btn => btn.classList.remove('is-active'));

    // 2. Turn on the clicked button's active state
    clickedButton.classList.add('is-active');

    // 3. Update state variables and dynamic content
    if (type === 'heroic') {
        chosenHeroicPath = pathId;
        updateDetailsPanel('heroic', pathId);
    } else {
        chosenLearningPath = pathId;
        updateDetailsPanel('learning', pathId);
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

// Event listener for the Generate button (you'll fill this in later)
generateBtn.addEventListener('click', () => {
    console.log(`Generate pressed! Heroic: ${chosenHeroicPath}, Learning: ${chosenLearningPath}`);
    // What you do after they press generate will go here.
});