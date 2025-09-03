const canvas = document.getElementById("canvas");
const photo = document.getElementById("photo");
const snap = document.getElementById("snap");

// Store video stream without displaying it
let videoStream;
let video = document.createElement("video");

navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user" }
})
.then(stream => {
  videoStream = stream;
  video.srcObject = stream;
  video.play();
})
.catch(err => {
  console.error("Error accessing camera:", err);
});

snap.addEventListener("click", () => {
  const context = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  photo.src = canvas.toDataURL("image/png");
});
