// Global Supabase client
let supabaseClient = null;

// Global state variables
let allStudents = [];
let presentStudents = [];
let currentCourseId = null;
let currentSession = null;
let allSessions = [];
let attendanceChart = null;
let verificationChart = null;

// ✅ MAIN ENTRY POINT
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Initializes the Supabase client, checks auth, fetches data, and starts the correct UI.
 */
async function initializeApp() {
    try {
        const SUPABASE_URL = 'https://zpesqzstorixfsmpntsx.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ';
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (error) {
        console.error('Database connection error:', error);
        return alert('FATAL: Could not connect to the database.');
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    const isStudentPage = window.location.pathname.includes('student.html');

    if (!session && !isStudentPage) {
        return window.location.href = 'login.html';
    }

    await fetchAllStudents();

    if (isStudentPage) {
        initStudentView();
    } else {
        initFacultyView();
    }
}

// =================================================================
// DATA FETCHING & STATE
// =================================================================

async function fetchAllStudents() {
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('name, usn')
            .order('name', { ascending: true });
        
        if (error) throw error;
        allStudents = data || [];
    } catch (err) {
        console.error('Error fetching students:', err);
        allStudents = [];
    }
}

async function fetchCurrentSessionAttendance() {
    if (!currentSession) {
        updatePresentStudentsList([]);
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, usn, timestamp, fingerprint_verified, location_verified')
            .eq('session_id', currentSession.id)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        
        const attendanceData = data || [];
        presentStudents = attendanceData.map(record => record.student);
        updatePresentStudentsList(attendanceData);
    } catch (err) {
        console.error('Error fetching attendance:', err);
    }
}

function updateActiveSession(sessionData) {
    currentSession = sessionData;
    const qrContainer = document.getElementById('qr-code-container');
    const sessionTitle = document.getElementById('current-session-title');

    if (sessionData) {
        localStorage.setItem('sessionId', sessionData.id);
        const courseName = sessionData.courses ? sessionData.courses.course_name : 'General';
        if (sessionTitle) {
            sessionTitle.textContent = `Active Session: ${sessionData.session_name} (${courseName})`;
        }
        generateQR(sessionData.id);
        fetchCurrentSessionAttendance();
    } else {
        localStorage.removeItem('sessionId');
        if (sessionTitle) {
            sessionTitle.textContent = 'No Active Session';
        }
        if (qrContainer) {
            qrContainer.innerHTML = '<p>Start a new session to generate a QR code.</p>';
        }
        updatePresentStudentsList([]);
    }
}

// =================================================================
// FACULTY VIEW (`index.html`)
// =================================================================

function initFacultyView() {
    const lastSessionId = localStorage.getItem('sessionId');
    if (lastSessionId) {
        supabaseClient
            .from('sessions')
            .select('*, courses(course_name)')
            .eq('id', lastSessionId)
            .single()
            .then(({ data, error }) => {
                if (data && !error) updateActiveSession(data);
                else updateActiveSession(null);
            });
    } else {
        updateActiveSession(null);
    }
    
    setInterval(fetchCurrentSessionAttendance, 5000);
    setupAllModalSearchListeners();
}

function generateQR(sessionId) {
    const qrContainer = document.getElementById('qr-code-container');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    
    try {
        const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
        const canvas = document.createElement('canvas');
        qrContainer.appendChild(canvas);
        new QRious({ element: canvas, value: studentUrl, size: 250 });
    } catch (error) {
        qrContainer.innerHTML = '<p style="color: #dc3545;">Failed to generate QR code.</p>';
    }
}

function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    updatePresentCount(attendanceData.length);

    if (!listElement) return;
    listElement.innerHTML = '';

    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item">No students present</div>';
        return;
    }
    
    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        const fingerprintBadge = record.fingerprint_verified ? '🔐' : '';
        const locationBadge = record.location_verified ? '📍' : '';
        studentDiv.innerHTML = `<span>${record.student} ${fingerprintBadge}${locationBadge}</span><button class="remove-btn" onclick="removeStudentFromSession('${record.student.replace(/'/g, "\\'")}')">Remove</button>`;
        listElement.appendChild(studentDiv);
    });
}

function updatePresentCount(count) {
    const countElement = document.getElementById('present-count');
    if (countElement) countElement.textContent = count;
}

async function removeStudentFromSession(studentName) {
    if (!currentSession || !confirm(`Remove ${studentName}?`)) return;
    await supabaseClient.from('attendance').delete().match({ student: studentName, session_id: currentSession.id });
    fetchCurrentSessionAttendance();
}

// ... (rest of the faculty view functions: show a modal, etc.)

// =================================================================
// STUDENT VIEW (`student.html`)
// =================================================================

function initStudentView() {
    // Student view initialization logic here...
}


// =================================================================
// MODAL & INTERACTIVITY
// =================================================================

function setupAllModalSearchListeners() {
    document.getElementById('student-list-search')?.addEventListener('input', (e) => populateStudentListDisplayWithFingerprint(e.target.value.toLowerCase().trim()));
    document.getElementById('student-search-manual')?.addEventListener('input', (e) => populateFacultyStudentDropdown(e.target.value.toLowerCase().trim()));
    document.getElementById('student-stats-search')?.addEventListener('input', (e) => fetchStudentStatistics(e.target.value.toLowerCase().trim()));
}

function showStudentListModal() { 
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplayWithFingerprint();
}

function closeStudentListModal() { 
    document.getElementById('student-list-modal').style.display = 'none';
}

function showEditStudentModal(usn) {
    const student = allStudents.find(s => s.usn === usn);
    if(!student) return;
    document.getElementById('edit-student-title').textContent = `Edit ${student.name}`;
    document.getElementById('edit-student-original-usn').value = student.usn;
    document.getElementById('edit-student-name').value = student.name;
    document.getElementById('edit-student-usn').value = student.usn;
    loadStudentFingerprints(student.usn);
    document.getElementById('edit-student-modal').style.display = 'block';
}

function closeEditStudentModal() {
    document.getElementById('edit-student-modal').style.display = 'none';
}

function showAddManuallyModal() { 
    if (!currentSession) return alert('Please start a session first.');
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
}

function closeAddManuallyModal() { 
    document.getElementById('add-manually-modal').style.display = 'none';
}

function showSessionHistoryModal() {
    document.getElementById('session-history-modal').style.display = 'block';
    fetchAllSessions();
}

function closeSessionHistoryModal() { 
    document.getElementById('session-history-modal').style.display = 'none';
}

function showCoursesModal() { 
    document.getElementById('courses-modal').style.display = 'block';
    populateCoursesList();
}

function closeCoursesModal() { 
    document.getElementById('courses-modal').style.display = 'none';
}

function showStatisticsModal() {
    document.getElementById('statistics-modal').style.display = 'block';
    showStatsTab('overview');
}

function closeStatisticsModal() {
    document.getElementById('statistics-modal').style.display = 'none';
    if(attendanceChart) attendanceChart.destroy();
    if(verificationChart) verificationChart.destroy();
}

// ... All other Javascript functions from previous responses go here. 
// For brevity, I've omitted the large blocks of code for fingerprint, location, 
// and statistics rendering that you already have. Make sure they are included in the final file.

async function logout() {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
}
