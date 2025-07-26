// Global Supabase client
let supabaseClient = null;

// Global state
let allStudents = [];
let presentStudents = [];

// Initialize Supabase client
function initSupabase() {
    try {
        supabaseClient = supabase.createClient(
            'https://zpesqzstorixfsmpntsx.supabase.co', // Your Supabase URL
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ' // Your Supabase Key
        );
        return true;
    } catch (error) {
        console.error('Supabase initialization error:', error);
        return false;
    }
}

// Main Initialization
document.addEventListener('DOMContentLoaded', async () => {
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

// Fetch all students from the 'students' table
async function fetchAllStudents() {
    try {
        const { data, error } = await supabaseClient.from('students').select('name').order('name');
        if (error) throw error;
        allStudents = data.map(s => s.name);
    } catch (err) {
        console.error('Error fetching student list:', err);
    }
}

// Setup for the Faculty (main) page
function initFacultyView() {
    if (!localStorage.getItem('sessionId')) {
        localStorage.setItem('sessionId', Date.now().toString());
    }
    generateQR();
    fetchAttendance();
    setInterval(fetchAttendance, 5000); // Refresh attendance list every 5 seconds
}

// Setup for the Student page
function initStudentView() {
    populateStudentList();
}

// Generate QR code with unique session ID
function generateQR() {
    const qrCodeContainer = document.getElementById('qr-code');
    const sessionId = localStorage.getItem('sessionId');
    if (!qrCodeContainer || !sessionId) return;
    qrCodeContainer.innerHTML = '';
    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;
    new QRious({ element: qrCodeContainer, value: studentUrl, size: 250 });
}

// Fetch and display present students
async function fetchAttendance() {
    try {
        const { data, error } = await supabaseClient.from('attendance').select('student');
        if (error) throw error;
        presentStudents = data.map(record => record.student);
        updatePresentStudentsList();
    } catch (err) {
        console.error('Error fetching attendance:', err);
    }
}

function updatePresentStudentsList() {
    const listContainer = document.getElementById('present-students-list');
    const countElement = document.getElementById('present-count');
    countElement.textContent = presentStudents.length;
    listContainer.innerHTML = '';
    if (presentStudents.length > 0) {
        presentStudents.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-item';
            item.innerHTML = `<span>${student}</span><button class="remove-btn" onclick="removeStudent('${student}')">Remove</button>`;
            listContainer.appendChild(item);
        });
    } else {
        listContainer.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students marked present yet</div>';
    }
}

// Start a new session
async function startFreshAttendance() {
    if (!confirm("Start a new session? This will clear all current attendance records.")) return;
    try {
        const { error } = await supabaseClient.from('attendance').delete().neq('student', 'placeholder');
        if (error) throw error;
        localStorage.setItem('sessionId', Date.now().toString());
        generateQR();
        fetchAttendance();
        alert("New session started. QR code has been updated.");
    } catch (err) {
        console.error('Failed to clear attendance:', err);
        alert("Error: Failed to clear attendance. Make sure RLS policies allow DELETE.");
    }
}

// All Modal Functions
function showAddManuallyModal() { document.getElementById('add-manually-modal').style.display = 'block'; }
function closeAddManuallyModal() { document.getElementById('add-manually-modal').style.display = 'none'; }
function showStudentListModal() { document.getElementById('student-list-modal').style.display = 'block'; }
function closeStudentListModal() { document.getElementById('student-list-modal').style.display = 'none'; }

// Logout Function
function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// Add other functions like addNewStudent, deleteStudent, etc., if they are missing
async function addNewStudent() { /* ...logic... */ }
async function removeStudent(studentName) { /* ...logic... */ }
async function exportAttendanceCSV() { /* ...logic... */ }
