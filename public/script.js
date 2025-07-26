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
// ✅ REVISED: Export attendance CSV with a more reliable download method
async function exportAttendanceCSV() {
    console.log('📤 Export process started...');

    if (!supabaseClient) {
        alert("Database connection not available. Please refresh the page.");
        return;
    }

    try {
        console.log('🔄 Fetching data from Supabase for export...');
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, timestamp')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error("❌ Export fetch error:", error);
            alert("Failed to fetch attendance data for export. Check the console for details.");
            return;
        }

        if (data.length === 0) {
            alert("No attendance data to export.");
            return;
        }
        console.log(`✅ Found ${data.length} records to export.`);

        // Create CSV content
        const csvRows = ['"Name","Timestamp"']; // Header row
        data.forEach(record => {
            const timestamp = new Date(record.timestamp).toLocaleString('en-US');
            csvRows.push(`"${record.student}","${timestamp}"`);
        });

        // Create a Blob for the CSV data
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // --- THE FIX ---
        // Create a temporary link element to trigger the download
        const a = document.createElement('a');
        a.style.display = 'none'; // Keep the link hidden
        a.href = url;
        a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
        
        // Append the link to the body, click it, and then remove it
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // --- END OF FIX ---

        // Clean up the object URL to free up memory
        URL.revokeObjectURL(url);
        
        console.log('✅ Attendance exported successfully!');
        // Provide clear feedback to the user
        alert('Attendance has been exported! Check your downloads folder.');

    } catch (err) {
        console.error('❌ A critical error occurred during export:', err);
        alert('Failed to export attendance. Please check the console for critical errors.');
    }
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

// === STUDENT LIST MANAGEMENT (MODAL) === //

function showStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplay();
}

function closeStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'none';
}

function updateStudentCount() {
    const countElement = document.getElementById('total-student-count');
    if(countElement) countElement.textContent = allStudents.length;
}

function populateStudentListDisplay() {
    const display = document.getElementById('student-list-display');
    if (!display) return;
    display.innerHTML = '';
    allStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `<span class="student-name">${student}</span><button class="delete-student-btn" onclick="deleteStudent('${student}')">🗑️ Delete</button>`;
        display.appendChild(item);
    });
    updateStudentCount();
}

// ✅ ADD NEW STUDENT TO DATABASE
async function addNewStudent() {
    const input = document.getElementById('new-student-name');
    const studentName = input.value.trim();
    if (!studentName) return alert('Please enter a student name.');
    if (allStudents.find(s => s.toLowerCase() === studentName.toLowerCase())) {
        return alert('Student already exists.');
    }

    try {
        const { error } = await supabaseClient.from('students').insert({ name: studentName });
        if (error) throw error;

        input.value = '';
        alert(`${studentName} added successfully!`);
        await fetchAllStudents(); // Refresh the list
        populateStudentListDisplay(); // Update modal view
    } catch(err) {
        console.error('❌ Error adding new student:', err);
        alert('Failed to add new student.');
    }
}

// ✅ DELETE STUDENT FROM DATABASE
async function deleteStudent(studentName) {
    if (!confirm(`This will permanently delete ${studentName} from the master list. Continue?`)) return;
    try {
        const { error } = await supabaseClient.from('students').delete().eq('name', studentName);
        if (error) throw error;
        await removeStudent(studentName); // Also remove from attendance if present
        alert(`${studentName} deleted successfully!`);
        await fetchAllStudents(); // Refresh the list
        populateStudentListDisplay(); // Update modal view
    } catch(err) {
        console.error('❌ Error deleting student:', err);
        alert('Failed to delete student.');
    }
}

// === MANUAL ATTENDANCE (MODAL) === //

function showAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
}

function closeAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'none';
}

function populateFacultyStudentDropdown() {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const unpresentStudents = allStudents.filter(s => !presentStudents.includes(s));
    
    unpresentStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = student;
        item.onclick = () => addStudentManually(student);
        dropdown.appendChild(item);
    });
}

async function addStudentManually(studentName) {
    if (!studentName) return;
    if (presentStudents.includes(studentName)) {
        return alert('Student is already marked present!');
    }
    try {
        const { error } = await supabaseClient.from('attendance').insert({ student: studentName });
        if (error) throw error;
        alert(`${studentName} added successfully!`);
        fetchAttendance();
        closeAddManuallyModal();
    } catch(err) {
        console.error('❌ Add manually error:', err);
        alert('Failed to add student manually.');
    }
}

// === UTILITY === //

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}
