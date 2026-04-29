let currentWordIndex = null;
let timerInterval = null;
let timeLeft = 15;
let wordDatabase = JSON.parse(localStorage.getItem('myWords')) || [];
let isWaitingForNext = false;
let currentScore = 0;
let bestScore = localStorage.getItem('bestScore') || 0;
let seenInSession = [];
let allVoices = [];

document.getElementById('bestScoreDisplay').innerText = bestScore;

const ONE_BEE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9oD_VDTfsKrdcbde04-GR6meNneDIr2P61j9cC2AGDV_TL_kN8ARNYCx3LbwJUQwD5FmydjWMgMTI/pub?gid=0&single=true&output=csv";
const TWO_BEE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9oD_VDTfsKrdcbde04-GR6meNneDIr2P61j9cC2AGDV_TL_kN8ARNYCx3LbwJUQwD5FmydjWMgMTI/pub?gid=1465023831&single=true&output=csv";

const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === 'true';

window.addEventListener('DOMContentLoaded', () => {
    if (isAdmin) {
        console.log("Admin mode active. Showing sync button.");
        document.getElementById('admin-section').style.display = 'block';
    } else {
        console.log("User mode. Sync button hidden.");
        // Double-check it is hidden
        document.getElementById('admin-section').style.display = 'none';
    }
});

async function syncAllData() {
    wordDatabase = []; // Start fresh
    
    // Fetch both (or as many as you have)
    await fetchSpecificSheet(ONE_BEE_URL, "One Bee");
    await fetchSpecificSheet(TWO_BEE_URL, "Two Bee");
    
    localStorage.setItem('myWords', JSON.stringify(wordDatabase));
    updateStatsTable();
    alert(`Sync Complete! Total words loaded: ${wordDatabase.length}`);
}

async function fetchSpecificSheet(url, categoryName) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network error");
        
        const data = await response.text();
        const rows = data.split("\n");

        // Skip header row (i = 1)
        for (let i = 1; i < rows.length; i++) {
            const columns = rows[i].split(",");
            const wordText = columns[0] ? columns[0].trim().toLowerCase() : "";
            
            if (wordText) {
                wordDatabase.push({
                    text: wordText,
                    category: categoryName, // This is crucial for your checkboxes!
                    correctCount: 0,
                    incorrectCount: 0,
                    needsPractice: false
                });
            }
        }
    } catch (error) {
        console.error(`Failed to load ${categoryName}:`, error);
    }
}


// 2. The function to save a word
function saveWord() {
    const input = document.getElementById('wordInput');
    const newWord = input.value.trim().toLowerCase();

    if (newWord !== "") {
        // Create a "Word Object" with stats
        const wordInfo = {
            text: newWord,
            correctCount: 0,
            incorrectCount: 0,
            needsPractice: false
        };

        // Add it to our list
        wordDatabase.push(wordInfo);

        // Save it to the browser's memory (Local Storage)
        localStorage.setItem('myWords', JSON.stringify(wordDatabase));

        // Clear the input box and alert the user
        input.value = "";
        alert("Word added! Total words: " + wordDatabase.length);
    }
}

function startQuiz() {
    isWaitingForNext = false;
    document.getElementById('nextButton').style.display = "none";

    const inputField = document.getElementById('answerInput');
    inputField.disabled = false; 
    inputField.readOnly = false; 
    inputField.value = "";
    inputField.focus();

    window.speechSynthesis.cancel();

    // 1. Get Filters
    const showOneBee = document.getElementById('oneBeeCheck').checked;
    const showTwoBee = document.getElementById('twoBeeCheck').checked;
    const practiceOnly = document.getElementById('practiceOnlyCheckbox').checked;
    const start = document.getElementById('startLetter').value.toLowerCase() || 'a';
    const end = document.getElementById('endLetter').value.toLowerCase() || 'z';

    // 2. Filter the Master Database
    let filteredWords = wordDatabase.filter(item => {
        const categoryMatch = (showOneBee && item.category === "One Bee") || 
                              (showTwoBee && item.category === "Two Bee");
        const firstLetter = item.text[0];
        const inRange = firstLetter >= start && firstLetter <= end;
        const practiceMatch = practiceOnly ? item.needsPractice : true;
        return categoryMatch && inRange && practiceMatch;
    });

    if (filteredWords.length === 0) {
        alert("No words found for the selected settings!");
        return;
    }

    // 3. Handle Session Tracking (Don't repeat words too soon)
    let availableWords = filteredWords.filter(w => !seenInSession.includes(w.text));
    if (availableWords.length === 0) {
        seenInSession = []; // Reset if we've gone through everything
        availableWords = filteredWords;
    }

    // 4. Create the Smart Priority Pool
    let priorityPool = [];
    availableWords.forEach(word => {
        if (word.correctCount === 0 && word.incorrectCount === 0) {
            priorityPool.push(word, word);
        } else if (word.incorrectCount > word.correctCount) {
            priorityPool.push(word, word, word);
        } else {
            priorityPool.push(word);
        }
    });

    // 5. Pick the Word
    let randomIndex = Math.floor(Math.random() * priorityPool.length);
    let selectedWordObject = priorityPool[randomIndex];
    seenInSession.push(selectedWordObject.text);

    currentWordIndex = wordDatabase.findIndex(w => w.text === selectedWordObject.text);
    let wordToSpell = wordDatabase[currentWordIndex].text;

    // 6. Speech Synthesis (CLEAN VERSION)
    const currentUtterance = new SpeechSynthesisUtterance(wordToSpell); // Renamed to avoid conflicts
    const voiceIndex = document.getElementById('voiceSelect').value;
    
    if (voiceIndex !== "" && allVoices[voiceIndex]) {
        currentUtterance.voice = allVoices[voiceIndex];
    } else {
        currentUtterance.lang = 'en-US';
    }
    
    currentUtterance.rate = 0.9; 

    // 7. UI Setup & Timer
    document.getElementById('quiz-controls').style.display = 'block';
    document.getElementById('feedback').innerText = "";
    if (timerInterval) clearInterval(timerInterval);
    
    // Only speak ONCE
    window.speechSynthesis.speak(currentUtterance);
    startTimer();
}

