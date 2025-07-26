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
async function fetchAllStudents() { /* ... (no changes needed in this function) ... */ }

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
function initStudentView() { /* ... (no changes needed in this function) ... */ }

// ✅ QR CODE GENERATION (NOW INCLUDES SESSION ID)
async function generateQR() {
    const qrCode = document.getElementById('qr-code');
    if (!qrCode) return;
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        qrCode.innerHTML = '<p style="color: red;">No active session. Please start a fresh session.</p>';
        return;
    }
    qrCode.innerHTML = '';
    // NEW: Add session ID to the QR code URL
    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
    new QRious({ element: qrCode, value: studentUrl, size: 300 });
    console.log('✅ QR code generated for session:', sessionId);
}

// ✅ STUDENT SEARCH
function setupStudentSearch() { /* ... (no changes needed in this function) ... */ }

// ✅ POPULATE STUDENT LIST
function populateStudentList() { /* ... (no changes needed in this function) ... */ }

// ✅ HANDLE STUDENT SELECTION
function updateStudentSelection() { /* ... (no changes needed in this function) ... */ }

// ✅ SETUP STUDENT EVENT LISTENERS
function setupStudentEventListeners() { /* ... (no changes needed in this function) ... */ }

// ✅ SUBMIT ATTENDANCE (NOW CHECKS AND SAVES SESSION)
async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        alert("Please select your name first!");
        return;
    }
    
    // NEW: Session validation logic
    const urlParams = new URLSearchParams(window.location.search);
    const currentSessionId = urlParams.get('session');
    const submittedSessionId = localStorage.getItem('submittedSessionId');

    if (!currentSessionId) {
        alert("Invalid session. Please scan the QR code again.");
        return;
    }

    if (submittedSessionId === currentSessionId) {
        alert("You have already submitted attendance for this session from this device.");
        return;
    }
    // End of new logic

    const studentName = selectedRadio.value;
    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient
            .from('attendance')
            // NEW: Insert session_id along with student name
            .insert({ student: studentName, session_id: currentSessionId, timestamp: new Date().toISOString() });

        if (error) {
            // Error code 23505 means a unique constraint violation (student + session_id already exists)
            if (error.code === '23505') {
                alert("Attendance for this session has already been recorded for you.");
            } else {
                throw error;
            }
        } else {
            // NEW: On success, save the session ID to local storage to prevent resubmission
            localStorage.setItem('submittedSessionId', currentSessionId);
            console.log("✅ Attendance submitted successfully for session:", currentSessionId);
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance. Please check the console and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// ✅ FETCH ATTENDANCE
async function fetchAttendance() { /* ... (no changes needed in this function) ... */ }

// ✅ UPDATE PRESENT STUDENTS LIST
function updatePresentStudentsList() { /* ... (no changes needed in this function) ... */ }

// ✅ REMOVE STUDENT FROM ATTENDANCE
async function removeStudent(studentName) { /* ... (no changes needed in this function) ... */ }

// ✅ START FRESH SESSION (NOW GENERATES NEW SESSION ID)
async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear all attendance records and start a new session with a new QR code. Continue?")) return;
    try {
        const { error } = await supabaseClient.from('attendance').delete().neq('student', 'placeholder');
        if (error) throw error;
        
        // NEW: Generate a new session ID and regenerate the QR code
        const newSessionId = Date.now().toString();
        localStorage.setItem('sessionId', newSessionId);
        generateQR(); // Immediately create the new QR code
        
        alert("✅ All attendance cleared! A new session has started.");
        fetchAttendance();
    } catch (err) {
        console.error("❌ Clear attendance error:", err);
        alert("Failed to clear attendance.");
    }
}

// ALL OTHER FUNCTIONS (MODALS, STUDENT LIST MANAGEMENT, LOGOUT) REMAIN THE SAME
// ... (rest of your script.js code) ...
