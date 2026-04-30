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

window.addEventListener('DOMContentLoaded', async () => {
    const savedLinks = localStorage.getItem('syncLinks');
    const linksInput = document.getElementById('sheetLinks');

    const masterLinks = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9oD_VDTfsKrdcbde04-GR6meNneDIr2P61j9cC2AGDV_TL_kN8ARNYCx3LbwJUQwD5FmydjWMgMTI/pub?gid=0&single=true&output=csv" + "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9oD_VDTfsKrdcbde04-GR6meNneDIr2P61j9cC2AGDV_TL_kN8ARNYCx3LbwJUQwD5FmydjWMgMTI/pub?gid=1465023831&single=true&output=csv";
    
    if (savedLinks) {
        linksInput.value = savedLinks;
        if (!wordDatabase || wordDatabase.length === 0) {
            await syncAllData(); 
        }
    } else {
        linksInput.value = masterLinks;
        localStorage.setItem('syncLinks', masterLinks);
        
        console.log("New user detected. Auto-syncing...");
        await syncAllData(); 
    }
    updateStatsTable();
    loadVoices();
    
    if (isAdmin) {
        console.log("Admin mode active. Showing sync button.");
        document.getElementById('admin-section').style.display = 'block';
    } else {
        console.log("User mode. Sync button hidden.");
        document.getElementById('admin-section').style.display = 'none';
    }
});

async function syncAllData() {
    const linksInput = document.getElementById('sheetLinks').value.trim();
    if (!linksInput) {
        console.warn("No links found to sync.");
        return;
    }
    
    const urls = linksInput.split('\n').map(url => url.trim()).filter(url => url !== "");
    wordDatabase = []; 
    
    localStorage.setItem('syncLinks', linksInput);

    const syncBtn = (typeof event !== 'undefined' && event && event.target) ? event.target : null;
    
    if (syncBtn && syncBtn.innerText) {
        syncBtn.innerText = "⌛ Syncing...";
        syncBtn.disabled = true;
    }

    for (let url of urls) {
        try {
            await fetchSpecificSheet(url, "Synced List");
        } catch (e) {
            console.error("Error fetching: " + url, e);
        }
    }

    localStorage.setItem('myWords', JSON.stringify(wordDatabase));
  
    updateStatsTable();
    
    if (syncBtn && syncBtn.innerText) {
        syncBtn.innerText = "Sync All Words";
        syncBtn.disabled = false;
        alert(`Sync Complete! Total words loaded: ${wordDatabase.length}`);
    }
    return true; 
}

async function fetchSpecificSheet(url) {
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
                    correctCount: 0,
                    incorrectCount: 0,
                    needsPractice: false
                });
            }
        }
    } catch (error) {
        console.error(`Failed to load the wordlist.:`, error);
    }
}

function saveWord() {
    const input = document.getElementById('wordInput');
    const newWord = input.value.trim().toLowerCase();

    if (newWord !== "") {
        const wordInfo = {
            text: newWord,
            correctCount: 0,
            incorrectCount: 0,
            needsPractice: false
        };
        
        wordDatabase.push(wordInfo);

        localStorage.setItem('myWords', JSON.stringify(wordDatabase));
        input.value = "";
        alert("Word added! Total words: " + wordDatabase.length);
    }
}

