const screens = {
  intro: document.querySelector("#intro-screen"),
  capture: document.querySelector("#capture-screen"),
  recording: document.querySelector("#recording-screen"),
  loading: document.querySelector("#loading-screen"),
  results: document.querySelector("#results-screen"),
};
const stepper = document.querySelector(".stepper");
const stepItems = [...document.querySelectorAll(".step-item")];
const startScreeningButton = document.querySelector("#start-screening");
const captureButton = document.querySelector("#capture-button");
const enableCameraButton = document.querySelector("#enable-camera");
const captureStatus = document.querySelector("#capture-status");
const cameraVideo = document.querySelector("#camera-video");
const recordingVideo = document.querySelector("#recording-video");
const cameraViewfinder = document.querySelector(".viewfinder");
const focusCountdown = document.querySelector("#focus-countdown");
const recordingProgress = document.querySelector("#recording-progress");
const recordingTimer = document.querySelector("#recording-timer");
const recordingCountdown = document.querySelector("#recording-countdown");
const recordingFrameCount = document.querySelector("#recording-frame-count");
const recordingStopButton = document.querySelector("#recording-stop");
const frameItems = [...document.querySelectorAll("#frame-list li")];
const pipelineItems = [...document.querySelectorAll("#pipeline-steps li")];
const filmFrames = [...document.querySelectorAll(".film-frame")];
const frameCounter = document.querySelector("#frame-counter");
const pipelineStatus = document.querySelector("#pipeline-status");
const scanCaption = document.querySelector("#scan-caption-text");
const scanIndicator = document.querySelector(".scan-indicator");
const canvas = document.querySelector("#scan-canvas");
const context = canvas.getContext("2d");
const qualitySummary = document.querySelector("#quality-summary");
const analysisState = document.querySelector("#analysis-state");
const resultsFile = "data/results.json";
const frameDelay = 480;
const recordingDuration = 5000;
const focusStepDuration = 1000;

const frames = [
  { name: "Soft focus", score: 42, filter: "blur(3px) brightness(.96)", shiftX: 0, shiftY: 0, noise: 0 },
  { name: "Low light", score: 34, filter: "brightness(.43) saturate(.78)", shiftX: 0, shiftY: 0, noise: 0 },
  { name: "Overexposed", score: 31, filter: "brightness(1.72) saturate(1.35)", shiftX: 0, shiftY: 0, noise: 0 },
  { name: "Off-centre", score: 56, filter: "blur(1px)", shiftX: 0.12, shiftY: -0.06, noise: 0 },
  { name: "Image noise", score: 73, filter: "contrast(1.04)", shiftX: 0, shiftY: 0, noise: 0.095 },
  { name: "Clean frame", score: 96, filter: "none", shiftX: 0, shiftY: 0, noise: 0 },
];

