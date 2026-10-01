// ==========================================
// OBJECT DETECTION CAMERA
// TensorFlow.js + COCO-SSD + Firebase Firestore
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, serverTimestamp,
    query, orderBy, limit, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";


// ==========================================
// FIREBASE
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyC7hiFQ3HXza9gwjpzXV7Tm8xRsqe14p6k",
    authDomain: "expense-tracer-mahasiswa-c5cf8.firebaseapp.com",
    projectId: "expense-tracer-mahasiswa-c5cf8",
    storageBucket: "expense-tracer-mahasiswa-c5cf8.firebasestorage.app",
    messagingSenderId: "90640908734",
    appId: "1:90640908734:web:05f8de2843105240c5f9ef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const detectionsRef = collection(db, "detections");


// ==========================================
// ELEMENT HTML
// ==========================================

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const loading = document.getElementById("loading");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const startCameraBtn = document.getElementById("startCameraBtn");
const cameraStatus = document.getElementById("cameraStatus");

const detectedObject = document.getElementById("detectedObject");
const confidence = document.getElementById("confidence");
const lastDetection = document.getElementById("lastDetection");

const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const emptyHTML = historyList.innerHTML;


// ==========================================
// PENGATURAN
// ==========================================

const DETECT_INTERVAL = 150;   // jeda antar deteksi (ms)
const MIN_SCORE = 0.5;         // minimal confidence untuk ditampilkan
const SAVE_MIN_SCORE = 0.6;    // minimal confidence untuk masuk history
const SAVE_COOLDOWN = 5000;    // jeda simpan objek yang sama (ms)
const MAX_HISTORY = 50;

let model = null;
let stream = null;
let detecting = false;
let busy = false;
let lastRun = 0;

let historyData = [];
const lastSaved = {};          // { namaObjek: timestamp }


// ==========================================
// LOAD MODEL (versi ringan untuk HP)
// ==========================================

async function loadModel() {
    try {
        loading.style.display = "block";
        cameraPlaceholder.style.display = "none";

        model = await cocoSsd.load({ base: "lite_mobilenet_v2" });

        loading.style.display = "none";
        cameraPlaceholder.style.display = "block";
    } catch (error) {
        console.error("Gagal memuat model:", error);
        loading.innerHTML = "<p>Gagal memuat model AI.</p>";
    }
}


// ==========================================
// START CAMERA (KAMERA DEPAN)
// ==========================================

async function startCamera() {
    if (!model) {
        alert("Model AI belum selesai dimuat.");
        return;
    }

    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 480 },
                height: { ideal: 360 },
                frameRate: { ideal: 24 }
            },
            audio: false
        });

        video.srcObject = stream;
        video.style.display = "block";
        video.style.transform = "scaleX(-1)";   // efek cermin
        canvas.style.objectFit = "cover";       // sejajar dengan video

        cameraPlaceholder.style.display = "none";
        cameraStatus.textContent = "Camera Active";
        document.querySelector(".status-dot").style.background = "#22c55e";

        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        detecting = true;
        requestAnimationFrame(loop);
    } catch (error) {
        console.error("Gagal mengakses kamera:", error);
        alert("Kamera tidak dapat diakses.\n\nPastikan browser sudah memberikan izin kamera.");
    }
}


// ==========================================
// LOOP DETEKSI (requestAnimationFrame + throttle)
// ==========================================

async function loop(now) {
    if (!detecting) return;
    requestAnimationFrame(loop);

    if (busy || now - lastRun < DETECT_INTERVAL || video.readyState < 2) return;

    busy = true;
    lastRun = now;

    try {
        const predictions = await model.detect(video, 5, MIN_SCORE);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (predictions.length > 0) {
            predictions.forEach(drawBoundingBox);

            const best = predictions.reduce((a, b) => (b.score > a.score ? b : a));
            showDetectionInfo(best);
            saveToHistory(predictions);
        } else {
            detectedObject.textContent = "-";
            confidence.textContent = "-";
        }
    } catch (error) {
        console.error("Detection error:", error);
    } finally {
        busy = false;
    }
}