function startQuiz() {
    if (wordDatabase.length === 0) {
        alert("Words are still loading or the database is empty. Please wait a moment or click Sync in Admin.");
        return;
    }
    isWaitingForNext = false;
    document.getElementById('nextButton').style.display = "none";
    document.getElementById('submitButton').style.display = "inline-block";

    const inputField = document.getElementById('answerInput');
    inputField.disabled = false; 
    inputField.readOnly = false; 
    inputField.value = "";
    inputField.focus();

    window.speechSynthesis.cancel();

    // 1. Get Filters
    
    const practiceOnly = document.getElementById('practiceOnlyCheckbox').checked;
    const start = document.getElementById('startLetter').value.toLowerCase() || 'a';
    const end = document.getElementById('endLetter').value.toLowerCase() || 'z';

    // 2. Filter the Master Database
    let filteredWords = wordDatabase.filter(item => {
        const firstLetter = item.text[0];
        const inRange = firstLetter >= start && firstLetter <= end;
        const practiceMatch = practiceOnly ? item.needsPractice : true;
        return inRange && practiceMatch;
    });

    if (filteredWords.length === 0) {
        alert("No words found.");
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
    if(isWaitingForNext) return;
    
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

        feedbackElement.innerHTML = `
            <span style="color: green;">Correct! ${pointsEarned} points earned. </span><br>
            You typed: <strong>${userAnswer}</strong><br>
            
        `;

        wordDatabase[currentWordIndex].correctCount++;
    }else{
        revealCorrectSpelling();
    }

    localStorage.setItem('myWords', JSON.stringify(wordDatabase));
    updateStatsTable();
    document.getElementById('answerInput').value = ""; // Clears the box for the next word
    document.getElementById('nextButton').style.display = "inline-block";
    document.getElementById('submitButton').style.display = "none";
    document.getElementById('answerInput').readOnly = true;
    isWaitingForNext = true; 
    document.getElementById('nextButton').focus(); 
}

function revealCorrectSpelling(){
    let userAnswer = document.getElementById('answerInput').value.trim();
    let correctAnswer = wordDatabase[currentWordIndex].text;
    let feedback = document.getElementById('feedback');
    
    feedback.innerHTML = `
        <span style="color: red;">Incorrect.</span><br>
        You typed: <strong>${userAnswer || " "}</strong><br>
        Correct: <strong>${correctAnswer.toUpperCase()}</strong>
    `;

    wordDatabase[currentWordIndex].incorrectCount++;
    document.getElementById('nextButton').style.display = "inline-block";
    document.getElementById('submitButton').style.display = "none";
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
    const sortType = document.getElementById('sortSelect').value;
    tbody.innerHTML = "";

    let sortedList = [...wordDatabase];

    if (sortType === "alpha") {
        sortedList.sort((a, b) => a.text.localeCompare(b.text));
    } else if (sortType === "best") {
        sortedList.sort((a, b) => b.correctCount - a.correctCount);
    } else if (sortType === "worst") {
        sortedList.sort((a, b) => b.incorrectCount - a.incorrectCount);
    }

    sortedList.forEach((item) => {
        const originalIndex = wordDatabase.findIndex(w => w.text === item.text);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.text}</td>
            <td>${item.correctCount}</td>
            <td>${item.incorrectCount}</td>
            <td>${item.needsPractice ? "⭐ Yes" : "No"}</td>
        `;
        tbody.appendChild(row);
    });
} 

function handleEnter(event) {
    window.addEventListener('keydown', function(event) {
        if (event.key === "Enter") {
            if(document.getElementById('quiz-controls').style !=== 'none'){
                event.preventDefault(); 
                if (isWaitingForNext === true) {
                    startQuiz();
                } else {
                    checkAnswer();
                }
            }
        }
        if (event.key === "Tab") {
            if(document.getElementById('quiz-controls').style !=== 'none'){
                event.preventDefault(); // Prevents a space character from appearing in the box
                if (currentWordIndex !== -1) {
                    listenAgain();
                }
                document.getElementById('answerInput').focus();
            }
        }
    });
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
    const voiceSelect = document.getElementById('voiceSelect');
    if (!voiceSelect) return;

    const currentSelected = voiceSelect.value;
    voiceSelect.innerHTML = '<option value="">Default System Voice</option>';

    const trustedCreators = ['Google', 'Apple', 'Alex', 'Samantha', 'Microsoft'];

    const filteredVoices = allVoices.filter(voice => {
        const isTrusted = trustedCreators.some(creator => voice.name.includes(creator));
        return isTrusted;
    });

    filteredVoices.forEach((voice) => {
        const originalIndex = allVoices.indexOf(voice);
        const option = document.createElement('option');
        option.value = originalIndex;
        option.textContent = `${voice.name}`; // Simplified name is easier to read
        voiceSelect.appendChild(option);
    });
    
    voiceSelect.value = currentSelected;
}
window.speechSynthesis.onvoiceschanged = loadVoices;
    