let records = [];
let busy = false;
let cameraStream = null;
let currentPhotoUrl = null;
let focusRunId = 0;
let focusReady = false;
let recording = false;
let recordingTimerId = null;
let recordingStartedAt = 0;
let capturedFrameCount = 0;
let averageSharpness = 0;

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function showScreen(name) {
  stepper.hidden = name === "intro";
  for (const [screenName, element] of Object.entries(screens)) {
    element.hidden = screenName !== name;
  }
  const activeStep = name === "recording" ? "capture" : name;
  const activeIndex = ["capture", "loading", "results"].indexOf(activeStep);
  for (const item of stepItems) {
    const itemIndex = ["capture", "loading", "results"].indexOf(item.dataset.step);
    const current = item.dataset.step === activeStep;
    item.classList.toggle("is-current", current);
    item.classList.toggle("is-done", activeIndex >= 0 && itemIndex < activeIndex);
    if (current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }
}

function getReviewRecords() {
  const candidates = [...records];

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  return candidates.slice(0, filmFrames.length);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${file}`));
    image.src = file;
  });
}

function drawFrame(image, frame, frameIndex) {
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#061d2e";
  context.fillRect(0, 0, width, height);

  const scale = Math.min(width / image.width, height / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  const x = (width - imageWidth) / 2 + frame.shiftX * width;
  const y = (height - imageHeight) / 2 + frame.shiftY * height;
  context.filter = frame.filter;
  context.drawImage(image, x, y, imageWidth, imageHeight);
  context.filter = "none";

  if (frame.noise > 0) {
    let seed = 204 + frameIndex;
    for (let index = 0; index < 520; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const px = seed % width;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const py = seed % height;
      context.fillStyle = `rgba(239, 255, 250, ${frame.noise * ((seed % 100) / 100)})`;
      context.fillRect(px, py, 2, 2);
    }
  }
}

function updateFrameItem(index, score) {
  const item = frameItems[index];
  item.classList.add("is-current");
  item.querySelector(".frame-score").textContent = `${score}%`;
}

function bandForRisk(risk) {
  if (risk < 30) {
    return { name: "Low risk", className: "", recommendation: "This result falls in the low placeholder band. Continue with routine eye care." };
  }
  if (risk <= 60) {
    return { name: "Moderate risk", className: "is-moderate", recommendation: "We recommend seeing an optometrist for a comprehensive eye examination." };
  }
  return { name: "High risk", className: "is-high", recommendation: "We recommend seeing an optometrist for a comprehensive eye examination." };
}

function animateRisk(risk) {
  const value = document.querySelector("#risk-value");
  if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    value.textContent = risk;
    return;
  }

  const startedAt = performance.now();
  const duration = 1100;

  function tick(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    value.textContent = Math.round(risk * progress);
    if (progress < 1) requestAnimationFrame(tick);
  }

  value.textContent = "0";
  requestAnimationFrame(tick);
}

function showResult(record) {
  const band = bandForRisk(record.risk);
  const resultImage = document.querySelector("#result-image");
  resultImage.src = record.file;
  resultImage.alt = `ACRIMA dataset retinal image ${record.id}`;
  document.querySelector("#result-image-id").textContent = record.id.toUpperCase();
  animateRisk(record.risk);
  const bandElement = document.querySelector("#risk-band");
  bandElement.textContent = band.name;
  bandElement.className = `risk-band ${band.className}`.trim();
  document.querySelector("#recommendation").textContent = band.recommendation;
  document.querySelector("#stat-frames").textContent = capturedFrameCount;
  document.querySelector("#stat-sharpness").textContent = `${frames[frames.length - 1].score}%`;
  showScreen("results");
}

function stopCamera() {
  focusRunId += 1;
  focusReady = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraVideo.srcObject = null;
  recordingVideo.srcObject = null;
  cameraVideo.hidden = true;
  recordingVideo.hidden = true;
  cameraViewfinder.classList.remove("is-live");
  cameraViewfinder.classList.remove("is-focusing", "is-aligned");
  captureButton.classList.remove("is-ready");
  captureButton.disabled = true;
  document.querySelector("#camera-label").textContent = "CAMERA STANDBY";
}

function revokePhoto() {
  if (currentPhotoUrl) {
    URL.revokeObjectURL(currentPhotoUrl);
    currentPhotoUrl = null;
  }
}

async function enableCamera() {
  enableCameraButton.disabled = true;
  captureStatus.textContent = "Waiting for camera permission…";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost in a supported browser.");
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    cameraVideo.srcObject = cameraStream;
    cameraVideo.hidden = false;
    await cameraVideo.play();
    recordingVideo.srcObject = cameraStream;
    cameraViewfinder.classList.add("is-live");
    document.querySelector("#camera-label").textContent = "LIVE CAMERA";
    runFocusSequence();
  } catch (error) {
    stopCamera();
    enableCameraButton.disabled = false;
    captureStatus.textContent = "Camera unavailable or permission was denied. Check browser permissions and try again.";
    console.error(error);
  }
}

async function runFocusSequence() {
  const runId = ++focusRunId;
  const guidance = [
    "Hold steady while the viewfinder finds focus…",
    "Center your eye in the ring…",
    "Alignment locked. Start your recording.",
  ];
  cameraViewfinder.classList.remove("is-aligned");
  cameraViewfinder.classList.add("is-focusing");
  captureButton.classList.remove("is-ready");
  captureButton.disabled = true;

  for (let index = 0; index < guidance.length; index += 1) {
    if (runId !== focusRunId || !cameraStream) return;
    captureStatus.textContent = guidance[index];
    focusCountdown.textContent = `${3 - index}`;
    await wait(focusStepDuration);
  }

  if (runId !== focusRunId || !cameraStream) return;
  focusReady = true;
  cameraViewfinder.classList.remove("is-focusing");
  cameraViewfinder.classList.add("is-aligned");
  document.querySelector("#camera-label").textContent = "FOCUS LOCKED";
  focusCountdown.textContent = "READY";
  captureStatus.textContent = "Aligned. Tap record when you're ready.";
  captureButton.disabled = records.length === 0;
  captureButton.classList.add("is-ready");
}

async function capturePhoto() {
  if (!cameraStream || cameraVideo.videoWidth === 0 || cameraVideo.videoHeight === 0) {
    throw new Error("The camera has no video frame to capture.");
  }

  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = cameraVideo.videoWidth;
  photoCanvas.height = cameraVideo.videoHeight;
  photoCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  const photoBlob = await new Promise((resolve) => photoCanvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!photoBlob) throw new Error("The camera photo could not be created.");

  revokePhoto();
  currentPhotoUrl = URL.createObjectURL(photoBlob);
  return currentPhotoUrl;
}

function updateRecording() {
  const elapsed = Math.min(performance.now() - recordingStartedAt, recordingDuration);
  const progress = elapsed / recordingDuration;
  const remaining = Math.max(0, (recordingDuration - elapsed) / 1000);
  capturedFrameCount = Math.max(1, Math.floor(elapsed / 150) + 1);
  recordingProgress.style.setProperty("--record-progress", `${progress * 360}deg`);
  recordingCountdown.textContent = remaining.toFixed(1);
  recordingTimer.textContent = `00:${String(Math.floor(elapsed / 1000)).padStart(2, "0")}`;
  recordingFrameCount.textContent = String(capturedFrameCount).padStart(2, "0");
  if (elapsed >= recordingDuration) finishRecording();
}

function startRecording() {
  if (!focusReady || !cameraStream || busy || records.length < filmFrames.length) return;
  recording = true;
  capturedFrameCount = 0;
  recordingStartedAt = performance.now();
  recordingVideo.hidden = false;
  recordingVideo.play();
  showScreen("recording");
  updateRecording();
  recordingTimerId = window.setInterval(updateRecording, 100);
}

async function finishRecording() {
  if (!recording || busy) return;
  recording = false;
  busy = true;
  window.clearInterval(recordingTimerId);
  recordingTimerId = null;
  recordingStopButton.disabled = true;

  try {
    const photoUrl = await capturePhoto();
    if (records.length < filmFrames.length) throw new Error("Six ACRIMA samples are required for review.");
    stopCamera();
    runPipeline({ photoUrl, frameCount: capturedFrameCount });
  } catch (error) {
    busy = false;
    stopCamera();
    enableCameraButton.disabled = false;
    captureStatus.textContent = "The photo could not be captured. Enable the camera and try again.";
    showScreen("capture");
    console.error(error);
  } finally {
    recordingStopButton.disabled = false;
  }
}

function setPipelineStep(activeStep) {
  const activeIndex = pipelineItems.findIndex((item) => item.dataset.pipelineStep === activeStep);
  pipelineItems.forEach((item, index) => {
    item.classList.toggle("is-current", index === activeIndex);
    item.classList.toggle("is-done", index < activeIndex);
  });
}

function prepareFilmstrip(reviewRecords) {
  filmFrames.forEach((frame, index) => {
    const image = frame.querySelector("img");
    const record = reviewRecords[index];
    image.src = record.file;
    image.alt = `ACRIMA sample ${record.id}`;
    frame.querySelector("span").textContent = record.id.toUpperCase();
    frame.classList.remove("is-current", "is-selected", "is-faded");
    image.style.filter = frames[index].filter;
  });
}

async function runPipeline(record) {
  busy = true;
  pipelineItems.forEach((item) => item.classList.remove("is-current", "is-done"));
  setPipelineStep("received");
  captureStatus.textContent = "Reviewing captured frames…";
  showScreen("loading");

  try {
    const reviewRecords = getReviewRecords();
    prepareFilmstrip(reviewRecords);
    const [cameraImage, ...reviewImages] = await Promise.all([
      loadImage(record.photoUrl),
      ...reviewRecords.map((sample) => loadImage(sample.file)),
    ]);
    frameItems.forEach((item) => {
      item.classList.remove("is-current", "is-best");
      item.querySelector(".frame-score").textContent = "--";
    });
    qualitySummary.hidden = true;
    analysisState.hidden = true;
    scanIndicator.classList.add("is-active");
    pipelineStatus.textContent = "Camera capture stays on this device.";
    frameCounter.textContent = "CAMERA / LOCAL";
    scanCaption.textContent = "Local camera capture";
    drawFrame(cameraImage, frames[5], 5);
    await wait(420);

    pipelineStatus.textContent = "Six distinct ACRIMA samples loaded for review.";
    frameCounter.textContent = `FRAME 01 / ${String(frames.length).padStart(2, "0")}`;
    scanCaption.textContent = `${reviewRecords[0].id.toUpperCase()} · ACRIMA sample`;
    drawFrame(reviewImages[0], frames[0], 0);
    await wait(420);

    setPipelineStep("sharpness");
    pipelineStatus.textContent = "Scoring frame sharpness…";

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      drawFrame(reviewImages[index], frame, index);
      updateFrameItem(index, frame.score);
      filmFrames.forEach((filmFrame, filmIndex) => {
        filmFrame.classList.toggle("is-current", filmIndex === index);
      });
      frameCounter.textContent = `FRAME ${String(index + 1).padStart(2, "0")} / 06`;
      scanCaption.textContent = `${reviewRecords[index].id.toUpperCase()} · ${frame.name} · ${frame.score}%`;
      await wait(300);
    }

    frameItems.forEach((item) => item.classList.remove("is-current"));
    averageSharpness = Math.round(frames.reduce((total, frame) => total + frame.score, 0) / frames.length);
    document.querySelector("#average-score").textContent = averageSharpness;
    document.querySelector("#quality-fill").style.width = `${averageSharpness}%`;
    qualitySummary.hidden = false;
    pipelineStatus.textContent = "Sharpness scores complete.";
    scanCaption.textContent = `Average quality ${averageSharpness}%`;
    setPipelineStep("best");

    const bestIndex = frames.length - 1;
    frameItems[bestIndex].classList.add("is-best");
    filmFrames.forEach((filmFrame, index) => {
      filmFrame.classList.remove("is-current");
      filmFrame.classList.toggle("is-selected", index === bestIndex);
      filmFrame.classList.toggle("is-faded", index !== bestIndex);
    });
    drawFrame(reviewImages[bestIndex], frames[bestIndex], bestIndex);
    frameCounter.textContent = "BEST FRAME / 06";
    scanCaption.textContent = "Best frame selected";
    pipelineStatus.textContent = "The sharpest frame is highlighted.";
    await wait(420);

    setPipelineStep("upload");
    pipelineStatus.textContent = "Upload step simulated. Your photo stays on this device.";
    await wait(520);
    setPipelineStep("model");
    analysisState.hidden = false;
    pipelineStatus.textContent = "Model scoring simulated against the ACRIMA sample.";
    scanCaption.textContent = "Sample model output ready";
    await wait(700);
    pipelineItems.forEach((item) => {
      item.classList.remove("is-current");
      item.classList.add("is-done");
    });
    showResult(reviewRecords[bestIndex]);
  } catch (error) {
    showScreen("capture");
    enableCameraButton.disabled = false;
    captureStatus.textContent = "The captured photo could not be processed. Enable the camera and try again.";
    console.error(error);
  } finally {
    busy = false;
    revokePhoto();
    filmFrames.forEach((frame) => frame.querySelector("img").removeAttribute("src"));
  }
}

startScreeningButton.addEventListener("click", () => showScreen("capture"));
enableCameraButton.addEventListener("click", enableCamera);
captureButton.addEventListener("click", startRecording);
recordingStopButton.addEventListener("click", finishRecording);

document.querySelector("#try-again").addEventListener("click", () => {
  stopCamera();
  revokePhoto();
  document.querySelector("#result-image").removeAttribute("src");
  enableCameraButton.disabled = false;
  captureButton.disabled = true;
  captureStatus.textContent = "Enable the camera to begin alignment.";
  showScreen("capture");
});

window.addEventListener("pagehide", () => {
  recording = false;
  window.clearInterval(recordingTimerId);
  stopCamera();
  revokePhoto();
});

fetch(resultsFile)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${resultsFile}: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data) || data.length === 0) throw new Error("No sample results are available.");
    records = data;
    if (records.length < filmFrames.length) throw new Error("At least six ACRIMA samples are required.");
  })
  .catch((error) => {
    captureStatus.textContent = "Placeholder risk data could not be loaded. Run prep_data.py and reload this page.";
    console.error(error);
  });