// ==========================================
// DRAW BOUNDING BOX (dengan koreksi mirror)
// ==========================================

function drawBoundingBox(prediction) {
    const [x, y, w, h] = prediction.bbox;
    const mx = canvas.width - x - w;   // balik horizontal
    const score = Math.round(prediction.score * 100);
    const label = `${prediction.class} ${score}%`;

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.strokeRect(mx, y, w, h);

    ctx.font = "bold 16px Arial";
    const textWidth = ctx.measureText(label).width;
    const labelHeight = 28;
    const ly = Math.max(0, y - labelHeight);

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(mx, ly, textWidth + 16, labelHeight);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, mx + 8, ly + 19);
}


// ==========================================
// INFO DETEKSI
// ==========================================

function showDetectionInfo(prediction) {
    detectedObject.textContent = prediction.class;
    confidence.textContent = `${Math.round(prediction.score * 100)}%`;
    lastDetection.textContent = new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
}


// ==========================================
// HISTORY: SIMPAN KE TABEL + FIRESTORE
// ==========================================

async function saveToHistory(predictions) {
    const now = Date.now();

    for (const p of predictions) {
        if (p.score < SAVE_MIN_SCORE) continue;
        if (lastSaved[p.class] && now - lastSaved[p.class] < SAVE_COOLDOWN) continue;

        lastSaved[p.class] = now;

        const item = {
            object: p.class,
            confidence: Math.round(p.score * 100),
            time: new Date(),
            saved: false
        };

        historyData.unshift(item);
        historyData = historyData.slice(0, MAX_HISTORY);
        renderHistory();

        // Simpan ke Firestore (tidak memblokir deteksi)
        addDoc(detectionsRef, {
            object: item.object,
            confidence: item.confidence,
            createdAt: serverTimestamp()
        })
            .then(() => { item.saved = true; renderHistory(); })
            .catch(err => console.error("Gagal simpan ke Firestore:", err));
    }
}

function renderHistory() {
    if (historyData.length === 0) {
        historyList.innerHTML = emptyHTML;
        return;
    }

    historyList.innerHTML = historyData.map((h, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>
                <div class="object-name">
                    <div class="object-icon"><i class="fa-solid fa-cube"></i></div>
                    ${h.object}
                </div>
            </td>
            <td><span class="confidence">${h.confidence}%</span></td>
            <td>${h.time.toLocaleString("id-ID")}</td>
            <td>
                ${h.saved
                    ? '<span class="status-badge">Tersimpan</span>'
                    : '<span class="status-badge" style="background:#fef3c7;color:#d97706">Menyimpan...</span>'}
            </td>
        </tr>
    `).join("");
}

async function loadHistory() {
    try {
        const q = query(detectionsRef, orderBy("createdAt", "desc"), limit(MAX_HISTORY));
        const snapshot = await getDocs(q);

        historyData = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                object: d.object,
                confidence: d.confidence,
                time: d.createdAt ? d.createdAt.toDate() : new Date(),
                saved: true
            };
        });

        renderHistory();
    } catch (error) {
        console.error("Gagal memuat history:", error);
    }
}

async function clearHistory() {
    if (!confirm("Hapus semua history deteksi?")) return;

    try {
        const snapshot = await getDocs(detectionsRef);
        const batch = writeBatch(db);
        snapshot.docs.slice(0, 500).forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        historyData = [];
        Object.keys(lastSaved).forEach(k => delete lastSaved[k]);
        renderHistory();
    } catch (error) {
        console.error("Gagal menghapus history:", error);
        alert("Gagal menghapus history dari database.");
    }
}


// ==========================================
// EVENT
// ==========================================

startCameraBtn.addEventListener("click", startCamera);
clearHistoryBtn.addEventListener("click", clearHistory);

window.addEventListener("resize", () => {
    if (video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }
});


// ==========================================
// INIT
// ==========================================

loadModel();
loadHistory();