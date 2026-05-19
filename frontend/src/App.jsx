import React, {
  useState,
  useRef,
  useCallback,
  useEffect
} from "react";

import Webcam from "react-webcam";

function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

function App() {

  const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `http://${window.location.hostname}:3005`
    : "https://warm-goats-count.loca.lt";

  const [userImage, setUserImage] = useState(null);

  const [previewUrl, setPreviewUrl] = useState(null);

  const [resultImage, setResultImage] = useState(null);
  const [resultCloudinaryUrl, setResultCloudinaryUrl] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [mode, setMode] = useState("upload");

  const [step, setStep] = useState("register");

  const [name, setName] = useState("");

  const [company, setCompany] = useState("");

  const [gender, setGender] = useState("male");

  const [wearsGlasses, setWearsGlasses] = useState(false);

  const [view, setView] = useState(window.location.hash === "#/dashboard" ? "dashboard" : "app");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedQRItem, setSelectedQRItem] = useState(null);
  const [serverIp, setServerIp] = useState(window.location.hostname);

  useEffect(() => {
    const handleHashChange = () => {
      setView(window.location.hash === "#/dashboard" ? "dashboard" : "app");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`);
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
        setServerIp(data.localIp || window.location.hostname);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (view === "dashboard") {
      loadHistory();
    }
  }, [view]);

  const defaultPromptMale = `Create a premium semi-realistic 3D cricket caricature avatar from the uploaded face image.

IMPORTANT:
- Preserve exact facial identity and gender
- MATCH THE EXACT HAIR LENGTH AND STYLE of the uploaded photo
- DO NOT add long hair unless the person in the photo has long hair
- If the uploaded image is a man, generate a male body
- DO NOT add a beard or mustache unless the person in the uploaded image has one
- Keep the person clearly recognizable
- DO NOT add glasses unless the person in the uploaded image is wearing them

STYLE:
- Pixar-quality 3D caricature
- Big caricature head
- Athletic cricket body
- Professional sports avatar
- Cinematic lighting
- High-detail face rendering

BODY:
- Holding a wooden cricket bat firmly in the right hand
- Holding a blue cricket helmet securely in the left hand
- Both hands must be clearly visible gripping the equipment
- No extra bats or duplicate items
- Dynamic cricket victory pose

IMPORTANT:
- Natural neck connection
- No floating head
- No distorted face
- No extra body parts
- Keep realistic skin color

BACKGROUND:
- Pure solid white background
- No stadium, no grass, no background elements
- Just a plain empty white studio background

OUTPUT:
- Full-body vertical portrait
- Clean professional 3D render`;

  const defaultPromptFemale = `Create a premium semi-realistic 3D cricket caricature avatar from the uploaded face image.

IMPORTANT:
- Preserve exact facial identity and gender
- MATCH THE EXACT HAIR LENGTH AND STYLE of the uploaded photo
- If the uploaded image is a woman, generate a female body
- Keep the person clearly recognizable
- DO NOT add glasses unless the person in the uploaded image is wearing them

STYLE:
- Pixar-quality 3D caricature
- Big caricature head
- Athletic female cricket body
- Professional sports avatar
- Cinematic lighting
- High-detail face rendering

BODY:
- Holding a wooden cricket bat firmly in the right hand
- Holding a blue cricket helmet securely in the left hand
- Both hands must be clearly visible gripping the equipment
- No extra bats or duplicate items
- Dynamic cricket victory pose

IMPORTANT:
- Natural neck connection
- No floating head
- No distorted face
- No extra body parts
- Keep realistic skin color

BACKGROUND:
- Pure solid white background
- No stadium, no grass, no background elements
- Just a plain empty white studio background

OUTPUT:
- Full-body vertical portrait
- Clean professional 3D render`;

  const [prompt, setPrompt] = useState(defaultPromptMale);

  const handleRegisterNext = (e) => {
    e.preventDefault();
    if (!name.trim() || !company.trim()) {
      setError("Please enter both your name and company.");
      return;
    }
    setError("");
    setStep("gender");
  };

  const handleRegisterSkip = () => {
    setName("Guest");
    setCompany("Visitor");
    setError("");
    setStep("gender");
  };

  const handleGenderSelect = (selectedGender) => {
    setGender(selectedGender);
    setPrompt(selectedGender === "male" ? defaultPromptMale : defaultPromptFemale);
    setStep("capture");
  };

  const webcamRef = useRef(null);

  // -----------------------------------------
  // HANDLE IMAGE UPLOAD
  // -----------------------------------------

  const handleUserImageUpload = (e) => {

    const file = e.target.files?.[0];

    if (!file) return;

    setUserImage(file);

    setPreviewUrl(URL.createObjectURL(file));

    setResultImage(null);

    setError("");
  };

  // -----------------------------------------
  // CAMERA CAPTURE
  // -----------------------------------------

  const capture = useCallback(() => {
    if (!webcamRef.current) {
      setError("Camera is still loading. Please try again in a moment.");
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      setError("Unable to capture image. Please make sure the camera is fully loaded and active.");
      return;
    }

    try {
      const blob = dataURItoBlob(imageSrc);
      const file = new File(
        [blob],
        "camera-capture.jpg",
        {
          type: "image/jpeg"
        }
      );

      setUserImage(file);

      setPreviewUrl(
        URL.createObjectURL(file)
      );

      setResultImage(null);

      setError("");
    } catch (err) {
      console.error("Failed to process captured image:", err);
      setError("Failed to process captured image. Please try again.");
    }
  }, [webcamRef]);

  // -----------------------------------------
  // SUBMIT IMAGE
  // -----------------------------------------

  const handleSubmit = async () => {

    if (!userImage || loading) return;

    setLoading(true);

    setResultImage(null);

    setError("");

    try {

      const formData = new FormData();

      formData.append(
        "image",
        userImage
      );

      formData.append(
        "prompt",
        prompt
      );

      formData.append(
        "gender",
        gender
      );

      formData.append(
        "wears_glasses",
        wearsGlasses
      );

      formData.append(
        "name",
        name
      );

      formData.append(
        "company",
        company
      );

      const response = await fetch(
        `${API_BASE_URL}/api/generate`,
        {
          method: "POST",
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {

        throw new Error(
          data.error || "Processing failed"
        );
      }

      if (data.success) {
        setResultImage(data.imageUrl);
        setResultCloudinaryUrl(data.cloudinaryUrl || "");
      } else {

        throw new Error(
          data.error || "Unknown error"
        );
      }

    } catch (err) {

      console.error(err);

      setError(
        err.message ||
        "Something went wrong"
      );

    } finally {

      setLoading(false);
    }
  };

  // -----------------------------------------
  // DOWNLOAD IMAGE
  // -----------------------------------------

  const handleDownload = () => {

    if (!resultImage) return;

    const a = document.createElement("a");

    a.href = resultImage;

    a.download = "cricket-caricature.png";

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);
  };

  // -----------------------------------------
  // RESET
  // -----------------------------------------

  const resetApp = () => {

    setResultImage(null);
    setResultCloudinaryUrl("");

    setUserImage(null);

    setPreviewUrl(null);

    setError("");

    setLoading(false);

    setStep("register");

    setName("");

    setCompany("");

    setWearsGlasses(false);
  };

  // -----------------------------------------
  // UI
  // -----------------------------------------

  return (

    <div className="container py-4 py-md-5">

      {/* -------------------------------- */}
      {/* BRAND & ROUTE NAVIGATION HEADER */}
      {/* -------------------------------- */}
      <div className="d-flex justify-content-between align-items-center mb-5 pb-3 border-bottom border-secondary" style={{ borderColor: "rgba(255,255,255,0.08) !important" }}>
        {/* based on the pers */}
        <div>
          {view === "app" ? (
            <button
              className="btn btn-outline-light d-flex align-items-center gap-2 py-2 px-3"
              style={{ borderRadius: "10px", fontSize: "0.9rem" }}
              onClick={() => { window.location.hash = "#/dashboard"; setView("dashboard"); }}
            >
              📊 Event Dashboard
            </button>
          ) : (
            <button
              className="btn btn-primary-custom d-flex align-items-center gap-2 py-2 px-3"
              style={{ borderRadius: "10px", fontSize: "0.9rem", textTransform: "none" }}
              onClick={() => { window.location.hash = ""; setView("app"); }}
            >
              📸 Open Photo Booth
            </button>
          )}
        </div>
      </div>

      {view === "app" ? (
        <div className="text-center">

          {/* -------------------------------- */}
          {/* TITLE */}
          {/* -------------------------------- */}

          <h1
            className="mb-3 fw-bold"
            style={{
              background:
                "linear-gradient(90deg,#06b6d4,#10b981)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontSize: "clamp(2rem, 5.5vw, 3.2rem)"
            }}
          >
            AI Photobooth
          </h1>

          <p className="lead text-light mb-4 mb-sm-5" style={{ fontSize: "clamp(0.95rem, 2.5vw, 1.25rem)" }}>
            Take a picture and generate
            a premium cartoon cricket avatar
          </p>

          {/* -------------------------------- */}
          {/* MAIN CARD */}
          {/* -------------------------------- */}

          <div className="row justify-content-center">

            <div className="col-12 col-sm-10 col-md-8 col-lg-6 col-xl-5">

              <div className="glass-card p-3 p-sm-4 p-md-5">

                {/* -------------------------------- */}
                {/* RESULT SCREEN */}
                {/* -------------------------------- */}

                {resultImage ? (

                  <div>

                    <h3 className="mb-4" style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)" }}>
                      Your Cartoon Avatar
                    </h3>

                    <img
                      src={resultImage}
                      alt="Generated Result"
                      className="img-fluid rounded shadow-lg mb-4 result-image"
                    />

                    <div className="d-flex justify-content-center">

                      <button
                        className="btn btn-primary-custom w-100"
                        onClick={resetApp}
                        style={{ textTransform: "none", fontSize: "1rem" }}
                      >
                        ✨ Done / Start Next Session
                      </button>

                    </div>

                    {resultCloudinaryUrl && (
                      <div className="mt-4 p-4 rounded-4 text-center" style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h5 className="text-light fw-bold mb-2" style={{ fontSize: "1.1rem" }}>📲 Scan to Download</h5>
                        <p className="text-muted small mb-3" style={{ fontSize: "0.85rem" }}>Scan this QR code with your phone camera to instantly save your caricature!</p>
                        <div className="bg-white p-3 d-inline-block rounded-4 shadow-lg mb-3">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(resultCloudinaryUrl)}`}
                            alt="Download QR"
                            style={{ width: "160px", height: "160px" }}
                          />
                        </div>
                        <div>
                          <a
                            href={resultCloudinaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline-light btn-sm px-3 py-2"
                            style={{ borderRadius: "8px", fontSize: "0.85rem", textTransform: "none" }}
                          >
                            🔗 Open in Browser
                          </a>
                        </div>
                      </div>
                    )}

                  </div>

                ) : step === "register" ? (

                  <form onSubmit={handleRegisterNext} className="text-start py-2">
                    <h3 className="mb-4 text-center animate-fade-in" style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)" }}>
                      Enter Your Details
                    </h3>

                    <div className="mb-4">
                      <label className="form-label text-light fw-bold">Name</label>
                      <input
                        type="text"
                        className="form-control bg-dark text-light border-secondary p-3"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        style={{ borderRadius: "10px" }}
                      />
                    </div>

                    <div className="mb-4">
                      <label className="form-label text-light fw-bold">Company</label>
                      <input
                        type="text"
                        className="form-control bg-dark text-light border-secondary p-3"
                        placeholder="Enter your company name"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        required
                        style={{ borderRadius: "10px" }}
                      />
                    </div>

                    {error && (
                      <div className="alert alert-danger py-2 mb-4">
                        {error}
                      </div>
                    )}

                    <div className="d-flex gap-3 mt-4">
                      <button
                        type="button"
                        className="btn btn-outline-light flex-grow-1 p-3"
                        onClick={handleRegisterSkip}
                        style={{ borderRadius: "10px" }}
                      >
                        Skip
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary-custom flex-grow-1 p-3"
                        style={{ borderRadius: "10px" }}
                      >
                        Continue &rarr;
                      </button>
                    </div>
                  </form>

                ) : step === "gender" ? (

                  <div className="py-2 py-sm-3">

                    <div className="d-flex justify-content-start align-items-center mb-3">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => { setError(""); setStep("register"); }}
                      >
                        &larr; Edit Details
                      </button>
                    </div>

                    <h3 className="mb-4" style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)" }}>
                      Select Template Gender
                    </h3>

                    <div className="d-flex gap-3 gap-sm-4 justify-content-center align-items-center">

                      <button
                        className="btn btn-outline-light p-3 d-flex flex-column align-items-center flex-fill"
                        onClick={() => handleGenderSelect("male")}
                        style={{ maxWidth: "180px", minWidth: "120px", borderRadius: "1.25rem", transition: "all 0.3s ease", border: "1px solid rgba(15, 23, 42, 0.08)" }}
                      >
                        <div className="position-relative overflow-hidden mb-2 shadow-sm" style={{ width: "100%", aspectRatio: "2/3", borderRadius: "12px" }}>
                          <img
                            src={`${API_BASE_URL}/outputs/cricket_template_male.png`}
                            alt="Men's Template"
                            className="w-100 h-100 object-fit-cover"
                            style={{ borderRadius: "12px" }}
                            onError={(e) => { e.target.src = "https://placehold.co/200x300?text=Men's+Template"; }}
                          />
                        </div>
                        <span className="mt-2 fw-bold" style={{ fontSize: "1rem", color: "#0f172a" }}>Men</span>
                      </button>

                      <button
                        className="btn btn-outline-light p-3 d-flex flex-column align-items-center flex-fill"
                        onClick={() => handleGenderSelect("female")}
                        style={{ maxWidth: "180px", minWidth: "120px", borderRadius: "1.25rem", transition: "all 0.3s ease", border: "1px solid rgba(15, 23, 42, 0.08)" }}
                      >
                        <div className="position-relative overflow-hidden mb-2 shadow-sm" style={{ width: "100%", aspectRatio: "2/3", borderRadius: "12px" }}>
                          <img
                            src={`${API_BASE_URL}/outputs/cricket_template_female.png`}
                            alt="Women's Template"
                            className="w-100 h-100 object-fit-cover"
                            style={{ borderRadius: "12px" }}
                            onError={(e) => { e.target.src = "https://placehold.co/200x300?text=Women's+Template"; }}
                          />
                        </div>
                        <span className="mt-2 fw-bold" style={{ fontSize: "1rem", color: "#0f172a" }}>Women</span>
                      </button>

                    </div>

                  </div>

                ) : (

                  <>

                    <div className="d-flex justify-content-between align-items-center mb-4">
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setStep("gender")}
                      >
                        &larr; Back
                      </button>
                      <span className="text-muted small">
                        {gender === "male" ? "Men's Template" : "Women's Template"} Selected
                      </span>
                    </div>

                    <div className="tab-container">
                      {/* <button
                        className={`tab-btn ${mode === "upload" ? "active" : ""}`}
                        onClick={() => setMode("upload")}
                      >
                        📤 Upload Photo
                      </button> */}
                      <button
                        className={`tab-btn ${mode === "camera" ? "active" : ""}`}
                        onClick={() => setMode("camera")}
                      >
                        📸 Take Picture
                      </button>
                    </div>

                    {error && (
                      <div className="alert alert-danger py-2 mb-4">
                        {error}
                      </div>
                    )}

                    {/* -------------------------------- */}
                    {/* UPLOAD MODE */}
                    {/* -------------------------------- */}

                    {/* {mode === "upload" && (

                      <div className="mb-4">

                        <label
                          htmlFor="userImageInput"
                          className="form-label text-light fw-bold"
                        >
                          Choose Photo
                        </label>

                        <input
                          type="file"
                          className="form-control"
                          id="userImageInput"
                          accept="image/*"
                          onChange={handleUserImageUpload}
                        />

                        {previewUrl && (
                          <div className="mt-4 text-center">
                            <img
                              src={previewUrl}
                              alt="User Preview"
                              className="img-fluid rounded shadow"
                              style={{
                                maxHeight: "300px"
                              }}
                            />
                          </div>
                        )}

                      </div>
                    )} */}

                    {/* -------------------------------- */}
                    {/* CAMERA MODE */}
                    {/* -------------------------------- */}

                    {mode === "camera" && (

                      <div className="mb-4">

                        {previewUrl ? (

                          <div className="text-center">

                            <img
                              src={previewUrl}
                              alt="Captured Preview"
                              className="img-fluid rounded shadow mb-3"
                              style={{
                                maxHeight: "300px"
                              }}
                            />

                            <div>

                              <button
                                className="btn btn-outline-light btn-sm"
                                onClick={() => {
                                  setPreviewUrl(null);
                                  setUserImage(null);
                                }}
                              >
                                Retake Photo
                              </button>

                            </div>

                          </div>

                        ) : (

                          <div className="text-center">

                            <div
                              className="position-relative d-inline-block rounded overflow-hidden shadow mb-3"
                              style={{
                                maxWidth: "100%"
                              }}
                            >

                              <Webcam
                                audio={false}
                                ref={webcamRef}
                                screenshotFormat="image/jpeg"
                                videoConstraints={{
                                  width: 1280,
                                  height: 720,
                                  facingMode: "user"
                                }}
                                style={{
                                  width: "100%",
                                  maxHeight: "300px"
                                }}
                              />

                            </div>

                            <div>

                              <button
                                className="btn btn-primary-custom btn-sm"
                                onClick={capture}
                              >
                                Capture Photo
                              </button>

                            </div>

                          </div>
                        )}

                      </div>
                    )}

                    {/* -------------------------------- */}
                    {/* GLASSES CHECKBOX */}
                    {/* -------------------------------- */}

                    {/* <div className="mb-4 d-flex align-items-center justify-content-center gap-2">
                  <input
                    type="checkbox"
                    id="wearsGlassesCheckbox"
                    className="form-check-input bg-dark border-secondary"
                    checked={wearsGlasses}
                    onChange={(e) => setWearsGlasses(e.target.checked)}
                    style={{ width: "1.2rem", height: "1.2rem" }}
                  />
                  <label htmlFor="wearsGlassesCheckbox" className="form-check-label text-light fw-bold" style={{ cursor: "pointer" }}>
                    Wear Glasses? 👓
                  </label>
                </div> */}

                    {/* -------------------------------- */}
                    {/* LOADER */}
                    {/* -------------------------------- */}

                    {loading && (
                      <div className="my-4">
                        <div className="loader mb-3"></div>
                        <p>
                          Generating your
                          cricket caricature...
                        </p>
                      </div>
                    )}

                    {/* -------------------------------- */}
                    {/* SUBMIT BUTTON */}
                    {/* -------------------------------- */}

                    <button
                      className="btn btn-primary-custom w-100"
                      disabled={!userImage || loading}
                      onClick={handleSubmit}
                    >
                      {loading ? "Generating..." : "Generate Cartoon"}
                    </button>

                  </>
                )}

              </div>

            </div>

          </div>
        </div>
      ) : (
        /* -------------------------------- */
        /* EVENT HISTORY DASHBOARD VIEW */
        /* -------------------------------- */
        <div>
          <div className="text-center">
            <h1 className="mb-3 fw-bold animate-fade-in" style={{
              background: "linear-gradient(90deg,#06b6d4,#10b981)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontSize: "clamp(2rem, 5.5vw, 3.2rem)"
            }}>
              Event Leads Dashboard
            </h1>
            <p className="lead text-light mb-5" style={{ fontSize: "clamp(0.95rem, 2.5vw, 1.25rem)" }}>
              Real-time caricature history, captured event leads, and custom mobile downloads
            </p>

            {/* Statistics Counters Row */}
            <div className="row g-3 mb-5 justify-content-center">
              <div className="col-6 col-sm-4">
                <div className="glass-card py-3 px-2 text-center" style={{ minWidth: "120px" }}>
                  <div style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", fontWeight: "800", color: "#06b6d4" }}>
                    {history.length}
                  </div>
                  <div className="text-muted small text-uppercase fw-bold mt-1">Total Leads</div>
                </div>
              </div>
              <div className="col-6 col-sm-4">
                <div className="glass-card py-3 px-2 text-center" style={{ minWidth: "120px" }}>
                  <div style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", fontWeight: "800", color: "#10b981" }}>
                    {history.filter(item => !item.filename.includes("_guest_")).length}
                  </div>
                  <div className="text-muted small text-uppercase fw-bold mt-1">Registered</div>
                </div>
              </div>
              <div className="col-6 col-sm-4">
                <div className="glass-card py-3 px-2 text-center" style={{ minWidth: "120px" }}>
                  <div style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", fontWeight: "800", color: "#64748b" }}>
                    {history.filter(item => item.filename.includes("_guest_")).length}
                  </div>
                  <div className="text-muted small text-uppercase fw-bold mt-1">Guest Sessions</div>
                </div>
              </div>
            </div>

            {/* Dashboard Body Grid */}
            {loadingHistory ? (
              <div className="py-5 text-center">
                <div className="loader mb-3"></div>
                <span className="text-light">Loading leads database...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="glass-card py-5 text-center">
                <div style={{ fontSize: "4.5rem" }}>📊</div>
                <h4 className="mt-4 text-light fw-bold">No Leads Logged Yet</h4>
                <p className="text-muted mb-4">Complete a caricature generation in the photo booth to populate your first lead!</p>
                <button
                  className="btn btn-primary-custom"
                  onClick={() => { window.location.hash = ""; setView("app"); }}
                >
                  Start First Session
                </button>
              </div>
            ) : (
              <div className="row g-4 justify-content-center">
                {history.map((item, idx) => {
                  const imgSource = item.cloudinaryUrl || `${API_BASE_URL}/outputs/${item.filename}`;
                  return (
                    <div className="col-12 col-sm-6 col-md-4 col-lg-3" key={idx}>
                      <div className="glass-card p-3 h-100 d-flex flex-column text-start" style={{ borderRadius: "16px", background: "rgba(15, 23, 42, 0.4)" }}>
                        <div className="position-relative overflow-hidden mb-3" style={{ borderRadius: "12px", aspectRatio: "2/3" }}>
                          <img
                            src={imgSource}
                            alt={item.name}
                            className="w-100 h-100 object-fit-cover"
                            style={{ objectPosition: "center", borderRadius: "12px" }}
                            onError={(e) => {
                              e.target.src = "https://placehold.co/600x900?text=Caricature";
                            }}
                          />
                        </div>

                        <h5 className="text-light fw-bold mb-1 text-truncate" title={item.name}>
                          {item.name}
                        </h5>
                        <span className="text-muted small mb-2 text-truncate d-block" title={item.company}>
                          🏢 {item.company}
                        </span>
                        <span className="text-muted small mb-3 d-block" style={{ fontSize: "0.75rem" }}>
                          📅 {item.timestamp}
                        </span>

                        <div className="mt-auto d-flex gap-2">
                          <button
                            className="btn btn-primary-custom flex-grow-1 py-2 px-1 text-center"
                            style={{ fontSize: "0.85rem", textTransform: "none", borderRadius: "8px" }}
                            onClick={() => setSelectedQRItem(item)}
                          >
                            📱 Scan QR
                          </button>
                          <a
                            href={imgSource}
                            download={item.filename}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline-light py-2 px-3 d-flex align-items-center justify-content-center"
                            style={{ borderRadius: "8px" }}
                          >
                            📥
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------- */}
      {/* INTERACTIVE DIGITAL QR MODAL */}
      {/* -------------------------------- */}
      {selectedQRItem && (
        <div className="modal-overlay d-flex align-items-center justify-content-center animate-fade-in" style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(15, 23, 42, 0.96)",
          backdropFilter: "blur(12px)",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div className="glass-card text-center p-4 p-sm-5 animate-scale-up" style={{ maxWidth: "420px", border: "1px solid rgba(6, 182, 212, 0.3)" }}>
            <h4 className="text-light fw-bold mb-2">Scan to Download</h4>
            <p className="text-muted small mb-4">Scan this QR code with your phone camera to instantly view and save your custom 4"x6" caricature!</p>

            <div className="bg-white p-3 mb-4 d-inline-block rounded-4 shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(selectedQRItem.cloudinaryUrl || `${API_BASE_URL}/outputs/${selectedQRItem.filename}`)}`}
                alt="Caricature Download QR"
                className="img-fluid"
                style={{ width: "220px", height: "220px" }}
              />
            </div>

            <h5 className="text-light fw-bold mb-1">{selectedQRItem.name}</h5>
            <span className="text-muted small mb-4 d-block">🏢 {selectedQRItem.company}</span>

            <div className="d-flex gap-3 mt-3">
              <a
                href={selectedQRItem.cloudinaryUrl || `${API_BASE_URL}/outputs/${selectedQRItem.filename}`}
                download={selectedQRItem.filename}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary-custom flex-grow-1 py-2 px-1"
                style={{ fontSize: "0.9rem", textTransform: "none" }}
              >
                Direct Download
              </a>
              <button
                className="btn btn-outline-light flex-grow-1 py-2 px-1"
                onClick={() => setSelectedQRItem(null)}
                style={{ fontSize: "0.9rem" }}
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;