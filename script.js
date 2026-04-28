let currentWordIndex = null;
let timerInterval = null;
let timeLeft = 15;
let wordDatabase = JSON.parse(localStorage.getItem('myWords')) || [];
let isWaitingForNext = false;
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

function startQuiz(){
    isWaitingForNext = false;
    document.getElementById('nextButton').style.display = "none";
    document.getElementById('answerInput').disabled = false; // Re-enable typing
    document.getElementById('answerInput').focus(); // Put cursor in box

    window.speechSynthesis.cancel();

    // 1. Get the range from the UI
    let start = document.getElementById('startLetter').value.toLowerCase() || 'a';
    let end = document.getElementById('endLetter').value.toLowerCase() || 'z';
    let practiceOnly = document.getElementById('practiceOnlyCheckbox').checked;

    const showOneBee = document.getElementById('oneBeeCheck').checked;
    const showTwoBee = document.getElementById('twoBeeCheck').checked;

    // 2. Create a "Filtered List" based on the range
   let filteredWords = wordDatabase.filter(item => {
        const categoryMatch = (showOneBee && item.category === "One Bee") || 
                              (showTwoBee && item.category === "Two Bee");
        
        const start = document.getElementById('startLetter').value.toLowerCase() || 'a';
        const end = document.getElementById('endLetter').value.toLowerCase() || 'z';
        const firstLetter = item.text[0];
        const inRange = firstLetter >= start && firstLetter <= end;

        return categoryMatch && inRange;
    });

    if (filteredWords.length === 0) {
        alert("No words found for the selected categories/range!");
        return;
    }

    if (practiceOnly) { 
        filteredWords = filteredWords.filter(w => w.needsPractice); 
    }

    // 4. Timer cleanup
    if (timerInterval) {
        console.log("Stopping the old timer...");
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // 5. Pick from the FILTERED list, not the whole database
    let randomIndex = Math.floor(Math.random() * filteredWords.length);
    let selectedWordObject = filteredWords[randomIndex];
    
    // We need to find the REAL index in the original database to update stats later
    currentWordIndex = wordDatabase.findIndex(w => w.text === selectedWordObject.text);
    
    let wordToSpell = wordDatabase[currentWordIndex].text;
    document.getElementById('quiz-controls').style.display = 'block';
    document.getElementById('feedback').innerText = "";
    document.getElementById('answerInput').value = "";
    document.getElementById('answerInput').focus();

    let utterance = new SpeechSynthesisUtterance(wordToSpell);
    window.speechSynthesis.speak(utterance);
    
    startTimer();
    document.getElementById('answerInput').focus();
}

function startTimer(){
    timeLeft = 15;
    document.getElementById('timer').innerText = "Time left: " + timeLeft + "s";

    timerInterval = setInterval(() => {
        timeLeft--;
        
        if(timeLeft <= 0){
            clearInterval(timerInterval);
            timeLeft = 0;
            revealCorrectSpelling();
        }

        document.getElementById('timer').innerText = "Time left: " + timeLeft + "s";
    }, 1000);
    
}

function checkAnswer(){
    clearInterval(timerInterval);

    let userAnswer = document.getElementById('answerInput').value.trim().toLowerCase();
    let correctAnswer = wordDatabase[currentWordIndex].text;
    let feedbackElement = document.getElementById('feedback');

    if(userAnswer === correctAnswer){
        let pointsEarned = 10 + timeLeft;
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
    document.getElementById('answerInput').disabled = true;
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
    document.getElementById('nextButton').focus(); // Move the "focus" to the next button
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
}

updateStatsTable();
    
