document.addEventListener("DOMContentLoaded", () => {
  // === STATE MANAGEMENT ===
  let playerProgress = {
    // Level 1 is unlocked by default
    unlocks: [true, false, false],
    scores: [0, 0, 0],
  };
  let levelsData = [];
  let currentLevel = null;
  let chatHistory = [];
  let currentScore = 0;
  let messageCount = 0;

  // === DOM ELEMENTS ===
  const screens = {
    start: document.getElementById("start-screen"),
    levelSelect: document.getElementById("level-select-screen"),
    game: document.getElementById("game-screen"),
    debrief: document.getElementById("debrief-screen"),
  };
  const startButton = document.getElementById("start-button");
  const levelGrid = document.getElementById("level-grid");
  const chatLog = document.getElementById("chat-log");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const sendButton = document.getElementById("send-button");
  const loadingSpinner = document.getElementById("loading-spinner");
  const debriefButton = document.getElementById("debrief-button");

  // Game Screen UI
  const gameTitle = document.getElementById("game-title");
  const scoreDisplay = document.getElementById("score-display");
  const messageCountDisplay = document.getElementById("message-count-display");
  const messageTotalDisplay = document.getElementById("message-total-display");

  // Debrief Screen UI
  const debriefTitle = document.getElementById("debrief-title");
  const debriefMessage = document.getElementById("debrief-message");
  const debriefScore = document.getElementById("debrief-score");

  // === CORE FUNCTIONS ===

  /**
   * Initializes the application.
   * Loads progress from localStorage.
   * Fetches level data.
   * Shows the start screen.
   */
  async function init() {
    loadProgress();
    try {
      const response = await fetch("./levels.json");
      if (!response.ok) throw new Error("Failed to load level data.");
      levelsData = await response.json();
      renderLevelSelect();
      showScreen("start");
    } catch (error) {
      console.error(error);
      alert(
        "FATAL ERROR: Could not load game data (levels.json). Check console."
      );
    }
  }

  /**
   * Loads player progress from localStorage.
   */
  function loadProgress() {
    const savedProgress = localStorage.getItem("dealersDojoProgress");
    if (savedProgress) {
      playerProgress = JSON.parse(savedProgress);
    } else {
      // Ensure the default structure is saved if nothing exists
      saveProgress();
    }
  }

  /**
   * Saves player progress to localStorage.
   */
  function saveProgress() {
    localStorage.setItem(
      "dealersDojoProgress",
      JSON.stringify(playerProgress)
    );
  }

  /**
   * Hides all screens and shows the one with the specified ID.
   * @param {string} screenId - The ID of the screen to show ('start', 'levelSelect', 'game', 'debrief').
   */
  function showScreen(screenId) {
    Object.values(screens).forEach((screen) =>
      screen.classList.remove("active")
    );
    screens[screenId].classList.add("active");
  }

  /**
   * Populates the level select screen based on player progress.
   */
  function renderLevelSelect() {
    levelGrid.innerHTML = ""; // Clear existing levels
    levelsData.forEach((level, index) => {
      const isUnlocked = playerProgress.unlocks[index];
      const levelCard = document.createElement("div");
      levelCard.className = `level-card ${isUnlocked ? "unlocked" : "locked"}`;

      levelCard.innerHTML = `
        <h3>${level.title}</h3>
        <p>High Score: ${playerProgress.scores[index] || 0}</p>
        <button class="btn level-start-btn" data-level-id="${level.id}" ${
        !isUnlocked ? "disabled" : ""
      }>
          ${isUnlocked ? "Start Mission" : "Locked"}
        </button>
      `;

      levelGrid.appendChild(levelCard);
    });

    // Add event listeners to the new buttons
    document.querySelectorAll(".level-start-btn").forEach((button) => {
      if (!button.disabled) {
        button.addEventListener("click", () =>
          startLevel(parseInt(button.dataset.levelId))
        );
      }
    });
  }

  /**
   * Starts a new game level.
   * @param {number} levelId - The ID of the level to start.
   */
  function startLevel(levelId) {
    currentLevel = levelsData.find((l) => l.id === levelId);
    if (!currentLevel) return;

    // Reset game state
    currentScore = 0;
    messageCount = 0;
    chatHistory = [];
    chatLog.innerHTML = ""; // Clear chat log

    // Setup UI
    gameTitle.textContent = currentLevel.title;
    updateScore(0); // Sets display to 0
    updateMessageCount(0);
    messageTotalDisplay.textContent = currentLevel.missionLength;

    // Add mission briefing as first system message
    addMessageToLog("system", currentLevel.briefing);

    showScreen("game");
  }

  /**
   * Handles the chat form submission.
   * @param {Event} event - The form submit event.
   */
  async function handleChatSubmit(event) {
    event.preventDefault();
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    // Add user message to UI and history
    addMessageToLog("user", userMessage);
    chatInput.value = "";
    updateMessageCount(messageCount + 1);

    // Disable input and show loading
    chatInput.disabled = true;
    sendButton.disabled = true;
    loadingSpinner.classList.remove("hidden");
    chatLog.scrollTop = chatLog.scrollHeight;

    try {
      // Send data to the serverless function
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: currentLevel.systemPrompt,
          history: chatHistory,
          userMessage: userMessage,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Server error");
      }

      const aiData = await response.json();

      // Add user message to history *before* AI response
      chatHistory.push({
        role: "user",
        parts: [{ text: userMessage }],
      });

      // Add AI response to UI, history, and update score
      addMessageToLog("ai", aiData.response);
      updateScore(aiData.score_change);
      chatHistory.push({
        role: "model",
        parts: [{ text: JSON.stringify(aiData) }], // Store the raw JSON string
      });
    } catch (error) {
      console.error("Error fetching AI response:", error);
      addMessageToLog(
        "system",
        `Error: Could not get response from AI. ${error.message}`
      );
    } finally {
      // Re-enable input
      chatInput.disabled = false;
      sendButton.disabled = false;
      loadingSpinner.classList.add("hidden");
      chatInput.focus();
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    // Check for mission end
    if (messageCount >= currentLevel.missionLength) {
      endMission();
    }
  }

  /**
   * Adds a message to the chat log UI.
   * @param {string} sender - 'user', 'ai', or 'system'.
   * @param {string} text - The message content.
   */
  function addMessageToLog(sender, text) {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${sender}`;
    messageElement.textContent = text;
    chatLog.appendChild(messageElement);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  /**
   * Updates the game score and the UI.
   * @param {number} change - The amount to change the score by.
   */
  function updateScore(change) {
    currentScore += change;
    scoreDisplay.textContent = currentScore;
  }

  /**
   * Updates the message count and the UI.
   * @param {number} count - The new message count.
   */
  function updateMessageCount(count) {
    messageCount = count;
    messageCountDisplay.textContent = messageCount;
  }

  /**
   * Ends the current mission and shows the debrief screen.
   */
  function endMission() {
    const levelIndex = currentLevel.id - 1;
    const pass = currentScore >= currentLevel.passScore;

    // Update high score if beaten
    if (currentScore > playerProgress.scores[levelIndex]) {
      playerProgress.scores[levelIndex] = currentScore;
    }

    if (pass) {
      debriefTitle.textContent = "Mission Successful";
      debriefTitle.className = "pass";
      debriefMessage.textContent =
        "Excellent work, Agent. You met the objective.";

      // Unlock next level if it exists and isn't already unlocked
      const nextLevelIndex = levelIndex + 1;
      if (
        nextLevelIndex < levelsData.length &&
        !playerProgress.unlocks[nextLevelIndex]
      ) {
        playerProgress.unlocks[nextLevelIndex] = true;
        debriefMessage.textContent += " A new assignment is now available.";
      }
    } else {
      debriefTitle.textContent = "Mission Failed";
      debriefTitle.className = "fail";
      debriefMessage.textContent =
        "Target lost. Report for reassessment. We will try this again.";
    }

    debriefScore.textContent = currentScore;
    saveProgress();
    showScreen("debrief");
  }

  /**
   * Returns the user to the level select screen from debrief.
   */
  function returnToLevels() {
    renderLevelSelect(); // Re-render to show new high scores or unlocks
    showScreen("levelSelect");
  }

  // === EVENT LISTENERS ===
  startButton.addEventListener("click", () => showScreen("levelSelect"));
  chatForm.addEventListener("submit", handleChatSubmit);
  debriefButton.addEventListener("click", returnToLevels);

  // === INITIALIZE APP ===
  init();
});
