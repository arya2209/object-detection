// ==========================================
// OBJECT DETECTION CAMERA
// TensorFlow.js + COCO-SSD + Firebase
// ==========================================


// ==========================================
// FIREBASE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    writeBatch,
    query,
    where,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

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
const detectionsCollection = collection(db, "expenses");

// Hanya dokumen dengan type "detection" yang dianggap history deteksi
const detectionsQuery = query(
    detectionsCollection,
    where("type", "==", "detection")
);


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


// ==========================================
// VARIABLE
// ==========================================

let model = null;
let stream = null;
let detecting = false;

// Pengaturan penyimpanan
const MIN_SCORE = 0.6;        // minimal confidence 60%
const SAVE_COOLDOWN = 5000;   // objek yang sama disimpan lagi setelah 5 detik
const MAX_HISTORY = 50;       // jumlah history yang ditampilkan

let lastSavedClass = null;
let lastSavedTime = 0;


// ==========================================
// LOAD COCO-SSD
// ==========================================

async function loadModel() {

    try {

        loading.style.display = "block";
        cameraPlaceholder.style.display = "none";

        console.log("Memuat model COCO-SSD...");

        model = await cocoSsd.load();

        console.log("Model COCO-SSD berhasil dimuat.");

        loading.style.display = "none";
        cameraPlaceholder.style.display = "block";

    } catch (error) {

        console.error("Gagal memuat model:", error);

        loading.innerHTML = `
            <p>Gagal memuat model AI.</p>
        `;

    }

}


// ==========================================
// MENCARI KAMERA BELAKANG
// ==========================================

async function getBackCamera() {

    try {

        // Minta izin kamera terlebih dahulu
        const temporaryStream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });

        // Ambil daftar semua kamera
        const devices =
            await navigator.mediaDevices.enumerateDevices();

        // Matikan kamera sementara
        temporaryStream
            .getTracks()
            .forEach(track => track.stop());

        const cameras = devices.filter(
            device => device.kind === "videoinput"
        );

        console.log("Daftar kamera:");

        cameras.forEach((camera, index) => {
            console.log(index, camera.label, camera.deviceId);
        });

        // Cari kamera yang kemungkinan kamera belakang
        const backCamera = cameras.find(camera => {

            const label = camera.label.toLowerCase();

            return (
                label.includes("back") ||
                label.includes("rear") ||
                label.includes("environment") ||
                label.includes("belakang")
            );

        });

        if (backCamera) {
            console.log("Kamera belakang ditemukan:", backCamera.label);
            return backCamera.deviceId;
        }

        console.log("Kamera belakang tidak ditemukan berdasarkan label.");

        return null;

    } catch (error) {

        console.error("Gagal mendapatkan daftar kamera:", error);

        return null;

    }

}


// ==========================================
// START CAMERA
// ==========================================

