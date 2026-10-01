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


        // Ambil device kamera
        const cameras = devices.filter(
            device => device.kind === "videoinput"
        );


        console.log("Daftar kamera:");

        cameras.forEach((camera, index) => {

            console.log(
                index,
                camera.label,
                camera.deviceId
            );

        });


        // Cari kamera yang kemungkinan kamera belakang
        const backCamera = cameras.find(camera => {

            const label =
                camera.label.toLowerCase();

            return (
                label.includes("back") ||
                label.includes("rear") ||
                label.includes("environment") ||
                label.includes("belakang")
            );

        });


        if (backCamera) {

            console.log(
                "Kamera belakang ditemukan:",
                backCamera.label
            );

            return backCamera.deviceId;

        }


        // Kalau tidak ditemukan berdasarkan nama,
        // gunakan environment sebagai fallback
        console.log(
            "Kamera belakang tidak ditemukan berdasarkan label."
        );

        return null;


    } catch (error) {

        console.error(
            "Gagal mendapatkan daftar kamera:",
            error
        );

        return null;

    }

}


// ==========================================
// START CAMERA
// ==========================================

async function startCamera() {

    try {

        if (!model) {

            alert(
                "Model AI belum selesai dimuat."
            );

            return;

        }


        // Kalau kamera sebelumnya masih aktif,
        // matikan terlebih dahulu
        if (stream) {

            stream
                .getTracks()
                .forEach(track => track.stop());

        }


        // Cari kamera belakang
        const backCameraId =
            await getBackCamera();


        let cameraConstraints;


        // ======================================
        // JIKA KAMERA BELAKANG DITEMUKAN
        // ======================================

        if (backCameraId) {

            cameraConstraints = {

                video: {

                    deviceId: {
                        exact: backCameraId
                    },

                    width: {
                        ideal: 640
                    },

                    height: {
                        ideal: 480
                    }

                },

                audio: false

            };

        }


        // ======================================
        // FALLBACK
        // ======================================

        else {

            cameraConstraints = {

                video: {

                    facingMode: {
                        ideal: "environment"
                    },

                    width: {
                        ideal: 640
                    },

                    height: {
                        ideal: 480
                    }

                },

                audio: false

            };

        }


        console.log(
            "Membuka kamera..."
        );


        // Aktifkan kamera
        stream =
            await navigator.mediaDevices.getUserMedia(
                cameraConstraints
            );


        // Masukkan stream ke video
        video.srcObject = stream;


        // Tampilkan video
        video.style.display = "block";


        // Sembunyikan placeholder
        cameraPlaceholder.style.display =
            "none";


        // Update status
        cameraStatus.textContent =
            "Camera Active";


        // Status hijau
        document.querySelector(
            ".status-dot"
        ).style.background = "#22c55e";


        // Tunggu video siap
        await video.play();


        // Ukuran canvas mengikuti kamera
        setCanvasSize();


        // Mulai detection
        detecting = true;

        detectObjects();


    } catch (error) {

        console.error(
            "Gagal mengakses kamera:",
            error
        );


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

    if (
        video.videoWidth === 0 ||
        video.videoHeight === 0
    ) {

        return;

    }


    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

}


// ==========================================
// OBJECT DETECTION
// ==========================================

async function detectObjects() {

    if (
        !detecting ||
        !model
    ) {

        return;

    }


    try {

        // Jalankan COCO-SSD
        const predictions =
            await model.detect(video);


        // Bersihkan canvas
        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        // ======================================
        // ADA OBJEK
        // ======================================

        if (predictions.length > 0) {

            // Ambil objek dengan confidence
            // paling tinggi
            let highestPrediction =
                predictions[0];


            predictions.forEach(
                prediction => {

                    if (
                        prediction.score >
                        highestPrediction.score
                    ) {

                        highestPrediction =
                            prediction;

                    }

                }
            );


            // Tampilkan informasi
            showDetectionInfo(
                highestPrediction
            );


            // Gambar bounding box
            predictions.forEach(
                prediction => {

                    drawBoundingBox(
                        prediction
                    );

                }
            );

        }


        // ======================================
        // TIDAK ADA OBJEK
        // ======================================

        else {

            detectedObject.textContent =
                "-";

            confidence.textContent =
                "-";

        }


    } catch (error) {

        console.error(
            "Detection error:",
            error
        );

    }


    // ======================================
    // DELAY DETECTION
    // ======================================

    if (detecting) {

        setTimeout(
            detectObjects,
            200
        );

    }

}


// ==========================================
// DRAW BOUNDING BOX
// ==========================================

function drawBoundingBox(
    prediction
) {

    const [
        x,
        y,
        width,
        height
    ] = prediction.bbox;


    const objectName =
        prediction.class;


    const score =
        Math.round(
            prediction.score * 100
        );


    // ======================================
    // BOX
    // ======================================

    ctx.strokeStyle =
        "#2563eb";

    ctx.lineWidth = 3;

    ctx.strokeRect(
        x,
        y,
        width,
        height
    );


    // ======================================
    // LABEL
    // ======================================

    const label =
        `${objectName} ${score}%`;


    ctx.font =
        "bold 16px Arial";


    const textWidth =
        ctx.measureText(label).width;


    const labelHeight =
        28;


    // Background label
    ctx.fillStyle =
        "#2563eb";


    ctx.fillRect(
        x,
        Math.max(
            0,
            y - labelHeight
        ),
        textWidth + 16,
        labelHeight
    );


    // Text
    ctx.fillStyle =
        "#ffffff";


    ctx.fillText(
        label,
        x + 8,
        Math.max(
            19,
            y - 8
        )
    );

}


// ==========================================
// SHOW DETECTION INFO
// ==========================================

function showDetectionInfo(
    prediction
) {

    const objectName =
        prediction.class;


    const score =
        Math.round(
            prediction.score * 100
        );


    // Objek
    detectedObject.textContent =
        objectName;


    // Confidence
    confidence.textContent =
        `${score}%`;


    // Waktu
    const now =
        new Date();


    const time =
        now.toLocaleTimeString(
            "id-ID",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );


    lastDetection.textContent =
        time;

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

        if (
            video.videoWidth > 0
        ) {

            setCanvasSize();

        }

    }
);


// ==========================================
// LOAD MODEL
// ==========================================

loadModel();