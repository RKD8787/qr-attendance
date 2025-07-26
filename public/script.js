// Global Supabase client
let supabaseClient = null;

// Global state
let allStudents = [];
let presentStudents = [];
let filteredStudents = [];

// Initialize Supabase client
function initSupabase() {
    try {
        supabaseClient = supabase.createClient(
            'https://zpesqzstorixfsmpntsx.supabase.co', // Your Supabase URL
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ' // Your Supabase Key
        );
        console.log('✅ Supabase client initialized');
        return true;
    } catch (error) {
        console.error('❌ Supabase initialization error:', error);
        return false;
    }
}

// ✅ MAIN INITIALIZATION
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 DOM Content Loaded');
    if (!initSupabase()) {
        alert('FATAL: Supabase client could not be initialized.');
        return;
    }
    const currentPage = window.location.pathname;
    await fetchAllStudents();
    if (currentPage.includes('student')) {
        initStudentView();
    } else {
        initFacultyView();
    }
});

// ✅ FETCH ALL STUDENTS FROM SUPABASE
async function fetchAllStudents() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('students').select('name').order('name', { ascending: true });
        if (error) throw error;
        allStudents = data.map(s => s.name);
        filteredStudents = [...allStudents];
    } catch (err) {
        console.error('❌ Error fetching master student list:', err);
    }
}

// ✅ FACULTY VIEW INITIALIZATION
function initFacultyView() {
    // Ensure a session ID exists on first load
    if (!localStorage.getItem('sessionId')) {
        localStorage.setItem('sessionId', Date.now().toString());
    }
    console.log('🔄 Starting faculty view initialization...');
    generateQR();
    fetchAttendance();
    setInterval(fetchAttendance, 5000);
    updateStudentCount();
}

// ✅ STUDENT VIEW INITIALIZATION
function initStudentView() {
    populateStudentList();
    setupStudentEventListeners();
    setupStudentSearch();
}

// ✅ QR CODE GENERATION (WITH SESSION ID)
async function generateQR() {
    const qrCodeContainer = document.getElementById('qr-code');
    if (!qrCodeContainer) {
        console.error("QR container not found!");
        return;
    }

    // Clear previous content and show a loading message
    qrCodeContainer.innerHTML = '<p>Generating QR code...</p>';

    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        qrCodeContainer.innerHTML = '<p style="color: red;">No active session. Please click "Start Fresh Session".</p>';
        return;
    }

    if (typeof QRious === 'undefined') {
        qrCodeContainer.innerHTML = '<p style="color: red;">QR library is not loaded. Please refresh.</p>';
        return;
    }

    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;

    // THE FIX: Create a <canvas> element for QRious to draw on
    qrCodeContainer.innerHTML = ''; // Clear the "Generating..." message
    const canvas = document.createElement('canvas');
    qrCodeContainer.appendChild(canvas);

    new QRious({
        element: canvas, // Give the library the <canvas> element
        value: studentUrl,
        size: 300,
        padding: 20
    });

    console.log('✅ QR code generated for session:', sessionId);
}

// ✅ STUDENT SEARCH
function setupStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filteredStudents = allStudents.filter(s => s.toLowerCase().includes(searchTerm));
        populateStudentList();
    });
}

// ✅ POPULATE STUDENT LIST
function populateStudentList() {
    // ... (This function remains unchanged)
}

// ✅ HANDLE STUDENT SELECTION
function updateStudentSelection() {
    // ... (This function remains unchanged)
}

// ✅ SETUP STUDENT EVENT LISTENERS
function setupStudentEventListeners() {
    // ... (This function remains unchanged)
}

// ✅ SUBMIT ATTENDANCE (WITH SESSION VALIDATION)
async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        alert("Please select your name first!");
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const currentSessionId = urlParams.get('session');
    
    if (!currentSessionId) {
        alert("Invalid or missing session. Please scan the QR code again.");
        return;
    }

    const submittedSessions = JSON.parse(localStorage.getItem('submittedSessions') || '[]');
    if (submittedSessions.includes(currentSessionId)) {
        alert("You have already submitted attendance for this session from this device.");
        return;
    }

    const studentName = selectedRadio.value;
    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ student: studentName, session_id: currentSessionId });

        if (error) {
            if (error.code === '23505') {
                alert("Attendance for this session has already been recorded for you.");
            } else {
                throw error;
            }
        } else {
            submittedSessions.push(currentSessionId);
            localStorage.setItem('submittedSessions', JSON.stringify(submittedSessions));
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// ✅ START FRESH SESSION (RE-GENERATES QR)
async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear ALL attendance records and start a new session. Continue?")) return;
    try {
        const { error } = await supabaseClient.from('attendance').delete().neq('student', 'placeholder_to_delete_all');
        if (error) throw error;
        
        const newSessionId = Date.now().toString();
        localStorage.setItem('sessionId', newSessionId);
        
        // Immediately regenerate the QR code with the new session
        await generateQR();
        
        alert("✅ All attendance cleared! A new session has started.");
        fetchAttendance();
    } catch (err) {
        console.error("❌ Clear attendance error:", err);
        alert("Failed to clear attendance.");
    }
}

// ... (All other functions for modals, fetching, deleting, etc., remain the same) ...
