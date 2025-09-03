const canvas = document.getElementById("canvas");
const photo = document.getElementById("photo");
const snap = document.getElementById("snap");

// Create a hidden video element
const video = document.createElement("video");
video.setAttribute("playsinline", true); // important for mobile

navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
  .then(stream => {
    video.srcObject = stream;
    video.play();

    // Wait until video metadata is loaded
    video.addEventListener("loadedmetadata", () => {
      snap.disabled = false; // Enable button once video is ready
    });
  })
  .catch(err => {
    console.error("Error accessing camera:", err);
  });

snap.addEventListener("click", () => {
  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Show captured image
  photo.src = canvas.toDataURL("image/png");
});
