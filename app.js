// ==========================================
// OBJECT DETECTION CAMERA
// TensorFlow.js + COCO-SSD
// ==========================================


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


// ==========================================
// VARIABLE
// ==========================================

let model = null;
let stream = null;
let detecting = false;


// ==========================================
// LOAD COCO-SSD MODEL
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
// START CAMERA
// ==========================================

async function startCamera() {

    try {

        if (!model) {

            alert("Model AI belum selesai dimuat.");

            return;
        }


        // Meminta izin kamera
        stream = await navigator.mediaDevices.getUserMedia({

            video: {
                facingMode: "environment",
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },

            audio: false

        });


        // Masukkan kamera ke video
        video.srcObject = stream;

        // Tampilkan video
        video.style.display = "block";

        // Hilangkan placeholder
        cameraPlaceholder.style.display = "none";

        // Status kamera
        cameraStatus.textContent = "Camera Active";

        // Ubah warna indikator
        document.querySelector(".status-dot").style.background = "#22c55e";


        // Tunggu video siap
        video.onloadedmetadata = () => {

            video.play();

            setCanvasSize();

            detecting = true;

            detectObjects();

        };


    } catch (error) {

        console.error("Gagal mengakses kamera:", error);

        alert(
            "Kamera tidak dapat diakses.\n\n" +
            "Pastikan browser sudah mendapatkan izin kamera."
        );

    }

}


// ==========================================
// SET CANVAS SIZE
// ==========================================

function setCanvasSize() {

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

        // Deteksi objek dari video
        const predictions = await model.detect(video);


        // Bersihkan canvas
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        // Jika ada objek
        if (predictions.length > 0) {

            // Simpan objek dengan confidence tertinggi
            let highestPrediction = predictions[0];


            predictions.forEach(prediction => {

                if (
                    prediction.score >
                    highestPrediction.score
                ) {

                    highestPrediction = prediction;

                }

            });


            // Tampilkan informasi objek utama
            showDetectionInfo(highestPrediction);


            // Gambar semua bounding box
            predictions.forEach(prediction => {

                drawBoundingBox(prediction);

            });

        } else {

            // Tidak ada objek
            detectedObject.textContent = "-";
            confidence.textContent = "-";

        }


    } catch (error) {

        console.error(
            "Terjadi error saat detection:",
            error
        );

    }


    // Jalankan detection berikutnya
    requestAnimationFrame(detectObjects);

}


// ==========================================
// DRAW BOUNDING BOX
// ==========================================

function drawBoundingBox(prediction) {

    const [x, y, width, height] = prediction.bbox;

    const objectName = prediction.class;

    const score = Math.round(
        prediction.score * 100
    );


    // ==============================
    // BOX
    // ==============================

    ctx.strokeStyle = "#2563eb";

    ctx.lineWidth = 3;

    ctx.strokeRect(
        x,
        y,
        width,
        height
    );


    // ==============================
    // LABEL BACKGROUND
    // ==============================

    const label = `${objectName} ${score}%`;

    ctx.font = "bold 16px Arial";

    const textWidth = ctx.measureText(label).width;

    const labelHeight = 28;


    ctx.fillStyle = "#2563eb";

    ctx.fillRect(
        x,
        y - labelHeight,
        textWidth + 16,
        labelHeight
    );


    // ==============================
    // LABEL TEXT
    // ==============================

    ctx.fillStyle = "#ffffff";

    ctx.fillText(
        label,
        x + 8,
        y - 8
    );

}


// ==========================================
// SHOW DETECTION INFORMATION
// ==========================================

function showDetectionInfo(prediction) {

    const objectName = prediction.class;

    const score = Math.round(
        prediction.score * 100
    );


    // Objek
    detectedObject.textContent = objectName;


    // Confidence
    confidence.textContent = `${score}%`;


    // Waktu
    const now = new Date();

    const time = now.toLocaleTimeString(
        "id-ID",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );

    lastDetection.textContent = time;

}


// ==========================================
// START CAMERA BUTTON
// ==========================================

startCameraBtn.addEventListener(
    "click",
    startCamera
);


// ==========================================
// WINDOW RESIZE
// ==========================================

window.addEventListener(
    "resize",
    () => {

        if (video.videoWidth > 0) {

            setCanvasSize();

        }

    }
);


// ==========================================
// LOAD MODEL SAAT WEBSITE DIBUKA
// ==========================================

loadModel();