function startTimer() {
    // Grabs the number from your HTML input, default to 10
    const userTime = document.getElementById('timerSetting');
    timeLeft = userTime ? parseInt(userTime.value) : 10;
    
    document.getElementById('timer').innerText = "Time left: " + timeLeft + "s";

    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').innerText = "Time left: " + timeLeft + "s";
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            revealCorrectSpelling();
        }
    }, 1000);
}

function checkAnswer(){
    clearInterval(timerInterval);

    let userAnswer = document.getElementById('answerInput').value.trim().toLowerCase();
    let correctAnswer = wordDatabase[currentWordIndex].text;
    let feedbackElement = document.getElementById('feedback');

    if(userAnswer === correctAnswer){
        let pointsEarned = 10 + timeLeft;
        currentScore += pointsEarned;
        if(currentScore > bestScore){
            bestScore = currentScore;
            localStorage.setItem('bestScore', bestScore);
        }
        document.getElementById('scoreDisplay').innerText = currentScore;
        document.getElementById('bestScoreDisplay').innerText = bestScore;
        
        feedbackElement.innerText = "Correct! You earned " + pointsEarned + " points.";
        feedbackElement.style.color = "green";

        wordDatabase[currentWordIndex].correctCount++;
    }else{
        revealCorrectSpelling();
    }

    localStorage.setItem('myWords', JSON.stringify(wordDatabase));
    updateStatsTable();
    document.getElementById('answerInput').value = ""; // Clears the box for the next word
    document.getElementById('nextButton').style.display = "inline-block";
    document.getElementById('answerInput').readOnly = true;
    isWaitingForNext = true; 
    document.getElementById('nextButton').focus(); // Move the "focus" to the next button
}

function revealCorrectSpelling(){
    let correctAnswer = wordDatabase[currentWordIndex].text;
    let feedback = document.getElementById('feedback');
    feedback.innerText = "Incorrect. The correct spelling is: " + correctAnswer.toUpperCase();
    feedback.style.color = "red";

    wordDatabase[currentWordIndex].incorrectCount++;
    document.getElementById('nextButton').style.display = "inline-block";
    isWaitingForNext = true; 
    document.getElementById('nextButton').focus();
    document.getElementById('answerInput').readOnly = true;
}

function markForPractice() {
    if (currentWordIndex !== null) {
        wordDatabase[currentWordIndex].needsPractice = true;
        localStorage.setItem('myWords', JSON.stringify(wordDatabase));
        alert("Word added to Practice List!");
    }
}

function updateStatsTable() {
    const tbody = document.getElementById('statsBody');
    
    // 1. Clear the table first so we don't get duplicates
    tbody.innerHTML = "";

    // 2. Loop through every word in your database
    wordDatabase.forEach(item => {
        const row = document.createElement('tr');

        // Create the cells (td)
        const nameCell = `<td>${item.text}</td>`;
        const categoryCell = `<td>${item.category || "General"}</td>`;
        const correctCell = `<td>${item.correctCount}</td>`;
        const incorrectCell = `<td>${item.incorrectCount}</td>`;
        const practiceCell = `<td>${item.needsPractice ? "⭐ Yes" : "No"}</td>`;

        // Put the cells into the row
        row.innerHTML = nameCell + categoryCell + correctCell + incorrectCell + practiceCell;
        
        // Add the row to the table
        tbody.appendChild(row);
    });
} 

function handleEnter(event) {
    if (event.key === "Enter") {
        event.preventDefault(); 
        console.log("Enter pressed. isWaitingForNext is:", isWaitingForNext);
        if (isWaitingForNext === true) {
            startQuiz();
        } else {
            checkAnswer();
        }
    }
    if (event.code === "Tab") {
        event.preventDefault(); // Prevents a space character from appearing in the box
        listenAgain();
        document.getElementById('answerInput').focus();
    }
}

function toggleStats() {
    const wrapper = document.getElementById('stats-wrapper');
    if (wrapper.style.display === "none") {
        wrapper.style.display = "block";
        updateStatsTable(); // Refresh data when opening
    } else {
        wrapper.style.display = "none";
    }
}

function listenAgain() {
    if (currentWordIndex !== null) {
        window.speechSynthesis.cancel();
        let wordToSpell = wordDatabase[currentWordIndex].text;
        let utterance = new SpeechSynthesisUtterance(wordToSpell);

        const voiceIndex = document.getElementById('voiceSelect').value;
        
        if (voiceIndex !== "") {
            utterance.voice = allVoices[voiceIndex];
        } else {
            utterance.lang = 'en-US';
        }

        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
}

function resetGame(){
    currentScore = 0
    document.getElementById('scoreDisplay').innerText = "0";
    startQuiz();
}

function loadVoices() {
    allVoices = window.speechSynthesis.getVoices();
    const select = document.getElementById('voiceSelect');
    if (!voiceSelect) return;
    const currentSelected = voiceSelect.value;
    voiceSelect.innerHTML = '<option value="">Default System Voice</option>';

    allVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });
    
    voiceSelect.value = currentSelected;
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

updateStatsTable();
    