async function startCamera() {

    try {

        if (!model) {
            alert("Model AI belum selesai dimuat.");
            return;
        }

        // Kalau kamera sebelumnya masih aktif, matikan dulu
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        // Cari kamera belakang
        const backCameraId = await getBackCamera();

        let cameraConstraints;

        if (backCameraId) {

            cameraConstraints = {
                video: {
                    deviceId: { exact: backCameraId },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            };

        } else {

            // Fallback
            cameraConstraints = {
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            };

        }

        console.log("Membuka kamera...");

        stream = await navigator.mediaDevices.getUserMedia(
            cameraConstraints
        );

        video.srcObject = stream;
        video.style.display = "block";
        cameraPlaceholder.style.display = "none";

        cameraStatus.textContent = "Camera Active";

        document.querySelector(".status-dot").style.background = "#22c55e";

        // Tunggu video siap
        await video.play();

        // Ukuran canvas mengikuti kamera
        setCanvasSize();

        // Mulai detection (cegah loop ganda kalau tombol ditekan lagi)
        const wasDetecting = detecting;
        detecting = true;

        if (!wasDetecting) {
            detectObjects();
        }

    } catch (error) {

        console.error("Gagal mengakses kamera:", error);

        alert(
            "Kamera tidak dapat diakses.\n\n" +
            "Pastikan browser sudah memberikan izin kamera."
        );

    }

}


// ==========================================
// SET CANVAS SIZE
// ==========================================

function setCanvasSize() {

    if (video.videoWidth === 0 || video.videoHeight === 0) {
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

}


// ==========================================
// OBJECT DETECTION
// ==========================================

async function detectObjects() {

    if (!detecting || !model) {
        return;
    }

    try {

        // Jalankan COCO-SSD
        const predictions = await model.detect(video);

        // Bersihkan canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (predictions.length > 0) {

            // Ambil objek dengan confidence paling tinggi
            let highestPrediction = predictions[0];

            predictions.forEach(prediction => {

                if (prediction.score > highestPrediction.score) {
                    highestPrediction = prediction;
                }

            });

            // Tampilkan informasi
            showDetectionInfo(highestPrediction);

            // Simpan ke Firebase
            saveDetection(highestPrediction);

            // Gambar bounding box
            predictions.forEach(prediction => {
                drawBoundingBox(prediction);
            });

        } else {

            detectedObject.textContent = "-";
            confidence.textContent = "-";

        }

    } catch (error) {

        console.error("Detection error:", error);

    }

    // Delay detection
    if (detecting) {
        setTimeout(detectObjects, 200);
    }

}


// ==========================================
// DRAW BOUNDING BOX
// ==========================================

function drawBoundingBox(prediction) {

    const [x, y, width, height] = prediction.bbox;

    const objectName = prediction.class;
    const score = Math.round(prediction.score * 100);

    // Box
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    // Label
    const label = `${objectName} ${score}%`;

    ctx.font = "bold 16px Arial";

    const textWidth = ctx.measureText(label).width;
    const labelHeight = 28;

    // Background label
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(
        x,
        Math.max(0, y - labelHeight),
        textWidth + 16,
        labelHeight
    );

    // Text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 8, Math.max(19, y - 8));

}


// ==========================================
// SHOW DETECTION INFO
// ==========================================

function showDetectionInfo(prediction) {

    const objectName = prediction.class;
    const score = Math.round(prediction.score * 100);

    detectedObject.textContent = objectName;
    confidence.textContent = `${score}%`;

    const time = new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    lastDetection.textContent = time;

}


// ==========================================
// SIMPAN DETECTION KE FIRESTORE
// ==========================================

async function saveDetection(prediction) {

    if (prediction.score < MIN_SCORE) return;

    const now = Date.now();

    // Hindari menyimpan objek yang sama terus-menerus
    // (deteksi berjalan tiap 200 ms)
    if (
        prediction.class === lastSavedClass &&
        now - lastSavedTime < SAVE_COOLDOWN
    ) {
        return;
    }

    lastSavedClass = prediction.class;
    lastSavedTime = now;

    try {

        await addDoc(detectionsCollection, {
            type: "detection",
            object: prediction.class,
            confidence: Math.round(prediction.score * 100),
            status: "Detected",
            createdAt: serverTimestamp()
        });

    } catch (error) {

        console.error("Gagal menyimpan ke Firebase:", error);

    }

}


// ==========================================
// TAMPILKAN HISTORY (REALTIME)
// ==========================================

const EMPTY_HISTORY_HTML = `
    <tr id="emptyHistory">
        <td colspan="5">
            <div class="empty-history">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <h3>Belum Ada History</h3>
                <p>Hasil deteksi objek akan muncul di sini.</p>
            </div>
        </td>
    </tr>
`;

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

function renderHistory(docs) {

    // Urutkan dari terbaru, ambil sejumlah MAX_HISTORY
    // "estimate" supaya data yang baru ditulis tetap punya waktu
    const items = docs
        .map(docSnap => docSnap.data({ serverTimestamps: "estimate" }))
        .sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        })
        .slice(0, MAX_HISTORY);

    if (items.length === 0) {
        historyList.innerHTML = EMPTY_HISTORY_HTML;
        return;
    }

    historyList.innerHTML = items.map((data, index) => {

        const time = data.createdAt
            ? data.createdAt.toDate().toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            })
            : "-";

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="object-name">
                        <div class="object-icon">
                            <i class="fa-solid fa-cube"></i>
                        </div>
                        ${escapeHTML(data.object)}
                    </div>
                </td>
                <td class="confidence">${escapeHTML(String(data.confidence))}%</td>
                <td>${time}</td>
                <td><span class="status-badge">${escapeHTML(data.status)}</span></td>
            </tr>
        `;

    }).join("");

}

function listenHistory() {

    onSnapshot(
        detectionsQuery,
        snapshot => renderHistory(snapshot.docs),
        error => {
            console.error("Gagal membaca history:", error);
        }
    );

}


// ==========================================
// HAPUS HISTORY (HANYA DATA DETEKSI)
// ==========================================

async function clearHistory() {

    if (!confirm("Hapus semua history deteksi?")) return;

    try {

        const snapshot = await getDocs(detectionsQuery);

        // Batch Firestore maksimal 500 operasi
        let batch = writeBatch(db);
        let count = 0;

        for (const docSnap of snapshot.docs) {

            batch.delete(docSnap.ref);
            count++;

            if (count === 500) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }

        }

        if (count > 0) await batch.commit();

        lastSavedClass = null;

    } catch (error) {

        console.error("Gagal menghapus history:", error);
        alert("Gagal menghapus history.");

    }

}


// ==========================================
// EVENT LISTENER
// ==========================================

startCameraBtn.addEventListener("click", startCamera);

clearHistoryBtn.addEventListener("click", clearHistory);

window.addEventListener("resize", () => {

    if (video.videoWidth > 0) {
        setCanvasSize();
    }

});


// ==========================================
// LOAD HISTORY & MODEL
// ==========================================

listenHistory();
loadModel();